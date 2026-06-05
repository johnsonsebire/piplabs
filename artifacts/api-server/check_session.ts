import { db, autoTradingSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const sessions = await db.select({
    id: autoTradingSessionsTable.id,
    status: autoTradingSessionsTable.status,
    alternateDirection: autoTradingSessionsTable.alternateDirection
  }).from(autoTradingSessionsTable).where(eq(autoTradingSessionsTable.status, "running"));
  console.log(sessions);
  process.exit(0);
}

main();
