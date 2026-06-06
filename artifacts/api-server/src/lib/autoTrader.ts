import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { autoTradingSessionsTable, usersTable, strategiesTable, tradesTable, autoTradingLogsTable, indicatorsTable } from "@workspace/db";
import { getAccountForMode, buyContract, sellContract, getOpenContractStatus, type DerivBuyParams } from "./derivApi";
import { fetchDerivCandles } from "./derivHistory";
import { parseStrategyLegs, enabledDirections, buildSeries, evalLeg } from "./backtestEngine";
import { logger } from "./logger";
import OpenAI from "openai";

async function logAutoTradeEvent(sessionId: number, symbol: string, action: string, message: string, details?: any) {
  try {
    await db.insert(autoTradingLogsTable).values({
      sessionId,
      symbol,
      action,
      message,
      details: details ? JSON.stringify(details) : null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to insert auto trade log");
  }
}

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  });
}

async function confirmTradeWithAI(
  sym: string, 
  side: string, 
  strategyName: string,
  recentCandles: { open: number; high: number; low: number; close: number }[]
): Promise<{ confirmed: boolean; reason: string }> {
  try {
    const client = getOpenAIClient();
    const prompt = `You are a Deriv AI Trading Assistant.
A trading signal has been generated:
Symbol: ${sym}
Direction: ${side.toUpperCase()}
Strategy: ${strategyName}

Here is the recent price action (last ${recentCandles.length} candles):
${JSON.stringify(recentCandles)}

Your task is to analyze the market context. You must rigorously check two primary conditions:
1. RANGING MARKETS: Use industry standards to detect if the market is currently RANGING (sideways/choppy) or TRENDING. If it is RANGING, you MUST reject the trade to protect capital.
2. MOMENTUM / MACD WEAKNESS: Evaluate the momentum of the recent price action (similar to how MACD behaves).
   - If the signal is BUY/CALL, but the upward momentum is visibly declining, weakening, or starting to turn downwards, you MUST reject the trade.
   - If the signal is SELL/PUT, but the downward momentum is visibly weakening or turning upwards, you MUST reject the trade.

If the market is trending favorably AND momentum strongly supports the signal, confirm the trade.

Do you confirm this trade? Reply strictly with a JSON object: {"recommendation": "confirm", "reason": "..."} or {"recommendation": "reject", "reason": "..."}.`;
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const res = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    return {
      confirmed: res.recommendation === "confirm",
      reason: res.reason || "No reason provided by AI",
    };
  } catch (err) {
    logger.error({ err, sym, side }, "AI Confirmation Failed, defaulting to reject");
    return { confirmed: false, reason: "AI Confirmation API failed or returned an invalid response" };
  }
}

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

  session.totalTrades += 1;
  await db.update(autoTradingSessionsTable)
    .set({ totalTrades: session.totalTrades })
    .where(eq(autoTradingSessionsTable.id, session.id));

  logger.info({ sessionId: session.id, side, signalSide, symbol, contractId: outcome.result.contractId, alternated: side !== signalSide }, "AutoTrader: Trade placed");
  await logAutoTradeEvent(session.id, symbol, "trade", `Successfully placed ${side.toUpperCase()} trade.`, { contractId: outcome.result.contractId, stake: session.stakeAmount });
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

      // Load user-defined indicators once per session (not per symbol) to avoid connection pool exhaustion
      const userIndicatorRows = await db
        .select({
          name: indicatorsTable.name,
          code: indicatorsTable.code,
          parameters: indicatorsTable.parameters,
        })
        .from(indicatorsTable)
        .where(eq(indicatorsTable.userId, user.id));
      const userIndicators = userIndicatorRows.map(r => ({
        name: r.name,
        code: r.code ?? "",
        parameters: r.parameters ?? null,
      }));

      // --- Evaluate which symbols to trade ---
      type SignalMap = Record<string, "buy" | "sell" | null>;
      const signals: SignalMap = {};

      for (const sym of symbols) {
        try {
          const legs = parseStrategyLegs(strategy.code);
          const { riskManagement } = legs;

          // --- Evaluate Risk Management Cooldown ---
          let cooldownActive = false;
          if (riskManagement && (riskManagement.winCooldown || riskManagement.lossCooldown)) {
            const maxN = Math.max(riskManagement.winCooldown?.consecutive || 0, riskManagement.lossCooldown?.consecutive || 0);
            if (maxN > 0) {
              const recentTrades = await db.select({ outcome: tradesTable.currentProfit, closedAt: tradesTable.closedAt })
                .from(tradesTable)
                .where(and(eq(tradesTable.sessionId, session.id), eq(tradesTable.symbol, sym), eq(tradesTable.status, "closed")))
                .orderBy(desc(tradesTable.closedAt))
                .limit(maxN);

              if (recentTrades.length > 0 && recentTrades[0].closedAt) {
                const lastTradeTimeMs = new Date(recentTrades[0].closedAt).getTime();
                const currentTimeMs = Date.now();
                
                // check win cooldown
                if (riskManagement.winCooldown && riskManagement.winCooldown.duration > 0 && riskManagement.winCooldown.consecutive > 0) {
                  const lastN = recentTrades.slice(0, riskManagement.winCooldown.consecutive);
                  if (lastN.length === riskManagement.winCooldown.consecutive && lastN.every(t => (t.outcome || 0) > 0)) {
                    if (currentTimeMs - lastTradeTimeMs < riskManagement.winCooldown.duration * 60 * 1000) {
                      cooldownActive = true;
                    }
                  }
                }

                // check loss cooldown
                if (!cooldownActive && riskManagement.lossCooldown && riskManagement.lossCooldown.duration > 0 && riskManagement.lossCooldown.consecutive > 0) {
                  const lastN = recentTrades.slice(0, riskManagement.lossCooldown.consecutive);
                  // outcome <= 0 implies a loss (or break-even)
                  if (lastN.length === riskManagement.lossCooldown.consecutive && lastN.every(t => (t.outcome || 0) <= 0)) {
                    if (currentTimeMs - lastTradeTimeMs < riskManagement.lossCooldown.duration * 60 * 1000) {
                      cooldownActive = true;
                    }
                  }
                }
              }
            }
          }

          if (cooldownActive) {
            await logAutoTradeEvent(session.id, sym, "cooldown", "Risk Management cooldown is active. Skipping evaluation.");
            signals[sym] = null;
            continue;
          }

          const candles = await fetchDerivCandles(sym, fromSec, nowSec, 60);
          if (candles.length < 2) { signals[sym] = null; continue; }
          const evalIndex = candles.length - 2;
          const directions = enabledDirections(legs);
          if (directions.length === 0) { signals[sym] = null; continue; }

          const map = buildSeries(candles, legs, userIndicators);
          const closes = candles.map(c => c.close);
          const curTime = candles[evalIndex].time;

          // --- Fetch HTF ---
          const htfTimeframes = new Set<number>();
          if (legs.buy.htf?.enabled) htfTimeframes.add(legs.buy.htf.timeframe);
          if (legs.sell.htf?.enabled) htfTimeframes.add(legs.sell.htf.timeframe);
          
          const htfData: Record<number, { candles: any[], map: any, closes: number[] }> = {};
          for (const tf of htfTimeframes) {
             const htfFromSec = nowSec - (tf * 300); // Need ~300 HTF candles to compute EMA200 etc.
             const htfC = await fetchDerivCandles(sym, htfFromSec, nowSec, tf);
             if (htfC.length < 2) continue;
             const hMap = buildSeries(htfC, legs, userIndicators);
             htfData[tf] = { candles: htfC, map: hMap, closes: htfC.map(c => c.close) };
          }

          const htfIndexBuy = legs.buy.htf?.enabled && htfData[legs.buy.htf.timeframe]
            ? htfData[legs.buy.htf.timeframe].candles.findIndex(c => c.time <= curTime && c.time + legs.buy.htf!.timeframe > curTime)
            : undefined;
          const htfIndexSell = legs.sell.htf?.enabled && htfData[legs.sell.htf.timeframe]
            ? htfData[legs.sell.htf.timeframe].candles.findIndex(c => c.time <= curTime && c.time + legs.sell.htf!.timeframe > curTime)
            : undefined;

          const isBuy = directions.includes("buy") && evalLeg(
            legs.buy, evalIndex, map, closes, curTime,
            legs.buy.htf?.enabled ? htfData[legs.buy.htf.timeframe]?.map : undefined,
            legs.buy.htf?.enabled ? htfData[legs.buy.htf.timeframe]?.closes : undefined,
            htfIndexBuy !== -1 ? htfIndexBuy : undefined
          );
          const isSell = directions.includes("sell") && evalLeg(
            legs.sell, evalIndex, map, closes, curTime,
            legs.sell.htf?.enabled ? htfData[legs.sell.htf.timeframe]?.map : undefined,
            legs.sell.htf?.enabled ? htfData[legs.sell.htf.timeframe]?.closes : undefined,
            htfIndexSell !== -1 ? htfIndexSell : undefined
          );
          let side: "buy" | "sell" | null = null;
          
          if (isBuy && isSell) {
            // Conflicting signal — both legs fired simultaneously. Do NOT trade.
            await logAutoTradeEvent(session.id, sym, "skip", "Both BUY and SELL conditions fired simultaneously. Skipping to avoid conflicting signal.");
            side = null;
          } else if (isBuy) {
            side = "buy";
          } else if (isSell) {
            side = "sell";
          }

          if (side) {
             await logAutoTradeEvent(session.id, sym, "evaluate", `Technical conditions met for ${side.toUpperCase()} signal.`);
          }

          if (side && legs[side].useAIConfirmation) {
            await logAutoTradeEvent(session.id, sym, "ai_request", `AI Confirmation requested for ${side.toUpperCase()} signal.`);
            const recentCandles = candles.slice(-50).map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
            const aiResponse = await confirmTradeWithAI(sym, side, strategy.name, recentCandles);
            if (!aiResponse.confirmed) {
              logger.info({ sym, side }, "AutoTrader: AI rejected trade signal");
              await logAutoTradeEvent(session.id, sym, "ai_result", `AI rejected ${side.toUpperCase()} signal. Reason: ${aiResponse.reason}`);
              side = null;
            } else {
              await logAutoTradeEvent(session.id, sym, "ai_result", `AI approved ${side.toUpperCase()} signal. Reason: ${aiResponse.reason}`);
            }
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
          if (sessionForPlace.alternateDirection && !(await isSignalAllowed(session.id, sym, side, true))) {
            await logAutoTradeEvent(session.id, sym, "blocked", `Alternate Direction rule blocked ${side.toUpperCase()} signal.`);
            continue;
          }
          logger.info({ sessionId: session.id, sym, side }, "AutoTrader: Simultaneous signal triggered");
          await placeTrade(user as any, sessionForPlace as any, strategy, sym, side);
          session.totalTrades = sessionForPlace.totalTrades;
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
            session.totalTrades = sessionForPlace.totalTrades;
            const nextIdx = (idx + 1) % symbols.length;
            await db.update(autoTradingSessionsTable)
              .set({ currentPairIdx: nextIdx })
              .where(eq(autoTradingSessionsTable.id, session.id));
            await checkAndStopSession(session);
          } else {
            await logAutoTradeEvent(session.id, sym, "blocked", `Alternate Direction rule blocked ${side.toUpperCase()} signal.`);
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
            session.totalTrades = sessionForPlace.totalTrades;
            await checkAndStopSession(session);
          } else {
            await logAutoTradeEvent(session.id, sym, "blocked", `Alternate Direction rule blocked ${side.toUpperCase()} signal.`);
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
