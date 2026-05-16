import { Router, type IRouter } from "express";
import { eq, and, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { strategiesTable, indicatorsTable, backtestsTable } from "@workspace/db";
import {
  ListStrategiesResponse,
  CreateStrategyBody,
  GetStrategyParams,
  GetStrategyResponse,
  UpdateStrategyParams,
  UpdateStrategyBody,
  UpdateStrategyResponse,
  DeleteStrategyParams,
  ListIndicatorsResponse,
  CreateIndicatorBody,
  GetIndicatorParams,
  GetIndicatorResponse,
  UpdateIndicatorParams,
  UpdateIndicatorBody,
  UpdateIndicatorResponse,
  DeleteIndicatorParams,
  ListBacktestsQueryParams,
  ListBacktestsResponse,
  RunBacktestBody,
  GetBacktestParams,
  GetBacktestResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

// --- Strategies ---
router.get("/strategies", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const strategies = await db.select().from(strategiesTable)
    .where(or(eq(strategiesTable.userId, req.userId!), eq(strategiesTable.isPublic, true)));
  res.json(ListStrategiesResponse.parse(strategies));
});

router.post("/strategies", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateStrategyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [strategy] = await db.insert(strategiesTable).values({
    userId: req.userId!,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    type: parsed.data.type as any,
    code: parsed.data.code,
    parameters: parsed.data.parameters ?? null,
    isPublic: parsed.data.isPublic ?? false,
  }).returning();
  res.status(201).json(GetStrategyResponse.parse(strategy));
});

router.get("/strategies/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = GetStrategyParams.safeParse({ id });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [strategy] = await db.select().from(strategiesTable)
    .where(and(eq(strategiesTable.id, params.data.id), or(eq(strategiesTable.userId, req.userId!), eq(strategiesTable.isPublic, true))));
  if (!strategy) { res.status(404).json({ error: "Strategy not found" }); return; }
  res.json(GetStrategyResponse.parse(strategy));
});

router.patch("/strategies/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = UpdateStrategyParams.safeParse({ id });
  const body = UpdateStrategyBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const [strategy] = await db.update(strategiesTable).set(body.data as any)
    .where(and(eq(strategiesTable.id, params.data.id), eq(strategiesTable.userId, req.userId!)))
    .returning();
  if (!strategy) { res.status(404).json({ error: "Strategy not found" }); return; }
  res.json(UpdateStrategyResponse.parse(strategy));
});

router.delete("/strategies/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = DeleteStrategyParams.safeParse({ id });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [s] = await db.delete(strategiesTable)
    .where(and(eq(strategiesTable.id, params.data.id), eq(strategiesTable.userId, req.userId!)))
    .returning();
  if (!s) { res.status(404).json({ error: "Strategy not found" }); return; }
  res.sendStatus(204);
});

// --- Indicators ---
router.get("/indicators", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const indicators = await db.select().from(indicatorsTable)
    .where(or(eq(indicatorsTable.userId, req.userId!), eq(indicatorsTable.isPublic, true)));
  res.json(ListIndicatorsResponse.parse(indicators));
});

router.post("/indicators", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateIndicatorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [indicator] = await db.insert(indicatorsTable).values({
    userId: req.userId!,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    code: parsed.data.code,
    parameters: parsed.data.parameters ?? null,
    isPublic: parsed.data.isPublic ?? false,
  }).returning();
  res.status(201).json(GetIndicatorResponse.parse(indicator));
});

router.get("/indicators/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = GetIndicatorParams.safeParse({ id });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [indicator] = await db.select().from(indicatorsTable)
    .where(and(eq(indicatorsTable.id, params.data.id), or(eq(indicatorsTable.userId, req.userId!), eq(indicatorsTable.isPublic, true))));
  if (!indicator) { res.status(404).json({ error: "Indicator not found" }); return; }
  res.json(GetIndicatorResponse.parse(indicator));
});

router.patch("/indicators/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = UpdateIndicatorParams.safeParse({ id });
  const body = UpdateIndicatorBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const [indicator] = await db.update(indicatorsTable).set(body.data as any)
    .where(and(eq(indicatorsTable.id, params.data.id), eq(indicatorsTable.userId, req.userId!)))
    .returning();
  if (!indicator) { res.status(404).json({ error: "Indicator not found" }); return; }
  res.json(UpdateIndicatorResponse.parse(indicator));
});

router.delete("/indicators/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = DeleteIndicatorParams.safeParse({ id });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [i] = await db.delete(indicatorsTable)
    .where(and(eq(indicatorsTable.id, params.data.id), eq(indicatorsTable.userId, req.userId!)))
    .returning();
  if (!i) { res.status(404).json({ error: "Indicator not found" }); return; }
  res.sendStatus(204);
});

// --- Backtests ---
router.get("/backtests", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ListBacktestsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const conditions = [eq(backtestsTable.userId, req.userId!)];
  if (params.data.strategyId) conditions.push(eq(backtestsTable.strategyId, params.data.strategyId));
  const backtests = await db.select().from(backtestsTable).where(and(...conditions));
  res.json(ListBacktestsResponse.parse(backtests));
});

router.post("/backtests", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = RunBacktestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [backtest] = await db.insert(backtestsTable).values({
    strategyId: parsed.data.strategyId,
    userId: req.userId!,
    symbol: parsed.data.symbol,
    fromDate: new Date(parsed.data.fromDate),
    toDate: new Date(parsed.data.toDate),
    initialBalance: parsed.data.initialBalance ?? null,
    stakePerTrade: parsed.data.stakePerTrade ?? null,
    status: "running",
  }).returning();

  // Simulate backtest completion
  setTimeout(async () => {
    const totalTrades = Math.floor(Math.random() * 50) + 20;
    const winRate = Math.random() * 0.4 + 0.4;
    const wins = Math.floor(totalTrades * winRate);
    const stakePerTrade = (parsed.data.stakePerTrade ?? 10);
    const totalPnl = (wins * stakePerTrade * 0.9) - ((totalTrades - wins) * stakePerTrade);
    await db.update(backtestsTable).set({
      status: "completed",
      totalTrades,
      winRate: Math.round(winRate * 100),
      totalPnl: Math.round(totalPnl * 100) / 100,
      maxDrawdown: Math.round(Math.random() * 20 * 100) / 100,
      sharpeRatio: Math.round(Math.random() * 2 * 100) / 100,
      results: JSON.stringify({ wins, losses: totalTrades - wins }),
      completedAt: new Date(),
    }).where(eq(backtestsTable.id, backtest.id));
    await db.update(strategiesTable).set({
      winRate: Math.round(winRate * 100),
    }).where(eq(strategiesTable.id, parsed.data.strategyId));
  }, 3000);

  res.status(201).json(GetBacktestResponse.parse(backtest));
});

router.get("/backtests/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = GetBacktestParams.safeParse({ id });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [backtest] = await db.select().from(backtestsTable)
    .where(and(eq(backtestsTable.id, params.data.id), eq(backtestsTable.userId, req.userId!)));
  if (!backtest) { res.status(404).json({ error: "Backtest not found" }); return; }
  res.json(GetBacktestResponse.parse(backtest));
});

export default router;
