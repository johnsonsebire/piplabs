import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, userPermissionsTable } from "@workspace/db";
import {
  GetMeResponse,
  UpdateMeBody,
  UpdateMeResponse,
  ListUsersQueryParams,
  ListUsersResponse,
  GetUserParams,
  GetUserResponse,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserResponse,
  GetUserPermissionsParams,
  GetUserPermissionsResponse,
  UpdateUserPermissionsParams,
  UpdateUserPermissionsBody,
  UpdateUserPermissionsResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/users/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const user = req.dbUser!;
  const [perms] = await db.select().from(userPermissionsTable).where(eq(userPermissionsTable.userId, user.id));
  res.json(GetMeResponse.parse({
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    isActive: user.isActive,
    derivConnected: !!user.derivApiToken,
    permissions: perms ?? null,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  }));
});

router.patch("/users/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) updateData.displayName = parsed.data.displayName;
  if (parsed.data.preferredTradeMode !== undefined) updateData.preferredTradeMode = parsed.data.preferredTradeMode;
  if ("openAiApiKey" in parsed.data) updateData.openAiApiKey = parsed.data.openAiApiKey ?? null;

  const [user] = await db
    .update(usersTable)
    .set(updateData as any)
    .where(eq(usersTable.id, req.userId!))
    .returning();
  res.json(UpdateMeResponse.parse({ id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl }));
});

router.get("/users", requireRole("system", "super_admin", "admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ListUsersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { role, page = 1, limit = 20 } = params.data;
  const query = db.select().from(usersTable);
  const users = await (role ? query.where(eq(usersTable.role, role as any)) : query)
    .limit(limit)
    .offset((page - 1) * limit);
  const total = users.length;
  res.json(ListUsersResponse.parse({
    users: users.map(u => ({
      id: u.id, clerkId: u.clerkId, email: u.email, displayName: u.displayName,
      avatarUrl: u.avatarUrl, role: u.role, isActive: u.isActive,
      derivConnected: !!u.derivApiToken, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt,
    })),
    total, page, limit,
  }));
});

router.get("/users/:id", requireRole("system", "super_admin", "admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(GetUserResponse.parse({
    id: user.id, clerkId: user.clerkId, email: user.email, displayName: user.displayName,
    avatarUrl: user.avatarUrl, role: user.role, isActive: user.isActive,
    derivConnected: !!user.derivApiToken, createdAt: user.createdAt, lastSeenAt: user.lastSeenAt,
  }));
});

router.patch("/users/:id", requireRole("system", "super_admin", "admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  const body = UpdateUserBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (body.data.role !== undefined) updates.role = body.data.role as any;
  if (body.data.isActive !== undefined) updates.isActive = body.data.isActive;
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(UpdateUserResponse.parse({ id: user.id, role: user.role, isActive: user.isActive }));
});

router.get("/users/:id/permissions", requireRole("system", "super_admin", "admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetUserPermissionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [perms] = await db.select().from(userPermissionsTable).where(eq(userPermissionsTable.userId, params.data.id));
  if (!perms) {
    res.status(404).json({ error: "User permissions not found" });
    return;
  }
  res.json(GetUserPermissionsResponse.parse(perms));
});

router.put("/users/:id/permissions", requireRole("system", "super_admin", "admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateUserPermissionsParams.safeParse(req.params);
  const body = UpdateUserPermissionsBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [perms] = await db
    .update(userPermissionsTable)
    .set(body.data)
    .where(eq(userPermissionsTable.userId, params.data.id))
    .returning();
  if (!perms) {
    res.status(404).json({ error: "Permissions not found" });
    return;
  }
  res.json(UpdateUserPermissionsResponse.parse(perms));
});

export default router;
