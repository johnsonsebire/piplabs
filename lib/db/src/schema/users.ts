import { pgTable, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["system", "super_admin", "admin", "user"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  derivApiToken: text("deriv_api_token"),
  derivAppId: text("deriv_app_id"),
  derivAccountId: text("deriv_account_id"),
  derivLoginId: text("deriv_login_id"),
  derivCurrency: text("deriv_currency"),
  derivConnectedAt: timestamp("deriv_connected_at", { withTimezone: true }),
  preferredTradeMode: text("preferred_trade_mode").notNull().default("demo"),
  openAiApiKey: text("open_ai_api_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const userPermissionsTable = pgTable("user_permissions", {
  userId: text("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  canTrade: boolean("can_trade").notNull().default(true),
  canViewAllTrades: boolean("can_view_all_trades").notNull().default(false),
  canManageUsers: boolean("can_manage_users").notNull().default(false),
  canManageStrategies: boolean("can_manage_strategies").notNull().default(true),
  canRunBacktests: boolean("can_run_backtests").notNull().default(true),
  canUseAI: boolean("can_use_ai").notNull().default(true),
  canAccessMarketData: boolean("can_access_market_data").notNull().default(true),
  canManageIndicators: boolean("can_manage_indicators").notNull().default(true),
  canExportData: boolean("can_export_data").notNull().default(false),
  canViewAnalytics: boolean("can_view_analytics").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserPermissionsSchema = createInsertSchema(userPermissionsTable);
export type InsertUserPermissions = z.infer<typeof insertUserPermissionsSchema>;
export type UserPermissions = typeof userPermissionsTable.$inferSelect;