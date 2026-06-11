import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { tradesTable, tradeLogsTable, tradeCommentsTable, strategiesTable } from "@workspace/db";
import {
  ListTradesQueryParams,
  ListTradesResponse,
  CreateTradeBody,
  GetRecentTradesQueryParams,
  GetRecentTradesResponse,
  GetTradeStatsQueryParams,
  GetTradeStatsResponse,
  GetTradeParams,
  GetTradeResponse,
  UpdateTradeParams,
  UpdateTradeBody,
  UpdateTradeResponse,
  CloseTradeParams,
  CloseTradeResponse,
  ListTradeLogsParams,
  ListTradeLogsResponse,
  AddTradeLogParams,
  AddTradeLogBody,
  ListTradeCommentsParams,
  ListTradeCommentsResponse,
  AddTradeCommentParams,
  AddTradeCommentBody,
  DeleteTradeCommentParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { buyContract, sellContract, getAccountForMode, invalidateBalanceCache, nextReqId, type DerivBuyParams } from "../lib/derivApi";
import { buildSignalPayload, fireStrategyWebhook } from "../lib/strategyWebhook";
import { getMetaApiWrapper } from "@workspace/integrations-meta-api";

const router: IRouter = Router();

function mapDirectionToContractType(
  direction: string,
  type: string,
): "CALL" | "PUT" | "MULTUP" | "MULTDOWN" | "VANILLALONGCALL" | "VANILLALONGPUT" {
  const isDown = direction === "sell" || direction === "put";
  if (type === "multiplier") return isDown ? "MULTDOWN" : "MULTUP";
  // True Deriv Vanilla Options product (contract_type without underscores)
  if (type === "vanilla_options") return isDown ? "VANILLALONGPUT" : "VANILLALONGCALL";
  // forex uses digital CALL/PUT
  return isDown ? "PUT" : "CALL";
}

function parseId(raw: string | string[]): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(s, 10);
}

router.get("/trades", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ListTradesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { status, type, symbol, page = 1, limit = 20 } = params.data;
  const conditions = [eq(tradesTable.userId, req.userId!)];
  if (status) conditions.push(eq(tradesTable.status, status as any));
  if (type) conditions.push(eq(tradesTable.type, type as any));
  if (symbol) conditions.push(eq(tradesTable.symbol, symbol));

  const [trades, countResult] = await Promise.all([
    db.select().from(tradesTable).where(and(...conditions))
      .orderBy(desc(tradesTable.openedAt)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)` }).from(tradesTable).where(and(...conditions)),
  ]);

  res.json(ListTradesResponse.parse({ trades, total: Number(countResult[0]?.count ?? 0), page, limit }));
});

router.post("/trades", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = req.dbUser!;
  const mode = (parsed.data.mode ?? "demo") as "live" | "demo";

  // Insert pending trade first so we always have a record even if Deriv fails
  const [trade] = await db.insert(tradesTable).values({
    userId: req.userId!,
    symbol: parsed.data.symbol,
    displayName: parsed.data.symbol,
    type: parsed.data.type as any,
    direction: parsed.data.direction as any,
    stake: parsed.data.stake,
    targetProfit: parsed.data.targetProfit ?? null,
    notes: parsed.data.notes ?? null,
    strategyId: parsed.data.strategyId ?? null,
    duration: parsed.data.duration ?? null,
    durationUnit: parsed.data.durationUnit ?? null,
    aiConfirmed: parsed.data.aiConfirmed ?? false,
    mode: mode as any,
    status: "pending",
    mt5AccountId: (parsed.data as any).mt5AccountId ?? null,
  }).returning();

  await db.insert(tradeLogsTable).values({
    tradeId: trade.id,
    level: "info",
    message: `Trade created: ${trade.direction.toUpperCase()} ${trade.symbol} at stake $${trade.stake} (${mode})`,
  });

  // Forex execution path via MetaApi
  if (parsed.data.type === "forex") {
    if (!(parsed.data as any).mt5AccountId) {
      const message = "MT5 Account ID is required for Forex trades";
      await db.update(tradesTable).set({ status: "cancelled", notes: message }).where(eq(tradesTable.id, trade.id));
      await db.insert(tradeLogsTable).values({ tradeId: trade.id, level: "error", message });
      res.status(400).json({ error: message });
      return;
    }

    try {
      const metaApi = getMetaApiWrapper();
      const action = parsed.data.direction === "buy" || parsed.data.direction === "call" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL";
      const volume = parsed.data.stake; 
      
      const options: any = {};
      if (parsed.data.targetProfit) {
        options.takeProfit = parsed.data.targetProfit;
      }

      // Normalize symbol for MT5 brokers (e.g. frxXAUUSD -> XAUUSD)
      let mt5Symbol = parsed.data.symbol;
      if (mt5Symbol.startsWith("frx")) {
        mt5Symbol = mt5Symbol.slice(3);
      } else if (mt5Symbol.startsWith("cry")) {
        mt5Symbol = mt5Symbol.slice(3);
      }
      mt5Symbol = mt5Symbol.toUpperCase();

      const result = await metaApi.executeMarketOrder(
        (parsed.data as any).mt5AccountId,
        mt5Symbol,
        action,
        volume,
        options
      );

      const [updated] = await db.update(tradesTable)
        .set({
          status: "open",
          contractId: result.orderId || result.positionId,
          entryPrice: result.price,
        })
        .where(eq(tradesTable.id, trade.id))
        .returning();

      await db.insert(tradeLogsTable).values({
        tradeId: trade.id,
        level: "info",
        message: `Executed on MT5: orderId=${result.orderId} price=${result.price}`,
      });

      res.status(201).json(GetTradeResponse.parse(updated));
      return;
    } catch (err: any) {
      // Improve user-friendliness of MetaApi errors
      let message = err instanceof Error ? err.message : "MT5 execution failed";
      
      // Handle known MetaApi format errors elegantly
      if (err?.stringCode === 'ERR_MARKET_UNKNOWN_SYMBOL' || message.includes('Unknown symbol')) {
        message = `The MT5 broker does not support the symbol: ${parsed.data.symbol}.`;
      } else if (err?.name === 'ValidationError' && message.includes('We were not able to connect to your broker')) {
        message = 'Unable to connect to MT5 broker. Please check that your MT5 account credentials and server are correct.';
      }

      req.log.warn({ err, tradeId: trade.id }, "MT5 trade execution failed");
      await db.update(tradesTable)
        .set({ status: "cancelled", notes: message })
        .where(eq(tradesTable.id, trade.id));
      await db.insert(tradeLogsTable).values({
        tradeId: trade.id, level: "error", message: `MT5 execution failed: ${message}`,
      });
      res.status(502).json({ error: message });
      return;
    }
  }

  // Real Deriv execution path — only when user has connected an API token
  if (user.derivApiToken) {
    try {
      // Pick the Deriv account that matches the requested trade mode (demo/live).
      const account = await getAccountForMode(user.derivApiToken, mode, user.derivAppId);

      const contractType = mapDirectionToContractType(parsed.data.direction, parsed.data.type);
      const reqId = nextReqId();
      const buyParams: DerivBuyParams = {
        symbol: parsed.data.symbol,
        contractType,
        amount: parsed.data.stake,
        currency: account.currency,
        duration: parsed.data.duration ?? 5,
        durationUnit: (parsed.data.durationUnit as any) ?? "m",
        basis: "stake",
        barrier: (parsed.data as any).barrier ?? undefined,
        reqId,
      };

      const outcome = await buyContract(user.derivApiToken, account.accountId, buyParams, user.derivAppId);
      invalidateBalanceCache(user.id);

      if (outcome.ok) {
        const [updated] = await db.update(tradesTable)
          .set({
            status: "open",
            contractId: outcome.result.contractId,
            entryPrice: outcome.result.buyPrice,
          })
          .where(eq(tradesTable.id, trade.id))
          .returning();

        await db.insert(tradeLogsTable).values({
          tradeId: trade.id,
          level: "info",
          message: `Executed on Deriv: contract_id=${outcome.result.contractId} buy=${outcome.result.buyPrice} payout=${outcome.result.payout} — ${outcome.result.longcode}`,
        });

        // Fire strategy webhook (fire-and-forget — never block the HTTP response).
        if (parsed.data.strategyId) {
          db.select({
            name: strategiesTable.name,
            webhookUrl: strategiesTable.webhookUrl,
            webhookSecret: strategiesTable.webhookSecret,
          })
            .from(strategiesTable)
            .where(eq(strategiesTable.id, parsed.data.strategyId))
            .limit(1)
            .then(([strat]) => {
              if (!strat?.webhookUrl) return;
              const payload = buildSignalPayload({
                strategyName: strat.name,
                symbol: trade.symbol,
                direction: trade.direction,
                duration: parsed.data.duration ?? null,
                durationUnit: parsed.data.durationUnit ?? null,
                condition: `Executed — contract ${outcome.result.contractId}, stake $${trade.stake}, entry ${outcome.result.buyPrice}`,
              });
              return fireStrategyWebhook(strat.webhookUrl, payload, strat.webhookSecret);
            })
            .catch((err) => req.log.warn({ err }, "Strategy webhook fire failed (non-fatal)"));
        }

        res.status(201).json(GetTradeResponse.parse(updated));
        return;
      }

      // Buy failed. If the request was sent before the failure we cannot be
      // sure whether Deriv executed it — leave the trade as `pending` (so the
      // user can reconcile against their Deriv account) instead of cancelling
      // a potentially live contract.
      if (outcome.uncertain) {
        const msg = `${outcome.error}. Please check your Deriv account for contract activity (req_id=${outcome.reqId}) before retrying.`;
        req.log.warn({ tradeId: trade.id, reqId: outcome.reqId }, "Deriv buy outcome uncertain");
        await db.update(tradesTable)
          .set({ status: "pending", notes: msg })
          .where(eq(tradesTable.id, trade.id));
        await db.insert(tradeLogsTable).values({
          tradeId: trade.id, level: "warning",
          message: `Deriv execution status UNKNOWN: ${msg}`,
        });
        res.status(202).json({
          ...GetTradeResponse.parse(trade),
          warning: msg,
        });
        return;
      }

      req.log.warn({ tradeId: trade.id, err: outcome.error }, "Deriv trade execution failed");
      await db.update(tradesTable)
        .set({ status: "cancelled", notes: outcome.error })
        .where(eq(tradesTable.id, trade.id));
      await db.insert(tradeLogsTable).values({
        tradeId: trade.id, level: "error", message: `Deriv execution failed: ${outcome.error}`,
      });
      res.status(502).json({ error: outcome.error });
      return;
    } catch (err) {
      // Failure before the buy request was sent (auth/network/account-info)
      const message = err instanceof Error ? err.message : "Deriv pre-execution failed";
      req.log.warn({ err, tradeId: trade.id }, "Deriv pre-execution failed");
      await db.update(tradesTable)
        .set({ status: "cancelled", notes: message })
        .where(eq(tradesTable.id, trade.id));
      await db.insert(tradeLogsTable).values({
        tradeId: trade.id, level: "error", message: `Deriv pre-execution failed: ${message}`,
      });
      res.status(502).json({ error: message });
      return;
    }
  }

  // No Deriv token connected — return the pending trade so the user knows it wasn't sent
  await db.insert(tradeLogsTable).values({
    tradeId: trade.id,
    level: "warning",
    message: "Trade not executed: Deriv API token not connected. Connect a token in Settings to execute trades.",
  });
  res.status(201).json(GetTradeResponse.parse(trade));
});

router.get("/trades/recent", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetRecentTradesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const limit = params.data.limit ?? 10;
  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, req.userId!))
    .orderBy(desc(tradesTable.openedAt)).limit(limit);
  res.json(GetRecentTradesResponse.parse(trades));
});

router.get("/trades/stats", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetTradeStatsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.userId!;
  const allTrades = await db.select().from(tradesTable).where(eq(tradesTable.userId, userId));

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());

  const closed = allTrades.filter(t => t.status === "closed");

  function calcWinRate(trades: typeof closed): number {
    if (trades.length === 0) return 0;
    const wins = trades.filter(t => (t.currentProfit ?? 0) > 0).length;
    return Math.round((wins / trades.length) * 100);
  }

  const totalPnl = closed.reduce((s, t) => s + (t.currentProfit ?? 0), 0);
  const totalStake = allTrades.reduce((s, t) => s + t.stake, 0);
  const averageProfit = closed.length > 0 ? totalPnl / closed.length : 0;

  // Group by contract type
  const typeMap = new Map<string, { count: number; pnl: number; wins: number }>();
  for (const t of closed) {
    const key = t.type;
    const entry = typeMap.get(key) ?? { count: 0, pnl: 0, wins: 0 };
    entry.count++;
    entry.pnl += t.currentProfit ?? 0;
    if ((t.currentProfit ?? 0) > 0) entry.wins++;
    typeMap.set(key, entry);
  }
  const byType = Array.from(typeMap.entries()).map(([type, v]) => ({
    type,
    count: v.count,
    pnl: Math.round(v.pnl * 100) / 100,
    winRate: Math.round((v.wins / v.count) * 100),
  }));

  // Group by asset
  const assetMap = new Map<string, { displayName: string; count: number; pnl: number }>();
  for (const t of closed) {
    const key = t.symbol;
    const entry = assetMap.get(key) ?? { displayName: t.displayName ?? t.symbol, count: 0, pnl: 0 };
    entry.count++;
    entry.pnl += t.currentProfit ?? 0;
    assetMap.set(key, entry);
  }
  const byAsset = Array.from(assetMap.entries()).map(([symbol, v]) => ({
    symbol,
    displayName: v.displayName,
    count: v.count,
    pnl: Math.round(v.pnl * 100) / 100,
  }));

  // Group by calendar day
  const dayMap = new Map<string, { pnl: number; trades: number }>();
  for (const t of closed) {
    if (!t.closedAt) continue;
    const date = t.closedAt.toISOString().slice(0, 10);
    const entry = dayMap.get(date) ?? { pnl: 0, trades: 0 };
    entry.pnl += t.currentProfit ?? 0;
    entry.trades++;
    dayMap.set(date, entry);
  }
  const dailyPnl = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, pnl: Math.round(v.pnl * 100) / 100, trades: v.trades }));

  res.json(GetTradeStatsResponse.parse({
    totalTrades: closed.length,
    winRate: calcWinRate(closed),
    totalPnl: Math.round(totalPnl * 100) / 100,
    totalStake: Math.round(totalStake * 100) / 100,
    averageProfit: Math.round(averageProfit * 100) / 100,
    byType,
    byAsset,
    dailyPnl,
  }));
});

router.get("/trades/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetTradeParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success || isNaN(params.data.id)) {
    res.status(400).json({ error: "Invalid trade id" });
    return;
  }
  const [trade] = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.id, params.data.id), eq(tradesTable.userId, req.userId!)));
  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }
  res.json(GetTradeResponse.parse(trade));
});

router.patch("/trades/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = UpdateTradeParams.safeParse({ id });
  const body = UpdateTradeBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const updates: Partial<typeof tradesTable.$inferInsert> = {};
  if (body.data.notes !== undefined) updates.notes = body.data.notes;
  if (body.data.targetProfit !== undefined) updates.targetProfit = body.data.targetProfit;
  if (body.data.strategyId !== undefined) updates.strategyId = body.data.strategyId;

  const [trade] = await db.update(tradesTable).set(updates)
    .where(and(eq(tradesTable.id, params.data.id), eq(tradesTable.userId, req.userId!)))
    .returning();
  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }
  res.json(UpdateTradeResponse.parse(trade));
});

router.post("/trades/:id/close", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = CloseTradeParams.safeParse({ id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid trade id" });
    return;
  }
  
  const [trade] = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.id, params.data.id), eq(tradesTable.userId, req.userId!)));
    
  if (!trade || trade.status !== "open" || !trade.contractId) {
    res.status(404).json({ error: "Trade not found or not open" });
    return;
  }

  if (trade.type === "forex") {
    if (!trade.mt5AccountId) {
      res.status(400).json({ error: "No MT5 account associated with this trade" });
      return;
    }

    try {
      const metaApi = getMetaApiWrapper();
      await metaApi.closePosition(trade.mt5AccountId, trade.contractId);

      const [updatedTrade] = await db.update(tradesTable)
        .set({
          status: "closed",
          closedAt: new Date(),
        })
        .where(eq(tradesTable.id, trade.id))
        .returning();

      await db.insert(tradeLogsTable).values({
        tradeId: trade.id,
        level: "info",
        message: `Forex position manually closed via MT5.`,
      });

      res.json(CloseTradeResponse.parse(updatedTrade));
      return;
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "Failed to execute sell on MT5";
      req.log.error({ err, tradeId: trade.id }, "Error selling MT5 trade");
      res.status(502).json({ error: msg });
      return;
    }
  }

  const user = req.dbUser!;
  if (!user.derivApiToken) {
    res.status(400).json({ error: "Deriv API token not connected" });
    return;
  }

  try {
    const account = await getAccountForMode(user.derivApiToken, (trade.mode || "demo") as "live" | "demo", user.derivAppId);
    
    // Send sell request
    const outcome = await sellContract(user.derivApiToken, account.accountId, trade.contractId, user.derivAppId);
    
    if (!outcome.ok) {
      await db.insert(tradeLogsTable).values({
        tradeId: trade.id,
        level: "error",
        message: `Failed to sell contract: ${outcome.error}`,
      });
      res.status(502).json({ error: outcome.error });
      return;
    }
    
    // Update trade in DB
    const [updatedTrade] = await db.update(tradesTable)
      .set({ 
        status: "closed", 
        closedAt: new Date(), 
        currentProfit: outcome.result.soldPrice - trade.stake 
      })
      .where(eq(tradesTable.id, trade.id))
      .returning();

    await db.insert(tradeLogsTable).values({
      tradeId: trade.id,
      level: "info",
      message: `Trade manually closed at profit $${updatedTrade.currentProfit ?? 0} (Sold for $${outcome.result.soldPrice})`,
    });
    
    res.json(CloseTradeResponse.parse(updatedTrade));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to execute sell";
    req.log.error({ err, tradeId: trade.id }, "Error selling trade");
    res.status(500).json({ error: msg });
  }
});

router.get("/trades/:id/logs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = ListTradeLogsParams.safeParse({ id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid trade id" });
    return;
  }
  const logs = await db.select().from(tradeLogsTable)
    .where(eq(tradeLogsTable.tradeId, params.data.id))
    .orderBy(tradeLogsTable.createdAt);
  res.json(ListTradeLogsResponse.parse(logs));
});

router.post("/trades/:id/logs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = AddTradeLogParams.safeParse({ id });
  const body = AddTradeLogBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [log] = await db.insert(tradeLogsTable).values({
    tradeId: params.data.id,
    level: (body.data.level as any) ?? "info",
    message: body.data.message,
    metadata: body.data.metadata ? JSON.stringify(body.data.metadata) : null,
  }).returning();
  res.status(201).json(log);
});

router.get("/trades/:id/comments", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = ListTradeCommentsParams.safeParse({ id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid trade id" });
    return;
  }
  const comments = await db.select().from(tradeCommentsTable)
    .where(eq(tradeCommentsTable.tradeId, params.data.id))
    .orderBy(tradeCommentsTable.createdAt);
  res.json(ListTradeCommentsResponse.parse(comments));
});

router.post("/trades/:id/comments", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = AddTradeCommentParams.safeParse({ id });
  const body = AddTradeCommentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const user = req.dbUser!;
  const [comment] = await db.insert(tradeCommentsTable).values({
    tradeId: params.data.id,
    userId: req.userId!,
    userDisplayName: user.displayName ?? user.email,
    content: body.data.content,
  }).returning();
  res.status(201).json(comment);
});

router.delete("/trades/:id/comments/:commentId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = DeleteTradeCommentParams.safeParse({
    id: parseId(req.params.id),
    commentId: parseId(req.params.commentId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const [comment] = await db.delete(tradeCommentsTable)
    .where(and(
      eq(tradeCommentsTable.id, params.data.commentId),
      eq(tradeCommentsTable.tradeId, params.data.id),
      eq(tradeCommentsTable.userId, req.userId!),
    ))
    .returning();
  if (!comment) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;