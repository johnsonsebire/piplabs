#!/usr/bin/env node
/**
 * Tests DATABASE_URL connectivity and prints troubleshooting hints.
 * Usage: pnpm --filter @workspace/db run db:check
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

function maskDatabaseUrl(connectionString) {
  try {
    const u = new URL(connectionString);
    const host = u.hostname;
    const port = u.port || "5432";
    const db = u.pathname.replace(/^\//, "") || "(default)";
    const ssl = u.searchParams.get("sslmode") ?? "(not set)";
    return { host, port, db, ssl, user: u.username || "(none)" };
  } catch {
    return { host: "(invalid URL)", port: "?", db: "?", ssl: "?", user: "?" };
  }
}

function printTimeoutHelp(meta) {
  console.error(`
Could not open a TCP connection to Postgres (ETIMEDOUT).

Target from your .env:
  host: ${meta.host}
  port: ${meta.port}
  database: ${meta.db}
  sslmode: ${meta.ssl}

This is a network problem, not an app bug. Common fixes:

1) Replit / internal-only database URL
   If DATABASE_URL points at an internal host (e.g. *.replit.dev, localhost
   inside another environment), it will NOT work from your Windows PC.
   → Open your Replit project → Database / Secrets → copy the *external*
     connection string, or run migrate:deriv inside Replit's shell.

2) Neon / Supabase / cloud Postgres
   → Open the provider dashboard → SQL editor → paste and run:
     lib/db/migrations/0001_add_deriv_columns.sql
   → Or copy a fresh "connection string" (direct or pooled) into .env
   → Neon: wake the project if it is suspended; allow your IP if restricted

3) Local Postgres
   → Ensure the service is running and listening on ${meta.port}
   → Use: postgresql://USER:PASS@127.0.0.1:5432/DATABASE

4) Firewall / VPN
   → Try another network or disable VPN; corporate firewalls often block 5432

After the DB is reachable, run:
  pnpm --filter @workspace/db run migrate:deriv
`);
}

const meta = maskDatabaseUrl(url);
console.log("DATABASE_URL target:", meta);

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 15_000,
});

try {
  console.log("Connecting (15s timeout)...");
  await client.connect();
  const r = await client.query("SELECT current_database() AS db, version()");
  console.log("OK — connected to database:", r.rows[0]?.db);
  console.log("Postgres:", String(r.rows[0]?.version ?? "").split("\n")[0]);
  process.exit(0);
} catch (err) {
  const code = err && typeof err === "object" ? (err).code : undefined;
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Connection failed:", msg);
  if (code === "ETIMEDOUT" || msg.includes("ETIMEDOUT")) {
    printTimeoutHelp(meta);
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
