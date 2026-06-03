import { Router, type IRouter } from "express";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { eq, and, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { strategiesTable, indicatorsTable, backtestsTable, assetsTable } from "@workspace/db";
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
  DeleteBacktestParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { buildSignalPayload, fireStrategyWebhook, generateWebhookSecret } from "../lib/strategyWebhook";
import { fetchDerivCandles, pickBacktestGranularity } from "../lib/derivHistory";
import {
  runBacktestOnCandles,
  computeMaxDrawdown,
  computeSharpe,
  UserIndicator,
} from "../lib/backtestEngine";
import { logger } from "../lib/logger";
import { readCsvCandles } from "../lib/csvHistory";
import * as fsSync from "node:fs";
import multer from "multer";

const router: IRouter = Router();

// Parse a strategy's `code` JSON and return the list of trade directions the
// strategy is configured to take. Supports v2 (separate buy/sell legs with
// `enabled` flags) and falls back to v1 (single `action: "buy"|"sell"`).
function parseStrategyDirections(rawCode: string | null | undefined): Array<"buy" | "sell"> {
  if (!rawCode) return [];
  let parsed: any;
  try { parsed = JSON.parse(rawCode); } catch { return []; }
  const out: Array<"buy" | "sell"> = [];
  if (parsed?.buy && parsed.buy.enabled !== false && Array.isArray(parsed.buy.conditions) && parsed.buy.conditions.length > 0) {
    out.push("buy");
  }
  if (parsed?.sell && parsed.sell.enabled !== false && Array.isArray(parsed.sell.conditions) && parsed.sell.conditions.length > 0) {
    out.push("sell");
  }
  if (out.length > 0) return out;
  // Legacy v1 fallback
  if (parsed?.action === "buy") return ["buy"];
  if (parsed?.action === "sell") return ["sell"];
  // No legs explicitly configured but conditions exist → default to buy
  if (Array.isArray(parsed?.conditions) && parsed.conditions.length > 0) return ["buy"];
  return [];
}

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
  const webhookUrl = parsed.data.webhookUrl ?? null;
  const [strategy] = await db.insert(strategiesTable).values({
    userId: req.userId!,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    type: parsed.data.type as any,
    code: parsed.data.code,
    parameters: parsed.data.parameters ?? null,
    isPublic: parsed.data.isPublic ?? false,
    webhookUrl,
    webhookSecret: webhookUrl ? generateWebhookSecret() : null,
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
  // If a webhook URL is being set and the strategy has no secret yet, mint one.
  const updates: Record<string, unknown> = { ...body.data };
  if (Object.prototype.hasOwnProperty.call(body.data, "webhookUrl") && body.data.webhookUrl) {
    const [existing] = await db.select({ webhookSecret: strategiesTable.webhookSecret }).from(strategiesTable)
      .where(and(eq(strategiesTable.id, params.data.id), eq(strategiesTable.userId, req.userId!)));
    if (existing && !existing.webhookSecret) updates.webhookSecret = generateWebhookSecret();
  }
  const [strategy] = await db.update(strategiesTable).set(updates as any)
    .where(and(eq(strategiesTable.id, params.data.id), eq(strategiesTable.userId, req.userId!)))
    .returning();
  if (!strategy) { res.status(404).json({ error: "Strategy not found" }); return; }
  res.json(UpdateStrategyResponse.parse(strategy));
});

router.post("/strategies/:id/webhook/test", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [strategy] = await db.select().from(strategiesTable)
    .where(and(eq(strategiesTable.id, id), eq(strategiesTable.userId, req.userId!)));
  if (!strategy) { res.status(404).json({ error: "Strategy not found" }); return; }
  if (!strategy.webhookUrl) {
    res.status(400).json({ ok: false, status: null, error: "No webhook URL configured for this strategy" });
    return;
  }
  const testSymbol = "R_100";
  const [asset] = await db.select({ displayName: assetsTable.displayName }).from(assetsTable)
    .where(eq(assetsTable.symbol, testSymbol));
  const payload = buildSignalPayload({
    strategyName: strategy.name,
    symbol: testSymbol,
    symbolDisplay: asset?.displayName ?? null,
    direction: "CALL",
    duration: 5,
    durationUnit: "m",
    condition: "TEST: EMA(7) crosses above EMA(14) AND CCI > 0",
  });
  const result = await fireStrategyWebhook(strategy.webhookUrl, payload, strategy.webhookSecret);
  res.json(result);
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
  if (!params.success || !body.success) { 
    console.error("UpdateIndicatorParams/Body error", params.error, body.error);
    res.status(400).json({ error: "Invalid request" }); 
    return; 
  }
  const [indicator] = await db.update(indicatorsTable).set(body.data as any)
    .where(and(eq(indicatorsTable.id, params.data.id), eq(indicatorsTable.userId, req.userId!)))
    .returning();
  if (!indicator) { 
    console.error("Update indicator not found. id:", params.data?.id, "userId:", req.userId);
    res.status(404).json({ error: "Indicator not found" }); 
    return; 
  }
  res.json(UpdateIndicatorResponse.parse(indicator));
});

router.delete("/indicators/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = DeleteIndicatorParams.safeParse({ id });
  if (!params.success) { 
    console.error("DeleteIndicatorParams error", params.error);
    res.status(400).json({ error: "Invalid id" }); 
    return; 
  }
  const [i] = await db.delete(indicatorsTable)
    .where(and(eq(indicatorsTable.id, params.data.id), eq(indicatorsTable.userId, req.userId!)))
    .returning();
  if (!i) { 
    console.error("Delete indicator not found. id:", params.data?.id, "userId:", req.userId);
    res.status(404).json({ error: "Indicator not found" }); 
    return; 
  }
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

// --- Datasets ---
const DATASETS_DIR = path.resolve(process.cwd(), "../../datasets/backtests");

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fsSync.existsSync(DATASETS_DIR)) {
        fsSync.mkdirSync(DATASETS_DIR, { recursive: true });
      }
      cb(null, DATASETS_DIR);
    },
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
      cb(null, safeName);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith(".csv")) {
      return cb(new Error("Only CSV files are allowed"));
    }
    cb(null, true);
  }
});

router.get("/datasets/backtests", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    // Ensure directory exists or catch error
    let files: string[] = [];
    try {
      files = await fs.readdir(DATASETS_DIR);
    } catch (e: any) {
      if (e.code === "ENOENT") {
        await fs.mkdir(DATASETS_DIR, { recursive: true });
        files = [];
      } else {
        throw e;
      }
    }
    const csvFiles = files.filter(f => f.toLowerCase().endsWith(".csv"));
    res.json(csvFiles);
  } catch (err) {
    logger.error({ err }, "Failed to list datasets");
    res.status(500).json({ error: "Failed to list datasets" });
  }
});

router.post("/datasets/backtests/upload", requireAuth, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}, (req: AuthenticatedRequest, res): void => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  res.json({ filename: req.file.filename, success: true });
});

router.post("/backtests", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = RunBacktestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Verify the strategy belongs to the caller (or is public) before running,
  // and load its code so the simulator can respect the configured BUY/SELL legs.
  const [ownedStrategy] = await db.select({ id: strategiesTable.id, code: strategiesTable.code }).from(strategiesTable)
    .where(and(
      eq(strategiesTable.id, parsed.data.strategyId),
      or(eq(strategiesTable.userId, req.userId!), eq(strategiesTable.isPublic, true)),
    ));
  if (!ownedStrategy) { res.status(404).json({ error: "Strategy not found" }); return; }

  // Determine which legs (buy/sell) the strategy actually trades. Supports both
  // v2 (separate buy/sell legs) and legacy v1 (single `action`) shapes.
  const enabledDirections = parseStrategyDirections(ownedStrategy.code);
  if (enabledDirections.length === 0) {
    res.status(400).json({ error: "Strategy has no enabled BUY or SELL leg" });
    return;
  }

  const [backtest] = await db.insert(backtestsTable).values({
    strategyId: parsed.data.strategyId,
    userId: req.userId!,
    symbol: parsed.data.symbol.trim().toUpperCase(),
    fromDate: new Date(parsed.data.fromDate),
    toDate: new Date(parsed.data.toDate),
    initialBalance: parsed.data.initialBalance ?? null,
    stakePerTrade: parsed.data.stakePerTrade ?? null,
    status: "running",
  }).returning();

  const runInput = {
    backtestId: backtest.id,
    userId: req.userId!,
    strategyId: parsed.data.strategyId,
    strategyCode: ownedStrategy.code,
    symbol: backtest.symbol,
    fromDate: parsed.data.fromDate,
    toDate: parsed.data.toDate,
    tradeType: parsed.data.tradeType ?? "vanilla_options",
    duration: parsed.data.duration ?? 5,
    durationUnit: parsed.data.durationUnit ?? "m",
    stakePerTrade: parsed.data.stakePerTrade ?? 1,
    initialBalance: parsed.data.initialBalance ?? 10_000,
    granularitySec: (parsed.data as any).granularitySec ?? null,
    sessions: Array.isArray((parsed.data as any).sessions)
      ? ((parsed.data as any).sessions as string[])
      : null,
    datasetFile: (parsed.data as any).datasetFile ?? null,
    alternateDirection: (parsed.data as any).alternateDirection ?? false,
  };

  void executeBacktestJob(runInput).catch((err) => {
    logger.error({ err, backtestId: backtest.id }, "Backtest job crashed");
  });

  res.status(201).json(GetBacktestResponse.parse(backtest));
});

type BacktestJobInput = {
  backtestId: number;
  userId: string;
  strategyId: number;
  strategyCode: string;
  symbol: string;
  fromDate: Date;
  toDate: Date;
  tradeType: string;
  duration: number;
  durationUnit: string;
  stakePerTrade: number;
  initialBalance: number;
  granularitySec?: number | null;
  sessions?: string[] | null;
  datasetFile?: string | null;
  alternateDirection?: boolean;
};

async function executeBacktestJob(input: BacktestJobInput): Promise<void> {
  const progressLogs: any[] = [];
  const addProgress = async (stage: string) => {
    progressLogs.push({ stage, timestamp: new Date().toISOString() });
    try {
      await db.update(backtestsTable)
        .set({ progressLogs: JSON.stringify(progressLogs) })
        .where(eq(backtestsTable.id, input.backtestId));
    } catch (err) { logger.warn({ err }, "Failed to update progress"); }
  };

  const fromSec = Math.floor(new Date(input.fromDate).getTime() / 1000);
  const toSec = Math.floor(new Date(input.toDate).getTime() / 1000);
  // Use explicit granularity if provided; otherwise auto-derive from duration unit.
  const granularity = input.granularitySec && input.granularitySec > 0
    ? input.granularitySec
    : pickBacktestGranularity(input.durationUnit);

  try {
    await addProgress("Downloading historical data");
    let candles;
    if (input.datasetFile) {
      candles = await readCsvCandles(input.datasetFile);
    } else {
      candles = await fetchDerivCandles(input.symbol, fromSec, toSec, granularity);
    }

    await addProgress(`Download complete, ${candles?.length || 0} candles downloaded`);
    await addProgress("Historical data health: Validating candles");

    if (!candles || candles.length === 0) {
      throw new Error("No valid candlestick data found in the selected date range. Please ensure your dataset has valid OHLC data or try a different date range.");
    }

    // Load all indicators for this user (and all public ones) so named refs like
    // "EMA3", "EMA7", "CCI" can be resolved to their configured parameters.
    const userIndicatorRows = await db
      .select({
        name: indicatorsTable.name,
        code: indicatorsTable.code,
        parameters: indicatorsTable.parameters,
      })
      .from(indicatorsTable)
      .where(or(
        eq(indicatorsTable.userId, input.userId),
        eq(indicatorsTable.isPublic, true),
      ));

    const userIndicators: UserIndicator[] = userIndicatorRows.map(r => ({
      name: r.name,
      code: r.code ?? "",
      parameters: r.parameters ?? null,
    }));

    logger.info({ backtestId: input.backtestId, indicatorCount: userIndicators.length, indicators: userIndicators.map(i => i.name) }, "Loaded user indicators for backtest");

    await addProgress("Backtesting with strategy");

    const result = runBacktestOnCandles(
      candles,
      input.strategyCode,
      {
        tradeType: input.tradeType,
        duration: input.duration,
        durationUnit: input.durationUnit,
        stakePerTrade: input.stakePerTrade,
        initialBalance: input.initialBalance,
        sessions: (input.sessions ?? undefined) as
          | undefined
          | Array<"asian" | "london" | "newyork" | "overlap_london_ny">,
        alternateDirection: input.alternateDirection,
      },
      granularity,
      userIndicators,
    );

    const totalTrades = result.trades.length;
    await addProgress(`Trades executed: ${totalTrades}`);
    const winRate = totalTrades > 0 ? (result.wins / totalTrades) * 100 : 0;
    const totalPnl = result.trades.reduce((acc, t) => acc + t.pnl, 0);
    const maxDrawdown = computeMaxDrawdown(input.initialBalance, result.trades);
    const sharpeRatio = computeSharpe(result.trades);

    // Augment candles with indicator values
    const augmentedCandles = candles.map((c, i) => {
      const indicators: Record<string, number> = {};
      for (const [key, values] of result.seriesMap.entries()) {
        if (key !== "CLOSE" && key !== "PRICE" && key !== "OPEN" && key !== "HIGH" && key !== "LOW") {
          const val = values[i];
          if (val !== null) indicators[key] = Math.round(val * 10000) / 10000;
        }
      }
      return { ...c, indicators };
    });

    try {
      const cachePath = path.resolve(process.cwd(), `../../datasets/backtest_cache/bt_${input.backtestId}_candles.json`);
      await fs.writeFile(cachePath, JSON.stringify(augmentedCandles));
    } catch (cacheErr) {
      logger.warn({ err: cacheErr, backtestId: input.backtestId }, "Failed to cache backtest candles");
    }

    // Augment results with the granularity used so UI can display it
    const enrichedResult = { ...result, granularitySec: granularity };

    await db.update(backtestsTable).set({
      status: "completed",
      totalTrades,
      winRate: Math.round(winRate * 10) / 10,
      totalPnl: Math.round(totalPnl * 100) / 100,
      maxDrawdown,
      sharpeRatio,
      results: JSON.stringify(enrichedResult),
      errorMessage: null,
      completedAt: new Date(),
    }).where(eq(backtestsTable.id, input.backtestId));

    if (totalTrades > 0) {
      await db.update(strategiesTable).set({
        winRate: Math.round(winRate * 10) / 10,
      }).where(eq(strategiesTable.id, input.strategyId));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backtest failed";
    logger.warn({ err, backtestId: input.backtestId }, "Backtest failed");
    await db.update(backtestsTable).set({
      status: "failed",
      errorMessage: message,
      completedAt: new Date(),
    }).where(eq(backtestsTable.id, input.backtestId));
  }
}

router.get("/backtests/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = GetBacktestParams.safeParse({ id });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [backtest] = await db.select().from(backtestsTable)
    .where(and(eq(backtestsTable.id, params.data.id), eq(backtestsTable.userId, req.userId!)));
  if (!backtest) { res.status(404).json({ error: "Backtest not found" }); return; }
  res.json(GetBacktestResponse.parse(backtest));
});

router.delete("/backtests/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = DeleteBacktestParams.safeParse({ id });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [bt] = await db.select({ id: backtestsTable.id, userId: backtestsTable.userId }).from(backtestsTable).where(eq(backtestsTable.id, params.data.id));
  if (!bt) { res.status(404).json({ error: "Backtest not found" }); return; }
  if (bt.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  // Delete from database
  await db.delete(backtestsTable).where(eq(backtestsTable.id, params.data.id));

  // Also clean up cache file if it exists
  try {
    const cachePath = path.resolve(process.cwd(), `../../datasets/backtest_cache/bt_${params.data.id}_candles.json`);
    await fs.unlink(cachePath);
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      logger.warn({ err, backtestId: params.data.id }, "Failed to delete backtest candle cache file");
    }
  }

  res.sendStatus(204);
});

router.get("/backtests/:id/candles", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [bt] = await db.select({ id: backtestsTable.id, userId: backtestsTable.userId }).from(backtestsTable).where(eq(backtestsTable.id, id));
  if (!bt) { res.status(404).json({ error: "Backtest not found" }); return; }
  if (bt.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  try {
    const cachePath = path.resolve(process.cwd(), `../../datasets/backtest_cache/bt_${id}_candles.json`);
    const fileContent = await fs.readFile(cachePath, "utf-8");
    res.setHeader("Content-Type", "application/json");
    res.send(fileContent);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      res.status(404).json({ error: "Candle cache not found for this backtest. Please re-run the backtest to generate replay data." });
    } else {
      res.status(500).json({ error: "Failed to read candle cache" });
    }
  }
});

export default router;
