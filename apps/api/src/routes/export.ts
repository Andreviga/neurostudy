import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';

const router = Router();
router.use(authenticate);

/** Escape a value for an Anki HTML-enabled TSV field */
function ankiField(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\t/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n/g, '<br>');
}

function tagify(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);
}

// GET /api/export/anki?subjectId=...  — Anki-importable TSV (flashcards + quizzes)
router.get('/anki', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { subjectId } = req.query as { subjectId?: string };
  const topicFilter = {
    subject: { userId: req.userId!, ...(subjectId ? { id: subjectId } : {}) },
  };

  const [flashcards, quizItems] = await Promise.all([
    prisma.flashcard.findMany({
      where: { topic: topicFilter },
      include: { topic: { select: { title: true, subject: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.quizItem.findMany({
      where: { topic: topicFilter },
      include: { topic: { select: { title: true, subject: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const lines: string[] = [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic',
    '#deck column:1',
    '#tags column:4',
  ];

  for (const f of flashcards) {
    const deck = `NeuroStudy::${f.topic.subject.name.replace(/:/g, '-')}`;
    const tags = `flashcard topico-${tagify(f.topic.title)}`;
    lines.push([deck, ankiField(f.front), ankiField(f.back), tags].join('\t'));
  }

  for (const q of quizItems) {
    const deck = `NeuroStudy::${q.topic.subject.name.replace(/:/g, '-')}`;
    const tags = `quiz topico-${tagify(q.topic.title)}`;
    const letters = ['A', 'B', 'C', 'D', 'E'];
    const front = [
      ankiField(q.question),
      '',
      ...q.options.map((o, i) => `${letters[i]}) ${ankiField(o)}`),
    ].join('<br>');
    const correct = `${letters[q.correctIndex] ?? '?'}) ${ankiField(q.options[q.correctIndex] ?? '')}`;
    const back = `<b>Resposta: ${correct}</b>${q.explanation ? `<br><br>${ankiField(q.explanation)}` : ''}`;
    lines.push([deck, front, back, tags].join('\t'));
  }

  const filename = `neurostudy-anki-${new Date().toISOString().slice(0, 10)}.txt`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + lines.join('\n'));
}));

export default router;
