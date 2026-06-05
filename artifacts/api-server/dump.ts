import { db } from "@workspace/db";
import { strategiesTable } from "@workspace/db";
import { desc } from "drizzle-orm";

async function run() {
  const strategies = await db.select().from(strategiesTable).orderBy(desc(strategiesTable.updatedAt)).limit(1);
  console.log(JSON.stringify(strategies[0].code, null, 2));
  process.exit(0);
}
run();
