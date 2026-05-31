import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { autoTradingSessionsTable, strategiesTable, tradesTable } from "@workspace/db";
import {
  ListAutoTradeSessionsResponse,
  CreateAutoTradeSessionBody,
  UpdateAutoTradeSessionParams,
  UpdateAutoTradeSessionBody,
  UpdateAutoTradeSessionResponse,
  DeleteAutoTradeSessionParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/autotrade/sessions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.userId!;
  const sessions = await db
    .select({
      id: autoTradingSessionsTable.id,
      userId: autoTradingSessionsTable.userId,
      strategyId: autoTradingSessionsTable.strategyId,
      strategyName: strategiesTable.name,
      status: autoTradingSessionsTable.status,
      mode: autoTradingSessionsTable.mode,
      symbol: autoTradingSessionsTable.symbol,
      symbols: autoTradingSessionsTable.symbols,
      pairMode: autoTradingSessionsTable.pairMode,
      currentPairIdx: autoTradingSessionsTable.currentPairIdx,
      stakeAmount: autoTradingSessionsTable.stakeAmount,
      duration: autoTradingSessionsTable.duration,
      durationUnit: autoTradingSessionsTable.durationUnit,
      maxTrades: autoTradingSessionsTable.maxTrades,
      stopOnLoss: autoTradingSessionsTable.stopOnLoss,
      profitTarget: autoTradingSessionsTable.profitTarget,
      totalTrades: autoTradingSessionsTable.totalTrades,
      winTrades: autoTradingSessionsTable.winTrades,
      totalPnl: autoTradingSessionsTable.totalPnl,
      errorMessage: autoTradingSessionsTable.errorMessage,
      startedAt: autoTradingSessionsTable.startedAt,
      stoppedAt: autoTradingSessionsTable.stoppedAt,
      createdAt: autoTradingSessionsTable.createdAt,
    })
    .from(autoTradingSessionsTable)
    .leftJoin(strategiesTable, eq(autoTradingSessionsTable.strategyId, strategiesTable.id))
    .where(eq(autoTradingSessionsTable.userId, userId))
    .orderBy(desc(autoTradingSessionsTable.createdAt));

  const parsedSessions = sessions.map(s => {
    let parsedSymbols: string[] = [];
    if (typeof s.symbols === "string") {
      try {
        parsedSymbols = JSON.parse(s.symbols);
      } catch {
        parsedSymbols = [];
      }
    } else if (Array.isArray(s.symbols)) {
      parsedSymbols = s.symbols;
    }
    return {
      ...s,
      symbols: parsedSymbols,
    };
  });

  res.json(ListAutoTradeSessionsResponse.parse(parsedSessions));
});

router.post("/autotrade/sessions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateAutoTradeSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { strategyId, mode, symbol, symbols, pairMode, stakeAmount, duration, durationUnit, maxTrades, stopOnLoss, profitTarget, tradeProfitTarget, alternateDirection } = parsed.data;
  const userId = req.userId!;

  const strategy = await db.select().from(strategiesTable)
    .where(and(eq(strategiesTable.id, strategyId), eq(strategiesTable.userId, userId)))
    .limit(1);
  if (!strategy[0]) {
    res.status(404).json({ error: "Strategy not found" });
    return;
  }

  const symbolsJson = symbols && symbols.length > 0 ? JSON.stringify(symbols) : "[]";

  const [session] = await db.insert(autoTradingSessionsTable).values({
    userId,
    strategyId,
    mode: mode as any,
    symbol,
    symbols: symbolsJson,
    pairMode: pairMode || "single",
    stakeAmount,
    duration,
    durationUnit,
    maxTrades: maxTrades ?? null,
    stopOnLoss: stopOnLoss ?? null,
    profitTarget: profitTarget ?? null,
    tradeProfitTarget: tradeProfitTarget ?? null,
    alternateDirection: alternateDirection ?? false,
    status: "running",
    totalTrades: 0,
    winTrades: 0,
    totalPnl: 0,
  }).returning();

  let parsedSymbols: string[] = [];
  if (typeof session.symbols === "string") {
    try { parsedSymbols = JSON.parse(session.symbols); } catch { parsedSymbols = []; }
  } else if (Array.isArray(session.symbols)) {
    parsedSymbols = session.symbols;
  }

  const result = { ...session, symbols: parsedSymbols, strategyName: strategy[0].name };
  res.status(201).json(result);
});

router.patch("/autotrade/sessions/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateAutoTradeSessionParams.safeParse(req.params);
  if (!params.success) {
    console.error("UpdateAutoTradeSessionParams error", params.error);
    res.status(400).json({ error: params.error.message });
    return;
  }
  const bodyParsed = UpdateAutoTradeSessionBody.safeParse(req.body);
  if (!bodyParsed.success) {
    console.error("UpdateAutoTradeSessionBody error", bodyParsed.error);
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const userId = req.userId!;
  const sessionId = params.data.id;
  const { status, stakeAmount, duration, durationUnit, symbols, pairMode, maxTrades, stopOnLoss, profitTarget, tradeProfitTarget, alternateDirection } = bodyParsed.data;

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (status === "stopped") updates.stoppedAt = new Date();
  
  if (stakeAmount !== undefined) updates.stakeAmount = stakeAmount;
  if (duration !== undefined) updates.duration = duration;
  if (durationUnit !== undefined) updates.durationUnit = durationUnit;
  if (symbols !== undefined) updates.symbols = JSON.stringify(symbols);
  if (pairMode !== undefined) updates.pairMode = pairMode;
  if (maxTrades !== undefined) updates.maxTrades = maxTrades;
  if (stopOnLoss !== undefined) updates.stopOnLoss = stopOnLoss;
  if (profitTarget !== undefined) updates.profitTarget = profitTarget;
  if (tradeProfitTarget !== undefined) updates.tradeProfitTarget = tradeProfitTarget;
  if (alternateDirection !== undefined) updates.alternateDirection = alternateDirection;

  const [updated] = await db.update(autoTradingSessionsTable)
    .set(updates as any)
    .where(and(eq(autoTradingSessionsTable.id, sessionId), eq(autoTradingSessionsTable.userId, userId)))
    .returning();

  if (!updated) {
    console.error("Update auto session not found. sessionId:", sessionId, "userId:", userId);
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const strategy = await db.select({ name: strategiesTable.name }).from(strategiesTable)
    .where(eq(strategiesTable.id, updated.strategyId)).limit(1);

  let parsedSymbols: string[] = [];
  if (typeof updated.symbols === "string") {
    try { parsedSymbols = JSON.parse(updated.symbols); } catch { parsedSymbols = []; }
  } else if (Array.isArray(updated.symbols)) {
    parsedSymbols = updated.symbols;
  }

  res.json(UpdateAutoTradeSessionResponse.parse({ ...updated, symbols: parsedSymbols, strategyName: strategy[0]?.name ?? null }));
});

router.delete("/autotrade/sessions/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = DeleteAutoTradeSessionParams.safeParse(req.params);
  if (!params.success) {
    console.error("DeleteAutoTradeSessionParams error", params.error);
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.userId!;
  const sessionId = params.data.id;

  const result = await db.delete(autoTradingSessionsTable)
    .where(and(eq(autoTradingSessionsTable.id, sessionId), eq(autoTradingSessionsTable.userId, userId)))
    .returning();
  
  if (result.length === 0) {
    console.error("Delete auto session not found. sessionId:", sessionId, "userId:", userId);
  }

  res.status(204).send();
});

router.get("/autotrade/sessions/:id/trades", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const sessionId = parseInt(req.params.id as string, 10);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }
  
  // Verify session belongs to user
  const [session] = await db.select({ id: autoTradingSessionsTable.id }).from(autoTradingSessionsTable)
    .where(and(eq(autoTradingSessionsTable.id, sessionId), eq(autoTradingSessionsTable.userId, req.userId!)))
    .limit(1);
    
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Get trades for this specific session
  const trades = await db.select().from(tradesTable)
    .where(and(
      eq(tradesTable.userId, req.userId!),
      eq(tradesTable.sessionId, sessionId)
    ))
    .orderBy(desc(tradesTable.openedAt))
    .limit(50);
    
  res.json(trades);
});

export default router;
