import Anthropic from '@anthropic-ai/sdk';
import { GenerateContentInput, GenerateContentOutput, TopicData } from './index';
import { buildGeneratePrompt, buildTopicExtractionPrompt } from './prompts';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-3-haiku-20240307'; // Fast + affordable; swap to claude-3-5-sonnet-20241022 for quality

export const anthropicService = {
  async generate(input: GenerateContentInput): Promise<GenerateContentOutput> {
    const prompt = buildGeneratePrompt(input.topicTitle, input.topicSummary, input.materialText, input.format);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: 'Você é um tutor educacional especializado. Responda sempre em português brasileiro. Seja didático, claro e engajante.',
      messages: [{ role: 'user', content: prompt }],
    });

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
      max_tokens: 1500,
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
};

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (match) return match[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text;
}
