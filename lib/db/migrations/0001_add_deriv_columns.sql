-- Adds Deriv API v2 connection fields to users (run if `drizzle-kit push` is unavailable).
-- Prefer: pnpm --filter @workspace/db run push

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deriv_app_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deriv_account_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deriv_login_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deriv_currency" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deriv_connected_at" timestamptz;

-- These may already exist on older databases; safe to run with IF NOT EXISTS.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deriv_api_token" text;
