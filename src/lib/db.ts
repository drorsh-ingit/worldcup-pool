import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildUrl() {
  const base = process.env.DATABASE_URL ?? "";
  if (process.env.NODE_ENV !== "production") {
    // In dev, Turbopack hot-reloads can open many short-lived connections.
    // Raise the pool timeout and enable pgbouncer mode so Neon recycles
    // connections quickly instead of holding them open.
    const url = new URL(base);
    url.searchParams.set("connection_limit", "5");
    url.searchParams.set("pool_timeout", "60");
    url.searchParams.set("pgbouncer", "true");
    return url.toString();
  }
  return base;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [],
    datasources: { db: { url: buildUrl() } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
