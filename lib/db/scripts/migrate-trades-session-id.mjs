#!/usr/bin/env node
/**
 * Adds session_id column to trades table.
 * Links each auto-trader trade to the specific session that created it.
 * Usage: node scripts/migrate-trades-session-id.mjs
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
ALTER TABLE "trades" ADD COLUMN IF NOT EXISTS "session_id" integer;
`;

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 60_000,
});

try {
  console.log("Connecting to database...");
  await client.connect();
  console.log("Connected. Applying migration...");
  await client.query(MIGRATION_SQL);
  console.log("Done — session_id column added to trades. Rebuild and restart the API server.");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Migration failed:", msg || "(no message)");
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
