import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { logger } from './lib/logger';

// Routes
import authRouter from './routes/auth';
import subjectsRouter from './routes/subjects';
import materialsRouter from './routes/materials';
import topicsRouter from './routes/topics';
import sessionsRouter from './routes/sessions';
import reviewsRouter from './routes/reviews';
import profileRouter from './routes/profile';

const app = express();
const PORT = process.env.PORT || 3001;
const isVercel = process.env.VERCEL === '1';

// ─── Ensure upload dir exists ────────────────────────────────────────────────
const uploadDir = process.env.LOCAL_UPLOAD_DIR || (isVercel ? '/tmp/uploads' : './uploads');
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (error) {
    logger.warn('Could not create upload directory', { uploadDir, error: (error as Error).message });
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.WEB_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.resolve(uploadDir)));

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many requests' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 200, message: 'Too many requests' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/subjects', subjectsRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/profile', profileRouter);

// Root route
app.get('/', (req, res) => {
  const webUrl = process.env.WEB_URL;
  if (webUrl) {
    res.redirect(webUrl);
    return;
  }

  const host = req.get('host');
  if (host?.includes('neurostudy-api')) {
    const inferredWebUrl = `https://${host.replace('neurostudy-api', 'neurostudy-web')}`;
    res.redirect(inferredWebUrl);
    return;
  }

  const renderExternalUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderExternalUrl?.includes('-api')) {
    res.redirect(renderExternalUrl.replace('-api', '-web'));
    return;
  }

  res.status(200).json({
    service: 'neurostudy-api',
    status: 'ok',
    detail: 'Configure WEB_URL com a URL pública do frontend no Render para habilitar redirecionamento.',
  });
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

if (!isVercel) {
  app.listen(PORT, () => {
    logger.info(`API running on http://localhost:${PORT}`);
  });
}

export default app;
