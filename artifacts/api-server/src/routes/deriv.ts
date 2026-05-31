import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { ConnectDerivBody } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { getAccountInfo, getAccountInfoCached, invalidateBalanceCache } from "../lib/derivApi";
import { buildDerivStatusPayload } from "../lib/derivStatus";
import { dbErrorMessage } from "../lib/dbErrors";

const router: IRouter = Router();

router.post("/deriv/connect", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const parsed = ConnectDerivBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const apiToken = parsed.data.apiToken.trim();
    const appId = parsed.data.appId?.trim() || null;
    const accountId = parsed.data.accountId?.trim() || null;

    if (!apiToken) {
      res.status(400).json({ error: "API token is required" });
      return;
    }

    if (!appId) {
      res.status(400).json({
        error:
          "App ID is required. Use the App ID from your PAT-type app at developers.deriv.com (must match the app that issued your PAT).",
      });
      return;
    }

    let accountInfo;
    try {
      accountInfo = await getAccountInfo(apiToken, appId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid Deriv API token";
      req.log.warn(
        { err, derivMessage: message, tokenLen: apiToken.length, tokenPrefix: apiToken.slice(0, 4) },
        "Deriv connect/authorize failed",
      );
      res.status(400).json({ error: message });
      return;
    }

    invalidateBalanceCache(req.userId!);

    const [user] = await db
      .update(usersTable)
      .set({
        derivApiToken: apiToken,
        derivAppId: appId,
        derivAccountId: accountId ?? accountInfo.loginId,
        derivLoginId: accountInfo.loginId,
        derivCurrency: accountInfo.currency,
        derivConnectedAt: new Date(),
      })
      .where(eq(usersTable.id, req.userId!))
      .returning();

    if (!user) {
      req.log.error({ userId: req.userId }, "Deriv connect: user row not updated");
      res.status(500).json({ error: "Could not save Deriv credentials for your account" });
      return;
    }

    res.json(buildDerivStatusPayload(true, user, accountInfo.balance));
  } catch (err) {
    const dbMsg = dbErrorMessage(err);
    req.log.error({ err }, "Deriv connect unexpected error");
    res.status(500).json({
      error: dbMsg ?? (err instanceof Error ? err.message : "Failed to connect Deriv API"),
    });
  }
});

router.delete("/deriv/connect", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    await db
      .update(usersTable)
      .set({
        derivApiToken: null,
        derivAppId: null,
        derivAccountId: null,
        derivLoginId: null,
        derivCurrency: null,
        derivConnectedAt: null,
      })
      .where(eq(usersTable.id, req.userId!));

    invalidateBalanceCache(req.userId!);

    res.json(buildDerivStatusPayload(false, null));
  } catch (err) {
    const dbMsg = dbErrorMessage(err);
    req.log.error({ err }, "Deriv disconnect error");
    res.status(500).json({
      error: dbMsg ?? (err instanceof Error ? err.message : "Failed to disconnect Deriv API"),
    });
  }
});

router.get("/deriv/status", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const user = req.dbUser!;

    let balance: number | null = null;
    if (user.derivApiToken) {
      try {
        const info = await getAccountInfoCached(user.id, user.derivApiToken, user.derivAppId);
        balance = info.balance;
      } catch {
        // Non-fatal — return status without balance if the fetch fails
      }
    }

    res.json(
      buildDerivStatusPayload(!!user.derivApiToken, user, balance),
    );
  } catch (err) {
    req.log.error({ err }, "Deriv status error");
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to load Deriv status",
    });
  }
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
