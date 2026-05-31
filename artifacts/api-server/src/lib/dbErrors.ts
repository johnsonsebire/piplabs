/** Map Postgres / Drizzle errors to actionable API messages. */
export function dbErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;

  const code = (err as { code?: string }).code;
  if (code === "42703") {
    return "Database schema is outdated. Run: pnpm --filter @workspace/db run push";
  }
  if (code === "42P01") {
    return "Database tables are missing. Run: pnpm --filter @workspace/db run push";
  }

  const message = (err as { message?: string }).message;
  if (typeof message === "string") {
    if (message.includes('column "deriv_app_id"') && message.includes("does not exist")) {
      return "Database schema is outdated. Run: pnpm --filter @workspace/db run push";
    }
    if (message.includes("ETIMEDOUT") || message.includes("ECONNREFUSED")) {
      return "Cannot reach the database. Check DATABASE_URL and that Postgres is running.";
    }
  }

  return typeof message === "string" ? message : null;
}
