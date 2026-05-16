import { pgTable, text, boolean, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assetTypeEnum = pgEnum("asset_type", ["forex", "vanilla_options", "multiplier", "crypto", "indices", "commodities"]);

export const assetsTable = pgTable("assets", {
  symbol: text("symbol").primaryKey(),
  displayName: text("display_name").notNull(),
  shortName: text("short_name").notNull(),
  type: assetTypeEnum("type").notNull(),
  subtype: text("subtype"),
  isActive: boolean("is_active").notNull().default(true),
  pipSize: real("pip_size"),
  minStake: real("min_stake"),
  maxStake: real("max_stake"),
  currency: text("currency"),
  watchCount: integer("watch_count").notNull().default(0),
});

export const insertAssetSchema = createInsertSchema(assetsTable);
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;

export const watchlistTable = pgTable("watchlist", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull(),
  symbol: text("symbol").notNull().references(() => assetsTable.symbol, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWatchlistSchema = createInsertSchema(watchlistTable);
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlistTable.$inferSelect;
