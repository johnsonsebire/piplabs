import { pgTable, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradingGuidesTable = pgTable("trading_guides", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  buyRules: jsonb("buy_rules").notNull().default([]),
  sellRules: jsonb("sell_rules").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTradingGuideSchema = createInsertSchema(tradingGuidesTable);
export type TradingGuideDb = typeof tradingGuidesTable.$inferSelect;
export type InsertTradingGuideDb = typeof tradingGuidesTable.$inferInsert;
