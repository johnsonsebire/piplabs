import { Router, type Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { db } from "@workspace/db";
import { mt5AccountsTable, insertMt5AccountSchema } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getMetaApiWrapper } from "@workspace/integrations-meta-api";

const router = Router();

// Get all MT5 accounts for the user (Sync from MetaAPI)
router.get("/mt5-accounts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const metaApi = getMetaApiWrapper();
    const remoteAccounts = await metaApi.getAccounts();

    for (const acc of remoteAccounts) {
      const isProvider = acc.copyFactoryRoles?.includes('PROVIDER') || false;
      const state = acc.state === 'DEPLOYED' ? 'deployed' : 'undeployed';
      const connectionStatus = acc.connectionStatus === 'CONNECTED' ? 'connected' : acc.connectionStatus === 'DISCONNECTED' ? 'disconnected' : 'error';
      const type = String(acc.type).toLowerCase() === 'live' ? 'live' : 'demo';

      await db.insert(mt5AccountsTable).values({
        id: acc.id,
        userId,
        login: acc.login,
        server: acc.server,
        name: acc.name,
        type: type,
        isProvider,
        state,
        connectionStatus
      }).onConflictDoUpdate({
        target: mt5AccountsTable.id,
        set: {
          isProvider,
          state,
          connectionStatus,
          login: acc.login,
          server: acc.server,
          name: acc.name,
          updatedAt: new Date()
        }
      });
    }

    const accounts = await db.select().from(mt5AccountsTable).where(eq(mt5AccountsTable.userId, userId));
    res.json(accounts);
  } catch (error: any) {
    req.log.error(error, "Failed to get MT5 accounts");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Set MT5 account as a Provider
router.post("/mt5-accounts/:id/provider", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const accountId = req.params.id;
    const metaApi = getMetaApiWrapper();
    
    await metaApi.setProviderRole(accountId as string, 1);

    const [updatedAccount] = await db.update(mt5AccountsTable)
      .set({ isProvider: true, updatedAt: new Date() })
      .where(eq(mt5AccountsTable.id, accountId as string))
      .returning();

    res.json(updatedAccount);
  } catch (error: any) {
    req.log.error(error, "Failed to set provider role");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Add a new MT5 account
router.post("/mt5-accounts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { name, login, password, server, type } = req.body;
    if (!name || !login || !password || !server) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const metaApi = getMetaApiWrapper();
    
    // Provision on MetaAPI
    const metaApiAccountId = await metaApi.provisionAccount({
      name,
      login,
      password,
      server,
      platform: "mt5"
    });

    // Save to DB
    const accountData = {
      id: metaApiAccountId,
      userId,
      login,
      server,
      name,
      type: type || "demo",
      state: "undeployed" as const,
      connectionStatus: "disconnected" as const,
      isProvider: false,
    };

    const validatedData = insertMt5AccountSchema.parse(accountData);
    
    const [newAccount] = await db.insert(mt5AccountsTable).values(validatedData).returning();

    res.status(201).json(newAccount);
  } catch (error: any) {
    req.log.error(error, "Failed to add MT5 account");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Delete/remove an MT5 account
router.delete("/mt5-accounts/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const accountId = req.params.id as string;

    // Check if account exists and belongs to the user
    const [account] = await db.select().from(mt5AccountsTable).where(
      and(
        eq(mt5AccountsTable.id, accountId),
        eq(mt5AccountsTable.userId, userId)
      )
    );

    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const metaApi = getMetaApiWrapper();
    
    try {
      await metaApi.removeAccount(accountId);
    } catch (metaApiError: any) {
      req.log.warn(metaApiError, `Failed to delete account ${accountId} on MetaAPI, proceeding with DB deletion`);
    }

    // Delete from DB
    await db.delete(mt5AccountsTable).where(eq(mt5AccountsTable.id, accountId));

    res.status(204).end();
  } catch (error: any) {
    req.log.error(error, "Failed to delete MT5 account");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
