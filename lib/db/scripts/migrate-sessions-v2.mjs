#!/usr/bin/env node
/**
 * Adds multi-pair + profit target columns to auto_trading_sessions.
 * Usage: pnpm --filter @workspace/db run migrate:sessions-v2
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
ALTER TABLE "auto_trading_sessions" ADD COLUMN IF NOT EXISTS "symbols" text NOT NULL DEFAULT '[]';
ALTER TABLE "auto_trading_sessions" ADD COLUMN IF NOT EXISTS "pair_mode" text NOT NULL DEFAULT 'single';
ALTER TABLE "auto_trading_sessions" ADD COLUMN IF NOT EXISTS "current_pair_idx" integer NOT NULL DEFAULT 0;
ALTER TABLE "auto_trading_sessions" ADD COLUMN IF NOT EXISTS "profit_target" real;
`;

function maskHost(connectionString) {
  try {
    const u = new URL(connectionString);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(could not parse DATABASE_URL)";
  }
}

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 60_000,
});

try {
  console.log(`Connecting to ${maskHost(url)} (60s timeout)...`);
  await client.connect();
  console.log("Connected.");
  console.log("Applying auto_trading_sessions v2 migration...");
  await client.query(MIGRATION_SQL);
  console.log("Done. Restart the API server.");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Migration failed:", msg || "(no message)");
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
