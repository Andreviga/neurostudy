import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { generateContent } from '../services/ai';
import { logger } from '../lib/logger';
import { asyncHandler } from '../lib/async-handler';
import { getCachedContent, saveContentToCache } from '../utils/contentCache';
import { selectRelevantExcerpt } from '../utils/textUtils';
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

// GET /api/topics/graph — full knowledge graph (nodes + prerequisite edges)
router.get('/graph', asyncHandler(async (req: AuthRequest, res: Response) => {
  const [topics, sessions] = await Promise.all([
    prisma.topic.findMany({
      where: { subject: { userId: req.userId! } },
      select: {
        id: true, title: true, difficulty: true, prerequisiteTopics: true, order: true,
        materialId: true,
        subject: { select: { id: true, name: true, color: true, createdAt: true } },
      },
      orderBy: [{ subject: { createdAt: 'asc' } }, { materialId: 'asc' }, { order: 'asc' }],
    }),
    prisma.studySession.groupBy({
      by: ['topicId'],
      where: { userId: req.userId!, cachedContent: null },
      _max: { score: true },
    }),
  ]);

  const best = new Map(sessions.map((s) => [s.topicId, s._max.score ?? 0]));
  res.json(topics.map((t) => ({
    id: t.id,
    title: t.title,
    difficulty: t.difficulty,
    prerequisites: t.prerequisiteTopics,
    subjectId: t.subject.id,
    subjectName: t.subject.name,
    color: t.subject.color,
    studied: best.has(t.id),
    mastered: (best.get(t.id) ?? 0) >= 0.6,
  })));
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
      where: { userId: req.userId!, topicId: { in: topic.prerequisiteTopics }, cachedContent: null },
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

  const useClaude = !!process.env.ANTHROPIC_API_KEY;
  if (!useClaude && !process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'Chat requer ANTHROPIC_API_KEY ou GEMINI_API_KEY configurada' });
    return;
  }

  const systemPrompt = `Você é um professor particular paciente, especializado em ensinar INICIANTES TOTAIS. O aluno nunca viu este assunto antes.

Como ensinar:
- Responda baseando-se no material abaixo. Se algo não estiver no material, diga isso claramente — mas então explique o conceito com seu próprio conhecimento, avisando que é complemento.
- Defina todo termo técnico na primeira vez, em palavras simples.
- Use exemplos do cotidiano brasileiro antes de exemplos técnicos.
- Respostas curtas e diretas (2-5 parágrafos no máximo). Nada de paredes de texto.
- Ao final de cada explicação, faça UMA pergunta simples de verificação para checar se o aluno entendeu (ex: "Pra ver se ficou claro: o que aconteceria se...?").
- Se o aluno errar ou demonstrar confusão, não repita a mesma explicação — tente por outro ângulo (analogia, exemplo, desenho em texto).

MATERIAL: "${materialTitle}"
---
${materialText.slice(0, 10000)}
---
Responda sempre em português brasileiro.`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const chatHistory = history.map((h) => ({
      role: (h.role === 'model' ? 'model' : 'user') as 'user' | 'model',
      content: h.content,
    }));

    let claudeOk = false;
    if (useClaude) {
      try {
        const { anthropicService } = await import('../services/ai/anthropic');
        await anthropicService.chatStream(systemPrompt, chatHistory, message, (text) => {
          claudeOk = true;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        });
        claudeOk = true;
      } catch (err) {
        // Credits exhausted or Claude unavailable — fall back to Gemini if
        // nothing was streamed yet
        logger.warn('Claude chat failed, falling back to Gemini', { err: String(err) });
        if (claudeOk || !process.env.GEMINI_API_KEY) throw err;
      }
    }
    if (!claudeOk) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
        systemInstruction: systemPrompt,
      });
      const chat = model.startChat({
        history: chatHistory.map((h) => ({ role: h.role, parts: [{ text: h.content }] })),
      });
      const result = await chat.sendMessageStream(message);
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
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
