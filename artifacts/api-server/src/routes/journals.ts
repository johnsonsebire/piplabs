import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { db, journalsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { logger } from "../lib/logger";

const router = Router();

// Zod schemas for request validation
const listQuerySchema = z.object({
  accountName: z.string().optional(),
  symbol: z.string().optional(),
  limit: z.coerce.number().optional(),
});

const statsQuerySchema = z.object({
  accountName: z.string(),
});

router.get("/journals", requireAuth, async (req: Request, res: Response) => {
  try {
    const query = listQuerySchema.parse(req.query);
    let conditions = [eq(journalsTable.userId, (req as any).userId)];
    
    if (query.accountName) {
      conditions.push(eq(journalsTable.accountName, query.accountName));
    }
    if (query.symbol) {
      conditions.push(eq(journalsTable.symbol, query.symbol));
    }

    const entries = await db
      .select()
      .from(journalsTable)
      .where(and(...conditions))
      .orderBy(desc(journalsTable.createdAt))
      .limit(query.limit || 100);

    res.json(entries.map(e => ({
        ...e,
        openTime: e.openTime.toISOString(),
        closeTime: e.closeTime?.toISOString() || null,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
    })));
  } catch (error) {
    logger.error({ error }, "Error listing journals");
    res.status(500).json({ error: "Failed to list journals" });
  }
});

// Create
router.post("/journals", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const [entry] = await db.insert(journalsTable).values({
      userId: (req as any).userId,
      accountName: data.accountName,
      symbol: data.symbol,
      side: data.side as any,
      tradeType: data.tradeType as any,
      volume: data.volume,
      openTime: new Date(data.openTime),
      closeTime: data.closeTime ? new Date(data.closeTime) : null,
      openPrice: data.openPrice,
      closePrice: data.closePrice,
      profitLossRaw: data.profitLossRaw,
      grossProfit: data.grossProfit,
      durationMinutes: data.durationMinutes,
      notes: data.notes,
    }).returning();
    
    res.status(201).json({
        ...entry,
        openTime: entry.openTime.toISOString(),
        closeTime: entry.closeTime?.toISOString() || null,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "Error creating journal");
    res.status(500).json({ error: "Failed to create journal entry" });
  }
});

// Stats
router.get("/journals/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const query = statsQuerySchema.parse(req.query);
    const entries = await db.select().from(journalsTable).where(
      and(
        eq(journalsTable.userId, (req as any).userId),
        eq(journalsTable.accountName, query.accountName)
      )
    );

    const totalTrades = entries.length;
    const completedTrades = entries.filter(e => e.closeTime && e.profitLossRaw !== null);
    
    let wins = 0;
    let losses = 0;
    let totalWinAmount = 0;
    let totalLossAmount = 0;
    let totalPnL = 0;

    for (const t of completedTrades) {
        const pnl = t.profitLossRaw || 0;
        totalPnL += pnl;
        if (pnl > 0) {
            wins++;
            totalWinAmount += pnl;
        } else if (pnl < 0) {
            losses++;
            totalLossAmount += Math.abs(pnl);
        }
    }

    const winRate = completedTrades.length > 0 ? (wins / completedTrades.length) * 100 : 0;
    const averageWin = wins > 0 ? totalWinAmount / wins : 0;
    const averageLoss = losses > 0 ? totalLossAmount / losses : 0;
    const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount > 0 ? 999 : 0;

    res.json({
        totalTrades,
        winRate,
        profitFactor,
        totalPnL,
        averageWin,
        averageLoss,
        byDuration: []
    });
  } catch (error) {
    logger.error({ error }, "Error getting journal stats");
    res.status(500).json({ error: "Failed to get journal stats" });
  }
});

// Get
router.get("/journals/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [entry] = await db.select().from(journalsTable).where(
      and(eq(journalsTable.id, id), eq(journalsTable.userId, (req as any).userId))
    );
    if (!entry) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({
        ...entry,
        openTime: entry.openTime.toISOString(),
        closeTime: entry.closeTime?.toISOString() || null,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "Error getting journal");
    res.status(500).json({ error: "Failed to get journal entry" });
  }
});

// Update
router.patch("/journals/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;
    
    const updateData: any = { ...data };
    if (updateData.openTime) updateData.openTime = new Date(updateData.openTime);
    if (updateData.closeTime) updateData.closeTime = new Date(updateData.closeTime);
    
    const [entry] = await db.update(journalsTable)
      .set(updateData)
      .where(and(eq(journalsTable.id, id), eq(journalsTable.userId, (req as any).userId)))
      .returning();
      
    if (!entry) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({
        ...entry,
        openTime: entry.openTime.toISOString(),
        closeTime: entry.closeTime?.toISOString() || null,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "Error updating journal");
    res.status(500).json({ error: "Failed to update journal entry" });
  }
});

// Delete
router.delete("/journals/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [entry] = await db.delete(journalsTable)
      .where(and(eq(journalsTable.id, id), eq(journalsTable.userId, (req as any).userId)))
      .returning();
      
    if (!entry) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).end();
  } catch (error) {
    logger.error({ error }, "Error deleting journal");
    res.status(500).json({ error: "Failed to delete journal entry" });
  }
});

export default router;
