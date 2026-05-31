import { pgTable, text, boolean, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradeTypeEnum = pgEnum("trade_type", ["vanilla_options", "forex", "multiplier"]);
export const tradeDirectionEnum = pgEnum("trade_direction", ["buy", "sell", "call", "put"]);
export const tradeStatusEnum = pgEnum("trade_status", ["open", "closed", "cancelled", "pending", "closing"]);
export const tradeModeEnum = pgEnum("trade_mode", ["demo", "live"]);
export const logLevelEnum = pgEnum("log_level", ["info", "warning", "error", "success"]);

export const tradesTable = pgTable("trades", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull(),
  symbol: text("symbol").notNull(),
  displayName: text("display_name").notNull(),
  type: tradeTypeEnum("type").notNull(),
  direction: tradeDirectionEnum("direction").notNull(),
  stake: real("stake").notNull(),
  targetProfit: real("target_profit"),
  currentProfit: real("current_profit"),
  entryPrice: real("entry_price"),
  exitPrice: real("exit_price"),
  status: tradeStatusEnum("status").notNull().default("pending"),
  contractId: text("contract_id"),
  strategyId: integer("strategy_id"),
  sessionId: integer("session_id"),
  notes: text("notes"),
  aiConfirmed: boolean("ai_confirmed").notNull().default(false),
  duration: integer("duration"),
  durationUnit: text("duration_unit"),
  mode: tradeModeEnum("mode").notNull().default("demo"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const insertTradeSchema = createInsertSchema(tradesTable);
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;

export const tradeLogsTable = pgTable("trade_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tradeId: integer("trade_id").notNull().references(() => tradesTable.id, { onDelete: "cascade" }),
  level: logLevelEnum("level").notNull().default("info"),
  message: text("message").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTradeLogSchema = createInsertSchema(tradeLogsTable);
export type InsertTradeLog = z.infer<typeof insertTradeLogSchema>;
export type TradeLog = typeof tradeLogsTable.$inferSelect;

export const tradeCommentsTable = pgTable("trade_comments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tradeId: integer("trade_id").notNull().references(() => tradesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  userDisplayName: text("user_display_name"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const insertTradeCommentSchema = createInsertSchema(tradeCommentsTable);
export type InsertTradeComment = z.infer<typeof insertTradeCommentSchema>;
export type TradeComment = typeof tradeCommentsTable.$inferSelect;
