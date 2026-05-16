import { Router, type IRouter } from "express";
import { eq, desc, and, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, tradesTable } from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const user = req.dbUser!;
  const userId = req.userId!;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const allTrades = await db.select().from(tradesTable).where(eq(tradesTable.userId, userId));

  const closed = allTrades.filter(t => t.status === "closed");
  const openTrades = allTrades.filter(t => t.status === "open");
  const todayTrades = closed.filter(t => t.closedAt && t.closedAt >= startOfDay);
  const weekTrades = closed.filter(t => t.closedAt && t.closedAt >= startOfWeek);
  const monthTrades = closed.filter(t => t.closedAt && t.closedAt >= startOfMonth);

  function sumPnl(trades: typeof closed): number {
    return Math.round(trades.reduce((s, t) => s + (t.currentProfit ?? 0), 0) * 100) / 100;
  }
  function calcWinRate(trades: typeof closed): number {
    if (trades.length === 0) return 0;
    return Math.round((trades.filter(t => (t.currentProfit ?? 0) > 0).length / trades.length) * 100);
  }

  const recentActivity = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId))
    .orderBy(desc(tradesTable.openedAt)).limit(5);

  const liveTrades = allTrades.filter(t => t.mode === "live");
  const demoTrades = allTrades.filter(t => t.mode !== "live");
  const liveClosed = liveTrades.filter(t => t.status === "closed");
  const demoClosed = demoTrades.filter(t => t.status === "closed");
  const liveTodayClosed = liveClosed.filter(t => t.closedAt && t.closedAt >= startOfDay);
  const demoTodayClosed = demoClosed.filter(t => t.closedAt && t.closedAt >= startOfDay);
  const liveOpen = liveTrades.filter(t => t.status === "open");
  const demoOpen = demoTrades.filter(t => t.status === "open");

  res.json(GetDashboardSummaryResponse.parse({
    accountBalance: null,
    currency: user.derivCurrency ?? "USD",
    activeTrades: openTrades.length,
    totalPnlToday: sumPnl(todayTrades),
    totalPnlWeek: sumPnl(weekTrades),
    totalPnlMonth: sumPnl(monthTrades),
    winRateToday: calcWinRate(todayTrades),
    winRateWeek: calcWinRate(weekTrades),
    totalTradesAllTime: allTrades.length,
    openTradesCount: openTrades.length,
    livePnlToday: sumPnl(liveTodayClosed),
    demoPnlToday: sumPnl(demoTodayClosed),
    liveOpenTrades: liveOpen.length,
    demoOpenTrades: demoOpen.length,
    derivConnected: !!user.derivApiToken,
    recentActivity: recentActivity.map(t => ({
      id: t.id,
      userId: t.userId,
      symbol: t.symbol,
      displayName: t.displayName,
      type: t.type,
      direction: t.direction,
      status: t.status,
      stake: t.stake,
      currentProfit: t.currentProfit ?? null,
      targetProfit: t.targetProfit ?? null,
      entryPrice: t.entryPrice ?? null,
      exitPrice: t.exitPrice ?? null,
      contractId: t.contractId ?? null,
      strategyId: t.strategyId ?? null,
      notes: t.notes ?? null,
      aiConfirmed: t.aiConfirmed,
      duration: t.duration ?? null,
      durationUnit: t.durationUnit ?? null,
      mode: t.mode,
      openedAt: t.openedAt,
      closedAt: t.closedAt ?? null,
    })),
  }));
});

export default router;
