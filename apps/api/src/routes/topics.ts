import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { generateContent } from '../services/ai';
import { logger } from '../lib/logger';

const router = Router();
router.use(authenticate);

// GET /api/topics?subjectId=...
router.get('/', async (req: AuthRequest, res: Response) => {
  const { subjectId } = req.query;
  const topics = await prisma.topic.findMany({
    where: {
      subjectId: subjectId as string | undefined,
      subject: { userId: req.userId! },
    },
    include: {
      _count: { select: { quizItems: true, flashcards: true, studySessions: true } },
    },
    orderBy: { order: 'asc' },
  });
  res.json(topics);
});

// GET /api/topics/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const topic = await prisma.topic.findFirst({
    where: { id: req.params.id, subject: { userId: req.userId! } },
    include: {
      quizItems: true,
      flashcards: true,
      subject: { select: { name: true } },
      _count: { select: { studySessions: true } },
    },
  });
  if (!topic) { res.status(404).json({ error: 'Topic not found' }); return; }
  res.json(topic);
});

const generateSchema = z.object({
  format: z.enum([
    'SUMMARY_SHORT', 'SUMMARY_MEDIUM', 'SUMMARY_DETAILED',
    'STEP_BY_STEP', 'ANALOGY', 'PRACTICAL_EXAMPLE',
    'QUIZ', 'FLASHCARD', 'GUIDED_QUESTIONS', 'MIND_MAP',
  ]),
  provider: z.enum(['openai', 'anthropic', 'gemini']).optional(),
});

// POST /api/topics/:id/generate — generate study content for a format
router.post('/:id/generate', async (req: AuthRequest, res: Response) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const topic = await prisma.topic.findFirst({
    where: { id: req.params.id, subject: { userId: req.userId! } },
    include: { material: { select: { extractedText: true } } },
  });
  if (!topic) { res.status(404).json({ error: 'Topic not found' }); return; }

  const { format, provider } = parsed.data;

  try {
    const result = await generateContent({
      topicTitle: topic.title,
      topicSummary: topic.summary || '',
      materialText: topic.material?.extractedText?.slice(0, 8000) || '',
      format,
      provider,
    });

    // Persist quiz/flashcard items if generated
    if (format === 'QUIZ' && result.quizItems?.length) {
      await prisma.quizItem.createMany({
        data: result.quizItems.map((q) => ({ ...q, topicId: topic.id })),
        skipDuplicates: true,
      });
    }
    if (format === 'FLASHCARD' && result.flashcards?.length) {
      await prisma.flashcard.createMany({
        data: result.flashcards.map((f) => ({ ...f, topicId: topic.id })),
        skipDuplicates: true,
      });
    }

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Content generation failed', { topicId: topic.id, format, error: message });
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

export default router;
