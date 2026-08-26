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
      material: { select: { id: true, title: true } },
      _count: { select: { quizItems: true, flashcards: true, studySessions: true } },
    },
    orderBy: [{ materialId: 'asc' }, { order: 'asc' }],
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

  // Resolve prerequisites: title + whether the user already mastered each one
  let prerequisites: { id: string; title: string; subjectName: string; mastered: boolean }[] = [];
  if (topic.prerequisiteTopics.length > 0) {
    const prereqTopics = await prisma.topic.findMany({
      where: { id: { in: topic.prerequisiteTopics } },
      select: { id: true, title: true, subject: { select: { name: true } } },
    });
    const sessions = await prisma.studySession.groupBy({
      by: ['topicId'],
      where: { userId: req.userId!, topicId: { in: topic.prerequisiteTopics } },
      _max: { score: true },
    });
    const bestScore = new Map(sessions.map((s) => [s.topicId, s._max.score ?? 0]));
    prerequisites = prereqTopics.map((p) => ({
      id: p.id,
      title: p.title,
      subjectName: p.subject.name,
      mastered: (bestScore.get(p.id) ?? 0) >= 0.6,
    }));
  }

  res.json({ ...topic, prerequisites });
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
  let materialText = selectRelevantExcerpt(topic.material?.extractedText || '', topic.title, topic.summary || '');
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

/**
 * Pick the ~8k-char window of the material most relevant to the topic,
 * instead of always using the first 8k chars. Scores fixed-size windows by
 * keyword overlap with the topic title/summary and returns the best one.
 */
function selectRelevantExcerpt(text: string, title: string, summary: string): string {
  const LIMIT = 8000;
  if (text.length <= LIMIT) return text;

  const stopwords = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'para', 'com', 'por', 'uma', 'um', 'os', 'as', 'ao', 'introdução', 'conceitos', 'fundamentos', 'básicos', 'estudo', 'sobre']);
  const keywords = `${title} ${summary}`
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !stopwords.has(w));
  if (keywords.length === 0) return text.slice(0, LIMIT);

  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const STEP = 4000;
  let bestStart = 0, bestScore = -1;
  for (let start = 0; start < normalized.length; start += STEP) {
    const window = normalized.slice(start, start + LIMIT);
    let score = 0;
    for (const kw of keywords) {
      let i = window.indexOf(kw);
      while (i !== -1) { score++; i = window.indexOf(kw, i + kw.length); }
    }
    if (score > bestScore) { bestScore = score; bestStart = start; }
  }
  return text.slice(bestStart, bestStart + LIMIT);
}

export default router;
