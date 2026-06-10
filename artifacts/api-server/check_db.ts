import { db } from "@workspace/db";
import { mt5AccountsTable } from "@workspace/db/schema";
import "dotenv/config";

async function main() {
  const accounts = await db.select().from(mt5AccountsTable);
  console.log(JSON.stringify(accounts, null, 2));
  process.exit(0);
}
main();
