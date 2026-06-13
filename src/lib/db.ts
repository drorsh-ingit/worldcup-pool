import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildUrl() {
  const base = process.env.DATABASE_URL ?? "";
  if (!base) return base;
  // We connect through Neon's PgBouncer (`-pooler`) endpoint in transaction
  // mode, so these apply in BOTH dev and prod:
  //   - pgbouncer=true   → disable prepared statements (required for PgBouncer)
  //   - connection_limit → headroom so a Neon cold-start wake burst doesn't
  //                        exhaust the pool ("Timed out fetching a new
  //                        connection from the connection pool")
  //   - pool_timeout     → wait longer for a connection while compute wakes
  // Previously these were dev-only, leaving production on Prisma's small
  // defaults (~vCPU×2+1 connections, 10s timeout) and without pgbouncer mode.
  const url = new URL(base);
  url.searchParams.set("pgbouncer", "true");
  url.searchParams.set("connection_limit", "5");
  url.searchParams.set("pool_timeout", process.env.NODE_ENV === "production" ? "30" : "60");
  return url.toString();
}

const TRANSIENT_DB_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);

/**
 * True for transient Neon/connection failures worth retrying — connection-pool
 * timeouts (P2024) and "can't reach database" errors that happen while Neon
 * compute is waking from scale-to-zero. Deliberately does NOT match query
 * errors (bad data, constraint violations), which retrying would not fix.
 */
export function isTransientDbError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; code?: string; message?: string };
  if (err.name === "PrismaClientInitializationError") return true;
  if (err.code && TRANSIENT_DB_CODES.has(err.code)) return true;
  return /connection pool|can't reach database|timed out/i.test(err.message ?? "");
}

/**
 * Run a DB operation, retrying a couple of times on transient cold-start
 * failures with a short backoff. The first attempt typically wakes the Neon
 * compute; the retry then succeeds against the warm pool. Only safe for
 * idempotent work — placeMatchPrediction's upserts qualify.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === attempts - 1 || !isTransientDbError(e)) throw e;
      await new Promise((r) => setTimeout(r, 250 * 2 ** i)); // 250ms, then 500ms
    }
  }
  throw lastErr;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [],
    datasources: { db: { url: buildUrl() } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
