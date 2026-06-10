import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

// Get all conversations for a user
router.get("/conversations", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const allConvos = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
    res.json(allConvos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch conversations", details: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
  }
});

// Get messages for a specific conversation
router.get("/conversations/:id/messages", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const conversationId = parseInt(req.params.id as string);

    // Verify ownership
    const convo = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    if (!convo || convo.length === 0 || convo[0].userId !== userId) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const allMsgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
      
    res.json(allMsgs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Delete a conversation
router.delete("/conversations/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const conversationId = parseInt(req.params.id as string);

    // Verify ownership
    const convo = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    if (!convo || convo.length === 0 || convo[0].userId !== userId) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    await db.delete(conversations).where(eq(conversations.id, conversationId));
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

export default router;
