# DerivTerminal

A high-performance trading terminal for Deriv traders — real-time data via Deriv WebSocket API, TradingView Lightweight Charts, AI-powered trade confirmation, algorithmic strategies with backtesting, and full role-based access control.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/trading-platform run dev` — run the frontend (port 21210, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Clerk auth (`@clerk/express@latest`)
- Frontend: React 19 + Vite 7 + Clerk React (`@clerk/react@6.x`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Charts: TradingView Lightweight Charts (planned)
- Real-time: Deriv WebSocket API (planned)

## Where things live

- `lib/db/src/schema/` — DB schema (source of truth for all tables)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `lib/api-zod/src/generated/` — generated Zod schemas from OpenAPI spec
- `lib/api-hooks/src/generated/` — generated React Query hooks from OpenAPI spec
- `artifacts/api-server/src/routes/` — all Express route handlers
- `artifacts/trading-platform/src/` — React frontend

## Database Tables

- `users` — user accounts synced from Clerk (roles: system/super_admin/admin/user)
- `user_permissions` — granular permission grants per user
- `assets` — tradeable instruments (Forex/Vanilla Options/Multiplier)
- `watchlist` — per-user asset watchlists
- `trades` — executed trades with auto-close target support
- `trade_logs` — audit log for every trade state change
- `trade_comments` — user comments on trades
- `strategies` — algorithmic trading strategies with win rate tracking
- `indicators` — technical indicators attached to strategies
- `backtests` — backtest runs with results JSON
- `ai_analyses` — AI trade confirmation results from GPT-4 Vision
- `conversations` — chat conversations (AI assistant)
- `messages` — messages within conversations

## API Routes

- `GET/PATCH /api/me` — current user profile
- `GET/POST /api/assets` — asset listing and creation
- `GET /api/watchlist` — user watchlist
- `GET/POST /api/trades` — trade list and execution
- `GET/POST/PATCH /api/trades/:id/comments` — trade comments
- `GET/POST /api/strategies` — strategy management
- `POST /api/strategies/:id/backtests` — run a backtest
- `GET /api/dashboard` — aggregated dashboard stats
- `GET /api/news` — market news feed
- `GET /api/deriv/assets` — Deriv API asset catalog
- `POST /api/ai/analyze` — AI trade confirmation (GPT-4 Vision)
- `GET/POST /api/openai/conversations` — AI chat sessions

## Architecture decisions

- Contract-first API: OpenAPI spec → Zod schemas + React Query hooks via Orval codegen
- Clerk auth proxied through Express (`/api/__clerk`) — same domain in production, no CORS issues
- All DB mutations go through Drizzle with runtime Zod validation on every input
- Deriv WebSocket API accessed server-side to avoid exposing API tokens to browser
- Role hierarchy: system > super_admin > admin > user (stored in `users.role`)

## Product

- **Home**: Landing page with terminal branding and "Launch Terminal" CTA
- **Dashboard**: Live P&L, open positions, win rate, recent trades summary
- **Terminal**: TradingView chart + order entry + live Deriv tick feed
- **Strategies**: Create/edit algorithmic strategies and run backtests
- **Trade History**: Full trade log with comments and AI analysis results
- **News**: Live market news feed with sentiment
- **Admin**: User management and permission control (admin+ only)

## User preferences

- Dark terminal aesthetic: financial green (`#00ff88`) on deep charcoal (`#0a0f0d`) — keep this throughout
- Brand name: **DerivTerminal**

## Gotchas

- Clerk version pinning: `@clerk/react@6.x` requires `@clerk/shared@^4.12.0`. Do not pin `@clerk/shared` to `3.x` or `4.x` via overrides — let pnpm resolve naturally.
- The `pnpm-workspace.yaml` `minimumReleaseAge: 1440` policy applies to all dependencies.
- Never call `pnpm dev` at workspace root — use `restart_workflow` instead.
- API routes use `req.userId` (set by Clerk middleware) — always guard protected routes.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `lib/api-spec/openapi.yaml` for the full API contract
