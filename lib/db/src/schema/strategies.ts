import { pgTable, text, boolean, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const strategyTypeEnum = pgEnum("strategy_type", ["vanilla_options", "forex", "multiplier", "universal"]);

export const strategiesTable = pgTable("strategies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  type: strategyTypeEnum("type").notNull(),
  code: text("code").notNull(),
  parameters: text("parameters"),
  isActive: boolean("is_active").notNull().default(true),
  isPublic: boolean("is_public").notNull().default(false),
  winRate: real("win_rate"),
  totalBacktests: integer("total_backtests").notNull().default(0),
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStrategySchema = createInsertSchema(strategiesTable);
export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type Strategy = typeof strategiesTable.$inferSelect;

export const indicatorsTable = pgTable("indicators", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  code: text("code").notNull(),
  parameters: text("parameters"),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertIndicatorSchema = createInsertSchema(indicatorsTable);
export type InsertIndicator = z.infer<typeof insertIndicatorSchema>;
export type Indicator = typeof indicatorsTable.$inferSelect;

export const backtestStatusEnum = pgEnum("backtest_status", ["pending", "running", "completed", "failed"]);

export const backtestsTable = pgTable("backtests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  strategyId: integer("strategy_id").notNull().references(() => strategiesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  symbol: text("symbol").notNull(),
  fromDate: timestamp("from_date", { withTimezone: true }).notNull(),
  toDate: timestamp("to_date", { withTimezone: true }).notNull(),
  status: backtestStatusEnum("status").notNull().default("pending"),
  initialBalance: real("initial_balance"),
  stakePerTrade: real("stake_per_trade"),
  totalTrades: integer("total_trades"),
  winRate: real("win_rate"),
  totalPnl: real("total_pnl"),
  maxDrawdown: real("max_drawdown"),
  sharpeRatio: real("sharpe_ratio"),
  results: text("results"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertBacktestSchema = createInsertSchema(backtestsTable);
export type InsertBacktest = z.infer<typeof insertBacktestSchema>;
export type Backtest = typeof backtestsTable.$inferSelect;

export const autoTradeSessionStatusEnum = pgEnum("auto_trade_session_status", ["running", "stopped", "paused", "error"]);
export const autoTradeSessionModeEnum = pgEnum("auto_trade_session_mode", ["demo", "live"]);

export const autoTradingSessionsTable = pgTable("auto_trading_sessions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull(),
  strategyId: integer("strategy_id").notNull().references(() => strategiesTable.id, { onDelete: "cascade" }),
  status: autoTradeSessionStatusEnum("status").notNull().default("running"),
  mode: autoTradeSessionModeEnum("mode").notNull().default("demo"),
  symbol: text("symbol").notNull(),
  // Multi-pair: JSON array of symbols e.g. '["R_100","R_75"]'. Empty = use symbol above.
  symbols: text("symbols").notNull().default("[]"),
  // Pair mode: 'single' | 'simultaneous' | 'rotating'
  pairMode: text("pair_mode").notNull().default("single"),
  // Current index for rotating mode
  currentPairIdx: integer("current_pair_idx").notNull().default(0),
  stakeAmount: real("stake_amount").notNull(),
  duration: integer("duration").notNull().default(15),
  durationUnit: text("duration_unit").notNull().default("m"),
  maxTrades: integer("max_trades"),
  stopOnLoss: real("stop_on_loss"),
  profitTarget: real("profit_target"),
  tradeProfitTarget: real("trade_profit_target"),
  alternateDirection: boolean("alternate_direction").notNull().default(false),
  totalTrades: integer("total_trades").notNull().default(0),
  winTrades: integer("win_trades").notNull().default(0),
  totalPnl: real("total_pnl").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAutoTradingSessionSchema = createInsertSchema(autoTradingSessionsTable);
export type InsertAutoTradingSession = z.infer<typeof insertAutoTradingSessionSchema>;
export type AutoTradingSession = typeof autoTradingSessionsTable.$inferSelect;
