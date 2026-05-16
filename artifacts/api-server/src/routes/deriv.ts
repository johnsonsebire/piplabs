import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import {
  ConnectDerivBody,
  ConnectDerivResponse,
  DisconnectDerivResponse,
  GetDerivStatusResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/deriv/connect", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = ConnectDerivBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { apiToken, accountId } = parsed.data;

  const [user] = await db
    .update(usersTable)
    .set({
      derivApiToken: apiToken,
      derivAccountId: accountId ?? null,
      derivConnectedAt: new Date(),
    })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json(ConnectDerivResponse.parse({
    connected: true,
    accountId: user.derivAccountId,
    loginId: user.derivLoginId,
    currency: user.derivCurrency,
    connectedAt: user.derivConnectedAt,
  }));
});

router.delete("/deriv/disconnect", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await db
    .update(usersTable)
    .set({
      derivApiToken: null,
      derivAccountId: null,
      derivLoginId: null,
      derivCurrency: null,
      derivConnectedAt: null,
    })
    .where(eq(usersTable.id, req.userId!));

  res.json(DisconnectDerivResponse.parse({ disconnected: true }));
});

router.get("/deriv/status", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const user = req.dbUser!;
  res.json(GetDerivStatusResponse.parse({
    connected: !!user.derivApiToken,
    accountId: user.derivAccountId,
    loginId: user.derivLoginId,
    currency: user.derivCurrency,
    connectedAt: user.derivConnectedAt,
  }));
});

export default router;
