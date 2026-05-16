import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { autoTradingSessionsTable, strategiesTable } from "@workspace/db";
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
      stakeAmount: autoTradingSessionsTable.stakeAmount,
      maxTrades: autoTradingSessionsTable.maxTrades,
      stopOnLoss: autoTradingSessionsTable.stopOnLoss,
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

  res.json(ListAutoTradeSessionsResponse.parse(sessions));
});

router.post("/autotrade/sessions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateAutoTradeSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { strategyId, mode, symbol, stakeAmount, maxTrades, stopOnLoss } = parsed.data;
  const userId = req.userId!;

  const strategy = await db.select().from(strategiesTable)
    .where(and(eq(strategiesTable.id, strategyId), eq(strategiesTable.userId, userId)))
    .limit(1);
  if (!strategy[0]) {
    res.status(404).json({ error: "Strategy not found" });
    return;
  }

  const [session] = await db.insert(autoTradingSessionsTable).values({
    userId,
    strategyId,
    mode: mode as any,
    symbol,
    stakeAmount,
    maxTrades: maxTrades ?? null,
    stopOnLoss: stopOnLoss ?? null,
    status: "running",
    totalTrades: 0,
    winTrades: 0,
    totalPnl: 0,
  }).returning();

  const result = { ...session, strategyName: strategy[0].name };
  res.status(201).json(result);
});

router.patch("/autotrade/sessions/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateAutoTradeSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const bodyParsed = UpdateAutoTradeSessionBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const userId = req.userId!;
  const sessionId = params.data.id;
  const { status } = bodyParsed.data;

  const updates: Record<string, unknown> = { status };
  if (status === "stopped") {
    updates.stoppedAt = new Date();
  }

  const [updated] = await db.update(autoTradingSessionsTable)
    .set(updates as any)
    .where(and(eq(autoTradingSessionsTable.id, sessionId), eq(autoTradingSessionsTable.userId, userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const strategy = await db.select({ name: strategiesTable.name }).from(strategiesTable)
    .where(eq(strategiesTable.id, updated.strategyId)).limit(1);

  res.json(UpdateAutoTradeSessionResponse.parse({ ...updated, strategyName: strategy[0]?.name ?? null }));
});

router.delete("/autotrade/sessions/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = DeleteAutoTradeSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.userId!;
  const sessionId = params.data.id;

  await db.delete(autoTradingSessionsTable)
    .where(and(eq(autoTradingSessionsTable.id, sessionId), eq(autoTradingSessionsTable.userId, userId)));

  res.status(204).send();
});

export default router;
