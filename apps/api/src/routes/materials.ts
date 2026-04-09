import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
// Local type mirrors the Prisma enum — avoids needing generated client at compile time
type MaterialType = 'PDF' | 'DOCX' | 'PPTX' | 'TXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'LINK' | 'TEXT';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { extractTextFromPDF } from '../services/pdf';
import { generateTopicsFromText, detectSubjectFromText } from '../services/ai';
import { uploadFile } from '../services/storage';
import { logger } from '../lib/logger';
import { asyncHandler } from '../lib/async-handler';
import { truncateExtractedText, estimateTokenCount } from '../utils/textUtils';

const router = Router();
router.use(authenticate);

// ─── Allowed MIME types for magic-byte validation ─────────────────────────────
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

async function validateMagicBytes(filePath: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { fileTypeFromFile } = await (Function('return import("file-type")')() as Promise<any>);
    const result = await fileTypeFromFile(filePath);
    if (!result) return true; // text files have no magic bytes — allow
    return ALLOWED_MIMES.has(result.mime);
  } catch {
    return true; // if file-type is unavailable, skip validation
  }
}

// Multer config — limit to 50 MB
const storage = multer.diskStorage({
  destination: process.env.LOCAL_UPLOAD_DIR || './uploads',
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) =>
    cb(null, `${uuid()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowed = ['.pdf', '.docx', '.pptx', '.txt', '.md', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mov', '.webm', '.avi', '.mkv'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// POST /api/materials/upload
router.post('/upload', upload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const { subjectId, title } = req.body;
  if (!subjectId) { res.status(400).json({ error: 'subjectId is required' }); return; }

  // Magic-byte validation (security Fase 1.4)
  const isValidType = await validateMagicBytes(req.file.path);
  if (!isValidType) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: 'Tipo de arquivo não suportado ou arquivo corrompido.' });
    return;
  }

  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId: req.userId! } });
  if (!subject) { res.status(404).json({ error: 'Subject not found' }); return; }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const type = extToType(ext);
  const fileUrl = await uploadFile(req.file.path, req.file.filename);

  // Create material record immediately
  const material = await prisma.material.create({
    data: {
      userId: req.userId!,
      subjectId,
      title: title || req.file.originalname,
      type,
      fileUrl,
    },
  });

  // Process async (don't block response)
  processMaterial(material.id, req.file.path, type, req.userId!).catch((err) =>
    logger.error('Material processing failed', { materialId: material.id, err: err.message })
  );

  res.status(202).json({ ...material, status: 'processing' });
}));

// POST /api/materials/text  — paste raw text
router.post('/text', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { subjectId, title, text } = req.body;
  if (!subjectId || !text) { res.status(400).json({ error: 'subjectId and text are required' }); return; }

  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId: req.userId! } });
  if (!subject) { res.status(404).json({ error: 'Subject not found' }); return; }

  const material = await prisma.material.create({
    data: {
      userId: req.userId!,
      subjectId,
      title: title || 'Pasted text',
      type: 'TEXT',
      extractedText: text,
      processedAt: new Date(),
    },
  });

  generateTopicsFromText(material.id, text, subjectId, req.userId!).catch((err) =>
    logger.error('Topic generation failed', { materialId: material.id, err: err.message })
  );

  res.status(202).json({ ...material, status: 'processing' });
}));

// POST /api/materials/url  — import from a web page
router.post('/url', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { subjectId, url, title } = req.body as { subjectId?: string; url?: string; title?: string };
  if (!subjectId || !url) { res.status(400).json({ error: 'subjectId and url are required' }); return; }

  let parsed: URL;
  try { parsed = new URL(url); } catch { res.status(400).json({ error: 'Invalid URL' }); return; }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    res.status(400).json({ error: 'Only HTTP/HTTPS URLs are supported' }); return;
  }
  if (isPrivateHost(parsed.hostname)) {
    res.status(400).json({ error: 'Private/local URLs are not allowed' }); return;
  }

  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId: req.userId! } });
  if (!subject) { res.status(404).json({ error: 'Subject not found' }); return; }

  let extractedText = '';
  let materialType: MaterialType = 'LINK';
  let materialTitle = title || url;

  // ─── YouTube transcript ────────────────────────────────────────────────────
  const youtubeId = extractYoutubeId(url);
  if (youtubeId) {
    try {
      const { YoutubeTranscript } = await import('youtube-transcript');
      let transcript: { text: string }[] = [];
      try {
        transcript = await YoutubeTranscript.fetchTranscript(youtubeId, { lang: 'pt' });
      } catch {
        transcript = await YoutubeTranscript.fetchTranscript(youtubeId);
      }
      extractedText = transcript.map((t) => t.text).join(' ').trim();
      materialType = 'VIDEO';
      if (!title) materialTitle = `YouTube: ${youtubeId}`;
    } catch (err) {
      logger.warn('YouTube transcript fetch failed', { youtubeId, err: String(err) });
    }
  }

  // ─── Fallback: fetch HTML ─────────────────────────────────────────────────
  if (!extractedText) {
    let html: string;
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NeuroStudyBot/1.0)' },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      html = await resp.text();
    } catch (err: unknown) {
      res.status(422).json({ error: `Could not fetch URL: ${err instanceof Error ? err.message : 'Unknown error'}` });
      return;
    }
    extractedText = extractTextFromHtml(html);
    if (!title) materialTitle = extractPageTitle(html) || url;
  }

  if (extractedText.length < 100) {
    res.status(422).json({ error: 'Not enough text content found on this page' });
    return;
  }

  const { text: truncated, truncated: wasTruncated } = truncateExtractedText(extractedText);

  const material = await prisma.material.create({
    data: {
      userId: req.userId!,
      subjectId,
      title: materialTitle,
      type: materialType,
      fileUrl: url,
      extractedText: truncated,
      textTruncated: wasTruncated,
      textTokenCount: estimateTokenCount(truncated),
      processedAt: new Date(),
    },
  });

  generateTopicsFromText(material.id, truncated, subjectId, req.userId!).catch((err) =>
    logger.error('Topic generation failed', { materialId: material.id, err: err.message })
  );

  res.status(202).json({ ...material, status: 'processing' });
}));

// POST /api/materials/detect-subject — detect discipline from text snippet and auto-create subject
router.post('/detect-subject', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { text } = req.body as { text?: string };
  if (!text || text.trim().length < 50) {
    res.status(400).json({ error: 'Provide at least 50 characters of text for detection' });
    return;
  }

  // Fetch existing subjects for this user so the AI can match to an existing one
  const existing = await prisma.subject.findMany({
    where: { userId: req.userId! },
    select: { id: true, name: true },
  });
  const existingNames = existing.map((s: { id: string; name: string }) => s.name);

  const detection = await detectSubjectFromText(text, existingNames);

  // Check if a subject with the detected name already exists (case-insensitive)
  const matched = existing.find(
    (s: { id: string; name: string }) => s.name.toLowerCase() === detection.subjectName.toLowerCase()
  );

  let subjectId: string;
  if (matched) {
    subjectId = matched.id;
  } else {
    const created = await prisma.subject.create({
      data: { name: detection.subjectName, userId: req.userId! },
    });
    subjectId = created.id;
  }

  res.json({ subjectId, subjectName: detection.subjectName, confidence: detection.confidence, reason: detection.reason, isNew: !matched });
}));

// GET /api/materials/:id/status — lightweight polling for processing state
router.get('/:id/status', asyncHandler(async (req: AuthRequest, res: Response) => {
  const material = await prisma.material.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    select: { id: true, processedAt: true, title: true, textTruncated: true, subjectId: true },
  });
  if (!material) { res.status(404).json({ error: 'Material not found' }); return; }
  res.json({
    id: material.id,
    status: material.processedAt ? 'done' : 'processing',
    title: material.title,
    truncated: material.textTruncated,
    subjectId: material.subjectId,
  });
}));

// GET /api/materials/:id
router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const material = await prisma.material.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { topics: { orderBy: { order: 'asc' } } },
  });
  if (!material) { res.status(404).json({ error: 'Material not found' }); return; }
  res.json(material);
}));

// DELETE /api/materials/:id
router.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const m = await prisma.material.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!m) { res.status(404).json({ error: 'Material not found' }); return; }
  await prisma.material.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function processMaterial(materialId: string, filePath: string, type: string, userId: string) {
  let rawText = '';

  if (type === 'PDF') {
    const result = await extractTextFromPDF(filePath);
    rawText = result.text;
    const { text, truncated } = truncateExtractedText(rawText);
    await prisma.material.update({
      where: { id: materialId },
      data: {
        extractedText: text,
        textTruncated: truncated,
        textTokenCount: estimateTokenCount(text),
        pageCount: result.pages,
        processedAt: new Date(),
      },
    });
    rawText = text;
  }

  if (type === 'TXT') {
    rawText = fs.readFileSync(filePath, 'utf-8').trim();
    const { text, truncated } = truncateExtractedText(rawText);
    await prisma.material.update({
      where: { id: materialId },
      data: {
        extractedText: text,
        textTruncated: truncated,
        textTokenCount: estimateTokenCount(text),
        processedAt: new Date(),
      },
    });
    rawText = text;
  }

  if (type === 'IMAGE' || type === 'VIDEO') {
    await prisma.material.update({
      where: { id: materialId },
      data: { processedAt: new Date() },
    });
  }

  // Clean up local file after processing if using S3 (uploaded file no longer needed)
  if (process.env.STORAGE_PROVIDER === 's3') {
    fs.unlink(filePath, () => {});
  }

  if (rawText.length > 100) {
    const material = await prisma.material.findUnique({ where: { id: materialId } });
    if (material) await generateTopicsFromText(materialId, rawText, material.subjectId, userId);
  }
}

function extractYoutubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractTextFromHtml(html: string): string {  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPageTitle(html: string): string {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? '';
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 127
  );
}

function extToType(ext: string): MaterialType {
  const map: Record<string, MaterialType> = {
    '.pdf': 'PDF', '.docx': 'DOCX', '.pptx': 'PPTX',
    '.txt': 'TXT', '.md': 'TXT',
    '.png': 'IMAGE', '.jpg': 'IMAGE', '.jpeg': 'IMAGE', '.gif': 'IMAGE', '.webp': 'IMAGE',
    '.mp4': 'VIDEO', '.mov': 'VIDEO', '.webm': 'VIDEO', '.avi': 'VIDEO', '.mkv': 'VIDEO',
  };
  return map[ext] ?? 'TEXT';
}

export default router;
