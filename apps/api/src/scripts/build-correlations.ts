/**
 * Build topic prerequisite correlations with AI.
 *
 * For every topic, asks Gemini which other topics (same subject + previous
 * year) are direct prerequisites, and stores their IDs in
 * `topic.prerequisiteTopics`. Uses numeric indexes in the prompt to avoid
 * ID hallucination; validates all returned indexes.
 *
 * Resumable: topics that already have prerequisites stored are skipped.
 * Run from apps/api:
 *   npx ts-node-dev --transpile-only --quiet src/scripts/build-correlations.ts
 */
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../lib/prisma';

const USER_EMAIL = 'demo@neurostudy.app';
const BATCH_SIZE = 60;
const AI_CALL_DELAY_MS = 8_000;
const MAX_RETRIES = 8;

// Subject processing order = academic progression (earlier ones can be prerequisites of later)
const SUBJECT_ORDER = [
  'Startup One (STO)',
  '1º Ano — ESO',
  '2º Ano — ESO',
  '3º Ano — ESO',
  '4º Ano — ESO',
  'Extras — ESO',
];

const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.6-flash'];
const deadModels = new Set<string>();
let modelIdx = 0;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (match) return match[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text;
}

function nextLiveModel(): string | null {
  for (let i = 0; i < MODELS.length; i++) {
    const candidate = MODELS[(modelIdx + i) % MODELS.length];
    if (!deadModels.has(candidate)) { modelIdx = MODELS.indexOf(candidate); return candidate; }
  }
  return null;
}

const isDailyQuota = (m: string) => /RESOURCE_EXHAUSTED|429|quota/i.test(m) && /PerDay|per day|daily/i.test(m);
const isRateLimit = (m: string) => /RESOURCE_EXHAUSTED|429|quota|rate/i.test(m);
const isTransient = (m: string) => /503|Service Unavailable|high demand|500|Internal|overloaded|fetch failed|ETIMEDOUT|ECONNRESET/i.test(m);

interface Relation { topic: number; prereqs: number[] }

async function askRelations(prompt: string, label: string): Promise<Relation[]> {
  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const model = nextLiveModel();
    if (!model) throw new Error(`QUOTA_EXHAUSTED: ${lastErr.slice(0, 200)}`);
    try {
      const m = genAI.getGenerativeModel({ model });
      const result = await m.generateContent(prompt);
      const parsed = JSON.parse(extractJSON(result.response.text()));
      return (parsed.relations || []) as Relation[];
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (isDailyQuota(lastErr)) { console.log(`  ⚠ daily quota on ${model}, switching`); deadModels.add(model); continue; }
      if (isRateLimit(lastErr)) { console.log(`  ~ rate limit on ${model}, waiting 65s`); await sleep(65_000); continue; }
      if (isTransient(lastErr)) {
        modelIdx = (modelIdx + 1) % MODELS.length;
        const backoff = Math.min(15_000 * attempt, 90_000);
        console.log(`  retry ${attempt}/${MAX_RETRIES} for ${label} in ${backoff / 1000}s (${lastErr.slice(0, 90)})`);
        await sleep(backoff);
        continue;
      }
      // JSON parse errors etc: retry once on another model, then give up
      console.log(`  ! parse/other error on ${model} for ${label}: ${lastErr.slice(0, 120)}`);
      modelIdx = (modelIdx + 1) % MODELS.length;
      if (attempt >= 3) return [];
    }
  }
  return [];
}

function buildPrompt(
  batch: { idx: number; title: string; summary: string | null }[],
  catalog: { idx: number; title: string }[]
): string {
  const catalogLines = catalog.map((c) => `${c.idx}| ${c.title}`).join('\n');
  const batchLines = batch
    .map((t) => `${t.idx}| ${t.title}${t.summary ? ` — ${t.summary}` : ''}`)
    .join('\n');

  return `Você é um planejador curricular de um curso superior de Engenharia de Software.

CATÁLOGO de tópicos disponíveis (formato "número| título"):
${catalogLines}

Para CADA tópico do LOTE abaixo, identifique de 0 a 4 pré-requisitos DIRETOS escolhidos do CATÁLOGO — conceitos que o aluno precisa dominar ANTES para conseguir aprender esse tópico.

Regras:
- Use APENAS os números do catálogo. Nunca invente números.
- Um tópico não pode ser pré-requisito de si mesmo.
- Inclua apenas dependências conceituais reais e diretas (ex: "Funções em JavaScript" ← "Introdução ao JavaScript"). Na dúvida, deixe a lista vazia.
- Prefira o pré-requisito mais específico, não o mais genérico.

Responda APENAS com JSON válido:
{"relations": [{"topic": <número do tópico do lote>, "prereqs": [<números do catálogo>]}]}

LOTE:
${batchLines}`;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error('demo user not found');

  const subjects = await prisma.subject.findMany({ where: { userId: user.id } });
  const ordered = SUBJECT_ORDER.map((n) => subjects.find((s) => s.name === n)).filter(Boolean) as typeof subjects;

  // Global index across all subjects (stable ordering: subject order, then topic order)
  type Entry = { idx: number; id: string; title: string; summary: string | null; subjectName: string; prereqCount: number };
  const all: Entry[] = [];
  for (const subj of ordered) {
    const topics = await prisma.topic.findMany({
      where: { subjectId: subj.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, summary: true, prerequisiteTopics: true },
    });
    for (const t of topics) {
      all.push({ idx: all.length + 1, id: t.id, title: t.title, summary: t.summary, subjectName: subj.name, prereqCount: t.prerequisiteTopics.length });
    }
  }
  console.log(`Topics loaded: ${all.length}\n`);

  const byId = new Map(all.map((e) => [e.idx, e]));
  let updated = 0, skipped = 0, withPrereqs = 0;

  for (let s = 0; s < ordered.length; s++) {
    const subj = ordered[s];
    const subjTopics = all.filter((e) => e.subjectName === subj.name);
    const prevSubject = s > 0 ? ordered[s - 1].name : null;

    // Catalog = same subject + directly previous subject (progression)
    const catalog = all
      .filter((e) => e.subjectName === subj.name || e.subjectName === prevSubject)
      .map((e) => ({ idx: e.idx, title: e.title }));

    const pending = subjTopics.filter((e) => e.prereqCount === 0);
    skipped += subjTopics.length - pending.length;
    if (pending.length === 0) { console.log(`— ${subj.name}: all done, skipping`); continue; }

    console.log(`▶ ${subj.name}: ${pending.length} topics, catalog ${catalog.length}`);

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const label = `${subj.name} [${i + 1}-${i + batch.length}]`;
      const relations = await askRelations(buildPrompt(batch, catalog), label);

      const batchIdxs = new Set(batch.map((b) => b.idx));
      const catalogIdxs = new Set(catalog.map((c) => c.idx));
      let batchUpdated = 0;

      for (const rel of relations) {
        if (!batchIdxs.has(rel.topic)) continue;
        const entry = byId.get(rel.topic)!;
        const prereqIds = [...new Set(rel.prereqs || [])]
          .filter((p) => catalogIdxs.has(p) && p !== rel.topic)
          .map((p) => byId.get(p)!.id);
        if (prereqIds.length === 0) continue;
        await prisma.topic.update({ where: { id: entry.id }, data: { prerequisiteTopics: prereqIds } });
        batchUpdated++;
        withPrereqs++;
      }
      updated += batch.length;
      console.log(`  ${label}: ${batchUpdated}/${batch.length} with prerequisites`);
      await sleep(AI_CALL_DELAY_MS);
    }
  }

  console.log(`\n── Summary ──────────────────────`);
  console.log(`processed: ${updated}  already-done skipped: ${skipped}  topics with prereqs: ${withPrereqs}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
