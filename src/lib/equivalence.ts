import type { Card } from '@/types';
import { normalizeAnswer, gradeAnswer } from '@/lib/utils';

/**
 * Groups cards by normalized term content.
 * Cards with identical normalized terms are in the same equivalence group.
 */
export function buildEquivalenceGroups(cards: Card[]): Map<string, Card[]> {
  const groups = new Map<string, Card[]>();

  for (const card of cards) {
    const key = normalizeAnswer(card.term);
    if (!key) continue;

    const existing = groups.get(key);
    if (existing) {
      existing.push(card);
    } else {
      groups.set(key, [card]);
    }
  }

  return groups;
}

/**
 * Returns all valid plain-text answers from a card's equivalence group.
 * If direction is 'term', returns all definitions from equivalent cards.
 * If direction is 'definition', returns all terms from equivalent cards.
 */
export function getEquivalentAnswers(
  card: Card,
  direction: 'term' | 'definition',
  groups: Map<string, Card[]>,
): string[] {
  const key = normalizeAnswer(card.term);
  const group = groups.get(key) ?? [card];

  if (direction === 'term') {
    // Asking for the term -> all terms in the group are valid
    return group.map((c) => c.term);
  }

  // Asking for the definition -> all definitions in the group are valid
  return group.map((c) => c.definition);
}

/**
 * Returns cards NOT in the same equivalence group, suitable for wrong answer options.
 */
export function getWrongOptionPool(
  card: Card,
  allCards: Card[],
  groups: Map<string, Card[]>,
): string[] {
  const key = normalizeAnswer(card.term);
  const group = groups.get(key) ?? [card];
  const groupIds = new Set(group.map((c) => c.id));

  return allCards
    .filter((c) => !groupIds.has(c.id))
    .map((c) => c.definition);
}

/**
 * Grades a written answer against all correct answers using Levenshtein distance.
 */
export function gradeWrittenAnswer(
  userAnswer: string,
  correctAnswers: string[],
): boolean {
  return gradeAnswer(userAnswer, correctAnswers);
}
