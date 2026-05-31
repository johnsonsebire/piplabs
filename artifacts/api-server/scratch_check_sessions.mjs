import dotenv from "dotenv";
import path from "path";
import pg from "pg";

dotenv.config({ path: "../../.env" });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  const res = await client.query("SELECT id, symbols, pair_mode FROM auto_trading_sessions");
  console.log("SESSIONS IN DB:", JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
