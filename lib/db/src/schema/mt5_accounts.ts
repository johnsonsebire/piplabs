import { pgTable, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const mt5AccountStateEnum = pgEnum("mt5_account_state", ["deployed", "undeployed"]);
export const mt5AccountConnectionStatusEnum = pgEnum("mt5_account_connection_status", ["connected", "disconnected", "error"]);

export const mt5AccountsTable = pgTable("mt5_accounts", {
  id: text("id").primaryKey(), // We can use MetaAPI's account ID as the primary key
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  login: text("login").notNull(),
  server: text("server").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("demo"), // 'demo' or 'live'
  isProvider: boolean("is_provider").notNull().default(false),
  state: mt5AccountStateEnum("state").notNull().default("undeployed"),
  connectionStatus: mt5AccountConnectionStatusEnum("connection_status").notNull().default("disconnected"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMt5AccountSchema = createInsertSchema(mt5AccountsTable);
export type InsertMt5Account = z.infer<typeof insertMt5AccountSchema>;
export type Mt5Account = typeof mt5AccountsTable.$inferSelect;
