import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
// Local type mirrors the Prisma enum — avoids needing generated client at compile time
type MaterialType = 'PDF' | 'DOCX' | 'PPTX' | 'TXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'LINK' | 'TEXT';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { extractTextFromPDF } from '../services/pdf';
import { generateTopicsFromText } from '../services/ai';
import { uploadFile } from '../services/storage';
import { logger } from '../lib/logger';

const router = Router();
router.use(authenticate);

// Multer config
const storage = multer.diskStorage({
  destination: process.env.LOCAL_UPLOAD_DIR || './uploads',
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) =>
    cb(null, `${uuid()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowed = ['.pdf', '.docx', '.pptx', '.txt', '.md', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// POST /api/materials/upload
router.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const { subjectId, title } = req.body;
  if (!subjectId) { res.status(400).json({ error: 'subjectId is required' }); return; }

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
});

// POST /api/materials/text  — paste raw text
router.post('/text', async (req: AuthRequest, res: Response) => {
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
});

// GET /api/materials/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const material = await prisma.material.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { topics: { orderBy: { order: 'asc' } } },
  });
  if (!material) { res.status(404).json({ error: 'Material not found' }); return; }
  res.json(material);
});

// DELETE /api/materials/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const m = await prisma.material.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!m) { res.status(404).json({ error: 'Material not found' }); return; }
  await prisma.material.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function processMaterial(materialId: string, filePath: string, type: string, userId: string) {
  let text = '';

  if (type === 'PDF') {
    const result = await extractTextFromPDF(filePath);
    text = result.text;
    await prisma.material.update({
      where: { id: materialId },
      data: { extractedText: text, pageCount: result.pages, processedAt: new Date() },
    });
  }

  if (text.length > 100) {
    const material = await prisma.material.findUnique({ where: { id: materialId } });
    if (material) await generateTopicsFromText(materialId, text, material.subjectId, userId);
  }
}

function extToType(ext: string): MaterialType {
  const map: Record<string, MaterialType> = {
    '.pdf': 'PDF', '.docx': 'DOCX', '.pptx': 'PPTX',
    '.txt': 'TXT', '.md': 'TXT',
    '.png': 'IMAGE', '.jpg': 'IMAGE', '.jpeg': 'IMAGE',
  };
  return map[ext] ?? 'TEXT';
}

export default router;
