import type { Card, ReviewLog } from '@/types';

/**
 * SM-2 spaced repetition algorithm.
 * Records a review and returns an updated card (does not mutate the original).
 */
export function recordReview(card: Card, quality: number, mode: string): Card {
  // Clamp quality to 0-5
  const q = Math.max(0, Math.min(5, Math.round(quality)));

  // Calculate new ease factor
  const newEfFactor = Math.max(
    1.3,
    card.efFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02),
  );

  let newRepetition: number;
  let newInterval: number;

  if (q >= 3) {
    // Successful review
    if (card.repetition === 0) {
      newInterval = 1;
      newRepetition = 1;
    } else if (card.repetition === 1) {
      newInterval = 6;
      newRepetition = 2;
    } else {
      newInterval = Math.round(card.interval * newEfFactor);
      newRepetition = card.repetition + 1;
    }
  } else {
    // Failed review - reset
    newRepetition = 0;
    newInterval = 1;
  }

  const nextReviewDate = Date.now() + newInterval * 86400000;

  const logEntry: ReviewLog = {
    date: Date.now(),
    quality: q,
    timeSpent: 0,
    mode: mode as ReviewLog['mode'],
  };

  return {
    ...card,
    efFactor: newEfFactor,
    interval: newInterval,
    repetition: newRepetition,
    nextReviewDate,
    history: [...card.history, logEntry],
  };
}

/**
 * Returns true if the card is due for review.
 */
export function isDueForReview(card: Card): boolean {
  return card.nextReviewDate <= Date.now();
}

/**
 * Determines the learning state of a card.
 */
export function getCardState(card: Card): 'new' | 'learning' | 'review' | 'relearning' {
  if (card.history.length === 0) {
    return 'new';
  }

  const lastReview = card.history[card.history.length - 1];

  if (card.repetition === 0 && card.history.length > 0) {
    // Was reviewed but reset due to failure
    if (lastReview.quality < 3) {
      return 'relearning';
    }
    return 'learning';
  }

  if (card.repetition <= 1) {
    return 'learning';
  }

  return 'review';
}
