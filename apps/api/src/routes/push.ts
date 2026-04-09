import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';

const router = Router();
router.use(authenticate);

// POST /api/push/subscribe
router.post('/subscribe', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint) {
    res.status(400).json({ error: 'Invalid push subscription object' });
    return;
  }
  await prisma.user.update({
    where: { id: req.userId! },
    data: {
      pushSubscription: JSON.stringify(subscription),
      pushEnabled: true,
    },
  });
  res.json({ success: true });
}));

// DELETE /api/push/unsubscribe
router.delete('/unsubscribe', asyncHandler(async (req: AuthRequest, res: Response) => {
  await prisma.user.update({
    where: { id: req.userId! },
    data: { pushSubscription: null, pushEnabled: false },
  });
  res.json({ success: true });
}));

export default router;
