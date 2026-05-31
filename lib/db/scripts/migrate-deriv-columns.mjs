#!/usr/bin/env node
/**
 * Applies missing Deriv columns on users when drizzle-kit push fails.
 * Usage: pnpm --filter @workspace/db run migrate:deriv
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
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deriv_api_token" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deriv_app_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deriv_account_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deriv_login_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deriv_currency" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deriv_connected_at" timestamptz;
`;

function maskHost(connectionString) {
  try {
    const u = new URL(connectionString);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(could not parse DATABASE_URL)";
  }
}

function printTimeoutHelp() {
  console.error(`
ETIMEDOUT — your PC cannot reach the database host (${maskHost(url)}).

If you use Replit or another hosted dev environment, the DATABASE_URL in .env
may only work *inside* that environment. Options:

  A) Run this on Replit (Shell tab):
       pnpm --filter @workspace/db run migrate:deriv

  B) Use your provider's web SQL editor (Neon / Supabase / Replit Database):
       Open: lib/db/migrations/0001_add_deriv_columns.sql
       Paste the ALTER TABLE statements and run them there.

  C) Put a publicly reachable Postgres URL in .env (Neon direct connection).

Test connectivity:
  pnpm --filter @workspace/db run db:check
`);
}

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 60_000,
});

try {
  console.log(`Connecting to ${maskHost(url)} (60s timeout)...`);
  await client.connect();
  console.log("Connected.");

  const before = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'
     ORDER BY column_name`,
  );
  console.log("users columns (before):", before.rows.map((r) => r.column_name).join(", "));

  console.log("Applying Deriv column migration...");
  await client.query(MIGRATION_SQL);

  const after = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'
       AND column_name LIKE 'deriv_%'
     ORDER BY column_name`,
  );
  console.log("deriv_* columns (after):", after.rows.map((r) => r.column_name).join(", "));
  console.log("Done. Restart the API server and try Deriv connect again.");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Migration failed:", msg || "(no message)");
  if (msg.includes("ETIMEDOUT") || (err && typeof err === "object" && err.code === "ETIMEDOUT")) {
    printTimeoutHelp();
  } else if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
