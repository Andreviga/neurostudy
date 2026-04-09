import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// ─── XP rules ────────────────────────────────────────────────────────────────

const XP_RULES = {
  SESSION_COMPLETED: 10,
  REVIEW_DONE: 5,
  PERFECT_SCORE: 15, // score >= 0.9
} as const;

const STREAK_BONUS_MULTIPLIER = 2.0;

// ─── Badge registry ───────────────────────────────────────────────────────────

const BADGES = {
  first_session:  { id: 'first_session',  name: 'Primeiro passo',        emoji: '🚀' },
  streak_7:       { id: 'streak_7',       name: 'Uma semana seguida',     emoji: '🔥' },
  streak_30:      { id: 'streak_30',      name: 'Mês dedicado',           emoji: '💪' },
  reviews_10:     { id: 'reviews_10',     name: '10 revisões',            emoji: '🧠' },
  reviews_100:    { id: 'reviews_100',    name: '100 revisões',           emoji: '🎓' },
  perfect_3:      { id: 'perfect_3',      name: '3 notas perfeitas',      emoji: '⭐' },
} as const;

type BadgeId = keyof typeof BADGES;

// ─── Level calculation ────────────────────────────────────────────────────────

export function getLevelFromXp(xp: number): number {
  let level = 1;
  let required = 100;
  let accumulated = 0;
  while (accumulated + required <= xp) {
    accumulated += required;
    required = Math.floor(required * 1.1);
    level++;
  }
  return level;
}

export function getXpForNextLevel(currentXp: number): { current: number; required: number; level: number } {
  let level = 1;
  let required = 100;
  let accumulated = 0;
  while (accumulated + required <= currentXp) {
    accumulated += required;
    required = Math.floor(required * 1.1);
    level++;
  }
  return { current: currentXp - accumulated, required, level };
}

// ─── Main award function ──────────────────────────────────────────────────────

export async function awardXp(
  userId: string,
  event: keyof typeof XP_RULES,
  score?: number
): Promise<{ newBadges: (typeof BADGES[BadgeId])[] }> {
  const profile = await prisma.learningProfile.findUnique({ where: { userId } });
  if (!profile) return { newBadges: [] };

  let xpGained = XP_RULES[event] as number;
  if (score !== undefined && score >= 0.9) xpGained = XP_RULES.PERFECT_SCORE;
  if (profile.streakDays >= 2) xpGained = Math.floor(xpGained * STREAK_BONUS_MULTIPLIER);

  const newTotalXp = profile.totalXp + xpGained;
  const newBadgeIds: BadgeId[] = [];

  // Determine which badges to unlock
  const totalSessions = profile.totalSessions + 1;
  const totalReviews = await prisma.review.count({ where: { userId } });
  const perfectSessions = await prisma.studySession.count({
    where: { userId, score: { gte: 0.9 } },
  });

  if (totalSessions >= 1 && !profile.badges.includes('first_session')) newBadgeIds.push('first_session');
  if (profile.streakDays >= 7 && !profile.badges.includes('streak_7')) newBadgeIds.push('streak_7');
  if (profile.streakDays >= 30 && !profile.badges.includes('streak_30')) newBadgeIds.push('streak_30');
  if (totalReviews >= 10 && !profile.badges.includes('reviews_10')) newBadgeIds.push('reviews_10');
  if (totalReviews >= 100 && !profile.badges.includes('reviews_100')) newBadgeIds.push('reviews_100');
  if (perfectSessions >= 3 && !profile.badges.includes('perfect_3')) newBadgeIds.push('perfect_3');

  await prisma.learningProfile.update({
    where: { userId },
    data: {
      totalXp: newTotalXp,
      currentLevel: getLevelFromXp(newTotalXp),
      badges: [...profile.badges, ...newBadgeIds],
      lastActivityAt: new Date(),
    },
  });

  logger.info('XP awarded', { userId, xpGained, newBadges: newBadgeIds });

  return { newBadges: newBadgeIds.map((id) => BADGES[id]) };
}
