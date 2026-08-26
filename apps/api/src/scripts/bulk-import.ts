/**
 * Bulk import — imports every PDF from the MATERIAL folder into NeuroStudy.
 *
 * - Groups files into subjects by filename prefix (STO, 1ESO..4ESO, extras)
 * - Extracts text locally (pdf-parse), then topics via Gemini with retry/backoff
 * - Resumable: reruns skip files already imported WITH topics; materials that
 *   exist but have zero topics get their topic extraction retried
 * - Paced for the Gemini free tier (delay between AI calls); stops gracefully
 *   when the daily quota is exhausted — just run it again later to continue
 *
 * Run from apps/api:
 *   npx ts-node-dev --transpile-only --quiet src/scripts/bulk-import.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../lib/prisma';
import { extractTextFromPDF } from '../services/pdf';
import { buildTopicExtractionPrompt } from '../services/ai/prompts';
import type { TopicData } from '../services/ai';
import { truncateExtractedText, estimateTokenCount } from '../utils/textUtils';

const MATERIAL_DIR = 'D:\\OneDrive\\APP Study\\MATERIAL';
const USER_EMAIL = 'demo@neurostudy.app';
const AI_CALL_DELAY_MS = 15_000; // free-tier pacing between Gemini calls
const MAX_RETRIES = 8;

// ─── Subject mapping by filename prefix ──────────────────────────────────────
const SUBJECT_RULES: Array<{ test: (f: string) => boolean; name: string; color: string }> = [
  { test: (f) => /^\d+\s*-\s*STO/i.test(f), name: 'Startup One (STO)', color: '#f59e0b' },
  { test: (f) => /^1ESO/i.test(f), name: '1º Ano — ESO', color: '#6366f1' },
  { test: (f) => /^2ESO/i.test(f), name: '2º Ano — ESO', color: '#10b981' },
  { test: (f) => /^3ESOA/i.test(f), name: '3º Ano — ESO', color: '#ef4444' },
  { test: (f) => /^4ESO/i.test(f), name: '4º Ano — ESO', color: '#8b5cf6' },
  { test: () => true, name: 'Extras — ESO', color: '#64748b' },
];

function subjectFor(filename: string) {
  return SUBJECT_RULES.find((r) => r.test(filename))!;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Multi-model rotation: each model has its own free-tier quota ────────────
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];
const deadModels = new Set<string>(); // daily quota exhausted
let modelIdx = 0;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (match) return match[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text;
}

async function extractTopicsWith(model: string, text: string): Promise<TopicData[]> {
  const m = genAI.getGenerativeModel({ model });
  const result = await m.generateContent(buildTopicExtractionPrompt(text));
  const content = result.response.text();
  try {
    const parsed = JSON.parse(extractJSON(content));
    return parsed.topics || [];
  } catch {
    return [];
  }
}

function nextLiveModel(): string | null {
  for (let i = 0; i < MODELS.length; i++) {
    const candidate = MODELS[(modelIdx + i) % MODELS.length];
    if (!deadModels.has(candidate)) { modelIdx = MODELS.indexOf(candidate); return candidate; }
  }
  return null;
}

function isDailyQuota(msg: string): boolean {
  return /RESOURCE_EXHAUSTED|429|quota/i.test(msg) && /PerDay|per day|daily/i.test(msg);
}

function isRateLimit(msg: string): boolean {
  return /RESOURCE_EXHAUSTED|429|quota|rate/i.test(msg);
}

function isTransientError(msg: string): boolean {
  return /503|Service Unavailable|high demand|500|Internal|overloaded|fetch failed|ETIMEDOUT|ECONNRESET/i.test(msg);
}

async function extractTopicsWithRetry(text: string, label: string) {
  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const model = nextLiveModel();
    if (!model) throw new Error(`QUOTA_EXHAUSTED: all models exhausted (${lastErr.slice(0, 200)})`);
    try {
      const topics = await extractTopicsWith(model, text);
      if (topics.length > 0) return topics;
      lastErr = 'AI returned zero topics';
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (isDailyQuota(lastErr)) {
        console.log(`    ⚠ daily quota hit on ${model} — switching model`);
        deadModels.add(model);
        continue; // try next model immediately
      }
      if (isRateLimit(lastErr)) {
        console.log(`    ~ rate limit on ${model}, waiting 65s (attempt ${attempt}/${MAX_RETRIES})`);
        await sleep(65_000);
        continue;
      }
      if (isTransientError(lastErr)) {
        // rotate to the next model and back off briefly
        modelIdx = (modelIdx + 1) % MODELS.length;
        const backoff = Math.min(20_000 * attempt, 120_000);
        console.log(`    retry ${attempt}/${MAX_RETRIES} for "${label}" in ${backoff / 1000}s (${model}: ${lastErr.slice(0, 100)})`);
        await sleep(backoff);
        continue;
      }
      console.log(`    ! non-transient error on ${model}, not retrying: ${lastErr.slice(0, 160)}`);
      return [];
    }
  }
  console.log(`    ! giving up on "${label}": ${lastErr.slice(0, 160)}`);
  return [];
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`User ${USER_EMAIL} not found — run the seed first`);

  const uploadDir = path.resolve(process.env.LOCAL_UPLOAD_DIR || './uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  // List PDFs, skipping "(1).pdf" duplicates whose base file also exists
  const all = fs.readdirSync(MATERIAL_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'));
  const files = all.filter((f) => {
    const m = f.match(/^(.*)\s*\(\d+\)(\.pdf)$/i);
    if (m && all.includes(m[1].trimEnd() + m[2])) return false;
    return true;
  }).sort();

  console.log(`Found ${files.length} PDFs (${all.length - files.length} duplicates skipped)\n`);

  // Ensure subjects exist
  const subjectIds = new Map<string, string>();
  for (const rule of SUBJECT_RULES) {
    if (subjectIds.has(rule.name)) continue;
    let subj = await prisma.subject.findFirst({ where: { userId: user.id, name: rule.name } });
    if (!subj) {
      subj = await prisma.subject.create({ data: { userId: user.id, name: rule.name, color: rule.color } });
      console.log(`+ subject created: ${rule.name}`);
    }
    subjectIds.set(rule.name, subj.id);
  }

  let done = 0, skipped = 0, imported = 0, failed = 0, noText = 0;

  for (const file of files) {
    done++;
    const title = file.replace(/\.pdf$/i, '');
    const prefix = `[${done}/${files.length}]`;
    const subjectId = subjectIds.get(subjectFor(file).name)!;

    // Resume logic: skip if material exists AND has topics
    const existing = await prisma.material.findFirst({
      where: { userId: user.id, title },
      include: { _count: { select: { topics: true } } },
    });
    if (existing && existing._count.topics > 0) { skipped++; continue; }
    if (existing && existing.textTokenCount === 0) { skipped++; continue; } // known no-text file

    try {
      let materialId = existing?.id;
      let text = existing?.extractedText || '';

      if (!materialId) {
        const srcPath = path.join(MATERIAL_DIR, file);
        const storedName = `${uuid()}.pdf`;
        fs.copyFileSync(srcPath, path.join(uploadDir, storedName));

        const result = await extractTextFromPDF(path.join(uploadDir, storedName));
        const { text: truncatedText, truncated } = truncateExtractedText(result.text || '');
        text = truncatedText;

        const material = await prisma.material.create({
          data: {
            userId: user.id,
            subjectId,
            title,
            type: 'PDF',
            fileUrl: `/uploads/${storedName}`,
            extractedText: text,
            textTruncated: truncated,
            textTokenCount: estimateTokenCount(text),
            pageCount: result.pages,
            processedAt: new Date(),
          },
        });
        materialId = material.id;
      }

      if (text.trim().length < 100) {
        console.log(`${prefix} ~ no extractable text (scanned?): ${file}`);
        noText++;
        continue;
      }

      const topics = await extractTopicsWithRetry(text, title);
      if (topics.length > 0) {
        await prisma.topic.createMany({
          data: topics.map((t) => ({ ...t, materialId, subjectId })),
        });
        imported++;
        console.log(`${prefix} ✓ ${topics.length} topics — ${file}`);
      } else {
        failed++;
        console.log(`${prefix} ✗ no topics — ${file} (rerun the script to retry)`);
      }

      await sleep(AI_CALL_DELAY_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('QUOTA_EXHAUSTED')) {
        console.log(`\n⛔ Gemini daily quota exhausted at file ${done}/${files.length}.`);
        console.log('   Progress is saved — run this script again later (tomorrow) to continue.');
        break;
      }
      failed++;
      console.log(`${prefix} ✗ error — ${file}: ${msg.slice(0, 200)}`);
    }
  }

  console.log(`\n── Summary ──────────────────────────`);
  console.log(`imported: ${imported}  skipped(done): ${skipped}  no-text: ${noText}  failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
