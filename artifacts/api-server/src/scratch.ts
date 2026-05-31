import { db } from "@workspace/db";
import { backtestsTable } from "@workspace/db";

async function main() {
  const backtests = await db.select().from(backtestsTable);
  console.log("Total backtests in DB:", backtests.length);
  backtests.forEach(bt => {
    console.log(`Backtest #${bt.id} - Symbol: ${bt.symbol} - Status: ${bt.status} - UserId: ${bt.userId}`);
  });
}

main().catch(console.error);
