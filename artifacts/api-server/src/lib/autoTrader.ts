import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { autoTradingSessionsTable, usersTable, strategiesTable, tradesTable } from "@workspace/db";
import { getAccountForMode, buyContract, sellContract, getOpenContractStatus, type DerivBuyParams } from "./derivApi";
import { fetchDerivCandles } from "./derivHistory";
import { parseStrategyLegs, enabledDirections, buildSeries, evalLeg } from "./backtestEngine";
import { logger } from "./logger";

export function startAutoTraderWorker() {
  const SIGNAL_INTERVAL_MS = 60 * 1000;    // 1 minute — evaluate signals
  const MONITOR_INTERVAL_MS = 10 * 1000;   // 10 seconds — monitor open trades for TP

  setInterval(async () => {
    try {
      await processAutoTradingSessions();
    } catch (err) {
      logger.error({ err }, "AutoTrader worker loop error");
    }
  }, SIGNAL_INTERVAL_MS).unref?.();

  setInterval(async () => {
    try {
      await monitorOpenTrades();
    } catch (err) {
      logger.error({ err }, "AutoTrader monitor loop error");
    }
  }, MONITOR_INTERVAL_MS).unref?.();

  logger.info("AutoTrader worker started (signal 60s, monitor 10s)");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSymbols(session: { symbols: string; symbol: string }): string[] {
  try {
    const arr = JSON.parse(session.symbols);
    if (Array.isArray(arr) && arr.length > 0) return arr.map(String);
  } catch { /* fall through */ }
  return [session.symbol];
}

/**
 * Checks if the signal is allowed given the alternateDirection rule.
 * When alternateDirection is on, we only accept a signal if it is the OPPOSITE
 * of the last trade's direction for that symbol.
 */
async function isSignalAllowed(
  sessionId: number,
  symbol: string,
  signalSide: "buy" | "sell",
  alternateDirection: boolean,
): Promise<boolean> {
  if (!alternateDirection) return true;

  // Find the most recent closed or open trade for this session+symbol
  const [lastTrade] = await db
    .select({ direction: tradesTable.direction })
    .from(tradesTable)
    .where(and(eq(tradesTable.sessionId, sessionId), eq(tradesTable.symbol, symbol)))
    .orderBy(desc(tradesTable.openedAt))
    .limit(1);

  if (!lastTrade) return true; // No prior trade — any signal is allowed

  const wasCall = lastTrade.direction === "call" || lastTrade.direction === "buy";
  const lastSide = wasCall ? "buy" : "sell";

  // Only allow if it's the opposite side
  return signalSide !== lastSide;
}

async function placeTrade(
  user: { id: string; derivApiToken: string | null; derivAppId: string | null },
  session: {
    id: number; mode: string; stakeAmount: number; duration: number;
    durationUnit: string; totalTrades: number;
    tradeProfitTarget: number | null; alternateDirection: boolean;
  },
  strategy: { id: number },
  symbol: string,
  signalSide: "buy" | "sell",
) {
  if (!user.derivApiToken) return false;

  const account = await getAccountForMode(user.derivApiToken, session.mode as "demo" | "live", user.derivAppId);
  const contractType = signalSide === "buy" ? "CALL" : "PUT";
  const side = signalSide;
  const buyParams: DerivBuyParams = {
    symbol,
    contractType,
    amount: session.stakeAmount,
    currency: account.currency,
    duration: session.duration,
    durationUnit: session.durationUnit as any,
    reqId: Date.now() % 1000000,
    basis: "stake",
  };

  const outcome = await buyContract(user.derivApiToken, account.accountId, buyParams, user.derivAppId);
  if (!outcome.ok) {
    logger.error({ error: outcome.error, sessionId: session.id, symbol }, "AutoTrader: Failed to place trade");
    return false;
  }

  await db.insert(tradesTable).values({
    userId: user.id,
    symbol,
    displayName: symbol,
    contractId: outcome.result.contractId,
    type: "vanilla_options",
    direction: side === "buy" ? "call" : "put",
    status: "open",
    openedAt: new Date(outcome.result.startTime * 1000),
    entryPrice: outcome.result.buyPrice,
    stake: session.stakeAmount,
    strategyId: strategy.id,
    sessionId: session.id,
    targetProfit: session.tradeProfitTarget ?? null,
    duration: session.duration,
    durationUnit: session.durationUnit as string,
    mode: session.mode as "demo" | "live",
  });

  await db.update(autoTradingSessionsTable)
    .set({ totalTrades: session.totalTrades + 1 })
    .where(eq(autoTradingSessionsTable.id, session.id));

  logger.info({ sessionId: session.id, side, signalSide, symbol, contractId: outcome.result.contractId, alternated: side !== signalSide }, "AutoTrader: Trade placed");
  return true;
}

async function checkAndStopSession(
  session: { id: number; maxTrades: number | null; totalTrades: number; stopOnLoss: number | null; totalPnl: number; profitTarget: number | null },
): Promise<boolean> {
  // Max trades reached
  if (session.maxTrades !== null && session.totalTrades >= session.maxTrades) {
    await db.update(autoTradingSessionsTable)
      .set({ status: "stopped", stoppedAt: new Date() })
      .where(eq(autoTradingSessionsTable.id, session.id));
    logger.info({ sessionId: session.id }, "AutoTrader: Session stopped — max trades reached");
    return true;
  }
  // Stop on loss
  if (session.stopOnLoss !== null && session.totalPnl <= -Math.abs(session.stopOnLoss)) {
    await db.update(autoTradingSessionsTable)
      .set({ status: "stopped", stoppedAt: new Date() })
      .where(eq(autoTradingSessionsTable.id, session.id));
    logger.info({ sessionId: session.id }, "AutoTrader: Session stopped — stop loss hit");
    return true;
  }
  // Session profit target
  if (session.profitTarget !== null && session.totalPnl >= session.profitTarget) {
    await db.update(autoTradingSessionsTable)
      .set({ status: "stopped", stoppedAt: new Date() })
      .where(eq(autoTradingSessionsTable.id, session.id));
    logger.info({ sessionId: session.id }, "AutoTrader: Session stopped — profit target reached");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Signal processor — runs every 60 s
// ---------------------------------------------------------------------------
async function processAutoTradingSessions() {
  const sessions = await db
    .select({
      session: autoTradingSessionsTable,
      user: usersTable,
      strategy: strategiesTable,
    })
    .from(autoTradingSessionsTable)
    .innerJoin(usersTable, eq(autoTradingSessionsTable.userId, usersTable.id))
    .innerJoin(strategiesTable, eq(autoTradingSessionsTable.strategyId, strategiesTable.id))
    .where(eq(autoTradingSessionsTable.status, "running"));

  for (const { session, user, strategy } of sessions) {
    try {
      if (!user.derivApiToken) {
        logger.warn({ sessionId: session.id }, "AutoTrader: No Deriv token, skipping");
        continue;
      }

      // Guard: stop checks before placing new trades
      if (await checkAndStopSession(session)) continue;

      const symbols = parseSymbols(session);
      const pairMode = (session.pairMode || "single") as "single" | "simultaneous" | "rotating";
      const nowSec = Math.floor(Date.now() / 1000);
      const fromSec = nowSec - 5 * 60 * 60;

      // --- Evaluate which symbols to trade ---
      type SignalMap = Record<string, "buy" | "sell" | null>;
      const signals: SignalMap = {};

      for (const sym of symbols) {
        try {
          const candles = await fetchDerivCandles(sym, fromSec, nowSec, 60);
          if (candles.length < 2) { signals[sym] = null; continue; }
          const evalIndex = candles.length - 2;
          const legs = parseStrategyLegs(strategy.code);
          const directions = enabledDirections(legs);
          if (directions.length === 0) { signals[sym] = null; continue; }
          const map = buildSeries(candles, legs);
          const closes = candles.map(c => c.close);
          const isBuy = directions.includes("buy") && evalLeg(legs.buy, evalIndex, map, closes);
          const isSell = directions.includes("sell") && evalLeg(legs.sell, evalIndex, map, closes);
          let side: "buy" | "sell" | null = null;
          
          if (isBuy && isSell) {
            side = "buy";
          } else if (isBuy) {
            side = "buy";
          } else if (isSell) {
            side = "sell";
          }
          signals[sym] = side;
        } catch (err) {
          logger.warn({ err, sym, sessionId: session.id }, "AutoTrader: Candle fetch failed for symbol");
          signals[sym] = null;
        }
      }

      // --- Execute trades based on pairMode ---
      const sessionForPlace = {
        ...session,
        tradeProfitTarget: (session as any).tradeProfitTarget ?? null,
        alternateDirection: (session as any).alternateDirection ?? false,
      };

      if (pairMode === "simultaneous") {
        for (const [sym, side] of Object.entries(signals)) {
          if (!side) continue;
          if (sessionForPlace.alternateDirection && !(await isSignalAllowed(session.id, sym, side, true))) continue;
          logger.info({ sessionId: session.id, sym, side }, "AutoTrader: Simultaneous signal triggered");
          await placeTrade(user as any, sessionForPlace as any, strategy, sym, side);
          if (await checkAndStopSession(session)) break;
        }
      } else if (pairMode === "rotating") {
        const idx = (session.currentPairIdx || 0) % symbols.length;
        const sym = symbols[idx];
        const side = signals[sym];
        if (side) {
          const allowed = !sessionForPlace.alternateDirection || (await isSignalAllowed(session.id, sym, side, true));
          if (allowed) {
            logger.info({ sessionId: session.id, sym, side, idx }, "AutoTrader: Rotating signal triggered");
            await placeTrade(user as any, sessionForPlace as any, strategy, sym, side);
            const nextIdx = (idx + 1) % symbols.length;
            await db.update(autoTradingSessionsTable)
              .set({ currentPairIdx: nextIdx })
              .where(eq(autoTradingSessionsTable.id, session.id));
          }
        }
      } else {
        const sym = symbols[0];
        const side = signals[sym];
        if (side) {
          const allowed = !sessionForPlace.alternateDirection || (await isSignalAllowed(session.id, sym, side, true));
          if (allowed) {
            logger.info({ sessionId: session.id, sym, side }, "AutoTrader: Single signal triggered");
            await placeTrade(user as any, sessionForPlace as any, strategy, sym, side);
          }
        }
      }
    } catch (err) {
      logger.error({ err, sessionId: session.id }, "AutoTrader: Error processing session");
    }
  }
}

// ---------------------------------------------------------------------------
// Open trade monitor — runs every 10 s — updates P&L, auto-sells on TP
// ---------------------------------------------------------------------------
async function monitorOpenTrades() {
  const openTrades = await db
    .select({ trade: tradesTable, user: usersTable })
    .from(tradesTable)
    .innerJoin(usersTable, eq(tradesTable.userId, usersTable.id))
    .where(eq(tradesTable.status, "open"));

  for (const { trade, user } of openTrades) {
    if (!trade.contractId || !user.derivApiToken) continue;

    try {
      const account = await getAccountForMode(user.derivApiToken, (trade.mode || "demo") as "demo" | "live", user.derivAppId);
      const status = await getOpenContractStatus(user.derivApiToken, account.accountId, trade.contractId, user.derivAppId);
      if (!status) continue;

      // Always update live P&L
      await db.update(tradesTable)
        .set({ currentProfit: status.currentProfit })
        .where(eq(tradesTable.id, trade.id));

      // Contract expired or already sold — close it and update session P&L
      if (status.isExpired || status.isSold) {
        await db.update(tradesTable)
          .set({ status: "closed", closedAt: new Date(), currentProfit: status.currentProfit })
          .where(eq(tradesTable.id, trade.id));

        if (trade.sessionId) {
          const [sess] = await db
            .select({
              id: autoTradingSessionsTable.id,
              totalPnl: autoTradingSessionsTable.totalPnl,
              winTrades: autoTradingSessionsTable.winTrades,
              maxTrades: autoTradingSessionsTable.maxTrades,
              totalTrades: autoTradingSessionsTable.totalTrades,
              stopOnLoss: autoTradingSessionsTable.stopOnLoss,
              profitTarget: autoTradingSessionsTable.profitTarget,
            })
            .from(autoTradingSessionsTable)
            .where(eq(autoTradingSessionsTable.id, trade.sessionId))
            .limit(1);

          if (sess) {
            const newPnl = (sess.totalPnl || 0) + status.currentProfit;
            const newWins = status.currentProfit > 0 ? (sess.winTrades || 0) + 1 : (sess.winTrades || 0);
            await db.update(autoTradingSessionsTable)
              .set({ totalPnl: newPnl, winTrades: newWins })
              .where(eq(autoTradingSessionsTable.id, sess.id));

            // Check session stop conditions immediately after P&L update
            await checkAndStopSession({ ...sess, totalPnl: newPnl });
          }
        }

        logger.info({ tradeId: trade.id, profit: status.currentProfit }, "AutoTrader: Trade expired/closed");
        continue;
      }

      // Per-trade TP auto-sell: if targetProfit is set and current profit >= target
      if (
        trade.targetProfit !== null &&
        trade.targetProfit !== undefined &&
        status.currentProfit >= trade.targetProfit
      ) {
        logger.info({ tradeId: trade.id, profit: status.currentProfit, target: trade.targetProfit }, "AutoTrader: TP hit — selling contract");
        const sellResult = await sellContract(user.derivApiToken, account.accountId, trade.contractId, user.derivAppId);
        if (sellResult.ok) {
          const finalProfit = sellResult.result.soldPrice - trade.stake;
          await db.update(tradesTable)
            .set({ status: "closed", closedAt: new Date(), currentProfit: finalProfit })
            .where(eq(tradesTable.id, trade.id));

          // Update session P&L after TP sell too
          if (trade.sessionId) {
            const [sess] = await db
              .select({
                id: autoTradingSessionsTable.id,
                totalPnl: autoTradingSessionsTable.totalPnl,
                winTrades: autoTradingSessionsTable.winTrades,
                maxTrades: autoTradingSessionsTable.maxTrades,
                totalTrades: autoTradingSessionsTable.totalTrades,
                stopOnLoss: autoTradingSessionsTable.stopOnLoss,
                profitTarget: autoTradingSessionsTable.profitTarget,
              })
              .from(autoTradingSessionsTable)
              .where(eq(autoTradingSessionsTable.id, trade.sessionId))
              .limit(1);

            if (sess) {
              const newPnl = (sess.totalPnl || 0) + finalProfit;
              const newWins = finalProfit > 0 ? (sess.winTrades || 0) + 1 : (sess.winTrades || 0);
              await db.update(autoTradingSessionsTable)
                .set({ totalPnl: newPnl, winTrades: newWins })
                .where(eq(autoTradingSessionsTable.id, sess.id));
              await checkAndStopSession({ ...sess, totalPnl: newPnl });
            }
          }

          logger.info({ tradeId: trade.id, soldPrice: sellResult.result.soldPrice }, "AutoTrader: TP sell successful");
        } else {
          logger.warn({ tradeId: trade.id, error: sellResult.error }, "AutoTrader: TP sell failed");
        }
      }
    } catch (err) {
      logger.warn({ err, tradeId: trade.id }, "AutoTrader: Monitor error for trade");
    }
  }
}
