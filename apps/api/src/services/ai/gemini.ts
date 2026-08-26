import { GoogleGenerativeAI } from '@google/generative-ai';
import { GenerateContentInput, GenerateContentOutput, TopicData } from './index';
import { buildGeneratePrompt, buildTopicExtractionPrompt } from './prompts';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

export const geminiService = {
  async generate(input: GenerateContentInput): Promise<GenerateContentOutput> {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const prompt = `Você é um tutor educacional. Responda em português brasileiro.\n\n${buildGeneratePrompt(input.topicTitle, input.topicSummary, input.materialText, input.format)}`;

    const result = await model.generateContent(prompt);
    const content = result.response.text();

    const output: GenerateContentOutput = {
      content,
      format: input.format,
      provider: 'gemini',
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
    const model = genAI.getGenerativeModel({ model: MODEL });
    const prompt = buildTopicExtractionPrompt(text);

    const result = await model.generateContent(prompt);
    const content = result.response.text();

    try {
      const parsed = JSON.parse(extractJSON(content));
      return parsed.topics || [];
    } catch {
      return [];
    }
  },

  async rawCompletion(prompt: string): Promise<string> {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(prompt);
    return result.response.text();
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
