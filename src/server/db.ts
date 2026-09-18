import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@/generated/prisma/client';

// Prisma 7 talks to Postgres through a driver adapter. node-postgres over
// Neon's pooled connection string works the same locally and on Vercel; if
// serverless connection counts ever became a problem we would swap in
// @prisma/adapter-neon without touching anything above this file.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const createClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Next.js dev hot-reloads modules; without this each reload opens a new pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * P2002 — unique constraint violated. Worth a named helper because the project
 * leans on the database to enforce uniqueness rather than checking for a row
 * first: `findFirst` then `create` is exactly the race that duplicates orders
 * when two syncs pull the same page (see invariant 3 in CLAUDE.md).
 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
