import { Router, type Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { db } from "@workspace/db";
import { 
  copyTradingSubscriptionsTable, 
  insertCopyTradingSubscriptionSchema,
  mt5AccountsTable 
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getMetaApiWrapper } from "@workspace/integrations-meta-api";

const router = Router();

// Get all copy trading subscriptions for the user
router.get("/copy-trading", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Get the user's MT5 accounts
    const userAccounts = await db.select({ id: mt5AccountsTable.id })
      .from(mt5AccountsTable)
      .where(eq(mt5AccountsTable.userId, userId));

    if (userAccounts.length === 0) {
      res.json([]);
      return;
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

// Get all available providers
router.get("/copy-trading/providers", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const providers = await db.select({
      id: mt5AccountsTable.id,
      name: mt5AccountsTable.name,
      server: mt5AccountsTable.server,
    })
    .from(mt5AccountsTable)
    .where(eq(mt5AccountsTable.isProvider, true));
    
    res.json(providers);
  } catch (error: any) {
    req.log.error(error, "Failed to get providers");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Subscribe to a strategy provider
router.post("/copy-trading", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { subscriberAccountId, providerAccountId, strategyId, riskMultiplier, riskType } = req.body;
    
    if (!subscriberAccountId || !providerAccountId) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Verify subscriber account belongs to user
    const subscriberAccount = await db.query.mt5AccountsTable.findFirst({
      where: and(
        eq(mt5AccountsTable.id, subscriberAccountId as string),
        eq(mt5AccountsTable.userId, userId)
      )
    });

    if (!subscriberAccount) {
      res.status(403).json({ error: "Subscriber account not found or access denied" });
      return;
    }

    // Register the subscription with MetaAPI CopyFactory
    const metaApi = getMetaApiWrapper();
    
    // 1. Ensure provider strategy exists
    const actualStrategyId = await metaApi.createOrGetStrategy(providerAccountId);

    // 2. Register subscriber to that strategy
    const rType = riskType || "fixed";
    const rMultiplier = riskMultiplier || 1.0;
    
    await metaApi.updateSubscriber(
      subscriberAccountId, 
      actualStrategyId, 
      rType, 
      rMultiplier
    );

    const subData = {
      id: `sub_${Date.now()}_${Math.floor(Math.random() * 1000)}`, // Generate ID for local DB
      subscriberAccountId,
      providerAccountId,
      strategyId: null, // Custom AI strategies. actualStrategyId is CopyFactory specific. We'll map internally if needed.
      riskMultiplier: rMultiplier,
      riskType: rType,
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

// Update subscription (e.g. pause/resume)
router.patch("/copy-trading/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const subId = req.params.id;
    const { status } = req.body;

    if (!status || !['active', 'paused'].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    const sub = await db.query.copyTradingSubscriptionsTable.findFirst({
      where: eq(copyTradingSubscriptionsTable.id, subId as string)
    });

    if (!sub) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    // Verify ownership
    const subscriberAccount = await db.query.mt5AccountsTable.findFirst({
      where: and(
        eq(mt5AccountsTable.id, sub.subscriberAccountId),
        eq(mt5AccountsTable.userId, userId)
      )
    });

    if (!subscriberAccount) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const metaApi = getMetaApiWrapper();

    if (status === 'paused') {
      await metaApi.clearSubscriber(sub.subscriberAccountId);
    } else if (status === 'active') {
      const actualStrategyId = await metaApi.createOrGetStrategy(sub.providerAccountId);
      await metaApi.updateSubscriber(sub.subscriberAccountId, actualStrategyId, sub.riskType, sub.riskMultiplier);
    }

    const [updatedSub] = await db.update(copyTradingSubscriptionsTable)
      .set({ status: status as 'active' | 'paused', updatedAt: new Date() })
      .where(eq(copyTradingSubscriptionsTable.id, subId as string))
      .returning();

    res.json(updatedSub);
  } catch (error: any) {
    req.log.error(error, "Failed to update copy trading subscription");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Delete subscription
router.delete("/copy-trading/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const subId = req.params.id;

    const sub = await db.query.copyTradingSubscriptionsTable.findFirst({
      where: eq(copyTradingSubscriptionsTable.id, subId as string)
    });

    if (!sub) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    // Verify ownership
    const subscriberAccount = await db.query.mt5AccountsTable.findFirst({
      where: and(
        eq(mt5AccountsTable.id, sub.subscriberAccountId),
        eq(mt5AccountsTable.userId, userId)
      )
    });

    if (!subscriberAccount) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Remove from MetaAPI CopyFactory completely (swallow errors so we can still delete broken DB entries)
    const metaApi = getMetaApiWrapper();
    try {
      await metaApi.clearSubscriber(sub.subscriberAccountId);
    } catch (e) {
      req.log.warn({ err: e }, "MetaAPI clearSubscriber failed (likely orphaned). Proceeding to delete DB entry.");
    }

    await db.delete(copyTradingSubscriptionsTable)
      .where(eq(copyTradingSubscriptionsTable.id, subId as string));

    res.status(204).send();
  } catch (error: any) {
    req.log.error(error, "Failed to delete copy trading subscription");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Stream subscriber transactions in realtime via Server-Sent Events (SSE)
router.get("/copy-trading/transactions/stream", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { subscriberAccountId } = req.query;
    if (!subscriberAccountId || typeof subscriberAccountId !== 'string') {
      res.status(400).json({ error: "Missing subscriberAccountId" });
      return;
    }

    // Verify subscriber account belongs to user
    const subscriberAccount = await db.query.mt5AccountsTable.findFirst({
      where: and(
        eq(mt5AccountsTable.id, subscriberAccountId),
        eq(mt5AccountsTable.userId, userId)
      )
    });

    if (!subscriberAccount) {
      res.status(403).json({ error: "Subscriber account not found or access denied" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial connection successful packet
    res.write(`data: ${JSON.stringify({ type: "connected", message: "Listening for subscriber transactions..." })}\n\n`);

    const metaApi = getMetaApiWrapper();
    
    // Define listener
    const listener = {
      onTransaction: async (packets: any[]) => {
        for (const packet of packets) {
          res.write(`data: ${JSON.stringify({ type: "transaction", transaction: packet })}\n\n`);
        }
      },
      onError: async (err: any) => {
        req.log.error(err, `Transaction stream error for subscriber ${subscriberAccountId}`);
        res.write(`data: ${JSON.stringify({ type: "error", error: err.message || String(err) })}\n\n`);
      }
    };

    const listenerId = metaApi.copyFactory.historyApi.addSubscriberTransactionListener(listener, subscriberAccountId);
    req.log.info(`Added subscriber transaction listener ${listenerId} for subscriber ${subscriberAccountId}`);

    // Cleanup on connection close
    req.on("close", () => {
      metaApi.copyFactory.historyApi.removeSubscriberTransactionListener(listenerId);
      req.log.info(`Removed subscriber transaction listener ${listenerId} for subscriber ${subscriberAccountId}`);
    });
  } catch (error: any) {
    req.log.error(error, "Failed to initialize transaction stream");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Get subscriber transaction history
router.get("/copy-trading/transactions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { subscriberAccountId, limit } = req.query;
    if (!subscriberAccountId || typeof subscriberAccountId !== 'string') {
      res.status(400).json({ error: "Missing subscriberAccountId" });
      return;
    }

    // Verify subscriber account belongs to user
    const subscriberAccount = await db.query.mt5AccountsTable.findFirst({
      where: and(
        eq(mt5AccountsTable.id, subscriberAccountId),
        eq(mt5AccountsTable.userId, userId)
      )
    });

    if (!subscriberAccount) {
      res.status(403).json({ error: "Subscriber account not found or access denied" });
      return;
    }

    const metaApi = getMetaApiWrapper();
    const limitNum = limit ? parseInt(limit as string) : 50;

    // Use last 30 days
    const till = new Date();
    const from = new Date(till.getTime() - 30 * 24 * 60 * 60 * 1000);

    const transactions = await metaApi.copyFactory.historyApi.getSubscriptionTransactions(
      from,
      till,
      undefined,
      [subscriberAccountId],
      0,
      limitNum
    );

    res.json(transactions);
  } catch (error: any) {
    req.log.error(error, "Failed to get subscriber transactions history");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Get subscriber event logs history (CopyFactory UserLog)
router.get("/copy-trading/logs", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { subscriberAccountId, limit } = req.query;
    if (!subscriberAccountId || typeof subscriberAccountId !== 'string') {
      res.status(400).json({ error: "Missing subscriberAccountId" });
      return;
    }

    // Verify subscriber account belongs to user
    const subscriberAccount = await db.query.mt5AccountsTable.findFirst({
      where: and(
        eq(mt5AccountsTable.id, subscriberAccountId),
        eq(mt5AccountsTable.userId, userId)
      )
    });

    if (!subscriberAccount) {
      res.status(403).json({ error: "Subscriber account not found or access denied" });
      return;
    }

    const metaApi = getMetaApiWrapper();
    const limitNum = limit ? parseInt(limit as string) : 50;

    const logs = await metaApi.copyFactory.tradingApi.getUserLog(
      subscriberAccountId,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      limitNum
    );

    res.json(logs);
  } catch (error: any) {
    req.log.error(error, "Failed to get subscriber logs history");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Get subscriber active stopouts
router.get("/copy-trading/stopouts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { subscriberAccountId } = req.query;
    if (!subscriberAccountId || typeof subscriberAccountId !== 'string') {
      res.status(400).json({ error: "Missing subscriberAccountId" });
      return;
    }

    // Verify subscriber account belongs to user
    const subscriberAccount = await db.query.mt5AccountsTable.findFirst({
      where: and(
        eq(mt5AccountsTable.id, subscriberAccountId as string),
        eq(mt5AccountsTable.userId, userId)
      )
    });

    if (!subscriberAccount) {
      res.status(403).json({ error: "Subscriber account not found or access denied" });
      return;
    }

    const metaApi = getMetaApiWrapper();
    const stopouts = await metaApi.copyFactory.tradingApi.getStopouts(subscriberAccountId);
    res.json(stopouts);
  } catch (error: any) {
    req.log.error(error, "Failed to get subscriber stopouts");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Reset subscriber stopouts
router.post("/copy-trading/stopouts/reset", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { subscriberAccountId, type } = req.body;
    if (!subscriberAccountId) {
      res.status(400).json({ error: "Missing subscriberAccountId" });
      return;
    }

    // Verify subscriber account belongs to user
    const subscriberAccount = await db.query.mt5AccountsTable.findFirst({
      where: and(
        eq(mt5AccountsTable.id, subscriberAccountId as string),
        eq(mt5AccountsTable.userId, userId)
      )
    });

    if (!subscriberAccount) {
      res.status(403).json({ error: "Subscriber account not found or access denied" });
      return;
    }

    const metaApi = getMetaApiWrapper();
    const resetType = type || "equity";
    await metaApi.copyFactory.tradingApi.resetSubscriberStopouts(subscriberAccountId, resetType);
    res.json({ success: true, message: `Successfully reset ${resetType} stopouts.` });
  } catch (error: any) {
    req.log.error(error, "Failed to reset subscriber stopouts");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Stream subscriber user logs in realtime via Server-Sent Events (SSE)
router.get("/copy-trading/logs/stream", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { subscriberAccountId } = req.query;
    if (!subscriberAccountId || typeof subscriberAccountId !== 'string') {
      res.status(400).json({ error: "Missing subscriberAccountId" });
      return;
    }

    // Verify subscriber account belongs to user
    const subscriberAccount = await db.query.mt5AccountsTable.findFirst({
      where: and(
        eq(mt5AccountsTable.id, subscriberAccountId),
        eq(mt5AccountsTable.userId, userId)
      )
    });

    if (!subscriberAccount) {
      res.status(403).json({ error: "Subscriber account not found or access denied" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(`data: ${JSON.stringify({ type: "connected", message: "Listening for subscriber event logs..." })}\n\n`);

    const metaApi = getMetaApiWrapper();
    
    // Define listener
    const listener = {
      onUserLog: async (packets: any[]) => {
        for (const packet of packets) {
          res.write(`data: ${JSON.stringify({ type: "log", log: packet })}\n\n`);
        }
      },
      onError: async (err: any) => {
        req.log.error(err, `User logs stream error for subscriber ${subscriberAccountId}`);
        res.write(`data: ${JSON.stringify({ type: "error", error: err.message || String(err) })}\n\n`);
      }
    };

    const listenerId = metaApi.copyFactory.tradingApi.addSubscriberLogListener(listener, subscriberAccountId);
    req.log.info(`Added subscriber log listener ${listenerId} for subscriber ${subscriberAccountId}`);

    // Cleanup on connection close
    req.on("close", () => {
      metaApi.copyFactory.tradingApi.removeSubscriberLogListener(listenerId);
      req.log.info(`Removed subscriber log listener ${listenerId} for subscriber ${subscriberAccountId}`);
    });
  } catch (error: any) {
    req.log.error(error, "Failed to initialize subscriber log stream");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
