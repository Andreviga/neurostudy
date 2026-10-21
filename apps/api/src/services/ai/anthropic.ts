import Anthropic from '@anthropic-ai/sdk';
import { GenerateContentInput, GenerateContentOutput, TopicData } from './index';
import { buildGeneratePrompt, buildTopicExtractionPrompt } from './prompts';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// Override with ANTHROPIC_MODEL (e.g. claude-haiku-4-5 for lower cost)
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

// Fable 5 / Opus 5: opt into server-side refusal fallbacks so a safety decline
// re-runs on a fallback model inside the same call instead of failing.
const SUPPORTS_FALLBACKS = /^claude-(fable-5|opus-5)/.test(MODEL);
const FALLBACK_EXTRAS = SUPPORTS_FALLBACKS ? { fallbacks: 'default' } : {};
const FALLBACK_OPTS = SUPPORTS_FALLBACKS
  ? { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } }
  : {};

export const anthropicService = {
  async generate(input: GenerateContentInput): Promise<GenerateContentOutput> {
    const prompt = buildGeneratePrompt(input.topicTitle, input.topicSummary, input.materialText, input.format);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: 'Você é um tutor educacional especializado. Responda sempre em português brasileiro. Seja didático, claro e engajante.',
      messages: [{ role: 'user', content: prompt }],
      ...FALLBACK_EXTRAS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any, FALLBACK_OPTS);

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const output: GenerateContentOutput = {
      content,
      format: input.format,
      provider: 'anthropic',
      model: MODEL,
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
    const prompt = buildTopicExtractionPrompt(text);
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: 'You are a curriculum expert. Extract study topics and respond with valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '{}';
    try {
      const parsed = JSON.parse(extractJSON(content));
      return parsed.topics || [];
    } catch {
      return [];
    }
  },

  async rawCompletion(prompt: string): Promise<string> {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].type === 'text' ? response.content[0].text : '';
  },

  /**
   * Streaming tutor chat grounded in the material. Calls onText for each
   * text chunk as it arrives.
   */
  async chatStream(
    systemPrompt: string,
    history: { role: 'user' | 'model'; content: string }[],
    message: string,
    onText: (text: string) => void
  ): Promise<void> {
    const messages = [
      ...history.map((h) => ({
        role: (h.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user' as const, content: message },
    ];

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages,
      ...FALLBACK_EXTRAS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any, FALLBACK_OPTS);

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onText(event.delta.text);
      }
    }
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
