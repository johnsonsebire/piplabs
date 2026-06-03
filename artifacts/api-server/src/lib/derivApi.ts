import WebSocket from "ws";

const DERIV_REST_BASE = "https://api.derivws.com";
/** Public/market-data only — API v2 PAT flows must use a registered app id. */
const DERIV_PUBLIC_APP_ID = "1089";
const DERIV_PUBLIC_WS = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_PUBLIC_APP_ID}`;
const TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveAuthAppId(customAppId?: string | null): string {
  const id = (customAppId?.trim() || process.env.DERIV_APP_ID?.trim() || "").trim();
  if (!id) {
    throw new Error(
      "App ID is required. Register a PAT-type app at developers.deriv.com, copy its App ID, " +
      "and ensure your PAT was created under that same app. Legacy public App ID 1089 does not work with API v2."
    );
  }
  return id;
}

function derivRestHeaders(pat: string, customAppId?: string | null): Record<string, string> {
  return {
    "Authorization": `Bearer ${pat.trim()}`,
    "Deriv-App-ID": resolveAuthAppId(customAppId),
    "Content-Type": "application/json",
  };
}

function parseDerivErrorPayload(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim()) {
    return body.trim().slice(0, 500);
  }
  if (!body || typeof body !== "object") {
    return `HTTP ${status}`;
  }
  const record = body as Record<string, unknown>;
  const errors = record.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const parts = errors
      .map((e) => {
        if (!e || typeof e !== "object") return null;
        const item = e as Record<string, unknown>;
        const msg = typeof item.message === "string" ? item.message.trim() : "";
        const code = typeof item.code === "string" ? item.code.trim() : "";
        return msg || code || null;
      })
      .filter((s): s is string => Boolean(s));
    if (parts.length > 0) return parts.join("; ");
  }
  for (const key of ["message", "error", "detail"] as const) {
    const val = record[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return `HTTP ${status}`;
}

function authFailureHint(status: number, appId: string): string {
  if (status !== 401 && status !== 403) return "";
  return (
    " Check that your PAT and App ID belong to the same PAT-type application at developers.deriv.com " +
    `(App ID sent: ${appId}). PAT needs the trade scope; create an Options account if you have none.`
  );
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
  /** Strike/barrier for vanilla options. e.g. "+0.00" (ATM), "+10", or absolute price string. */
  barrier?: string;
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

async function derivJsonRequest(
  path: string,
  pat: string,
  customAppId: string | null | undefined,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; json: unknown; appId: string }> {
  const appId = resolveAuthAppId(customAppId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${DERIV_REST_BASE}${path}`, {
      ...init,
      headers: {
        ...derivRestHeaders(pat, customAppId),
        ...(init.headers as Record<string, string> | undefined),
      },
      signal: controller.signal,
    });
    let json: unknown = null;
    try {
      json = await resp.json();
    } catch {
      json = null;
    }
    return { ok: resp.ok, status: resp.status, json, appId };
  } finally {
    clearTimeout(timer);
  }
}

async function createOptionsDemoAccount(pat: string, customAppId?: string | null): Promise<void> {
  const { ok, status, json, appId } = await derivJsonRequest(
    "/trading/v1/options/accounts",
    pat,
    customAppId,
    {
      method: "POST",
      body: JSON.stringify({ currency: "USD", group: "row", account_type: "demo" }),
    },
  );
  if (ok || status === 200 || status === 201) return;
  const message = parseDerivErrorPayload(json, status);
  throw new Error(`Deriv create demo account failed: ${message}${authFailureHint(status, appId)}`);
}

function normalizeOptionsAccount(raw: unknown): OptionsAccount | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const accountId = r.account_id ?? r.accountId;
  if (accountId == null || String(accountId).trim() === "") return null;

  const accountType = r.account_type ?? r.accountType;
  const typeStr = accountType === "real" || accountType === "demo" ? accountType : "demo";

  return {
    account_id: String(accountId),
    balance: Number(r.balance) || 0,
    currency: typeof r.currency === "string" ? r.currency : "USD",
    account_type: typeStr,
    status: r.status === "inactive" ? "inactive" : "active",
    email: typeof r.email === "string" ? r.email : undefined,
    name: typeof r.name === "string" ? r.name : undefined,
  };
}

function parseAccountsPayload(json: unknown): OptionsAccount[] {
  if (!json || typeof json !== "object") return [];
  const data = (json as { data?: unknown }).data;
  if (Array.isArray(data)) {
    return data.map(normalizeOptionsAccount).filter((a): a is OptionsAccount => a !== null);
  }
  const single = normalizeOptionsAccount(data);
  return single ? [single] : [];
}

async function fetchAccounts(pat: string, customAppId?: string | null): Promise<OptionsAccount[]> {
  const { ok, status, json, appId } = await derivJsonRequest(
    "/trading/v1/options/accounts",
    pat,
    customAppId,
  );
  if (!ok) {
    const message = parseDerivErrorPayload(json, status);
    throw new Error(`Deriv GET accounts failed: ${message}${authFailureHint(status, appId)}`);
  }
  return parseAccountsPayload(json);
}

async function fetchOtpWsUrl(pat: string, accountId: string, customAppId?: string | null): Promise<string> {
  const { ok, status, json, appId } = await derivJsonRequest(
    `/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
    pat,
    customAppId,
    { method: "POST" },
  );
  if (!ok) {
    const message = parseDerivErrorPayload(json, status);
    throw new Error(`Deriv OTP request failed: ${message}${authFailureHint(status, appId)}`);
  }
  const url = (json as { data?: { url?: string } })?.data?.url;
  if (!url) throw new Error("Deriv OTP response missing WebSocket URL");
  return url;
}

// ---------------------------------------------------------------------------
// Public API: getAccountInfo
// Validates the PAT via REST and returns the best available account.
// Prefers real account; falls back to demo.
// ---------------------------------------------------------------------------

export async function getAccountInfo(pat: string, customAppId?: string | null): Promise<DerivAccountInfo> {
  let accounts = await fetchAccounts(pat, customAppId);

  if (accounts.length === 0) {
    try {
      await createOptionsDemoAccount(pat, customAppId);
      accounts = await fetchAccounts(pat, customAppId);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Could not create demo account";
      throw new Error(
        "No Options trading accounts found for this PAT. " +
        "Create a PAT with trade and account_manage scopes, or open an Options account at app.deriv.com. " +
        `(${detail})`
      );
    }
  }

  if (accounts.length === 0) {
    throw new Error(
      "No Options trading accounts found for this PAT after attempting to create a demo account. " +
      "Ensure your PAT has trade and account_manage scopes from developers.deriv.com."
    );
  }

  // Prefer an active real account; fall back to demo.
  const pick =
    accounts.find(a => a.account_type === "real" && a.status === "active") ??
    accounts.find(a => a.status === "active") ??
    accounts[0];

  return {
    loginId: String(pick.account_id),
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
  customAppId?: string | null,
): Promise<AccountForMode> {
  const accounts = await fetchAccounts(pat, customAppId);

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
    accountId: String(match.account_id),
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
  params: DerivBuyParams,
  customAppId?: string | null,
): Promise<DerivBuyOutcome> {
  // Step 1: Exchange PAT for a single-use OTP → authenticated WS URL.
  let wsUrl: string;
  try {
    wsUrl = await fetchOtpWsUrl(pat, accountId, customAppId);
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
      const isVanilla = params.contractType === "VANILLALONGCALL" || params.contractType === "VANILLALONGPUT";
      if (isMulti) {
        msg.multiplier = params.multiplier ?? 10;
      } else {
        msg.duration = params.duration;
        msg.duration_unit = params.durationUnit;
      }
      // Vanilla options require a single barrier (strike price).
      // Default to "+0.00" (at-the-money) if the caller didn't provide one.
      if (isVanilla) {
        msg.barrier = params.barrier ?? "+0.00";
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
// Public API: sellContract (close an open contract at market)
// ---------------------------------------------------------------------------

export type DerivSellResult = {
  contractId: string;
  soldPrice: number;
  transactionId: string;
};

export type DerivSellOutcome =
  | { ok: true; result: DerivSellResult }
  | { ok: false; error: string };

export async function sellContract(
  pat: string,
  accountId: string,
  contractId: string,
  customAppId?: string | null,
): Promise<DerivSellOutcome> {
  let wsUrl: string;
  try {
    wsUrl = await fetchOtpWsUrl(pat, accountId, customAppId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to obtain Deriv OTP for sell" };
  }

  return new Promise<DerivSellOutcome>((resolve) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;

    const settle = (outcome: DerivSellOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      safeClose(ws);
      resolve(outcome);
    };

    const timeout = setTimeout(() => {
      settle({ ok: false, error: "Deriv sell timed out" });
    }, TIMEOUT_MS);

    ws.on("open", () => {
      try {
        ws.send(JSON.stringify({ sell: Number(contractId), price: 0 }));
      } catch (err) {
        settle({ ok: false, error: err instanceof Error ? err.message : "Failed to send sell" });
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as DerivWsResponse;
        if (msg.error) {
          settle({ ok: false, error: msg.error.message });
          return;
        }
        if (msg.msg_type === "sell" && msg.sell) {
          const sell = msg.sell as Record<string, unknown>;
          settle({
            ok: true,
            result: {
              contractId: String(sell.contract_id ?? contractId),
              soldPrice: Number(sell.sold_for ?? 0),
              transactionId: String(sell.transaction_id ?? ""),
            },
          });
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on("error", (err) => settle({ ok: false, error: err.message }));
    ws.on("close", () => settle({ ok: false, error: "Deriv WS closed during sell" }));
  });
}

// ---------------------------------------------------------------------------
// Public API: getOpenContractStatus
// ---------------------------------------------------------------------------

export type OpenContractStatus = {
  contractId: string;
  currentProfit: number;
  currentSpot: number;
  expiryTime: number;
  isExpired: boolean;
  isSold: boolean;
  bid: number;
};

export async function getOpenContractStatus(
  pat: string,
  accountId: string,
  contractId: string,
  customAppId?: string | null,
): Promise<OpenContractStatus | null> {
  let wsUrl: string;
  try {
    wsUrl = await fetchOtpWsUrl(pat, accountId, customAppId);
  } catch {
    return null;
  }

  return new Promise<OpenContractStatus | null>((resolve) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;

    const settle = (result: OpenContractStatus | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      safeClose(ws);
      resolve(result);
    };

    const timeout = setTimeout(() => settle(null), TIMEOUT_MS);

    ws.on("open", () => {
      try {
        ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: contractId }));
      } catch {
        settle(null);
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as DerivWsResponse;
        if (msg.error || msg.msg_type !== "proposal_open_contract") return;
        const poc = msg.proposal_open_contract as Record<string, unknown>;
        settle({
          contractId: String(poc.contract_id ?? contractId),
          currentProfit: Number(poc.profit ?? 0),
          currentSpot: Number(poc.current_spot ?? 0),
          expiryTime: Number(poc.date_expiry ?? 0),
          isExpired: Boolean(poc.is_expired),
          isSold: Boolean(poc.is_sold),
          bid: Number(poc.bid_price ?? 0),
        });
      } catch { /* ignore */ }
    });

    ws.on("error", () => settle(null));
    ws.on("close", () => settle(null));
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

export async function getAccountInfoCached(userId: string, pat: string, customAppId?: string | null): Promise<DerivAccountInfo> {
  const cached = balanceCache.get(userId);
  if (cached && Date.now() - cached.ts < BALANCE_TTL_MS) return cached.info;

  const existing = inflightAccountInfo.get(userId);
  if (existing) return existing;

  const p = getAccountInfo(pat, customAppId)
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