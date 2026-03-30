import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/reviews/due — topics due for review today
router.get('/due', async (req: AuthRequest, res: Response) => {
  const reviews = await prisma.review.findMany({
    where: {
      userId: req.userId!,
      nextReviewDate: { lte: new Date() },
    },
    include: {
      topic: {
        select: {
          id: true, title: true, difficulty: true,
          subject: { select: { name: true, color: true } },
        },
      },
    },
    orderBy: { nextReviewDate: 'asc' },
    take: 10,
  });
  res.json(reviews);
});

// GET /api/reviews — all reviews for the user
router.get('/', async (req: AuthRequest, res: Response) => {
  const reviews = await prisma.review.findMany({
    where: { userId: req.userId! },
    include: {
      topic: { select: { id: true, title: true, subject: { select: { name: true } } } },
    },
    orderBy: { nextReviewDate: 'asc' },
  });
  res.json(reviews);
});

export default router;
