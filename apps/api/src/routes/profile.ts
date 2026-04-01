import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getNextRecommendedFormat } from '../services/learning-profile';
import { asyncHandler } from '../lib/async-handler';

const router = Router();
router.use(authenticate);

// GET /api/profile — learning profile + recommendations
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const profile = await prisma.learningProfile.findUnique({
    where: { userId: req.userId! },
  });
  if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }

  const nextFormat = getNextRecommendedFormat(profile);
  res.json({ ...profile, recommendedFormat: nextFormat });
}));

// GET /api/profile/today — today's study plan
router.get('/today', asyncHandler(async (req: AuthRequest, res: Response) => {
  const [dueReviews, weakTopics, profile, todayAgg] = await Promise.all([
    prisma.review.findMany({
      where: { userId: req.userId!, nextReviewDate: { lte: new Date() } },
      include: { topic: { select: { id: true, title: true, subject: { select: { name: true, color: true } } } } },
      take: 3,
      orderBy: { retentionScore: 'asc' },
    }),
    prisma.topic.findMany({
      where: {
        subject: { userId: req.userId! },
        difficulty: { in: ['HARD', 'CRITICAL'] },
      },
      include: { subject: { select: { name: true, color: true } } },
      take: 3,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.learningProfile.findUnique({ where: { userId: req.userId! } }),
    prisma.studySession.aggregate({
      where: {
        userId: req.userId!,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      _sum: { durationSecs: true },
    }),
  ]);

  res.json({
    dueReviews,
    weakTopics,
    streakDays: profile?.streakDays || 0,
    totalMinsToday: Math.round((todayAgg._sum.durationSecs || 0) / 60),
  });
}));

export default router;
