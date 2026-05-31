import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, userPermissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { dbErrorMessage } from "../lib/dbErrors";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
  dbUser?: typeof usersTable.$inferSelect;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        id: auth.userId,
        clerkId: auth.userId,
        email: (auth as any).sessionClaims?.email ?? "",
        displayName: (auth as any).sessionClaims?.name ?? null,
        avatarUrl: (auth as any).sessionClaims?.image_url ?? null,
        role: "user",
      })
      .onConflictDoUpdate({
        target: usersTable.clerkId,
        set: {
          email: (auth as any).sessionClaims?.email ?? "",
          lastSeenAt: new Date(),
        },
      })
      .returning();

    await db.insert(userPermissionsTable).values({ userId: user.id }).onConflictDoNothing();

    if (!user.isActive) {
      res.status(403).json({ error: "Account is disabled" });
      return;
    }

    req.userId = user.id;
    req.userRole = user.role;
    req.dbUser = user;
    next();
  } catch (err) {
    const hint = dbErrorMessage(err);
    logger.error({ err, hint }, "Error in requireAuth middleware");
    res.status(500).json({
      error: hint ?? "Internal server error",
    });
  }
}

export function requireRole(...roles: string[]) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    await requireAuth(req, res, async () => {
      if (!roles.includes(req.userRole ?? "")) {
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }
      next();
    });
  };
}
