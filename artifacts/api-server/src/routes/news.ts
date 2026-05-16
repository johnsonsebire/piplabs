import { Router, type IRouter } from "express";
import { GetMarketNewsQueryParams, GetMarketNewsResponse } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

const MOCK_NEWS = [
  {
    id: "1",
    title: "US Federal Reserve holds interest rates steady amid economic uncertainty",
    summary: "The Federal Reserve maintained its benchmark interest rate in a widely expected decision, citing persistent inflation and labor market resilience.",
    source: "Financial Times",
    url: "https://ft.com",
    category: "general",
    sentiment: "neutral",
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    relatedSymbols: ["frxEURUSD", "frxGBPUSD", "frxUSDJPY"],
  },
  {
    id: "2",
    title: "EUR/USD holds above 1.08 as dollar weakens on soft data",
    summary: "The euro gained ground against the US dollar as softer-than-expected US economic data weighed on the greenback.",
    source: "Reuters",
    url: "https://reuters.com",
    category: "forex",
    sentiment: "bullish",
    publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    relatedSymbols: ["frxEURUSD"],
  },
  {
    id: "3",
    title: "Volatility indices spike as market uncertainty rises",
    summary: "Synthetic volatility indices on Deriv showed increased activity as global market uncertainty prompted traders to seek short-term opportunities.",
    source: "Deriv Blog",
    url: "https://deriv.com",
    category: "general",
    sentiment: "neutral",
    publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    relatedSymbols: ["R_10", "R_25", "R_50", "R_75", "R_100"],
  },
  {
    id: "4",
    title: "Bitcoin surges past key resistance as institutional buying accelerates",
    summary: "Bitcoin broke above a critical technical resistance level following reports of increased institutional accumulation and positive ETF flows.",
    source: "CoinDesk",
    url: "https://coindesk.com",
    category: "crypto",
    sentiment: "bullish",
    publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    relatedSymbols: ["cryBTCUSD", "cryETHUSD"],
  },
  {
    id: "5",
    title: "GBP under pressure as UK economic outlook dims",
    summary: "Sterling fell against major peers after a series of weak UK economic indicators renewed concerns about the Bank of England's rate path.",
    source: "Bloomberg",
    url: "https://bloomberg.com",
    category: "forex",
    sentiment: "bearish",
    publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
    relatedSymbols: ["frxGBPUSD", "frxEURGBP"],
  },
  {
    id: "6",
    title: "S&P 500 extends rally on strong earnings season",
    summary: "US equity markets continued their advance as major corporations reported better-than-expected quarterly earnings results.",
    source: "Wall Street Journal",
    url: "https://wsj.com",
    category: "stocks",
    sentiment: "bullish",
    publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    relatedSymbols: ["OTC_SPC", "OTC_NDX"],
  },
];

router.get("/market/news", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetMarketNewsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { category, limit = 10 } = params.data;

  let news = MOCK_NEWS;
  if (category) {
    news = news.filter(n => n.category === (category as string));
  }

  res.json(GetMarketNewsResponse.parse(news.slice(0, limit)));
});

export default router;
