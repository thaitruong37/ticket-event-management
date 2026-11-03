import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

try {
  process.loadEnvFile?.();
} catch {}

const globalForDb = globalThis as typeof globalThis & { ticketOpsPool?: Pool };

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const pool =
  globalForDb.ticketOpsPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: positiveInteger(process.env.DATABASE_POOL_MAX, 10),
    idleTimeoutMillis: positiveInteger(process.env.DATABASE_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMillis: positiveInteger(process.env.DATABASE_CONNECT_TIMEOUT_MS, 10_000),
    ssl:
      process.env.PGSSL === "require"
        ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" }
        : undefined,
    application_name: process.env.PGAPPNAME ?? "ticketops-web",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.ticketOpsPool = pool;
}

export const db = drizzle({ client: pool, schema });
export { schema };
export * from "./schema";
