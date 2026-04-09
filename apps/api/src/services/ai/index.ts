/**
 * Unified AI service — routes requests to OpenAI, Anthropic, or Gemini
 * based on task type, provider config, or explicit override.
 *
 * Future extension points:
 * - Add cost tracking per call
 * - Add quality scoring per provider/task
 * - Add automatic fallback when a provider is unavailable
 */
import { openaiService } from './openai';
import { anthropicService } from './anthropic';
import { geminiService } from './gemini';
import { buildSubjectDetectionPrompt } from './prompts';
import { logger } from '../../lib/logger';

export type AIProvider = 'openai' | 'anthropic' | 'gemini';

export type StudyFormat =
  | 'SUMMARY_SHORT' | 'SUMMARY_MEDIUM' | 'SUMMARY_DETAILED'
  | 'STEP_BY_STEP' | 'ANALOGY' | 'PRACTICAL_EXAMPLE'
  | 'QUIZ' | 'FLASHCARD' | 'GUIDED_QUESTIONS' | 'MIND_MAP';

export interface GenerateContentInput {
  topicTitle: string;
  topicSummary: string;
  materialText: string;
  format: StudyFormat;
  provider?: AIProvider;
}

export interface QuizItemData {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface FlashcardData {
  front: string;
  back: string;
}

export interface GenerateContentOutput {
  content: string;
  format: StudyFormat;
  provider: AIProvider;
  model: string;
  quizItems?: QuizItemData[];
  flashcards?: FlashcardData[];
}

// ─── Provider routing heuristic ──────────────────────────────────────────────
// Each task type is mapped to the best-suited provider.
// Falls back to the DEFAULT_AI_PROVIDER env var.

const TASK_ROUTING: Record<StudyFormat, AIProvider> = {
  SUMMARY_SHORT: 'openai',
  SUMMARY_MEDIUM: 'anthropic',   // Claude handles long structured summaries well
  SUMMARY_DETAILED: 'anthropic',
  STEP_BY_STEP: 'openai',
  ANALOGY: 'openai',
  PRACTICAL_EXAMPLE: 'openai',
  QUIZ: 'openai',
  FLASHCARD: 'openai',
  GUIDED_QUESTIONS: 'openai',
  MIND_MAP: 'anthropic',
};

function selectProvider(format: StudyFormat, override?: AIProvider): AIProvider {
  if (override) return override;
  const suggested = TASK_ROUTING[format];
  // Only use suggested if that provider is configured
  if (isProviderAvailable(suggested)) return suggested;
  // Fallback chain
  const fallbacks: AIProvider[] = ['openai', 'anthropic', 'gemini'];
  for (const p of fallbacks) {
    if (isProviderAvailable(p)) return p;
  }
  throw new Error('No AI provider configured. Set at least one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY');
}

function isProviderAvailable(p: AIProvider): boolean {
  const keys: Record<AIProvider, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };
  return !!keys[p];
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function generateContent(input: GenerateContentInput): Promise<GenerateContentOutput> {
  const provider = selectProvider(input.format, input.provider);
  const start = Date.now();

  let result: GenerateContentOutput;

  try {
    switch (provider) {
      case 'anthropic': result = await anthropicService.generate(input); break;
      case 'gemini':    result = await geminiService.generate(input); break;
      default:          result = await openaiService.generate(input);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('AI generation failed, trying fallback', { provider, format: input.format, error: msg });
    // Simple fallback: try the next available provider
    const fallback = ['openai', 'anthropic', 'gemini'].find(
      (p) => p !== provider && isProviderAvailable(p as AIProvider)
    ) as AIProvider | undefined;
    if (!fallback) throw new Error(`All AI providers failed: ${msg}`);
    switch (fallback) {
      case 'anthropic': result = await anthropicService.generate(input); break;
      case 'gemini':    result = await geminiService.generate(input); break;
      default:          result = await openaiService.generate(input);
    }
  }

  logger.info('AI generation complete', {
    provider: result.provider,
    model: result.model,
    format: input.format,
    durationMs: Date.now() - start,
    contentLength: result.content.length,
  });

  return result;
}

// ─── Topic extraction ─────────────────────────────────────────────────────────

export interface TopicData {
  title: string;
  summary: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  order: number;
}

export async function generateTopicsFromText(
  materialId: string,
  text: string,
  subjectId: string,
  _userId: string
): Promise<void> {
  const { prisma } = await import('../../lib/prisma');
  const provider = selectProvider('SUMMARY_MEDIUM');
  let topics: TopicData[] = [];

  try {
    switch (provider) {
      case 'anthropic': topics = await anthropicService.extractTopics(text); break;
      case 'gemini':    topics = await geminiService.extractTopics(text); break;
      default:          topics = await openaiService.extractTopics(text);
    }
  } catch (err: unknown) {
    logger.error('Topic extraction failed', { materialId, error: err instanceof Error ? err.message : err });
    return;
  }

  await prisma.topic.createMany({
    data: topics.map((t) => ({
      ...t,
      materialId,
      subjectId,
    })),
  });

  logger.info('Topics created', { materialId, count: topics.length });
}

// ─── Subject detection ────────────────────────────────────────────────────────

export interface SubjectDetectionResult {
  subjectName: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

export async function detectSubjectFromText(
  text: string,
  existingSubjects: string[]
): Promise<SubjectDetectionResult> {
  const provider = (['openai', 'anthropic', 'gemini'] as AIProvider[]).find(isProviderAvailable);
  if (!provider) throw new Error('No AI provider configured');

  let raw: string;
  switch (provider) {
    case 'anthropic': raw = await anthropicService.rawCompletion(buildSubjectDetectionPrompt(text, existingSubjects)); break;
    case 'gemini':    raw = await geminiService.rawCompletion(buildSubjectDetectionPrompt(text, existingSubjects)); break;
    default:          raw = await openaiService.rawCompletion(buildSubjectDetectionPrompt(text, existingSubjects));
  }

  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('Invalid AI response for subject detection');
  return JSON.parse(json) as SubjectDetectionResult;
}
