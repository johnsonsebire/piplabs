import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import {
  ConnectDerivBody,
  ConnectDerivResponse,
  DisconnectDerivResponse,
  GetDerivStatusResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { getAccountInfo, getAccountInfoCached, invalidateBalanceCache } from "../lib/derivApi";

const router: IRouter = Router();

router.post("/deriv/connect", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = ConnectDerivBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { apiToken, accountId } = parsed.data;

  // Validate the token by authorizing with Deriv and capturing account details.
  let accountInfo;
  try {
    accountInfo = await getAccountInfo(apiToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid Deriv API token";
    // Log the *actual* Deriv rejection reason so we can debug token issues
    // (e.g. DisabledClient, InvalidToken, AuthorizationRequired, scope errors).
    req.log.warn({ err, derivMessage: message, tokenLen: apiToken.length, tokenPrefix: apiToken.slice(0, 4) }, "Deriv connect/authorize failed");
    res.status(400).json({ error: message });
    return;
  }

  invalidateBalanceCache(req.userId!);

  const [user] = await db
    .update(usersTable)
    .set({
      derivApiToken: apiToken,
      derivAccountId: accountId ?? accountInfo.loginId,
      derivLoginId: accountInfo.loginId,
      derivCurrency: accountInfo.currency,
      derivConnectedAt: new Date(),
    })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json(ConnectDerivResponse.parse({
    connected: true,
    accountId: user.derivAccountId,
    loginId: user.derivLoginId,
    currency: user.derivCurrency,
    connectedAt: user.derivConnectedAt,
  }));
});

router.delete("/deriv/connect", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await db
    .update(usersTable)
    .set({
      derivApiToken: null,
      derivAccountId: null,
      derivLoginId: null,
      derivCurrency: null,
      derivConnectedAt: null,
    })
    .where(eq(usersTable.id, req.userId!));

  invalidateBalanceCache(req.userId!);

  // DisconnectDerivResponse is the same DerivStatus schema — return a cleared
  // status so the client zod parser doesn't 500 on a missing `connected` field.
  res.json(DisconnectDerivResponse.parse({
    connected: false,
    accountId: null,
    loginId: null,
    currency: null,
    connectedAt: null,
  }));
});

router.get("/deriv/status", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const user = req.dbUser!;

  let balance: number | null = null;
  if (user.derivApiToken) {
    try {
      const info = await getAccountInfoCached(user.id, user.derivApiToken);
      balance = info.balance;
    } catch {
      // Non-fatal — return status without balance if the fetch fails
    }
  }

  res.json(GetDerivStatusResponse.parse({
    connected: !!user.derivApiToken,
    accountId: user.derivAccountId,
    loginId: user.derivLoginId,
    currency: user.derivCurrency,
    balance,
    connectedAt: user.derivConnectedAt,
  }));
});

let cachedSymbols: unknown[] | null = null;
let symbolsCachedAt = 0;
const SYMBOLS_CACHE_TTL_MS = 60 * 60 * 1000;

router.get("/deriv/active-symbols", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { q, instrumentType } = req.query as Record<string, string | undefined>;

  if (!cachedSymbols || Date.now() - symbolsCachedAt > SYMBOLS_CACHE_TTL_MS) {
    try {
      const { default: WebSocket } = await import("ws");
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
        const timeout = setTimeout(() => { ws.terminate(); reject(new Error("timeout")); }, 10000);
        ws.on("open", () => ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" })));
        ws.on("message", (data: Buffer) => {
          clearTimeout(timeout);
          try {
            const parsed = JSON.parse(data.toString());
            if (parsed.active_symbols) {
              cachedSymbols = parsed.active_symbols.map((s: Record<string, unknown>) => ({
                symbol: s.symbol,
                displayName: s.display_name,
                shortName: s.symbol_type ?? s.symbol,
                instrumentType: s.market ?? s.symbol_type ?? "unknown",
                subtype: s.submarket ?? null,
                isTradingSuspended: !s.exchange_is_open,
                pip: s.pip ?? null,
              }));
              symbolsCachedAt = Date.now();
            }
          } catch (_) {}
          ws.close();
          resolve();
        });
        ws.on("error", (err: Error) => { clearTimeout(timeout); reject(err); });
      });
    } catch (_) {
      if (!cachedSymbols) cachedSymbols = [];
    }
  }

  let results = cachedSymbols ?? [];
  if (instrumentType) {
    results = results.filter((s: any) => s.instrumentType === instrumentType);
  }
  if (q) {
    const lower = q.toLowerCase();
    results = results.filter((s: any) =>
      s.displayName.toLowerCase().includes(lower) ||
      s.symbol.toLowerCase().includes(lower)
    );
  }

  res.json(results.slice(0, 100));
});

export default router;
