// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  course?: string;
  semester?: number;
  dailyGoalMinutes: number;
}

// ─── Subjects ─────────────────────────────────────────────────────────────────

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type SubjectStatus = 'ACTIVE' | 'COMPLETED' | 'PAUSED';

export interface Subject {
  id: string;
  name: string;
  description?: string;
  color: string;
  priority: Priority;
  status: SubjectStatus;
  progress: number; // 0-100
  createdAt: string;
  _count: { materials: number; topics: number };
}

// ─── Materials ────────────────────────────────────────────────────────────────

export type MaterialType = 'PDF' | 'DOCX' | 'PPTX' | 'TXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'LINK' | 'TEXT';

export interface Material {
  id: string;
  subjectId: string;
  title: string;
  type: MaterialType;
  fileUrl?: string;
  extractedText?: string;
  pageCount?: number;
  processedAt?: string;
  createdAt: string;
  status?: 'processing' | 'ready';
}

// ─── Topics ───────────────────────────────────────────────────────────────────

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'CRITICAL';

export interface Topic {
  id: string;
  subjectId: string;
  materialId?: string;
  title: string;
  summary?: string;
  difficulty: Difficulty;
  order: number;
  subject?: { name: string };
  _count?: { quizItems: number; flashcards: number; studySessions: number };
}

// ─── Study Content ────────────────────────────────────────────────────────────

export type StudyFormat =
  | 'SUMMARY_SHORT' | 'SUMMARY_MEDIUM' | 'SUMMARY_DETAILED'
  | 'STEP_BY_STEP' | 'ANALOGY' | 'PRACTICAL_EXAMPLE'
  | 'QUIZ' | 'FLASHCARD' | 'GUIDED_QUESTIONS' | 'MIND_MAP';

export interface QuizItem {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface GeneratedContent {
  content: string;
  format: StudyFormat;
  provider: string;
  model: string;
  quizItems?: QuizItem[];
  flashcards?: Flashcard[];
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export interface StudySession {
  id: string;
  topicId: string;
  format: StudyFormat;
  durationSecs: number;
  completionRate: number;
  score?: number;
  aiProvider?: string;
  aiModel?: string;
  createdAt: string;
  topic?: { title: string; subject?: { name: string } };
}

export interface SessionStats {
  totalSessions: number;
  totalMinsStudied: number;
  avgScore?: number;
  bySubjectLast7Days: Array<{ subject: string; sessions: number }>;
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export interface Review {
  id: string;
  topicId: string;
  nextReviewDate: string;
  retentionScore: number;
  reviewCount: number;
  topic: Topic & { subject: { name: string; color: string } };
}

// ─── Learning Profile ─────────────────────────────────────────────────────────

export interface LearningProfile {
  id: string;
  preferredFormats: StudyFormat[];
  weakTopics: string[];
  peakHour: string;
  avgSessionMins: number;
  retentionByFormat: Record<string, number>;
  totalSessions: number;
  totalMinsStudied: number;
  streakDays: number;
  lastStudiedAt?: string;
  recommendedFormat: StudyFormat;
}

export interface TodayPlan {
  dueReviews: Review[];
  weakTopics: (Topic & { subject: { name: string; color: string } })[];
  streakDays: number;
  totalMinsToday: number;
}
