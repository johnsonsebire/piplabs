import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { usersTable, strategiesTable, indicatorsTable } from "@workspace/db";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { fetchDerivCandles } from "../lib/derivHistory";
import { parseStrategyLegs, enabledDirections, buildSeries, evalLeg } from "../lib/backtestEngine";

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  });
}

const router = Router();

router.post("/scanner/alert", requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.userId;
    const { signal, payload } = req.body; // Expect payload to be defined by user's configuration

    if (!signal) {
      return res.status(400).json({ error: "Missing signal data" });
    }

    // Fetch user preferences
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { scannerWebhookUrl, scannerEmailAlerts } = user;
    const results: any = { webhook: "skipped", email: "skipped" };

    // 1. Dispatch Webhook
    if (scannerWebhookUrl) {
      try {
        const webhookResponse = await fetch(scannerWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload || signal)
        });
        results.webhook = webhookResponse.ok ? "success" : `failed: ${webhookResponse.statusText}`;
      } catch (err: any) {
        results.webhook = `error: ${err.message}`;
      }
    }

    // 2. Dispatch Email Alert (Mock implementation for now)
    if (scannerEmailAlerts) {
      console.log(`[Email Alert Mock] Sending email to ${user.email} regarding signal:`, signal);
      results.email = "success (mocked)";
    }

    res.json({ success: true, results });
  } catch (error: any) {
    console.error("Error in /scanner/alert:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

router.post("/scanner/evaluate", requireAuth, async (req: any, res: any) => {
  try {
    const { prompt, symbol, direction } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.1, // Low temperature for consistent evaluation
    });

    const aiContent = completion.choices[0]?.message?.content || "";
    const lines = aiContent.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    const firstLine = lines[0]?.toUpperCase() || "";
    
    let result = "INVALID";
    if (firstLine.includes("VALID") && !firstLine.includes("INVALID")) {
      result = "VALID";
    }

    const reasoning = lines.slice(1).join(" ") || firstLine;

    res.json({ result, reasoning });
  } catch (error: any) {
    console.error("Error in /scanner/evaluate:", error);
    res.status(500).json({ error: "AI Evaluation failed" });
  }
});

router.post("/scanner/evaluate-strategy", requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.userId;
    const { strategyId, symbol, timeframe = 60 } = req.body;

    if (!strategyId || !symbol) {
      return res.status(400).json({ error: "Missing strategyId or symbol" });
    }

    const [strategy] = await db.select().from(strategiesTable).where(eq(strategiesTable.id, parseInt(strategyId)));
    if (!strategy) {
      return res.status(404).json({ error: "Strategy not found" });
    }

    // Load user indicators
    const userIndicatorRows = await db.select().from(indicatorsTable).where(eq(indicatorsTable.userId, userId));
    const userIndicators = userIndicatorRows.map(r => ({
      name: r.name,
      code: r.code ?? "",
      parameters: r.parameters ?? null,
    }));

    const nowSec = Math.floor(Date.now() / 1000);
    const fromSec = nowSec - 5 * 60 * 60; // 5 hours of data for indicators

    const candles = await fetchDerivCandles(symbol, fromSec, nowSec, timeframe);
    if (candles.length < 2) {
      return res.json({ result: "none", reasoning: "Insufficient candle data" });
    }

    const legs = parseStrategyLegs(strategy.code);
    const directions = enabledDirections(legs);
    if (directions.length === 0) {
      return res.json({ result: "none", reasoning: "Strategy has no enabled directions" });
    }

    const map = buildSeries(candles, legs, userIndicators);
    const closes = candles.map((c: any) => c.close);
    const evalIndex = candles.length - 2; // Evaluate on last closed candle
    const curTime = candles[evalIndex].time;

    // HTF logic
    const htfTimeframes = new Set<number>();
    if (legs.buy.htf?.enabled) htfTimeframes.add(legs.buy.htf.timeframe);
    if (legs.sell.htf?.enabled) htfTimeframes.add(legs.sell.htf.timeframe);
    
    const htfData: Record<number, { candles: any[], map: any, closes: number[] }> = {};
    for (const tf of htfTimeframes) {
       const htfFromSec = nowSec - (tf * 300);
       const htfC = await fetchDerivCandles(symbol, htfFromSec, nowSec, tf);
       if (htfC.length < 2) continue;
       const hMap = buildSeries(htfC, legs, userIndicators);
       htfData[tf] = { candles: htfC, map: hMap, closes: htfC.map((c: any) => c.close) };
    }

    const htfIndexBuy = legs.buy.htf?.enabled && htfData[legs.buy.htf.timeframe]
      ? htfData[legs.buy.htf.timeframe].candles.findIndex((c: any) => c.time <= curTime && c.time + legs.buy.htf!.timeframe > curTime)
      : undefined;
    const htfIndexSell = legs.sell.htf?.enabled && htfData[legs.sell.htf.timeframe]
      ? htfData[legs.sell.htf.timeframe].candles.findIndex((c: any) => c.time <= curTime && c.time + legs.sell.htf!.timeframe > curTime)
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

    let side: "BUY" | "SELL" | "NONE" = "NONE";
    let strength = "MODERATE"; // Could be computed based on how many indicators align
    let reasoning = "";

    if (isBuy && isSell) {
      reasoning = "Conflicting signals";
    } else if (isBuy) {
      side = "BUY";
      reasoning = "Technical conditions met for BUY";
    } else if (isSell) {
      side = "SELL";
      reasoning = "Technical conditions met for SELL";
    } else {
      reasoning = "No entry conditions met";
    }

    res.json({ result: side, reasoning, strength });
  } catch (error: any) {
    console.error("Error in /scanner/evaluate-strategy:", error);
    res.status(500).json({ error: "Strategy Evaluation failed" });
  }
});

export default router;
