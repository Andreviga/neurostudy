/**
 * Prepare lessons ahead of time.
 *
 * Computes the user's study trail (unstudied topics whose prerequisites are
 * mastered, in curriculum order) and pre-generates the 3 guided-lesson steps
 * (SUMMARY_MEDIUM, PRACTICAL_EXAMPLE, QUIZ) for the next N topics, saving them
 * to the content cache so lessons open instantly in the app.
 *
 * Uses the free Gemini tier by default (LESSON_PROVIDER env to override), so
 * it never spends Anthropic credits — those stay reserved for live tutoring.
 *
 * Run from apps/api (N defaults to 15):
 *   npx ts-node-dev --transpile-only --quiet src/scripts/prepare-lessons.ts [N]
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { generateContent, StudyFormat, AIProvider } from '../services/ai';
import { getCachedContent, saveContentToCache } from '../utils/contentCache';
import { selectRelevantExcerpt } from '../utils/textUtils';

const USER_EMAIL = process.env.IMPORT_USER_EMAIL || 'andrevigarani@gmail.com';
const PROVIDER = (process.env.LESSON_PROVIDER || 'gemini') as AIProvider;
const LESSON_FORMATS: StudyFormat[] = ['SUMMARY_MEDIUM', 'PRACTICAL_EXAMPLE', 'QUIZ'];
const AI_CALL_DELAY_MS = 8_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const count = parseInt(process.argv[2] || '15', 10);
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`User ${USER_EMAIL} not found`);

  // Real sessions only (cache rows have cachedContent set)
  const sessions = await prisma.studySession.groupBy({
    by: ['topicId'],
    where: { userId: user.id, cachedContent: null },
    _max: { score: true },
  });
  const studied = new Set(sessions.map((s) => s.topicId));
  const mastered = new Set(sessions.filter((s) => (s._max.score ?? 0) >= 0.6).map((s) => s.topicId));

  const allTopics = await prisma.topic.findMany({
    where: { subject: { userId: user.id } },
    select: {
      id: true, title: true, summary: true, prerequisiteTopics: true,
      material: { select: { extractedText: true } },
      subject: { select: { createdAt: true } },
    },
    orderBy: [{ subject: { createdAt: 'asc' } }, { materialId: 'asc' }, { order: 'asc' }],
  });

  const trail = allTopics
    .filter((t) => !studied.has(t.id) && t.prerequisiteTopics.every((p) => mastered.has(p)))
    .slice(0, count);

  console.log(`Trail: preparing ${trail.length} lessons (provider: ${PROVIDER})\n`);

  let generated = 0, cachedAlready = 0, failed = 0;

  for (const [i, topic] of trail.entries()) {
    console.log(`[${i + 1}/${trail.length}] ${topic.title}`);
    const materialText = selectRelevantExcerpt(topic.material?.extractedText || '', topic.title, topic.summary || '');

    for (const format of LESSON_FORMATS) {
      const cached = await getCachedContent(topic.id, format);
      if (cached) { cachedAlready++; continue; }

      try {
        const result = await generateContent({
          topicTitle: topic.title,
          topicSummary: topic.summary || '',
          materialText,
          format,
          provider: PROVIDER,
        });

        if (format === 'QUIZ' && result.quizItems?.length) {
          await prisma.quizItem.createMany({
            data: result.quizItems.map((q) => ({ ...q, topicId: topic.id })),
            skipDuplicates: true,
          });
        }
        await saveContentToCache(user.id, topic.id, format, result);
        generated++;
        console.log(`    ✓ ${format} (${result.model})`);
        await sleep(AI_CALL_DELAY_MS);
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`    ✗ ${format}: ${msg.slice(0, 140)}`);
        if (/All Gemini models unavailable/i.test(msg)) {
          console.log('\n⛔ Gemini quotas exhausted for today — rerun later to continue.');
          console.log(`── Summary: generated ${generated}, cached ${cachedAlready}, failed ${failed}`);
          await prisma.$disconnect();
          return;
        }
      }
    }
  }

  console.log(`\n── Summary ──────────────────────`);
  console.log(`generated: ${generated}  already-cached: ${cachedAlready}  failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
