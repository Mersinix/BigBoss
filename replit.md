# BigBoss Coffee — B2B Marketplace

A B2B marketplace platform connecting Tunisian cafes with verified suppliers. Cafes can browse products, place orders, and manage deliveries. Suppliers manage their catalog and fulfill orders. Admins oversee the whole platform.

## Stack

- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS v3, Shadcn UI (Radix), TanStack Query, Wouter, Zustand
- **Backend**: Express v5 on Node.js, TypeScript (tsx)
- **Database**: PostgreSQL via Drizzle ORM (`shared/schema.ts`)
- **Auth**: Passport.js (local strategy) + Express Session
- **Real-time**: WebSockets (`/ws` path, `server/ws.ts`)

## How to run

The `Start application` workflow runs `npm run dev`, which starts the Express server (with Vite middleware in development) on port 5000.

- Push schema changes: `npm run db:push`
- Type-check: `npm run check`
- Production build: `npm run build`

## Environment

| Variable | Source | Purpose |
|---|---|---|
| `SESSION_SECRET` | Replit Secret | Express session signing |
| `VITE_GOOGLE_MAPS_API_KEY` | Replit Secret | Google Maps (frontend) |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Replit PostgreSQL | Database connection |

## Project structure

```
client/          React frontend
  src/
    components/  UI components (shadcn + custom)
    pages/       Route-level pages
    hooks/       Custom React hooks
    store/       Zustand stores
server/          Express backend
  routes.ts      All API routes + seeding logic
  storage.ts     DatabaseStorage class (Drizzle queries)
  ws.ts          WebSocket server
  vite.ts        Vite dev middleware setup
shared/
  schema.ts      Drizzle schema (single source of truth for DB + types)
migrations/      Drizzle migration files
```

## Roles

- **Admin** — full platform control, manages users, services, visibility
- **Supplier** — manages product catalog, receives and fulfills orders
- **Cafe Owner** — browses marketplace, places orders
- **Driver** — handles deliveries

## Setup notes

- Ran `npm install` and `npm run db:push` to provision the Helium DB schema; the seed script auto-creates default users/products on server start.

## User preferences
