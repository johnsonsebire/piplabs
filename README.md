# DerivTerminal

A high-performance trading terminal for Deriv traders — real-time data via Deriv WebSocket API, TradingView Lightweight Charts, AI-powered trade confirmation, algorithmic strategies with backtesting, and full role-based access control.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Install Dependencies](#2-install-dependencies)
  - [3. Configure Environment Variables](#3-configure-environment-variables)
  - [4. Set Up the Database](#4-set-up-the-database)
  - [5. Generate API Client Code](#5-generate-api-client-code)
  - [6. Start the API Server (Backend)](#6-start-the-api-server-backend)
  - [7. Start the Frontend (Trading Platform)](#7-start-the-frontend-trading-platform)
- [Running Everything Together](#running-everything-together)
- [Available Commands](#available-commands)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [API Routes](#api-routes)
- [Database Schema](#database-schema)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Ensure the following are installed on your system before proceeding:

| Tool       | Version  | Installation                                                     |
| ---------- | -------- | ---------------------------------------------------------------- |
| **Node.js** | 24+     | [nodejs.org](https://nodejs.org/)                                |
| **pnpm**   | 9+       | `npm install -g pnpm`                                            |
| **PostgreSQL** | 15+  | [postgresql.org](https://www.postgresql.org/download/) or use a hosted service like [Neon](https://neon.tech) |

---

## Project Structure

```
Deriv-AI-Trader/
├── artifacts/
│   ├── api-server/          # Express 5 API server (backend)
│   ├── trading-platform/    # React 19 + Vite 7 frontend
│   └── mockup-sandbox/      # UI mockup sandbox
├── lib/
│   ├── api-client-react/    # Generated React Query hooks
│   ├── api-spec/            # OpenAPI specification (source of truth)
│   ├── api-zod/             # Generated Zod schemas from OpenAPI
│   ├── db/                  # Drizzle ORM database schema & client
│   ├── integrations/        # Shared integration utilities
│   ├── integrations-openai-ai-react/   # OpenAI React integration
│   └── integrations-openai-ai-server/  # OpenAI server integration
├── scripts/                 # Workspace utility scripts
├── .env                     # Environment variables (not committed)
├── .env.example             # Environment variables template
├── package.json             # Root workspace config
├── pnpm-workspace.yaml      # pnpm workspace configuration
└── tsconfig.base.json       # Shared TypeScript configuration
```

---

## Getting Started

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd Deriv-AI-Trader
```

### 2. Install Dependencies

This project uses **pnpm workspaces**. Install all dependencies from the project root:

```bash
pnpm install
```

> **Note:** The workspace has a `minimumReleaseAge: 1440` security policy that prevents installing npm packages published less than 24 hours ago. This is a supply-chain attack defense — do not disable it.

### 3. Configure Environment Variables

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Then edit `.env` with the following values:

```env
# Database — PostgreSQL connection string (required)
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

# API Server
PORT=8080                    # Port for the Vite dev server (frontend)
NODE_ENV=development

# Frontend
BASE_PATH=/                  # Base path for the frontend app

# Clerk Authentication (required)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
VITE_CLERK_PROXY_URL=        # Leave empty for local development

# Deriv API (required for trading features)
DERIV_APP_ID=your_deriv_app_id

# OpenAI (optional — required for AI trade analysis & chat)
OPENAI_API_KEY=sk-your_openai_api_key
```

| Variable                        | Required | Description                                          |
| ------------------------------- | -------- | ---------------------------------------------------- |
| `DATABASE_URL`                  | ✅       | PostgreSQL connection string                         |
| `PORT`                          | ✅       | Port used by the Vite frontend dev server            |
| `NODE_ENV`                      | ✅       | `development` or `production`                        |
| `BASE_PATH`                     | ✅       | Base URL path for the frontend (usually `/`)         |
| `VITE_CLERK_PUBLISHABLE_KEY`    | ✅       | Clerk publishable key (from Clerk dashboard)         |
| `CLERK_SECRET_KEY`              | ✅       | Clerk secret key (from Clerk dashboard)              |
| `DERIV_APP_ID`                  | ✅       | Your Deriv API app ID (from [Deriv API](https://api.deriv.com/)) |
| `OPENAI_API_KEY`                | ❌       | OpenAI API key for AI-powered features               |

### 4. Set Up the Database

Push the Drizzle ORM schema to your PostgreSQL database:

```bash
pnpm --filter @workspace/db run push
```

> This runs `drizzle-kit push` which syncs your schema to the database. For development only — use migrations in production.

If `push` fails while "Pulling schema from database" (common with remote Postgres / SSL), add the missing Deriv columns directly:

```bash
pnpm --filter @workspace/db run migrate:deriv
```

If you see **`ETIMEDOUT`**, your machine cannot reach the database host in `DATABASE_URL` (common when the URL is Replit-internal or the DB is paused). Test with:

```bash
pnpm --filter @workspace/db run db:check
```

**Workaround:** open your database provider’s **SQL editor** (Neon, Supabase, Replit Database, etc.) and run the statements in [`lib/db/migrations/0001_add_deriv_columns.sql`](lib/db/migrations/0001_add_deriv_columns.sql), then restart the API server.

### 5. Generate API Client Code

The project uses a **contract-first API** approach. Zod schemas and React Query hooks are auto-generated from the OpenAPI spec:

```bash
pnpm --filter @workspace/api-spec run codegen
```

> You only need to run this when `lib/api-spec/openapi.yaml` changes.

### 6. Start the API Server (Backend)

In a terminal, start the Express API server:

```bash
pnpm --filter @workspace/api-server run dev
```

This will:
1. Build the API server with esbuild
2. Start the server at `http://localhost:3001` (internally, proxied at `/api`)

The API server handles:
- All REST API routes under `/api`
- Clerk authentication proxy
- Deriv WebSocket API connections (server-side)
- OpenAI integrations

### 7. Start the Frontend (Trading Platform)

In a **separate terminal**, start the Vite dev server:

```bash
pnpm --filter @workspace/trading-platform run dev
```

This will start the frontend at `http://localhost:8080` (or whatever `PORT` you configured).

The Vite dev server automatically proxies `/api` requests to the backend at `http://localhost:3001`.

---

## Running Everything Together

You need **two terminal windows** running simultaneously:

| Terminal | Command                                               | Service         | URL                    |
| -------- | ----------------------------------------------------- | --------------- | ---------------------- |
| 1        | `pnpm --filter @workspace/api-server run dev`         | API Server      | `http://localhost:3001` |
| 2        | `pnpm --filter @workspace/trading-platform run dev`   | Frontend        | `http://localhost:8080` |

Open your browser at **`http://localhost:8080`** to access the trading platform. All API calls are automatically proxied to the backend.

---

## Available Commands

Run these commands from the **project root**:

| Command                                                  | Description                                          |
| -------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm install`                                           | Install all workspace dependencies                   |
| `pnpm --filter @workspace/api-server run dev`            | Build and start the API server                       |
| `pnpm --filter @workspace/trading-platform run dev`      | Start the frontend dev server                        |
| `pnpm run typecheck`                                     | Run TypeScript type checking across all packages     |
| `pnpm run build`                                         | Typecheck + build all packages for production        |
| `pnpm --filter @workspace/api-spec run codegen`          | Regenerate API hooks and Zod schemas from OpenAPI    |
| `pnpm --filter @workspace/db run push`                   | Push DB schema changes to database (dev only)        |

---

## Tech Stack

| Layer         | Technology                                              |
| ------------- | ------------------------------------------------------- |
| **Runtime**   | Node.js 24, TypeScript 5.9                              |
| **Monorepo**  | pnpm workspaces                                         |
| **Backend**   | Express 5, Clerk auth (`@clerk/express`)                |
| **Frontend**  | React 19, Vite 7, Clerk React (`@clerk/react@6.x`)     |
| **Database**  | PostgreSQL + Drizzle ORM                                |
| **Validation**| Zod (v4), drizzle-zod                                   |
| **API Codegen**| Orval (OpenAPI → Zod schemas + React Query hooks)      |
| **Build**     | esbuild (CJS bundle for server)                         |
| **Charts**    | TradingView Lightweight Charts                          |
| **Real-time** | Deriv WebSocket API                                     |
| **AI**        | OpenAI GPT-4 Vision (trade analysis & chat)             |
| **UI**        | Radix UI primitives, Tailwind CSS, Framer Motion        |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  React 19 + Vite + TradingView Charts            │
│  Clerk React Auth │ React Query                  │
└────────┬────────────────────────────┬────────────┘
         │ /api/* (proxied)           │ WebSocket
         ▼                            ▼
┌─────────────────────────────────────────────────┐
│              Express 5 API Server                │
│  Clerk Middleware │ Zod Validation               │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ REST API │ │ Deriv WS │ │ OpenAI (GPT-4V)  │ │
│  └────┬─────┘ └────┬─────┘ └────────┬─────────┘ │
└───────┼─────────────┼───────────────┼────────────┘
        │             │               │
        ▼             ▼               ▼
   PostgreSQL    Deriv API       OpenAI API
   (Drizzle)     (WebSocket)    (REST)
```

**Key decisions:**
- **Contract-first API:** OpenAPI spec → Zod schemas + React Query hooks via Orval codegen
- **Clerk auth proxied** through Express (`/api/__clerk`) — same domain, no CORS issues
- **All DB mutations** go through Drizzle with runtime Zod validation
- **Deriv WebSocket** accessed server-side to avoid exposing API tokens to the browser
- **Role hierarchy:** `system > super_admin > admin > user` (stored in `users.role`)

---

## API Routes

| Method | Endpoint                            | Description                          |
| ------ | ----------------------------------- | ------------------------------------ |
| GET    | `/api/me`                           | Current user profile                 |
| PATCH  | `/api/me`                           | Update current user profile          |
| GET    | `/api/assets`                       | List tradeable assets                |
| POST   | `/api/assets`                       | Create a new asset                   |
| GET    | `/api/watchlist`                    | Get user's watchlist                 |
| GET    | `/api/trades`                       | List trades                          |
| POST   | `/api/trades`                       | Execute a trade                      |
| GET    | `/api/trades/:id/comments`          | Get trade comments                   |
| POST   | `/api/trades/:id/comments`          | Add a trade comment                  |
| PATCH  | `/api/trades/:id/comments`          | Update a trade comment               |
| GET    | `/api/strategies`                   | List strategies                      |
| POST   | `/api/strategies`                   | Create a strategy                    |
| POST   | `/api/strategies/:id/backtests`     | Run a backtest                       |
| GET    | `/api/dashboard`                    | Aggregated dashboard stats           |
| GET    | `/api/news`                         | Market news feed                     |
| GET    | `/api/deriv/assets`                 | Deriv API asset catalog              |
| POST   | `/api/ai/analyze`                   | AI trade confirmation (GPT-4 Vision) |
| GET    | `/api/openai/conversations`         | List AI chat sessions                |
| POST   | `/api/openai/conversations`         | Create AI chat session               |

---

## Database Schema

| Table              | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `users`            | User accounts synced from Clerk (roles: system/super_admin/admin/user) |
| `user_permissions` | Granular permission grants per user                      |
| `assets`           | Tradeable instruments (Forex/Vanilla Options/Multiplier) |
| `watchlist`        | Per-user asset watchlists                                |
| `trades`           | Executed trades with auto-close target support           |
| `trade_logs`       | Audit log for every trade state change                   |
| `trade_comments`   | User comments on trades                                  |
| `strategies`       | Algorithmic trading strategies with win rate tracking    |
| `indicators`       | Technical indicators attached to strategies              |
| `backtests`        | Backtest runs with results JSON                          |
| `ai_analyses`      | AI trade confirmation results from GPT-4 Vision          |
| `conversations`    | Chat conversations (AI assistant)                        |
| `messages`         | Messages within conversations                            |

---

## Troubleshooting

### Port conflicts

If port `8080` is already in use, change the `PORT` variable in your `.env` file. The API server runs on port `3001` internally — if that's also taken, you'll need to update the proxy target in `artifacts/trading-platform/vite.config.ts`.

### Database connection issues

- Ensure your `DATABASE_URL` is correct and the database is accessible
- If using Neon or another cloud provider, make sure `?sslmode=require` is included
- Run `pnpm --filter @workspace/db run db:check` to test connectivity from your machine
- **`ETIMEDOUT`:** the host in `.env` is not reachable from your PC (Replit-internal URL, paused Neon project, firewall). Use the provider’s SQL editor + `lib/db/migrations/0001_add_deriv_columns.sql`, or run `migrate:deriv` inside Replit’s shell
- Run `pnpm --filter @workspace/db run push` (or `migrate:deriv`) to ensure the schema is up to date

### Clerk authentication errors

- Ensure both `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set
- The publishable key starts with `pk_test_` (development) or `pk_live_` (production)
- The secret key starts with `sk_test_` (development) or `sk_live_` (production)
- **Do not** pin `@clerk/shared` to `3.x` or `4.x` via overrides — let pnpm resolve naturally

### API codegen issues

If generated types are out of date, regenerate them:

```bash
pnpm --filter @workspace/api-spec run codegen
```

### Module installation hangs or fails

The workspace enforces a 24-hour `minimumReleaseAge` policy on npm packages. If a brand-new package version fails to install, wait 24 hours or add it to the `minimumReleaseAgeExclude` list in `pnpm-workspace.yaml` (only for trusted packages).

---

## License

MIT
