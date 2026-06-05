import { RunBacktestBody, UpdateAutoTradeSessionBody } from "../packages/api-zod/dist/index.js";

const body = {
  strategyId: 1,
  symbol: "R_100",
  fromDate: "2026-05-28",
  toDate: "2026-06-04",
  initialBalance: 1000,
  stakePerTrade: 10,
  tradeType: "vanilla_options",
  duration: 15,
  durationUnit: "m",
  sessions: null,
  datasetFile: null,
  alternateDirection: false,
};

const res = RunBacktestBody.safeParse(body);
console.log("Backtest res:", JSON.stringify(res, null, 2));

const editBody = {
  strategyId: 1,
  symbol: "R_100",
  symbols: ["R_100"],
  pairMode: "rotating",
  mode: "demo",
  stakeAmount: 10,
  duration: 15,
  durationUnit: "m",
  maxTrades: null,
  stopOnLoss: null,
  profitTarget: null,
  tradeProfitTarget: null,
  alternateDirection: false
};

const editRes = UpdateAutoTradeSessionBody.safeParse(editBody);
console.log("Edit res:", JSON.stringify(editRes, null, 2));
