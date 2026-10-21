const MAX_CHARS = 40000; // ~10.000 tokens, ~40 KB por material

export function truncateExtractedText(text: string): {
  text: string;
  truncated: boolean;
  originalLength: number;
} {
  // Postgres rejects null bytes in text columns (invalid byte sequence 0x00)
  text = text.replace(/\u0000/g, '');
  const originalLength = text.length;
  if (text.length <= MAX_CHARS) {
    return { text, truncated: false, originalLength };
  }

  // Cortar no final de uma frase para não quebrar contexto
  const candidate = text.substring(0, MAX_CHARS);
  const lastPeriod = candidate.lastIndexOf('.');
  const finalText =
    lastPeriod > MAX_CHARS * 0.8
      ? candidate.substring(0, lastPeriod + 1)
      : candidate;

  return { text: finalText, truncated: true, originalLength };
}

export function estimateTokenCount(text: string): number {
  // Estimativa: ~4 caracteres por token em português
  return Math.ceil(text.length / 4);
}

/**
 * Pick the ~8k-char window of the material most relevant to the topic,
 * instead of always using the first 8k chars. Scores fixed-size windows by
 * keyword overlap with the topic title/summary and returns the best one.
 */
export function selectRelevantExcerpt(text: string, title: string, summary: string): string {
  const LIMIT = 8000;
  if (text.length <= LIMIT) return text;

  const stopwords = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'para', 'com', 'por', 'uma', 'um', 'os', 'as', 'ao', 'introdução', 'conceitos', 'fundamentos', 'básicos', 'estudo', 'sobre']);
  const keywords = `${title} ${summary}`
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !stopwords.has(w));
  if (keywords.length === 0) return text.slice(0, LIMIT);

  const normalized = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const STEP = 4000;
  let bestStart = 0, bestScore = -1;
  for (let start = 0; start < normalized.length; start += STEP) {
    const window = normalized.slice(start, start + LIMIT);
    let score = 0;
    for (const kw of keywords) {
      let i = window.indexOf(kw);
      while (i !== -1) { score++; i = window.indexOf(kw, i + kw.length); }
    }
    if (score > bestScore) { bestScore = score; bestStart = start; }
  }
  return text.slice(bestStart, bestStart + LIMIT);
}
