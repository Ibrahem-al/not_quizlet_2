export interface ReviewLog {
  date: number;
  quality: number; // 0-5
  timeSpent: number; // ms
  mode: 'flashcards' | 'learn' | 'match' | 'test' | 'game';
}

export interface FSRSState {
  stability: number;
  difficulty: number;
  state: 0 | 1 | 2 | 3; // New, Learning, Review, Relearning
  lastReview: number;
}

export interface Card {
  id: string;
  term: string; // HTML
  definition: string; // HTML
  imageData?: string; // base64
  audioData?: string; // base64
  difficulty: number;
  repetition: number;
  interval: number;
  efFactor: number;
  nextReviewDate: number;
  history: ReviewLog[];
  fsrs?: FSRSState;
}

export interface StudyStats {
  totalSessions: number;
  averageAccuracy: number;
  streakDays: number;
}

export interface StudySet {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  cards: Card[];
  lastStudied: number;
  studyStats: StudyStats;
  visibility: 'private' | 'public';
  folderId?: string;
  userId?: string;
  cardCount?: number;
  shareToken?: string; // UUID for shareable link
}

export type FolderColor = 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'yellow' | 'pink' | 'teal' | 'gray';

export interface Folder {
  id: string;
  userId: string;
  name: string;
  description: string;
  parentFolderId?: string;
  color: FolderColor;
  createdAt: number;
  updatedAt: number;
  itemCount?: number;
  shareToken?: string;
}

export interface FolderItem {
  id: string;
  folderId: string;
  itemType: 'set';
  itemId: string;
  addedAt: number;
  addedBy: string;
}

export interface StudySession {
  id?: number;
  setId: string;
  startedAt: number;
  endedAt?: number;
  mode: string;
  cardsStudied: number;
  accuracy?: number;
}

export type QuestionType = 'written' | 'multiple-choice' | 'true-false';
export type AnswerDirection = 'term-to-def' | 'def-to-term' | 'both';
export type StudyMode = 'flashcards' | 'learn' | 'match' | 'test' | 'spinner' | 'block-builder' | 'memory-card-flip' | 'race-to-finish';

export interface TestConfig {
  questionCount: number;
  direction: AnswerDirection;
  questionTypes: QuestionType[];
  multiAnswerMC: boolean;
}

export interface GameRegistration {
  id: string;
  name: string;
  category: string;
  minCards: number;
  icon: string;
  description: string;
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

// Validation
export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  message: string;
  severity: ValidationSeverity;
  cardId?: string;
}
