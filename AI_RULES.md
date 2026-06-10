# PipLabs AI Rules & Tech Stack

This document outlines the architectural standards and library usage rules for the PipLabs project.

## Tech Stack

- **Monorepo Architecture**: Managed with `pnpm` workspaces, separating the API server, trading platform, and shared libraries.
- **Backend**: Express 5 framework with Clerk for authentication and Drizzle ORM for PostgreSQL database interactions.
- **Frontend**: React 19 and Vite 7, utilizing Clerk React for auth and TanStack React Query for state management.
- **API Contract**: Contract-first approach using OpenAPI 3.1, with Orval generating Zod schemas and React Query hooks.
- **Database**: PostgreSQL database with Drizzle ORM for schema management and type-safe queries.
- **Real-time Data**: Direct integration with Deriv WebSocket API for low-latency market data and trade execution.
- **Charts**: TradingView Lightweight Charts for high-performance financial data visualization.
- **AI Integration**: OpenAI GPT-4 Vision for automated trade setup analysis and GPT-4 for conversational assistance.
- **UI/UX**: A dark terminal aesthetic built with Tailwind CSS, Radix UI primitives, and Bootstrap 5.3 for layout consistency.

## Library Usage Rules

### 1. API & Data Fetching
- **Contract-First**: Always update `lib/api-spec/openapi.yaml` first for any API changes.
- **Codegen**: Run `pnpm --filter @workspace/api-spec run codegen` after spec changes.
- **Hooks**: Use the generated React Query hooks from `@workspace/api-client-react`. Do not use raw `fetch` or `axios` in the frontend.

### 2. Database & Validation
- **Schema**: Define all database tables in `lib/db/src/schema/`.
- **ORM**: Use Drizzle ORM for all database operations. Avoid raw SQL unless absolutely necessary for performance.
- **Validation**: Use Zod schemas generated in `lib/api-zod` for all request body and query parameter validation in Express routes.

### 3. UI & Styling
- **Aesthetic**: Maintain the "Dark Terminal" look (Financial Green `#00ff88` on Deep Charcoal `#0a0f0d`).
- **Styling**: Prefer Tailwind CSS for new components. Use Bootstrap 5.3 utility classes for layout consistency with existing pages.
- **Components**: Use Radix UI primitives (via shadcn/ui) for complex accessible components like Dialogs, Popovers, and Selects.
- **Icons**: Use `lucide-react` for general UI icons.

### 4. State Management
- **Server State**: Use TanStack React Query for all server-side data.
- **Local State**: Use React `useState` and `useContext` for simple UI state.
- **Navigation**: Use `wouter` for routing and URL-based state.

### 5. Real-time & Charts
- **WebSockets**: Use the `useDerivWs` hook for market data. Keep WebSocket logic server-side for authenticated operations.
- **Charting**: Use `lightweight-charts` for all financial data visualization. Custom indicators should be implemented in `lib/indicators.ts`.

### 6. AI Features
- **Analysis**: Use GPT-4 Vision for chart-based trade analysis.
- **Integrations**: Use the shared packages in `lib/integrations-*` for OpenAI interactions to ensure consistent error handling and rate limiting.