import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { StudyFormat } from '../services/ai';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface CachedContent {
  content: string;
  format: StudyFormat;
  provider: string;
  model: string;
  quizItems?: unknown[];
  flashcards?: unknown[];
}

export async function getCachedContent(
  topicId: string,
  format: StudyFormat
): Promise<CachedContent | null> {
  const cached = await prisma.studySession.findFirst({
    where: {
      topicId,
      format,
      cachedContent: { not: null },
      createdAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
    },
    select: { cachedContent: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!cached?.cachedContent) return null;

  try {
    return JSON.parse(cached.cachedContent) as CachedContent;
  } catch {
    logger.warn('Failed to parse cached content JSON', { topicId, format });
    return null;
  }
}

export async function saveContentToCache(
  userId: string,
  topicId: string,
  format: StudyFormat,
  content: CachedContent
): Promise<void> {
  try {
    await prisma.studySession.create({
      data: {
        userId,
        topicId,
        format,
        durationSecs: 0,
        completionRate: 0,
        cachedContent: JSON.stringify(content),
      },
    });
  } catch (err) {
    logger.warn('Failed to save content cache', { topicId, format, err });
  }
}
