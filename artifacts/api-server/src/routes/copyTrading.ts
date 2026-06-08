import { Router, type Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { db } from "@workspace/db";
import { 
  copyTradingSubscriptionsTable, 
  insertCopyTradingSubscriptionSchema,
  mt5AccountsTable 
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// Get all copy trading subscriptions for the user
router.get("/copy-trading", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get the user's MT5 accounts
    const userAccounts = await db.select({ id: mt5AccountsTable.id })
      .from(mt5AccountsTable)
      .where(eq(mt5AccountsTable.userId, userId));

    if (userAccounts.length === 0) {
      return res.json([]);
    }

    const accountIds = userAccounts.map(a => a.id);

    // Get subscriptions where subscriber is one of the user's accounts
    // In a real app we'd use `inArray`, for simplicity here we filter in memory or join
    // This assumes small number of accounts
    const subscriptions = await db.select()
      .from(copyTradingSubscriptionsTable);
    
    const userSubscriptions = subscriptions.filter(s => accountIds.includes(s.subscriberAccountId));

    res.json(userSubscriptions);
  } catch (error: any) {
    req.log.error(error, "Failed to get copy trading subscriptions");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Subscribe to a strategy provider
router.post("/copy-trading", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { subscriberAccountId, providerAccountId, strategyId, riskMultiplier } = req.body;
    
    if (!subscriberAccountId || !providerAccountId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify subscriber account belongs to user
    const subscriberAccount = await db.query.mt5AccountsTable.findFirst({
      where: and(
        eq(mt5AccountsTable.id, subscriberAccountId),
        eq(mt5AccountsTable.userId, userId)
      )
    });

    if (!subscriberAccount) {
      return res.status(403).json({ error: "Subscriber account not found or access denied" });
    }

    // Depending on whether we use CopyFactory or custom replication, 
    // we would register the subscription with MetaAPI here.
    // For now, we save it to the DB to act as custom replication configuration.

    const subData = {
      id: `sub_${Date.now()}_${Math.floor(Math.random() * 1000)}`, // Generate a dummy ID
      subscriberAccountId,
      providerAccountId,
      strategyId,
      riskMultiplier: riskMultiplier || 1.0,
      status: "active" as const
    };

    const validatedData = insertCopyTradingSubscriptionSchema.parse(subData);
    
    const [newSub] = await db.insert(copyTradingSubscriptionsTable).values(validatedData).returning();

    res.status(201).json(newSub);
  } catch (error: any) {
    req.log.error(error, "Failed to create copy trading subscription");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
