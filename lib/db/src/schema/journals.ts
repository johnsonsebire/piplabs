import { pgTable, text, real, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { tradeTypeEnum } from "./trades";

export const journalsTable = pgTable("journal_entries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  accountName: text("account_name").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // 'buy' or 'sell'
  tradeType: tradeTypeEnum("trade_type").notNull(),
  volume: real("volume").notNull(),
  openTime: timestamp("open_time", { withTimezone: true }).notNull(),
  closeTime: timestamp("close_time", { withTimezone: true }),
  openPrice: real("open_price").notNull(),
  closePrice: real("close_price"),
  profitLossRaw: real("profit_loss_raw"),
  grossProfit: real("gross_profit"),
  commission: real("commission"),
  swap: real("swap"),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertJournalSchema = createInsertSchema(journalsTable);

export type InsertJournal = z.infer<typeof insertJournalSchema>;
export type JournalEntry = typeof journalsTable.$inferSelect;
