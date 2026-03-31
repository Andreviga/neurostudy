import OpenAI from 'openai';
import { GenerateContentInput, GenerateContentOutput, TopicData } from './index';
import { buildGeneratePrompt, buildTopicExtractionPrompt } from './prompts';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

const MODEL = 'gpt-4o-mini';

export const openaiService = {
  async generate(input: GenerateContentInput): Promise<GenerateContentOutput> {
    const prompt = buildGeneratePrompt(input.topicTitle, input.topicSummary, input.materialText, input.format);

    const response = await getClient().chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'Você é um tutor educacional especializado. Responda sempre em português brasileiro. Seja didático, claro e engajante.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content || '';
    const output: GenerateContentOutput = {
      content,
      format: input.format,
      provider: 'openai',
      model: MODEL,
    };

    // Parse structured responses
    if (input.format === 'QUIZ') {
      try {
        const json = JSON.parse(extractJSON(content));
        output.quizItems = json.questions;
      } catch {}
    }
    if (input.format === 'FLASHCARD') {
      try {
        const json = JSON.parse(extractJSON(content));
        output.flashcards = json.flashcards;
      } catch {}
    }

    return output;
  },

  async extractTopics(text: string): Promise<TopicData[]> {
    const prompt = buildTopicExtractionPrompt(text);
    const response = await getClient().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are a curriculum expert. Extract study topics and respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);
    return parsed.topics || [];
  },
};

function extractJSON(text: string): string {
  // Try to extract JSON from markdown code blocks or raw text
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (match) return match[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text;
}
