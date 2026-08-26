import { GoogleGenerativeAI } from '@google/generative-ai';
import { GenerateContentInput, GenerateContentOutput, TopicData } from './index';
import { buildGeneratePrompt, buildTopicExtractionPrompt } from './prompts';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Free-tier daily quotas are PER MODEL (gemini-3.6-flash allows only ~20 req/day),
// so we rotate through several models when one is exhausted or unavailable.
const MODELS = [
  process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
].filter((m, i, arr) => arr.indexOf(m) === i);

// Models marked dead (daily quota) recover after this cooldown
const DEAD_COOLDOWN_MS = 60 * 60 * 1000;
const deadUntil = new Map<string, number>();

function isQuotaOrUnavailable(msg: string): boolean {
  return /RESOURCE_EXHAUSTED|429|quota|503|Service Unavailable|high demand|overloaded|404/i.test(msg);
}

async function generateWithFallback(prompt: string): Promise<{ text: string; model: string }> {
  let lastErr = '';
  for (const model of MODELS) {
    if ((deadUntil.get(model) ?? 0) > Date.now()) continue;
    try {
      const m = genAI.getGenerativeModel({ model });
      const result = await m.generateContent(prompt);
      return { text: result.response.text(), model };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (isQuotaOrUnavailable(lastErr)) {
        deadUntil.set(model, Date.now() + DEAD_COOLDOWN_MS);
        continue; // try the next model
      }
      throw err; // non-quota error: bubble up
    }
  }
  throw new Error(`All Gemini models unavailable: ${lastErr.slice(0, 300)}`);
}

export const geminiService = {
  async generate(input: GenerateContentInput): Promise<GenerateContentOutput> {
    const prompt = `Você é um tutor educacional. Responda em português brasileiro.\n\n${buildGeneratePrompt(input.topicTitle, input.topicSummary, input.materialText, input.format)}`;
    const { text: content, model } = await generateWithFallback(prompt);

    const output: GenerateContentOutput = {
      content,
      format: input.format,
      provider: 'gemini',
      model,
    };

    if (input.format === 'QUIZ') {
      try { output.quizItems = JSON.parse(extractJSON(content)).questions; } catch {}
    }
    if (input.format === 'FLASHCARD') {
      try { output.flashcards = JSON.parse(extractJSON(content)).flashcards; } catch {}
    }

    return output;
  },

  async extractTopics(text: string): Promise<TopicData[]> {
    const { text: content } = await generateWithFallback(buildTopicExtractionPrompt(text));
    try {
      const parsed = JSON.parse(extractJSON(content));
      return parsed.topics || [];
    } catch {
      return [];
    }
  },

  async rawCompletion(prompt: string): Promise<string> {
    const { text } = await generateWithFallback(prompt);
    return text;
  },
};

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (match) return match[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text;
}
