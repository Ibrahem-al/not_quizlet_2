import type { Card, QuestionType, AnswerDirection } from '@/types';
import { shuffleArray, normalizeAnswer } from '@/lib/utils';
import {
  getEquivalentAnswers,
  getWrongOptionPool,
  getWrongTermPool,
  gradeWrittenAnswer,
} from '@/lib/equivalence';

// Question generation shared by the quiz-style games (Block Builder, Race).

export interface GameQuestion {
  card: Card;
  type: QuestionType;
  promptHtml: string;
  correctAnswers: string[];
  options?: string[];
  tfPair?: { term: string; definition: string; isCorrect: boolean };
}

export function buildGameQuestion(
  card: Card,
  cards: Card[],
  groups: Map<string, Card[]>,
  type: QuestionType,
  direction: AnswerDirection,
  questionIndex: number,
): GameQuestion {
  const isReverse =
    direction === 'def-to-term' || (direction === 'both' && questionIndex % 2 === 1);

  const promptHtml = isReverse ? card.definition : card.term;
  const correctAnswers = isReverse ? [card.term] : getEquivalentAnswers(card, 'definition', groups);
  const wrongPool = () =>
    isReverse ? getWrongTermPool(card, cards, groups) : getWrongOptionPool(card, cards, groups);

  if (type === 'multiple-choice') {
    const wrongs = shuffleArray(wrongPool()).slice(0, 3);
    if (wrongs.length < 1) return { card, type: 'written', promptHtml, correctAnswers };
    const correct = isReverse ? card.term : card.definition;
    return {
      card,
      type: 'multiple-choice',
      promptHtml,
      correctAnswers,
      options: shuffleArray([correct, ...wrongs]),
    };
  }

  if (type === 'true-false') {
    const isCorrect = Math.random() > 0.5;
    let shown = isReverse ? card.term : card.definition;
    if (!isCorrect) {
      const pool = wrongPool();
      if (pool.length > 0) shown = shuffleArray(pool)[0];
    }
    return {
      card,
      type: 'true-false',
      promptHtml,
      correctAnswers,
      tfPair: {
        term: isReverse ? card.definition : card.term,
        definition: shown,
        isCorrect: isCorrect || correctAnswers.some((a) => normalizeAnswer(a) === normalizeAnswer(shown)),
      },
    };
  }

  return { card, type: 'written', promptHtml, correctAnswers };
}

export function isCorrectOption(question: GameQuestion, option: string): boolean {
  return question.correctAnswers.some((a) => normalizeAnswer(a) === normalizeAnswer(option));
}

export function gradeGameAnswer(
  question: GameQuestion,
  answer: { written: string } | { option: string } | { tf: boolean },
): boolean {
  if ('written' in answer) return gradeWrittenAnswer(answer.written, question.correctAnswers);
  if ('option' in answer) return isCorrectOption(question, answer.option);
  return answer.tf === question.tfPair?.isCorrect;
}
