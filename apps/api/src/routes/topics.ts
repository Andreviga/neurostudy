import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { generateContent } from '../services/ai';
import { logger } from '../lib/logger';
import { asyncHandler } from '../lib/async-handler';
import { getCachedContent, saveContentToCache } from '../utils/contentCache';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();
router.use(authenticate);

// GET /api/topics?subjectId=...
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
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
}));

// GET /api/topics/:id
router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
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
}));

const generateSchema = z.object({
  format: z.enum([
    'SUMMARY_SHORT', 'SUMMARY_MEDIUM', 'SUMMARY_DETAILED',
    'STEP_BY_STEP', 'ANALOGY', 'PRACTICAL_EXAMPLE',
    'QUIZ', 'FLASHCARD', 'GUIDED_QUESTIONS', 'MIND_MAP',
  ]),
  provider: z.enum(['openai', 'anthropic', 'gemini']).optional(),
});

// POST /api/topics/:id/generate — generate study content for a format
router.post('/:id/generate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const topic = await prisma.topic.findFirst({
    where: { id: req.params.id, subject: { userId: req.userId! } },
    include: {
      material: { select: { extractedText: true } },
      subject: { select: { name: true, examStyle: true, professorName: true } },
    },
  });
  if (!topic) { res.status(404).json({ error: 'Topic not found' }); return; }

  const { format, provider } = parsed.data;
  const force = req.query.force === 'true';

  // Cache check (Fase 1.3)
  if (!force) {
    const cached = await getCachedContent(topic.id, format);
    if (cached) {
      return res.json({ ...cached, fromCache: true });
    }
  }

  // Build exam-style context (Fase 3.4)
  let materialText = topic.material?.extractedText?.slice(0, 8000) || '';
  if (topic.subject?.examStyle) {
    materialText = `[Estilo de prova: ${topic.subject.examStyle}${topic.subject.professorName ? ` — Prof(a). ${topic.subject.professorName}` : ''}]\n\n${materialText}`;
  }

  try {
    const result = await generateContent({
      topicTitle: topic.title,
      topicSummary: topic.summary || '',
      materialText,
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

    // Save to cache
    await saveContentToCache(req.userId!, topic.id, format, result);

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Content generation failed', { topicId: topic.id, format, error: message });
    res.status(500).json({ error: 'Failed to generate content' });
  }
}));

// POST /api/topics/:id/chat — streaming chat with the material
router.post('/:id/chat', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { message, history = [] } = req.body as {
    message?: string;
    history?: { role: string; content: string }[];
  };
  if (!message) { res.status(400).json({ error: 'message is required' }); return; }

  const topic = await prisma.topic.findFirst({
    where: { id: req.params.id, subject: { userId: req.userId! } },
    include: { material: { select: { extractedText: true, title: true } } },
  });
  if (!topic) { res.status(404).json({ error: 'Topic not found' }); return; }

  const materialText = topic.material?.extractedText ?? topic.summary ?? '';
  const materialTitle = topic.material?.title ?? topic.title;

  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'Chat requer GEMINI_API_KEY configurada' });
    return;
  }

  const systemPrompt = `Você é um tutor IA especializado. Responda perguntas baseando-se APENAS no material abaixo. Se a resposta não estiver no material, diga isso claramente. Seja didático e use exemplos.\n\nMATERIAL: "${materialTitle}"\n---\n${materialText.slice(0, 10000)}\n---\nResponda sempre em português.`;

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    systemInstruction: systemPrompt,
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const chat = model.startChat({
      history: history.map((h) => ({
        role: h.role as 'user' | 'model',
        parts: [{ text: h.content }],
      })),
    });

    const result = await chat.sendMessageStream(message);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    logger.error('Chat streaming failed', { topicId: topic.id, err: String(err) });
    res.write(`data: ${JSON.stringify({ error: 'Erro no chat' })}\n\n`);
    res.end();
  }
}));

export default router;
