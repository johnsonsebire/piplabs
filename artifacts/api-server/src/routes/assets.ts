import { Router, type IRouter } from "express";
import { eq, like, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { assetsTable, watchlistTable } from "@workspace/db";
import {
  ListAssetsQueryParams,
  ListAssetsResponse,
  GetAssetParams,
  GetAssetResponse,
  GetPopularAssetsResponse,
  GetWatchlistResponse,
  AddToWatchlistBody,
  RemoveFromWatchlistParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

const SEED_ASSETS = [
  { symbol: "R_10", displayName: "Volatility 10 Index", shortName: "Vol 10", type: "multiplier" as const, currency: "USD", isActive: true },
  { symbol: "R_25", displayName: "Volatility 25 Index", shortName: "Vol 25", type: "multiplier" as const, currency: "USD", isActive: true },
  { symbol: "R_50", displayName: "Volatility 50 Index", shortName: "Vol 50", type: "multiplier" as const, currency: "USD", isActive: true },
  { symbol: "R_75", displayName: "Volatility 75 Index", shortName: "Vol 75", type: "multiplier" as const, currency: "USD", isActive: true },
  { symbol: "R_100", displayName: "Volatility 100 Index", shortName: "Vol 100", type: "multiplier" as const, currency: "USD", isActive: true },
  { symbol: "frxEURUSD", displayName: "Euro/US Dollar", shortName: "EUR/USD", type: "forex" as const, pipSize: 0.00001, currency: "USD", isActive: true },
  { symbol: "frxGBPUSD", displayName: "British Pound/US Dollar", shortName: "GBP/USD", type: "forex" as const, pipSize: 0.00001, currency: "USD", isActive: true },
  { symbol: "frxUSDJPY", displayName: "US Dollar/Japanese Yen", shortName: "USD/JPY", type: "forex" as const, pipSize: 0.001, currency: "JPY", isActive: true },
  { symbol: "frxAUDUSD", displayName: "Australian Dollar/US Dollar", shortName: "AUD/USD", type: "forex" as const, pipSize: 0.00001, currency: "USD", isActive: true },
  { symbol: "frxUSDCAD", displayName: "US Dollar/Canadian Dollar", shortName: "USD/CAD", type: "forex" as const, pipSize: 0.00001, currency: "CAD", isActive: true },
  { symbol: "frxEURGBP", displayName: "Euro/British Pound", shortName: "EUR/GBP", type: "forex" as const, pipSize: 0.00001, currency: "GBP", isActive: true },
  { symbol: "OTC_AS51", displayName: "Australian Index", shortName: "AUS200", type: "indices" as const, currency: "AUD", isActive: true },
  { symbol: "OTC_NDX", displayName: "US Tech 100", shortName: "NASDAQ100", type: "indices" as const, currency: "USD", isActive: true },
  { symbol: "OTC_SPC", displayName: "US 500", shortName: "S&P 500", type: "indices" as const, currency: "USD", isActive: true },
  { symbol: "cryBTCUSD", displayName: "Bitcoin/US Dollar", shortName: "BTC/USD", type: "crypto" as const, currency: "USD", isActive: true },
  { symbol: "cryETHUSD", displayName: "Ethereum/US Dollar", shortName: "ETH/USD", type: "crypto" as const, currency: "USD", isActive: true },
];

async function seedAssetsIfNeeded(): Promise<void> {
  const count = await db.select({ count: sql<number>`count(*)` }).from(assetsTable);
  if (Number(count[0]?.count) === 0) {
    await db.insert(assetsTable).values(SEED_ASSETS).onConflictDoNothing();
  }
}

router.get("/assets", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ListAssetsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await seedAssetsIfNeeded();

  const { type, search, activeOnly } = params.data;
  const conditions = [];
  if (type) conditions.push(eq(assetsTable.type, type as any));
  if (search) conditions.push(like(assetsTable.displayName, `%${search}%`));
  if (activeOnly) conditions.push(eq(assetsTable.isActive, true));

  const assets = conditions.length > 0
    ? await db.select().from(assetsTable).where(and(...conditions))
    : await db.select().from(assetsTable);

  res.json(ListAssetsResponse.parse(assets));
});

router.get("/assets/popular", requireAuth, async (_req, res): Promise<void> => {
  await seedAssetsIfNeeded();
  const assets = await db.select().from(assetsTable).where(eq(assetsTable.isActive, true)).limit(10);
  res.json(GetPopularAssetsResponse.parse(assets));
});

router.get("/assets/:symbol", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.symbol, params.data.symbol));
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  res.json(GetAssetResponse.parse(asset));
});

router.get("/watchlist", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const items = await db
    .select({
      id: watchlistTable.id,
      userId: watchlistTable.userId,
      symbol: watchlistTable.symbol,
      addedAt: watchlistTable.addedAt,
      displayName: assetsTable.displayName,
      shortName: assetsTable.shortName,
      type: assetsTable.type,
      isActive: assetsTable.isActive,
    })
    .from(watchlistTable)
    .leftJoin(assetsTable, eq(watchlistTable.symbol, assetsTable.symbol))
    .where(eq(watchlistTable.userId, req.userId!));
  res.json(GetWatchlistResponse.parse(items));
});

router.post("/watchlist", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = AddToWatchlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db.insert(watchlistTable).values({ userId: req.userId!, symbol: parsed.data.symbol }).onConflictDoNothing();
  res.status(201).json({ added: true });
});

router.delete("/watchlist/:symbol", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = RemoveFromWatchlistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(watchlistTable)
    .where(and(eq(watchlistTable.userId, req.userId!), eq(watchlistTable.symbol, params.data.symbol)));
  res.sendStatus(204);
});

export default router;
