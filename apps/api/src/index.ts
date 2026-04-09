import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { logger } from './lib/logger';
import { startKeepAlive } from './keepAlive';

// ─── Validate required environment variables at startup ───────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// Routes
import authRouter from './routes/auth';
import subjectsRouter from './routes/subjects';
import materialsRouter from './routes/materials';
import topicsRouter from './routes/topics';
import sessionsRouter from './routes/sessions';
import reviewsRouter from './routes/reviews';
import profileRouter from './routes/profile';
import pushRouter from './routes/push';
import shareRouter from './routes/share';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Ensure upload dir exists ────────────────────────────────────────────────
const uploadDir = process.env.LOCAL_UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
const corsOrigin = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/$/, '');
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.resolve(uploadDir)));

// Rate limiting
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'Muitos uploads. Tente novamente em 1 hora.' },
});
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many requests' }));
app.use('/api/materials/upload', uploadLimiter);
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 200, message: 'Too many requests' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/subjects', subjectsRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/push', pushRouter);
app.use('/api/share', shareRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`API running on http://localhost:${PORT}`);
  startKeepAlive();
});

export default app;
