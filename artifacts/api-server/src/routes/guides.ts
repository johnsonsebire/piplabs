import { Router, type IRouter, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { tradingGuidesTable } from "@workspace/db/schema";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/guides", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const guides = await db.query.tradingGuidesTable.findMany({
      where: eq(tradingGuidesTable.userId, userId),
      orderBy: (guides, { desc }) => [desc(guides.createdAt)],
    });
    
    res.json(guides);
  } catch (err) {
    console.error("Error fetching guides:", err);
    res.status(500).json({ error: "Failed to fetch guides" });
  }
});

router.post("/guides", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log("POST /guides req.body:", req.body);
    const userId = req.userId!;
    const { id, name, isActive, buyRules, sellRules } = req.body;
    
    // Deactivate others if this is active
    if (isActive) {
      await db.update(tradingGuidesTable)
        .set({ isActive: false })
        .where(eq(tradingGuidesTable.userId, userId));
    }

    const [newGuide] = await db.insert(tradingGuidesTable).values({
      id,
      userId,
      name,
      isActive: !!isActive,
      buyRules: buyRules || [],
      sellRules: sellRules || [],
    }).returning();
    
    res.status(201).json(newGuide);
  } catch (err: any) {
    console.error("Error creating guide:", err);
    res.status(400).json({ error: "Failed to create guide", detail: err.message || err.toString() });
  }
});

router.put("/guides/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const guideId = req.params.id;
    const { name, isActive, buyRules, sellRules } = req.body;

    // Check if it belongs to user
    const existing = await db.query.tradingGuidesTable.findFirst({
      where: and(eq(tradingGuidesTable.id, guideId), eq(tradingGuidesTable.userId, userId))
    });

    if (!existing) {
      return res.status(404).json({ error: "Guide not found" });
    }

    // Deactivate others if this is active
    if (isActive) {
      await db.update(tradingGuidesTable)
        .set({ isActive: false })
        .where(eq(tradingGuidesTable.userId, userId));
    }

    const [updated] = await db.update(tradingGuidesTable)
      .set({
        name,
        isActive: !!isActive,
        buyRules,
        sellRules,
        updatedAt: new Date()
      })
      .where(and(eq(tradingGuidesTable.id, guideId), eq(tradingGuidesTable.userId, userId)))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error("Error updating guide:", err);
    res.status(400).json({ error: "Failed to update guide" });
  }
});

router.delete("/guides/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const guideId = req.params.id;

    const result = await db.delete(tradingGuidesTable)
      .where(and(eq(tradingGuidesTable.id, guideId), eq(tradingGuidesTable.userId, userId)))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: "Guide not found" });
    }

    res.status(204).send();
  } catch (err) {
    console.error("Error deleting guide:", err);
    res.status(400).json({ error: "Failed to delete guide" });
  }
});

export default router;
