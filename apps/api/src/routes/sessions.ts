import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { updateLearningProfile } from '../services/learning-profile';
import { asyncHandler } from '../lib/async-handler';
import { updateReviewWithFSRS } from '../services/fsrsService';
import { awardXp } from '../services/gamificationService';

const router = Router();
router.use(authenticate);

const sessionSchema = z.object({
  topicId: z.string(),
  format: z.enum([
    'SUMMARY_SHORT', 'SUMMARY_MEDIUM', 'SUMMARY_DETAILED',
    'STEP_BY_STEP', 'ANALOGY', 'PRACTICAL_EXAMPLE',
    'QUIZ', 'FLASHCARD', 'GUIDED_QUESTIONS', 'MIND_MAP',
  ]),
  durationSecs: z.number().int().min(0),
  completionRate: z.number().min(0).max(1),
  score: z.number().min(0).max(1).optional(),
  aiProvider: z.string().optional(),
  aiModel: z.string().optional(),
});

// POST /api/sessions — record a completed study session
router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const topic = await prisma.topic.findFirst({
    where: { id: parsed.data.topicId, subject: { userId: req.userId! } },
  });
  if (!topic) { res.status(404).json({ error: 'Topic not found' }); return; }

  const session = await prisma.studySession.create({
    data: { ...parsed.data, userId: req.userId! },
  });

  // Update spaced repetition via FSRS (with SM-2 fallback for new reviews)
  await updateReviewScheduleFSRS(req.userId!, parsed.data.topicId, parsed.data.score);

  // Award XP + badges (gamification)
  const { newBadges } = await awardXp(req.userId!, 'SESSION_COMPLETED', parsed.data.score).catch(() => ({ newBadges: [] }));

  // Update learning profile asynchronously
  updateLearningProfile(req.userId!, session).catch(() => {});

  res.status(201).json({ ...session, newBadges });
}));

// GET /api/sessions — history
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const sessions = await prisma.studySession.findMany({
    where: { userId: req.userId! },
    include: { topic: { select: { title: true, subject: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json(sessions);
}));

// GET /api/sessions/stats — aggregated stats for dashboard
router.get('/stats', asyncHandler(async (req: AuthRequest, res: Response) => {
  const [totalSessions, totalMins, avgScore, bySubject] = await Promise.all([
    prisma.studySession.count({ where: { userId: req.userId! } }),
    prisma.studySession.aggregate({
      where: { userId: req.userId! },
      _sum: { durationSecs: true },
    }),
    prisma.studySession.aggregate({
      where: { userId: req.userId!, score: { not: null } },
      _avg: { score: true },
    }),
    prisma.$queryRaw`
      SELECT s.name as subject, COUNT(ss.id)::int as sessions
      FROM study_sessions ss
      JOIN topics t ON ss."topicId" = t.id
      JOIN subjects s ON t."subjectId" = s.id
      WHERE ss."userId" = ${req.userId!}
        AND ss."createdAt" > NOW() - INTERVAL '7 days'
      GROUP BY s.name
    `,
  ]);

  res.json({
    totalSessions,
    totalMinsStudied: Math.round((totalMins._sum.durationSecs || 0) / 60),
    avgScore: avgScore._avg.score ? Math.round(avgScore._avg.score * 100) : null,
    bySubjectLast7Days: bySubject,
  });
}));

// ─── Spaced repetition hybrid: FSRS for existing reviews, SM-2 seed for new ──

async function updateReviewScheduleFSRS(userId: string, topicId: string, score?: number) {
  const q = score !== undefined ? score : 0.5;

  const existing = await prisma.review.findUnique({ where: { userId_topicId: { userId, topicId } } });

  if (!existing) {
    // First encounter — seed with SM-2 values, FSRS will take over next time
    await prisma.review.create({
      data: {
        userId,
        topicId,
        retentionScore: q,
        reviewCount: 1,
        interval: q >= 0.6 ? 3 : 1,
        nextReviewDate: new Date(Date.now() + (q >= 0.6 ? 3 : 1) * 86400000),
      },
    });
    return;
  }

  // Use FSRS for subsequent reviews
  await updateReviewWithFSRS(existing.id, q);
}

export default router;

