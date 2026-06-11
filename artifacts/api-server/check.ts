import { db } from '@workspace/db';
import { tradesTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

async function check() {
  const trades = await db.select().from(tradesTable).where(eq(tradesTable.type, 'forex'));
  console.log(JSON.stringify(trades.slice(-2), null, 2));
  process.exit(0);
}
check();
