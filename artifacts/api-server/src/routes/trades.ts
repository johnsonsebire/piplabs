import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { tradesTable, tradeLogsTable, tradeCommentsTable } from "@workspace/db";
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
import { buyContract, getAccountInfo, invalidateBalanceCache, nextReqId, type DerivBuyParams } from "../lib/derivApi";

const router: IRouter = Router();

function mapDirectionToContractType(
  direction: string,
  type: string,
): "CALL" | "PUT" | "MULTUP" | "MULTDOWN" {
  if (type === "multiplier") {
    return direction === "sell" || direction === "put" ? "MULTDOWN" : "MULTUP";
  }
  return direction === "sell" || direction === "put" ? "PUT" : "CALL";
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
  }).returning();

  await db.insert(tradeLogsTable).values({
    tradeId: trade.id,
    level: "info",
    message: `Trade created: ${trade.direction.toUpperCase()} ${trade.symbol} at stake $${trade.stake} (${mode})`,
  });

  // Real Deriv execution path — only when user has connected an API token
  if (user.derivApiToken) {
    try {
      // Verify the token's account matches the requested trade mode (live vs demo)
      const account = await getAccountInfo(user.derivApiToken);
      const accountMode = account.isVirtual ? "demo" : "live";
      if (accountMode !== mode) {
        const msg = `Connected Deriv account is ${accountMode.toUpperCase()} but trade mode is ${mode.toUpperCase()}. Provide an API token for a ${mode} account to execute.`;
        await db.update(tradesTable)
          .set({ status: "cancelled", notes: msg })
          .where(eq(tradesTable.id, trade.id));
        await db.insert(tradeLogsTable).values({
          tradeId: trade.id, level: "error", message: msg,
        });
        res.status(400).json({ error: msg });
        return;
      }

      const contractType = mapDirectionToContractType(parsed.data.direction, parsed.data.type);
      const reqId = nextReqId();
      const buyParams: DerivBuyParams = {
        symbol: parsed.data.symbol,
        contractType,
        amount: parsed.data.stake,
        currency: account.currency,
        duration: parsed.data.duration ?? 5,
        durationUnit: (parsed.data.durationUnit as any) ?? "t",
        basis: "stake",
        reqId,
      };

      const outcome = await buyContract(user.derivApiToken, buyParams);
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
  const todayTrades = closed.filter(t => t.closedAt && t.closedAt >= startOfDay);
  const weekTrades = closed.filter(t => t.closedAt && t.closedAt >= startOfWeek);

  function calcWinRate(trades: typeof closed): number {
    if (trades.length === 0) return 0;
    const wins = trades.filter(t => (t.currentProfit ?? 0) > 0).length;
    return Math.round((wins / trades.length) * 100);
  }

  function sumPnl(trades: typeof closed): number {
    return trades.reduce((s, t) => s + (t.currentProfit ?? 0), 0);
  }

  res.json(GetTradeStatsResponse.parse({
    totalTradesAllTime: allTrades.length,
    openTradesCount: allTrades.filter(t => t.status === "open").length,
    totalPnlToday: sumPnl(todayTrades),
    totalPnlWeek: sumPnl(weekTrades),
    totalPnlMonth: 0,
    winRateToday: calcWinRate(todayTrades),
    winRateWeek: calcWinRate(weekTrades),
    winRateAllTime: calcWinRate(closed),
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
  const [trade] = await db.update(tradesTable)
    .set({ status: "closed", closedAt: new Date() })
    .where(and(eq(tradesTable.id, params.data.id), eq(tradesTable.userId, req.userId!)))
    .returning();
  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }
  await db.insert(tradeLogsTable).values({
    tradeId: trade.id,
    level: "info",
    message: `Trade closed at profit $${trade.currentProfit ?? 0}`,
  });
  res.json(CloseTradeResponse.parse(trade));
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
