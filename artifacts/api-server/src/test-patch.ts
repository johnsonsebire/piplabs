import { db, indicatorsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

async function main() {
  const indicators = await db.select().from(indicatorsTable);
  console.log("Indicators total:", indicators.length);
  if (indicators.length === 0) return;

  const first = indicators[0];
  console.log("First indicator id:", first.id, "userId:", first.userId);

  const updates = { isPublic: true };
  const paramsDataId = first.id;
  const reqUserId = first.userId;

  const [indicator] = await db.update(indicatorsTable).set(updates as any)
    .where(and(eq(indicatorsTable.id, paramsDataId), eq(indicatorsTable.userId, reqUserId)))
    .returning();

  console.log("Updated indicator:", indicator);
}

main().catch(console.error);
