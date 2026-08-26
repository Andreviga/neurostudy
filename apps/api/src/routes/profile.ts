import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getNextRecommendedFormat } from '../services/learning-profile';
import { asyncHandler } from '../lib/async-handler';

const router = Router();
router.use(authenticate);

// GET /api/profile — learning profile + recommendations
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const [profile, realTotals] = await Promise.all([
    prisma.learningProfile.findUnique({ where: { userId: req.userId! } }),
    prisma.studySession.aggregate({
      where: { userId: req.userId! },
      _count: { id: true },
      _sum: { durationSecs: true },
    }),
  ]);
  if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }

  const nextFormat = getNextRecommendedFormat(profile);
  // Report real session totals (profile counters can drift from seeded/legacy sessions)
  res.json({
    ...profile,
    totalSessions: realTotals._count.id,
    totalMinsStudied: Math.round((realTotals._sum.durationSecs || 0) / 60),
    recommendedFormat: nextFormat,
  });
}));

// GET /api/profile/today — today's study plan
router.get('/today', asyncHandler(async (req: AuthRequest, res: Response) => {
  const [dueReviews, profile, todayAgg, studiedSessions] = await Promise.all([
    prisma.review.findMany({
      where: { userId: req.userId!, nextReviewDate: { lte: new Date() } },
      include: { topic: { select: { id: true, title: true, subject: { select: { name: true, color: true } } } } },
      take: 3,
      orderBy: { retentionScore: 'asc' },
    }),
    prisma.learningProfile.findUnique({ where: { userId: req.userId! } }),
    prisma.studySession.aggregate({
      where: {
        userId: req.userId!,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      _sum: { durationSecs: true },
    }),
    prisma.studySession.groupBy({
      by: ['topicId'],
      where: { userId: req.userId! },
      _max: { score: true },
    }),
  ]);

  const bestScore = new Map(studiedSessions.map((s) => [s.topicId, s._max.score ?? 0]));
  const masteredIds = new Set(
    studiedSessions.filter((s) => (s._max.score ?? 0) >= 0.6).map((s) => s.topicId)
  );

  // Weak topics: the user's actual weak topics (avg < 50% recently), fallback to HARD topics
  let weakTopics;
  if (profile && profile.weakTopics.length > 0) {
    weakTopics = await prisma.topic.findMany({
      where: { id: { in: profile.weakTopics } },
      include: { subject: { select: { name: true, color: true } } },
      take: 3,
    });
  } else {
    weakTopics = await prisma.topic.findMany({
      where: { subject: { userId: req.userId! }, difficulty: { in: ['HARD', 'CRITICAL'] } },
      include: { subject: { select: { name: true, color: true } } },
      take: 3,
      orderBy: { createdAt: 'desc' },
    });
  }

  // "Study next": unstudied topics whose prerequisites are all mastered,
  // in curriculum order (subject creation order → material → topic order)
  const allTopics = await prisma.topic.findMany({
    where: { subject: { userId: req.userId! } },
    select: {
      id: true, title: true, difficulty: true, prerequisiteTopics: true,
      subject: { select: { id: true, name: true, color: true, createdAt: true } },
      material: { select: { title: true } },
    },
    orderBy: [{ subject: { createdAt: 'asc' } }, { materialId: 'asc' }, { order: 'asc' }],
  });

  const nextTopics = [];
  for (const t of allTopics) {
    if (bestScore.has(t.id)) continue; // already studied
    const prereqsMet = t.prerequisiteTopics.every((p) => masteredIds.has(p));
    if (!prereqsMet) continue;
    nextTopics.push({
      id: t.id,
      title: t.title,
      difficulty: t.difficulty,
      subject: { name: t.subject.name, color: t.subject.color },
      materialTitle: t.material?.title ?? null,
    });
    if (nextTopics.length >= 3) break;
  }

  res.json({
    dueReviews,
    weakTopics,
    nextTopics,
    streakDays: profile?.streakDays || 0,
    totalMinsToday: Math.round((todayAgg._sum.durationSecs || 0) / 60),
  });
}));

export default router;
