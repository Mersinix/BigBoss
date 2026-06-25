import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Build connection config from individual PG* vars (Replit Helium DB)
// or fall back to DATABASE_URL. This handles the case where DATABASE_URL
// still points to localhost but PGHOST resolves to the actual Helium host.
function buildConnectionConfig() {
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, DATABASE_URL } = process.env;
  if (PGHOST && PGHOST !== "localhost" && PGHOST !== "127.0.0.1") {
    return {
      host: PGHOST,
      port: PGPORT ? parseInt(PGPORT, 10) : 5432,
      user: PGUSER,
      password: PGPASSWORD,
      database: PGDATABASE,
    };
  }
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }
  return { connectionString: DATABASE_URL };
}

export const pool = new Pool(buildConnectionConfig());
export const db = drizzle(pool, { schema });
