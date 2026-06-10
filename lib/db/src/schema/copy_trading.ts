import { pgTable, text, boolean, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mt5AccountsTable } from "./mt5_accounts";
import { strategiesTable } from "./strategies";

export const copyTradingSubscriptionStatusEnum = pgEnum("copy_trading_subscription_status", ["active", "paused", "failed"]);

export const copyTradingSubscriptionsTable = pgTable("copy_trading_subscriptions", {
  id: text("id").primaryKey(), // Could use MetaAPI CopyFactory subscriber ID
  subscriberAccountId: text("subscriber_account_id").notNull().references(() => mt5AccountsTable.id, { onDelete: "cascade" }),
  providerAccountId: text("provider_account_id").notNull().references(() => mt5AccountsTable.id, { onDelete: "cascade" }),
  strategyId: integer("strategy_id").references(() => strategiesTable.id, { onDelete: "set null" }), // Optional strategy linkage
  riskType: text("risk_type").notNull().default("fixed"), // 'fixed' or 'proportional'
  riskMultiplier: real("risk_multiplier").notNull().default(1.0),
  status: copyTradingSubscriptionStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCopyTradingSubscriptionSchema = createInsertSchema(copyTradingSubscriptionsTable);
export type InsertCopyTradingSubscription = z.infer<typeof insertCopyTradingSubscriptionSchema>;
export type CopyTradingSubscription = typeof copyTradingSubscriptionsTable.$inferSelect;
