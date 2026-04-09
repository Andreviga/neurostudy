import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import {
  generateAccessToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
} from '../services/authService';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  course: z.string().optional(),
  semester: z.number().int().min(1).max(12).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Backward-compat: also sign a long-lived token for clients that only use `token`
function signLegacyToken(userId: string) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']) || '7d',
  });
}

// POST /api/auth/signup
router.post('/signup', asyncHandler(async (req: Request, res: Response) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { name, email, password, course, semester } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, password: hashed, course, semester },
  });

  // Create empty learning profile
  await prisma.learningProfile.create({
    data: { userId: user.id },
  });

  const [accessToken, refreshToken, legacyToken] = await Promise.all([
    Promise.resolve(generateAccessToken(user.id)),
    generateRefreshToken(user.id),
    Promise.resolve(signLegacyToken(user.id)),
  ]);

  res.status(201).json({
    token: legacyToken,          // backward compat
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, course: user.course },
  });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const [accessToken, refreshToken, legacyToken] = await Promise.all([
    Promise.resolve(generateAccessToken(user.id)),
    generateRefreshToken(user.id),
    Promise.resolve(signLegacyToken(user.id)),
  ]);

  res.json({
    token: legacyToken,          // backward compat
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, course: user.course },
  });
}));

// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) { res.status(400).json({ error: 'refreshToken required' }); return; }
  const tokens = await refreshAccessToken(refreshToken);
  res.json(tokens);
}));

// POST /api/auth/logout — revoke current refresh token
router.post('/logout', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body;
  if (refreshToken) await revokeRefreshToken(refreshToken);
  res.json({ success: true });
}));

// POST /api/auth/logout-all — revoke all sessions
router.post('/logout-all', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  await revokeAllRefreshTokens(req.userId!);
  res.json({ success: true });
}));

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as { sub: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, course: true, semester: true, dailyGoalMinutes: true },
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;

