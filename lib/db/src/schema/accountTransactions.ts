import { pgTable, text, real, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const accountTransactionsTable = pgTable("account_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  accountName: text("account_name").notNull(),
  type: text("type").notNull(), // 'deposit', 'withdrawal', 'bonus', 'credit'
  amount: real("amount").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAccountTransactionSchema = createInsertSchema(accountTransactionsTable);

export type InsertAccountTransaction = z.infer<typeof insertAccountTransactionSchema>;
export type AccountTransaction = typeof accountTransactionsTable.$inferSelect;
