import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL || "";

// Singleton connection pool across hot-reloads
declare global {
  var __pgPool: pg.Pool | undefined;
}

export const pool =
  global.__pgPool ||
  new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

export const db = drizzle(pool, { schema });
