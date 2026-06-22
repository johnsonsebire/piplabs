import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const journalWorkspacesTable = pgTable("journal_workspaces", {
  id: text("id").primaryKey(), // slugified string like "manual-trading"
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startingBalance: real("starting_balance").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertJournalWorkspaceSchema = createInsertSchema(journalWorkspacesTable);

export type InsertJournalWorkspace = z.infer<typeof insertJournalWorkspaceSchema>;
export type JournalWorkspace = typeof journalWorkspacesTable.$inferSelect;
