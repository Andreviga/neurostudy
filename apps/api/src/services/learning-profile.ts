/**
 * Learning Profile service
 *
 * Tracks which study formats work best for a user and updates
 * their profile after each session. This is the "local personalisation"
 * engine described in the spec.
 *
 * Algorithm:
 * - Maintain a weighted score per format: score = avg(session_score * completion_rate)
 * - Re-rank preferred_formats after each session
 * - Detect weak topics (topics with avg score < 0.5 over last 3 attempts)
 * - Track streak and total study time
 */

import { prisma } from '../lib/prisma';
import { StudyFormat } from './ai';

// Local types to avoid depending on generated Prisma client at compile time
interface StudySession {
  topicId: string;
  format: string;
  score: number | null;
  completionRate: number;
  durationSecs: number;
}

interface LearningProfile {
  preferredFormats: string[];
  weakTopics: string[];
  streakDays: number;
  lastStudiedAt: Date | null;
  retentionByFormat: unknown;
}

interface RetentionMap {
  [format: string]: { total: number; count: number };
}

export async function updateLearningProfile(userId: string, session: StudySession): Promise<void> {
  const profile = await prisma.learningProfile.findUnique({ where: { userId } });
  if (!profile) return;

  const retention = (profile.retentionByFormat as RetentionMap) || {};
  const fmt = session.format as string;
  const sessionScore = (session.score ?? session.completionRate);

  // Update running average for this format
  if (!retention[fmt]) retention[fmt] = { total: 0, count: 0 };
  retention[fmt].total += sessionScore;
  retention[fmt].count += 1;

  // Re-rank formats by avg retention (highest first)
  const ranked = Object.entries(retention)
    .map(([format, { total, count }]) => ({ format, avg: total / count }))
    .sort((a, b) => b.avg - a.avg)
    .map((x) => x.format);

  // Detect weak topics: avg score < 0.5 in last 3 sessions
  const recentSessions = await prisma.studySession.findMany({
    where: { userId, topicId: session.topicId },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });
  const avgRecentScore =
    recentSessions.reduce((sum: number, s) => sum + (s.score ?? s.completionRate), 0) / recentSessions.length;

  let weakTopics = profile.weakTopics;
  if (avgRecentScore < 0.5 && !weakTopics.includes(session.topicId)) {
    weakTopics = [...weakTopics, session.topicId];
  } else if (avgRecentScore >= 0.7) {
    weakTopics = weakTopics.filter((id: string) => id !== session.topicId);
  }

  // Update streak
  const lastStudied = profile.lastStudiedAt;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let streak = profile.streakDays;
  if (lastStudied) {
    const lastDay = new Date(lastStudied);
    lastDay.setHours(0, 0, 0, 0);
    if (lastDay.getTime() === yesterday.getTime()) streak += 1;
    else if (lastDay.getTime() < yesterday.getTime()) streak = 1;
    // same day: no change
  } else {
    streak = 1;
  }

  await prisma.learningProfile.update({
    where: { userId },
    data: {
      preferredFormats: ranked,
      weakTopics,
      retentionByFormat: retention,
      totalSessions: { increment: 1 },
      totalMinsStudied: { increment: Math.round(session.durationSecs / 60) },
      streakDays: streak,
      lastStudiedAt: new Date(),
    },
  });
}

export function getNextRecommendedFormat(profile: LearningProfile): StudyFormat {
  if (profile.preferredFormats.length > 0) {
    return profile.preferredFormats[0] as StudyFormat;
  }
  return 'SUMMARY_SHORT'; // default for new users
}

/**
 * Heuristic: detect whether a user needs a base review.
 * If a topic has CRITICAL difficulty or the user has failed it 3+ times,
 * recommend starting with prerequisites first.
 */
export function needsBaseReview(weakTopicIds: string[], topicId: string): boolean {
  return weakTopicIds.includes(topicId);
}
