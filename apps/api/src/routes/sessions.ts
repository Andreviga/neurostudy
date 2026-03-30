import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { updateLearningProfile } from '../services/learning-profile';

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
router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const topic = await prisma.topic.findFirst({
    where: { id: parsed.data.topicId, subject: { userId: req.userId! } },
  });
  if (!topic) { res.status(404).json({ error: 'Topic not found' }); return; }

  const session = await prisma.studySession.create({
    data: { ...parsed.data, userId: req.userId! },
  });

  // Update spaced repetition review schedule
  await updateReviewSchedule(req.userId!, parsed.data.topicId, parsed.data.score);

  // Update learning profile asynchronously
  updateLearningProfile(req.userId!, session).catch(() => {});

  res.status(201).json(session);
});

// GET /api/sessions — history
router.get('/', async (req: AuthRequest, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const sessions = await prisma.studySession.findMany({
    where: { userId: req.userId! },
    include: { topic: { select: { title: true, subject: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json(sessions);
});

// GET /api/sessions/stats — aggregated stats for dashboard
router.get('/stats', async (req: AuthRequest, res: Response) => {
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
    // Sessions per subject last 7 days
    prisma.$queryRaw`
      SELECT s.name as subject, COUNT(ss.id)::int as sessions
      FROM study_sessions ss
      JOIN topics t ON ss.topic_id = t.id
      JOIN subjects s ON t.subject_id = s.id
      WHERE ss.user_id = ${req.userId!}
        AND ss.created_at > NOW() - INTERVAL '7 days'
      GROUP BY s.name
    `,
  ]);

  res.json({
    totalSessions,
    totalMinsStudied: Math.round((totalMins._sum.durationSecs || 0) / 60),
    avgScore: avgScore._avg.score ? Math.round(avgScore._avg.score * 100) : null,
    bySubjectLast7Days: bySubject,
  });
});

// ─── Spaced repetition (SM-2 simplified) ─────────────────────────────────────

async function updateReviewSchedule(userId: string, topicId: string, score?: number) {
  const q = score !== undefined ? score : 0.5; // 0-1

  const existing = await prisma.review.findUnique({ where: { userId_topicId: { userId, topicId } } });

  if (!existing) {
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

  // SM-2 ease factor update
  const newEase = Math.max(1.3, existing.easeFactor + 0.1 - (1 - q) * (0.08 + (1 - q) * 0.02));
  const newInterval = q < 0.6
    ? 1
    : existing.reviewCount === 1
      ? 6
      : Math.round(existing.interval * newEase);

  await prisma.review.update({
    where: { userId_topicId: { userId, topicId } },
    data: {
      easeFactor: newEase,
      interval: newInterval,
      retentionScore: q,
      reviewCount: { increment: 1 },
      nextReviewDate: new Date(Date.now() + newInterval * 86400000),
    },
  });
}

export default router;
