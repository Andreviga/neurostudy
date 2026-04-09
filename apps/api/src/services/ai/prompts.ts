import { StudyFormat } from './index';

export function buildGeneratePrompt(
  topicTitle: string,
  topicSummary: string,
  materialText: string,
  format: StudyFormat
): string {
  const context = `
Tópico: ${topicTitle}
${topicSummary ? `Resumo: ${topicSummary}` : ''}
${materialText ? `\nTrecho do material:\n${materialText.slice(0, 4000)}` : ''}
`.trim();

  const formatInstructions: Record<StudyFormat, string> = {
    SUMMARY_SHORT: `Crie um resumo muito conciso (máx 150 palavras) do tópico abaixo. Use bullet points. Seja direto ao ponto.`,
    SUMMARY_MEDIUM: `Crie um resumo médio (200-350 palavras) do tópico abaixo. Use headers e bullet points. Destaque os conceitos principais.`,
    SUMMARY_DETAILED: `Crie um resumo detalhado e completo do tópico abaixo. Explique todos os conceitos importantes, inclua exemplos e organize com headers claros.`,
    STEP_BY_STEP: `Explique o tópico abaixo em um passo a passo numerado, como se estivesse ensinando alguém do zero. Cada passo deve ser claro e progressivo.`,
    ANALOGY: `Explique o tópico abaixo usando pelo menos 2 analogias criativas com situações do dia a dia. Depois, conecte as analogias de volta ao conceito real.`,
    PRACTICAL_EXAMPLE: `Crie 3 exemplos práticos e aplicados do tópico abaixo. Cada exemplo deve mostrar como o conceito é usado na prática.`,
    QUIZ: `Crie um quiz com 5 questões de múltipla escolha sobre o tópico abaixo.

Responda APENAS com JSON válido no seguinte formato:
{
  "questions": [
    {
      "question": "Pergunta aqui?",
      "options": ["Opção A", "Opção B", "Opção C", "Opção D"],
      "correctIndex": 0,
      "explanation": "Explicação da resposta correta"
    }
  ]
}`,
    FLASHCARD: `Crie 8 flashcards sobre o tópico abaixo.

Responda APENAS com JSON válido no seguinte formato:
{
  "flashcards": [
    { "front": "Conceito ou pergunta", "back": "Definição ou resposta" }
  ]
}`,
    GUIDED_QUESTIONS: `Crie 5 perguntas guiadas (Socratic method) sobre o tópico abaixo que levem o aluno a descobrir o conhecimento por conta própria. Após cada pergunta, adicione uma dica sutil.`,
    MIND_MAP: `Crie um mapa mental textual hierárquico sobre o tópico abaixo usando indentação. Formato:
[Tópico Central]
  ├── Subtópico 1
  │   ├── Detalhe 1.1
  │   └── Detalhe 1.2
  └── Subtópico 2
      └── Detalhe 2.1`,
  };

  return `${formatInstructions[format]}\n\n${context}`;
}

export function buildSubjectDetectionPrompt(text: string, existingSubjects: string[]): string {
  const list = existingSubjects.length > 0
    ? `\nDisciplinas já cadastradas (use o nome exato se o conteúdo pertencer a uma delas):\n${existingSubjects.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';

  return `Você é um assistente acadêmico. Analise o trecho de material de estudo abaixo e determine a qual disciplina universitária ele pertence.${list}

Responda APENAS com JSON válido no seguinte formato:
{
  "subjectName": "Nome da disciplina (ex: Cálculo II, Bioquímica, História Moderna)",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reason": "Breve justificativa (1 frase)"
}

Regras:
- Se o conteúdo se encaixa numa das disciplinas já cadastradas, use o nome exato dela.
- Caso contrário, proponha um nome claro e conciso em português.
- Prefira nomes de disciplinas universitárias reconhecidos.

TEXTO:
${text.slice(0, 5000)}`;
}

export function buildTopicExtractionPrompt(text: string): string {
  return `Analise o texto acadêmico abaixo e extraia os tópicos principais de estudo.

Responda APENAS com JSON válido no seguinte formato:
{
  "topics": [
    {
      "title": "Nome do tópico",
      "summary": "Resumo de 1-2 frases sobre o tópico",
      "difficulty": "EASY" | "MEDIUM" | "HARD",
      "order": 1
    }
  ]
}

Extraia entre 3 e 10 tópicos. Ordene do mais básico ao mais avançado.

TEXTO:
${text.slice(0, 8000)}`;
}
