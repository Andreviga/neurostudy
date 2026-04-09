const MAX_CHARS = 40000; // ~10.000 tokens, ~40 KB por material

export function truncateExtractedText(text: string): {
  text: string;
  truncated: boolean;
  originalLength: number;
} {
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
