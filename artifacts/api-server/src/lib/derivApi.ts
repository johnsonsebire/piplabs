import WebSocket from "ws";

const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const TIMEOUT_MS = 15000;

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
  contractType: "CALL" | "PUT" | "MULTUP" | "MULTDOWN";
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

type DerivResponse = {
  error?: { code: string; message: string };
  msg_type?: string;
  req_id?: number;
  [k: string]: unknown;
};

function safeClose(ws: WebSocket): void {
  try { ws.removeAllListeners(); } catch { /* noop */ }
  try { ws.close(); } catch { /* noop */ }
  try { ws.terminate(); } catch { /* noop */ }
}

export async function getAccountInfo(token: string): Promise<DerivAccountInfo> {
  type AuthMsg = {
    authorize: {
      loginid: string;
      email?: string;
      currency: string;
      balance: number;
      is_virtual: 0 | 1;
      fullname?: string;
    };
  };

  return new Promise<DerivAccountInfo>((resolve, reject) => {
    const ws = new WebSocket(DERIV_WS_URL);
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      safeClose(ws);
      fn();
    };
    const timeout = setTimeout(() => settle(() => reject(new Error("Deriv authorize timeout"))), TIMEOUT_MS);

    ws.on("open", () => ws.send(JSON.stringify({ authorize: token })));
    ws.on("message", (raw: Buffer) => {
      if (settled) return;
      let msg: DerivResponse;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.error) {
        settle(() => reject(new Error(`Deriv authorize failed: ${msg.error!.message}`)));
        return;
      }
      if (msg.msg_type === "authorize") {
        const a = (msg as unknown as AuthMsg).authorize;
        settle(() => resolve({
          loginId: a.loginid,
          email: a.email ?? null,
          currency: a.currency,
          balance: Number(a.balance) || 0,
          isVirtual: a.is_virtual === 1,
          fullname: a.fullname ?? null,
        }));
      }
    });
    ws.on("error", (err: Error) => settle(() => reject(err)));
    ws.on("close", () => settle(() => reject(new Error("Deriv WS closed unexpectedly"))));
  });
}

/**
 * Place a buy order on Deriv. Returns an outcome:
 *  - { ok: true, result } — buy confirmed by Deriv
 *  - { ok: false, uncertain: false } — request never went out (network/auth failure)
 *  - { ok: false, uncertain: true, reqId } — buy may or may not have executed; reconcile by querying portfolio
 */
export async function buyContract(token: string, params: DerivBuyParams): Promise<DerivBuyOutcome> {
  return new Promise<DerivBuyOutcome>((resolve) => {
    const ws = new WebSocket(DERIV_WS_URL);
    let settled = false;
    let authorized = false;
    let buySent = false;

    const settle = (outcome: DerivBuyOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      safeClose(ws);
      resolve(outcome);
    };
    const timeout = setTimeout(() => {
      // If the buy was already sent we don't know whether Deriv executed it
      settle(buySent
        ? { ok: false, uncertain: true, error: "Deriv buy timed out after send — execution status unknown", reqId: params.reqId }
        : { ok: false, uncertain: false, error: "Deriv buy timed out before send" });
    }, TIMEOUT_MS);

    ws.on("open", () => ws.send(JSON.stringify({ authorize: token })));
    ws.on("message", (raw: Buffer) => {
      if (settled) return;
      let msg: DerivResponse;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.error) {
        settle(buySent && msg.msg_type === "buy"
          ? { ok: false, uncertain: false, error: `Deriv buy rejected: ${msg.error.message}` }
          : { ok: false, uncertain: false, error: `Deriv error: ${msg.error.message}` });
        return;
      }
      if (!authorized && msg.msg_type === "authorize") {
        authorized = true;
        const proposal: Record<string, unknown> = {
          buy: 1,
          price: params.amount,
          req_id: params.reqId,
          parameters: {
            amount: params.amount,
            basis: params.basis ?? "stake",
            contract_type: params.contractType,
            currency: params.currency,
            duration: params.duration,
            duration_unit: params.durationUnit,
            symbol: params.symbol,
          },
        };
        if (params.contractType === "MULTUP" || params.contractType === "MULTDOWN") {
          const p = proposal.parameters as Record<string, unknown>;
          delete p.duration;
          delete p.duration_unit;
          p.multiplier = params.multiplier ?? 10;
        }
        try {
          ws.send(JSON.stringify(proposal));
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
      settle(buySent
        ? { ok: false, uncertain: true, error: `Deriv WS error after buy sent: ${err.message}`, reqId: params.reqId }
        : { ok: false, uncertain: false, error: `Deriv WS error: ${err.message}` });
    });
    ws.on("close", () => {
      settle(buySent
        ? { ok: false, uncertain: true, error: "Deriv WS closed after buy sent — execution status unknown", reqId: params.reqId }
        : { ok: false, uncertain: false, error: "Deriv WS closed before buy" });
    });
  });
}

// User-keyed balance cache (avoids retaining raw tokens in long-lived map keys).
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

export async function getAccountInfoCached(userId: string, token: string): Promise<DerivAccountInfo> {
  const cached = balanceCache.get(userId);
  if (cached && Date.now() - cached.ts < BALANCE_TTL_MS) return cached.info;

  const existing = inflightAccountInfo.get(userId);
  if (existing) return existing;

  const p = getAccountInfo(token)
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
