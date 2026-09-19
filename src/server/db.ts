import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@/generated/prisma/client';

// Prisma 7 talks to Postgres through a driver adapter. node-postgres over
// Neon's pooled connection string works the same locally and on Vercel; if
// serverless connection counts ever became a problem we would swap in
// @prisma/adapter-neon without touching anything above this file.
function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  // Thrown on first use rather than on import. Importing a module must not
  // require a database to exist: `next build` loads every route to collect its
  // page data, and a module that threw at import time failed the build of an
  // app that was perfectly capable of running.
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

// Next.js dev hot-reloads modules; without the global each reload opens a new
// pool. The module-level memo is what keeps one client per process everywhere
// else — a lazy getter without it would build a client per call.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
let instance: PrismaClient | undefined;

function client(): PrismaClient {
  instance ??= globalForPrisma.prisma ?? createClient();
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = instance;
  return instance;
}

/**
 * The client, created on first property access.
 *
 * A proxy rather than a `db()` function so that every call site still reads
 * `prisma.order.findMany(...)`: the laziness is an infrastructure detail and
 * should not be visible in the services. Methods are bound to the real client
 * because `$transaction` and `$executeRaw` need their own `this`.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const target = client();
    const value = Reflect.get(target, property) as unknown;
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

/**
 * P2002 — unique constraint violated. Worth a named helper because the project
 * leans on the database to enforce uniqueness rather than checking for a row
 * first: `findFirst` then `create` is exactly the race that duplicates orders
 * when two syncs pull the same page (see invariant 3 in CLAUDE.md).
 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
