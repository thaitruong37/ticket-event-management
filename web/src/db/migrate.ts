import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool } from "./index";

export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to run migrations.");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
}

async function main(): Promise<void> {
  try {
    await runMigrations();
    console.info("Database migrations completed.");
  } finally {
    await pool.end();
  }
}

const isDirectExecution = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href;
if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error("Database migration failed.", error);
    process.exitCode = 1;
  });
}
