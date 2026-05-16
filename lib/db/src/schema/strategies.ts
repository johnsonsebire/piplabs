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
