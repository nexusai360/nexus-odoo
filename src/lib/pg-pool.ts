import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __nexusOdooPgPool: Pool | undefined;
}

export const pgPool: Pool =
  globalThis.__nexusOdooPgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__nexusOdooPgPool = pgPool;
}
