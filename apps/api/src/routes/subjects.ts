import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const subjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

// GET /api/subjects
router.get('/', async (req: AuthRequest, res: Response) => {
  const subjects = await prisma.subject.findMany({
    where: { userId: req.userId! },
    include: {
      _count: { select: { materials: true, topics: true } },
      topics: {
        select: { id: true, difficulty: true },
      },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });

  // Compute completion % per subject (topics studied at least once)
  const enriched = await Promise.all(
    subjects.map(async (s: typeof subjects[number]) => {
      const totalTopics = s._count.topics;
      const studiedTopics = await prisma.studySession.findMany({
        where: { userId: req.userId!, topic: { subjectId: s.id } },
        distinct: ['topicId'],
      });
      const progress = totalTopics > 0 ? (studiedTopics.length / totalTopics) * 100 : 0;
      return { ...s, progress: Math.round(progress) };
    })
  );

  res.json(enriched);
});

// POST /api/subjects
router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = subjectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const subject = await prisma.subject.create({
    data: { ...parsed.data, userId: req.userId! },
  });
  res.status(201).json(subject);
});

// GET /api/subjects/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const subject = await prisma.subject.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: {
      materials: { orderBy: { createdAt: 'desc' } },
      topics: {
        orderBy: { order: 'asc' },
        include: { _count: { select: { studySessions: true } } },
      },
    },
  });
  if (!subject) { res.status(404).json({ error: 'Subject not found' }); return; }
  res.json(subject);
});

// PATCH /api/subjects/:id
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const exists = await prisma.subject.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!exists) { res.status(404).json({ error: 'Subject not found' }); return; }

  const parsed = subjectSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const updated = await prisma.subject.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(updated);
});

// DELETE /api/subjects/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const exists = await prisma.subject.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!exists) { res.status(404).json({ error: 'Subject not found' }); return; }

  await prisma.subject.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
