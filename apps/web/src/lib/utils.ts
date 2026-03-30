import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Difficulty, Priority, StudyFormat } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const difficultyLabel: Record<Difficulty, string> = {
  EASY: 'Fácil', MEDIUM: 'Médio', HARD: 'Difícil', CRITICAL: 'Crítico',
};

export const difficultyColor: Record<Difficulty, string> = {
  EASY: 'text-emerald-600 bg-emerald-50',
  MEDIUM: 'text-amber-600 bg-amber-50',
  HARD: 'text-orange-600 bg-orange-50',
  CRITICAL: 'text-red-600 bg-red-50',
};

export const priorityLabel: Record<Priority, string> = {
  LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', URGENT: 'Urgente',
};

export const formatLabel: Record<StudyFormat, string> = {
  SUMMARY_SHORT: 'Resumo rápido',
  SUMMARY_MEDIUM: 'Resumo médio',
  SUMMARY_DETAILED: 'Resumo detalhado',
  STEP_BY_STEP: 'Passo a passo',
  ANALOGY: 'Analogia',
  PRACTICAL_EXAMPLE: 'Exemplo prático',
  QUIZ: 'Quiz',
  FLASHCARD: 'Flashcards',
  GUIDED_QUESTIONS: 'Perguntas guiadas',
  MIND_MAP: 'Mapa mental',
};

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

export function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

export function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days < 7) return `${days} dias atrás`;
  return new Date(dateStr).toLocaleDateString('pt-BR');
}
