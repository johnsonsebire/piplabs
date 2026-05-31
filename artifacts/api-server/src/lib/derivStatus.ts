import type { User } from "@workspace/db";

type DerivUserFields = Pick<
  User,
  "derivAppId" | "derivAccountId" | "derivLoginId" | "derivCurrency" | "derivConnectedAt"
>;

/** JSON-safe Deriv connection payload (matches OpenAPI DerivStatus). */
export function buildDerivStatusPayload(
  connected: boolean,
  user: DerivUserFields | null | undefined,
  balance?: number | null,
) {
  const connectedAt = user?.derivConnectedAt;
  return {
    connected,
    appId: user?.derivAppId ?? null,
    accountId: user?.derivAccountId != null ? String(user.derivAccountId) : null,
    loginId: user?.derivLoginId != null ? String(user.derivLoginId) : null,
    currency: user?.derivCurrency ?? null,
    balance: balance ?? null,
    connectedAt:
      connectedAt instanceof Date
        ? connectedAt.toISOString()
        : connectedAt != null
          ? String(connectedAt)
          : null,
  };
}

