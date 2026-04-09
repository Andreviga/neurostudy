import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';

const router = Router();

// GET /api/share/:token — public, no auth required
router.get('/:token', asyncHandler(async (req: Request, res: Response) => {
  const topic = await prisma.topic.findUnique({
    where: { shareToken: req.params.token, isPublic: true },
    include: {
      flashcards: true,
      quizItems: { select: { id: true, question: true, options: true, explanation: true } }, // no correctIndex
      subject: { select: { name: true } },
    },
  });

  if (!topic) {
    res.status(404).json({ error: 'Conteúdo não encontrado ou não é público' });
    return;
  }

  res.json({
    title: topic.title,
    subject: topic.subject.name,
    summary: topic.summary,
    difficulty: topic.difficulty,
    flashcards: topic.flashcards,
    quizItems: topic.quizItems,
  });
}));

// PATCH /api/topics/:id/share — authenticated
router.patch('/:id/share', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { isPublic } = req.body as { isPublic?: boolean };
  if (typeof isPublic !== 'boolean') {
    res.status(400).json({ error: 'isPublic (boolean) is required' });
    return;
  }

  const topic = await prisma.topic.findFirst({
    where: { id: req.params.id, subject: { userId: req.userId! } },
  });
  if (!topic) { res.status(404).json({ error: 'Topic not found' }); return; }

  const updated = await prisma.topic.update({
    where: { id: req.params.id },
    data: { isPublic },
    select: { shareToken: true, isPublic: true },
  });

  const shareUrl = updated.isPublic
    ? `${process.env.WEB_URL || ''}/share/${updated.shareToken}`
    : null;

  res.json({ shareUrl, isPublic: updated.isPublic });
}));

export default router;
