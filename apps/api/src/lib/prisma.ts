import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  // Log slow queries in dev
  prisma.$on('query' as never, (e: { duration: number; query: string }) => {
    if (e.duration > 500) logger.warn('Slow query', { duration: e.duration, query: e.query });
  });
  globalForPrisma.prisma = prisma;
}
