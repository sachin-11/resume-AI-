import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Explicitly pass datasource URL — fixes Amplify env variable issue
// connection_limit=5 — safe for Neon free tier (serverless, multiple API routes)
function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Append connection pool params for Neon serverless compatibility
  const pooledUrl = url.includes("?")
    ? `${url}&connection_limit=5&pool_timeout=10`
    : `${url}?connection_limit=5&pool_timeout=10`;

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: { url: pooledUrl },
    },
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
