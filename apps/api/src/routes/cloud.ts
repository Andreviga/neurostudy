/**
 * Cloud OAuth Routes
 * GET  /api/cloud/status               — list connected providers
 * GET  /api/cloud/auth/:provider       — return OAuth URL for the provider
 * GET  /api/cloud/callback/:provider   — handle OAuth callback (browser redirect)
 * DELETE /api/cloud/disconnect/:provider — remove connection
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
  encryptToken,
  getOneDriveAuthUrl,
  exchangeOneDriveCode,
} from '../services/cloudStorage';

const router = Router();

// ─── Sign / verify state JWT to bind OAuth flow to authenticated user ─────────

function makeState(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '10m' });
}

function verifyState(state: string): { userId: string } {
  try {
    return jwt.verify(state, process.env.JWT_SECRET!) as { userId: string };
  } catch {
    throw new Error('Invalid or expired OAuth state');
  }
}

// ─── GET /api/cloud/status ────────────────────────────────────────────────────
router.get('/status', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const connections = await prisma.cloudConnection.findMany({
    where: { userId: req.userId! },
    select: { provider: true, createdAt: true },
  });
  res.json(connections);
}));

// ─── GET /api/cloud/auth/:provider ───────────────────────────────────────────
router.get('/auth/:provider', authenticate, (req: AuthRequest, res: Response) => {
  const { provider } = req.params;
  const state = makeState(req.userId!);

  let authUrl: string;
  if (provider === 'google') {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI) {
      res.status(503).json({ error: 'Google Drive integration not configured' });
      return;
    }
    authUrl = getGoogleAuthUrl(state);
  } else if (provider === 'onedrive') {
    if (!process.env.ONEDRIVE_CLIENT_ID || !process.env.ONEDRIVE_REDIRECT_URI) {
      res.status(503).json({ error: 'OneDrive integration not configured' });
      return;
    }
    authUrl = getOneDriveAuthUrl(state);
  } else {
    res.status(400).json({ error: 'Unknown provider. Use "google" or "onedrive"' });
    return;
  }

  res.json({ authUrl });
});

// ─── GET /api/cloud/callback/:provider ───────────────────────────────────────
// This is reached by the browser after the user grants permission.
router.get('/callback/:provider', asyncHandler(async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { code, state, error } = req.query as Record<string, string>;

  const webUrl = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/$/, '');

  if (error) {
    res.redirect(`${webUrl}/settings?cloud_error=${encodeURIComponent(error)}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${webUrl}/settings?cloud_error=missing_params`);
    return;
  }

  let userId: string;
  try {
    ({ userId } = verifyState(state));
  } catch (e) {
    res.redirect(`${webUrl}/settings?cloud_error=invalid_state`);
    return;
  }

  try {
    if (provider === 'google') {
      const tokens = await exchangeGoogleCode(code);
      await prisma.cloudConnection.upsert({
        where: { userId_provider: { userId, provider: 'GOOGLE_DRIVE' } },
        create: {
          userId,
          provider: 'GOOGLE_DRIVE',
          accessToken: encryptToken(tokens.access_token),
          refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        },
        update: {
          accessToken: encryptToken(tokens.access_token),
          refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : undefined,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        },
      });
      res.redirect(`${webUrl}/settings?cloud_connected=google`);
    } else if (provider === 'onedrive') {
      const tokens = await exchangeOneDriveCode(code);
      await prisma.cloudConnection.upsert({
        where: { userId_provider: { userId, provider: 'ONE_DRIVE' } },
        create: {
          userId,
          provider: 'ONE_DRIVE',
          accessToken: encryptToken(tokens.access_token),
          refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        },
        update: {
          accessToken: encryptToken(tokens.access_token),
          refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : undefined,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        },
      });
      res.redirect(`${webUrl}/settings?cloud_connected=onedrive`);
    } else {
      res.redirect(`${webUrl}/settings?cloud_error=unknown_provider`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown';
    res.redirect(`${webUrl}/settings?cloud_error=${encodeURIComponent(msg)}`);
  }
}));

// ─── DELETE /api/cloud/disconnect/:provider ───────────────────────────────────
router.delete('/disconnect/:provider', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const providerMap: Record<string, 'GOOGLE_DRIVE' | 'ONE_DRIVE'> = {
    google: 'GOOGLE_DRIVE',
    onedrive: 'ONE_DRIVE',
  };
  const provider = providerMap[req.params.provider];
  if (!provider) { res.status(400).json({ error: 'Unknown provider' }); return; }

  await prisma.cloudConnection.deleteMany({
    where: { userId: req.userId!, provider },
  });
  res.status(204).send();
}));

export default router;
