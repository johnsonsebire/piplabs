import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { db, journalWorkspacesTable, journalsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// List
router.get("/journals/workspaces", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaces = await db
      .select()
      .from(journalWorkspacesTable)
      .where(eq(journalWorkspacesTable.userId, (req as any).userId))
      .orderBy(desc(journalWorkspacesTable.createdAt));

    res.json(workspaces);
  } catch (error) {
    logger.error({ error }, "Error listing journal workspaces");
    res.status(500).json({ error: "Failed to list workspaces" });
  }
});

// Create
router.post("/journals/workspaces", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const slug = data.name.toLowerCase().replace(/\s+/g, '-');
    const id = `${slug}-${Date.now()}`;
    
    const [workspace] = await db.insert(journalWorkspacesTable).values({
      id,
      userId: (req as any).userId,
      name: data.name,
      startingBalance: data.startingBalance || 0,
    }).returning();
    
    res.status(201).json(workspace);
  } catch (error) {
    logger.error({ error }, "Error creating journal workspace");
    res.status(500).json({ error: "Failed to create workspace" });
  }
});

// Update
router.patch("/journals/workspaces/:id", requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    const data = req.body;
    
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.startingBalance !== undefined) updateData.startingBalance = data.startingBalance;
    
    const [workspace] = await db.update(journalWorkspacesTable)
      .set(updateData)
      .where(and(eq(journalWorkspacesTable.id, id), eq(journalWorkspacesTable.userId, (req as any).userId)))
      .returning();
      
    if (!workspace) {
      return res.status(404).json({ error: "Not found" });
    }
    
    return res.json(workspace);
  } catch (error) {
    logger.error({ error }, "Error updating journal workspace");
    return res.status(500).json({ error: "Failed to update workspace" });
  }
});

// Delete
router.delete("/journals/workspaces/:id", requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    
    // First delete all journals associated with this workspace
    await db.delete(journalsTable)
      .where(and(eq(journalsTable.accountName, id), eq(journalsTable.userId, (req as any).userId)));

    // Then delete the workspace itself
    const [workspace] = await db.delete(journalWorkspacesTable)
      .where(and(eq(journalWorkspacesTable.id, id), eq(journalWorkspacesTable.userId, (req as any).userId)))
      .returning();
      
    if (!workspace) {
      return res.status(404).json({ error: "Not found" });
    }
    
    return res.status(204).end();
  } catch (error) {
    logger.error({ error }, "Error deleting journal workspace");
    res.status(500).json({ error: "Failed to delete workspace" });
  }
});

export default router;
