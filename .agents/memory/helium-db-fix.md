---
name: Helium DB connection fix
description: How to fix ECONNREFUSED when DATABASE_URL points to localhost but Replit Helium DB uses PGHOST=helium
---

The `DATABASE_URL` secret may still say `postgresql://...@localhost:5432/postgres` even when Replit provisions a Helium DB with `PGHOST=helium`. The app will get `ECONNREFUSED 127.0.0.1:5432`.

**Fix:** In `server/db.ts`, check `PGHOST` first and build a config object from individual `PG*` env vars when `PGHOST` is not localhost.

**Why:** Replit doesn't always update the `DATABASE_URL` secret when the underlying Helium host changes. The individual `PG*` vars (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE) are always accurate.

**How to apply:** Any time DB connection fails at startup with ECONNREFUSED on localhost, verify `echo $PGHOST` — if it differs from localhost, apply the `buildConnectionConfig()` pattern in db.ts. Do NOT modify DATABASE_URL directly (it's runtime-managed for Helium DBs per the env-secrets skill).

Note: `drizzle.config.ts` still uses `DATABASE_URL` for `db:push` / `db:studio` — this will fail if DATABASE_URL is stale, but the running server will work fine via the PG* vars.
