import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for drizzle-kit commands.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL },
  migrations: {
    table: "__drizzle_migrations",
    schema: "public",
  },
  strict: true,
  verbose: true,
});
