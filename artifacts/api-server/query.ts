import { db } from './src/db';
import { strategiesTable } from './src/db/schema';

async function main() {
  const res = await db.select().from(strategiesTable);
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}
main();
