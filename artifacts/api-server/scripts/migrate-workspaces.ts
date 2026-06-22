import { db, journalsTable, journalWorkspacesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

async function migrate() {
  console.log("Starting migration...");
  
  // Get all unique accountName and userId pairs
  const journals = await db.select({
    accountName: journalsTable.accountName,
    userId: journalsTable.userId,
  }).from(journalsTable);

  const uniqueWorkspaces = new Map<string, string>();
  for (const j of journals) {
    if (!uniqueWorkspaces.has(j.accountName)) {
      uniqueWorkspaces.set(j.accountName, j.userId);
    }
  }

  console.log(`Found ${uniqueWorkspaces.size} unique workspaces from journals.`);

  // Get existing workspaces
  const existing = await db.select().from(journalWorkspacesTable);
  const existingIds = new Set(existing.map((w: any) => w.id));

  let inserted = 0;
  for (const [accountName, userId] of uniqueWorkspaces.entries()) {
    if (!existingIds.has(accountName)) {
      console.log(`Migrating missing workspace: ${accountName}`);
      await db.insert(journalWorkspacesTable).values({
        id: accountName,
        userId: userId,
        name: accountName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        startingBalance: 0,
      });
      inserted++;
    }
  }

  console.log(`Migration complete! Inserted ${inserted} new workspaces.`);
  process.exit(0);
}

migrate().catch(console.error);
