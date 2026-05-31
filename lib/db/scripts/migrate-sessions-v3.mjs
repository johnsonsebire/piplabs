#!/usr/bin/env node
/**
 * Adds trade_profit_target and alternate_direction columns to auto_trading_sessions.
 * Usage: node scripts/migrate-sessions-v3.mjs
 */
import dotenv from "dotenv";
import dns from "node:dns";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

dns.setDefaultResultOrder("ipv4first");

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(pkgRoot, "../../.env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in the project root .env file");
  process.exit(1);
}

const MIGRATION_SQL = `
ALTER TABLE "auto_trading_sessions" ADD COLUMN IF NOT EXISTS "trade_profit_target" real;
ALTER TABLE "auto_trading_sessions" ADD COLUMN IF NOT EXISTS "alternate_direction" boolean NOT NULL DEFAULT false;
`;

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 60_000 });

try {
  console.log("Connecting to database...");
  await client.connect();
  console.log("Connected. Applying sessions v3 migration...");
  await client.query(MIGRATION_SQL);
  console.log("Done — trade_profit_target and alternate_direction columns added.");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Migration failed:", msg || "(no message)");
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
