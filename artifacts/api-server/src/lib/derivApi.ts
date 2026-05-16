import WebSocket from "ws";

const DERIV_REST_BASE = "https://api.derivws.com";
const DERIV_PUBLIC_WS = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAppId(): string {
  const id = process.env.DERIV_APP_ID;
  if (!id) {
    throw new Error(
      "DERIV_APP_ID is not configured. " +
      "Register a PAT-type app at developers.deriv.com → Dashboard, " +
      "then set DERIV_APP_ID in your environment variables."
    );
  }
  return id;
}

function derivRestHeaders(pat: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${pat}`,
    "Deriv-App-ID": getAppId(),
    "Content-Type": "application/json",
  };
}

function safeClose(ws: WebSocket): void {
  try { ws.removeAllListeners(); } catch { /* noop */ }
  try { ws.close(); } catch { /* noop */ }
  try { ws.terminate(); } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DerivAccountInfo = {
  loginId: string;
  email: string | null;
  currency: string;
  balance: number;
  isVirtual: boolean;
  fullname: string | null;
};

export type DerivBuyParams = {
  symbol: string;
  contractType: "CALL" | "PUT" | "MULTUP" | "MULTDOWN" | "VANILLALONGCALL" | "VANILLALONGPUT";
  amount: number;
  currency: string;
  duration: number;
  durationUnit: "t" | "s" | "m" | "h" | "d";
  basis?: "stake" | "payout";
  multiplier?: number;
  reqId: number;
};

export type DerivBuyResult = {
  contractId: string;
  buyPrice: number;
  payout: number;
  startTime: number;
  longcode: string;
  transactionId: string;
  reqId: number;
};

export type DerivBuyOutcome =
  | { ok: true; result: DerivBuyResult }
  | { ok: false; uncertain: false; error: string }
  | { ok: false; uncertain: true; error: string; reqId: number };

// ---------------------------------------------------------------------------
// Internal REST types (Deriv v2 response shapes)
// ---------------------------------------------------------------------------

type OptionsAccount = {
  account_id: string;
  balance: number;
  currency: string;
  account_type: "demo" | "real";
  status: "active" | "inactive";
  email?: string;
  name?: string;
};

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

async function fetchAccounts(pat: string): Promise<OptionsAccount[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${DERIV_REST_BASE}/trading/v1/options/accounts`, {
      headers: derivRestHeaders(pat),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Deriv GET accounts failed (HTTP ${resp.status}): ${body.slice(0, 300)}`);
    }
    const json = await resp.json() as { data: OptionsAccount[] };
    return Array.isArray(json.data) ? json.data : [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOtpWsUrl(pat: string, accountId: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(
      `${DERIV_REST_BASE}/trading/v1/options/accounts/${accountId}/otp`,
      {
        method: "POST",
        headers: derivRestHeaders(pat),
        signal: controller.signal,
      }
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Deriv OTP request failed (HTTP ${resp.status}): ${body.slice(0, 300)}`);
    }
    const json = await resp.json() as { data: { url: string } };
    if (!json?.data?.url) throw new Error("Deriv OTP response missing WebSocket URL");
    return json.data.url;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API: getAccountInfo
// Validates the PAT via REST and returns the best available account.
// Prefers real account; falls back to demo.
// ---------------------------------------------------------------------------

export async function getAccountInfo(pat: string): Promise<DerivAccountInfo> {
  const accounts = await fetchAccounts(pat);

  if (accounts.length === 0) {
    throw new Error(
      "No Options trading accounts found for this PAT. " +
      "Log in to app.deriv.com, then go to Deriv API → Tokens, " +
      "create a PAT with the 'trade' scope, and make sure you have an Options demo or real account."
    );
  }

  // Prefer an active real account; fall back to demo.
  const pick =
    accounts.find(a => a.account_type === "real" && a.status === "active") ??
    accounts.find(a => a.status === "active") ??
    accounts[0];

  return {
    loginId: pick.account_id,
    email: pick.email ?? null,
    currency: pick.currency,
    balance: Number(pick.balance) || 0,
    isVirtual: pick.account_type === "demo",
    fullname: pick.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public API: getAccountForMode
// Picks the account that matches the requested trade mode (demo/live).
// Returns { accountId, currency, balance, isVirtual }.
// Throws if no matching account is found.
// ---------------------------------------------------------------------------

export type AccountForMode = {
  accountId: string;
  currency: string;
  balance: number;
  isVirtual: boolean;
};

export async function getAccountForMode(
  pat: string,
  mode: "demo" | "live",
): Promise<AccountForMode> {
  const accounts = await fetchAccounts(pat);

  if (accounts.length === 0) {
    throw new Error(
      "No Options trading accounts found for this PAT. " +
      "Make sure you have an Options demo or real account."
    );
  }

  const want = mode === "demo" ? "demo" : "real";
  const match =
    accounts.find(a => a.account_type === want && a.status === "active") ??
    accounts.find(a => a.account_type === want);

  if (!match) {
    const available = accounts.map(a => a.account_type).join(", ");
    throw new Error(
      `No ${mode.toUpperCase()} account found for this PAT. ` +
      `Available accounts: ${available}. ` +
      `${mode === "demo" ? "Open a demo account at app.deriv.com to trade demo." : "Fund a real account to trade live."}`
    );
  }

  return {
    accountId: match.account_id,
    currency: match.currency,
    balance: Number(match.balance) || 0,
    isVirtual: match.account_type === "demo",
  };
}

// ---------------------------------------------------------------------------
// Public API: buyContract
// Deriv v2 OTP flow (as documented):
//   1. POST /trading/v1/options/accounts/{id}/otp  → pre-authenticated WS URL
//   2. Connect WS (no authorize message needed — already authenticated via OTP)
//   3. Send `proposal` → receive proposal id + ask_price
//   4. Send `buy: proposal.id, price: ask_price` → receive contract_id
// ---------------------------------------------------------------------------

type DerivWsResponse = {
  error?: { code: string; message: string };
  msg_type?: string;
  req_id?: number;
  [k: string]: unknown;
};

export async function buyContract(
  pat: string,
  accountId: string,
  params: DerivBuyParams
): Promise<DerivBuyOutcome> {
  // Step 1: Exchange PAT for a single-use OTP → authenticated WS URL.
  let wsUrl: string;
  try {
    wsUrl = await fetchOtpWsUrl(pat, accountId);
  } catch (err) {
    return {
      ok: false,
      uncertain: false,
      error: err instanceof Error ? err.message : "Failed to obtain Deriv OTP",
    };
  }

  return new Promise<DerivBuyOutcome>((resolve) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;
    let buySent = false;

    const settle = (outcome: DerivBuyOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      safeClose(ws);
      resolve(outcome);
    };

    const timeout = setTimeout(() => {
      settle(
        buySent
          ? { ok: false, uncertain: true, error: "Deriv buy timed out after send — execution status unknown", reqId: params.reqId }
          : { ok: false, uncertain: false, error: "Deriv buy timed out before proposal response" }
      );
    }, TIMEOUT_MS);

    ws.on("open", () => {
      // Step 2: Request a price proposal. The OTP WS is pre-authenticated —
      // no `authorize` message is needed. Uses `underlying_symbol` (v2 field name).
      const msg: Record<string, unknown> = {
        proposal: 1,
        amount: params.amount,
        basis: params.basis ?? "stake",
        contract_type: params.contractType,
        currency: params.currency,
        underlying_symbol: params.symbol,
        req_id: params.reqId,
      };

      const isMulti = params.contractType === "MULTUP" || params.contractType === "MULTDOWN";
      if (isMulti) {
        msg.multiplier = params.multiplier ?? 10;
      } else {
        msg.duration = params.duration;
        msg.duration_unit = params.durationUnit;
      }

      try {
        ws.send(JSON.stringify(msg));
      } catch (err) {
        settle({ ok: false, uncertain: false, error: err instanceof Error ? err.message : "Failed to send proposal" });
      }
    });

    ws.on("message", (raw: Buffer) => {
      if (settled) return;
      let msg: DerivWsResponse;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.error) {
        settle({ ok: false, uncertain: buySent, error: `Deriv error: ${(msg.error as any).message}`, ...(buySent ? { reqId: params.reqId } : {}) } as DerivBuyOutcome);
        return;
      }

      if (msg.msg_type === "proposal") {
        // Step 3: Buy the contract using the proposal id and ask_price.
        const p = (msg as any).proposal as { id: string; ask_price: number };
        try {
          ws.send(JSON.stringify({ buy: p.id, price: p.ask_price, req_id: params.reqId + 1 }));
          buySent = true;
        } catch (err) {
          settle({ ok: false, uncertain: false, error: err instanceof Error ? err.message : "Failed to send buy" });
        }
        return;
      }

      if (msg.msg_type === "buy") {
        const b = (msg as any).buy as {
          contract_id: number; buy_price: number; payout: number;
          start_time: number; longcode: string; transaction_id: number;
        };
        settle({
          ok: true,
          result: {
            contractId: String(b.contract_id),
            buyPrice: Number(b.buy_price),
            payout: Number(b.payout),
            startTime: Number(b.start_time),
            longcode: b.longcode,
            transactionId: String(b.transaction_id),
            reqId: params.reqId,
          },
        });
      }
    });

    ws.on("error", (err: Error) => {
      settle(
        buySent
          ? { ok: false, uncertain: true, error: `Deriv WS error after buy sent: ${err.message}`, reqId: params.reqId }
          : { ok: false, uncertain: false, error: `Deriv WS error: ${err.message}` }
      );
    });

    ws.on("close", () => {
      settle(
        buySent
          ? { ok: false, uncertain: true, error: "Deriv WS closed after buy sent — execution status unknown", reqId: params.reqId }
          : { ok: false, uncertain: false, error: "Deriv WS closed before buy" }
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Balance cache (avoids hammering the REST API on every dashboard load)
// ---------------------------------------------------------------------------

type CacheEntry = { info: DerivAccountInfo; ts: number };
const balanceCache = new Map<string, CacheEntry>();
const inflightAccountInfo = new Map<string, Promise<DerivAccountInfo>>();
const BALANCE_TTL_MS = 10_000;
const CACHE_SWEEP_MS = 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of balanceCache.entries()) {
    if (now - v.ts > BALANCE_TTL_MS * 6) balanceCache.delete(k);
  }
}, CACHE_SWEEP_MS).unref?.();

export async function getAccountInfoCached(userId: string, pat: string): Promise<DerivAccountInfo> {
  const cached = balanceCache.get(userId);
  if (cached && Date.now() - cached.ts < BALANCE_TTL_MS) return cached.info;

  const existing = inflightAccountInfo.get(userId);
  if (existing) return existing;

  const p = getAccountInfo(pat)
    .then((info) => {
      balanceCache.set(userId, { info, ts: Date.now() });
      return info;
    })
    .finally(() => {
      inflightAccountInfo.delete(userId);
    });
  inflightAccountInfo.set(userId, p);
  return p;
}

export function invalidateBalanceCache(userId: string): void {
  balanceCache.delete(userId);
  inflightAccountInfo.delete(userId);
}

let _reqIdCounter = Math.floor(Date.now() / 1000);
export function nextReqId(): number {
  _reqIdCounter = (_reqIdCounter + 1) & 0x7fffffff;
  return _reqIdCounter;
}

// Exported so routes can reference the public WS URL without duplicating it.
export { DERIV_PUBLIC_WS };
