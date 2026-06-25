import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.PGHOST && process.env.PGDATABASE
    ? `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT || "5432"}/${process.env.PGDATABASE}`
    : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("No database connection found. Ensure the database is provisioned.");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
