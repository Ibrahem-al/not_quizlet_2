import type { Card } from '@/types';
import { normalizeAnswer, gradeAnswer } from '@/lib/utils';

/**
 * Groups cards by normalized TERM content.
 * Cards with identical normalized terms are in the same equivalence group.
 * (Keyed by term — consumers such as MatchMode look up a group via the card's term.)
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
 * Returns all valid plain-text answers equivalent to this card's answer.
 * If direction is 'definition' (the definition is the answer), returns every
 * definition among cards that share this card's TERM.
 * If direction is 'term' (the term is the answer), returns every term among
 * cards that share this card's DEFINITION.
 */
export function getEquivalentAnswers(
  card: Card,
  direction: 'term' | 'definition',
  groups: Map<string, Card[]>,
): string[] {
  if (direction === 'definition') {
    // Asking for the definition -> every definition of cards sharing the term.
    const key = normalizeAnswer(card.term);
    const group = groups.get(key) ?? [card];
    return group.map((c) => c.definition);
  }

  // direction === 'term': asking for the term -> every term of cards sharing the
  // definition. The term-keyed `groups` map can't answer this directly, so derive
  // the card pool from the group values and match on normalized definition.
  const defKey = normalizeAnswer(card.definition);
  if (!defKey) return [card.term];
  const allCards = Array.from(groups.values()).flat();
  const matches = allCards.filter((c) => normalizeAnswer(c.definition) === defKey);
  return (matches.length > 0 ? matches : [card]).map((c) => c.term);
}

/**
 * Returns plain-text options suitable as WRONG answers for `card`, drawn from the
 * requested answer side. Excludes cards in the same (term) equivalence group,
 * excludes any option whose normalized value equals the card's own correct answer,
 * and de-dupes by normalized value.
 */
export function getWrongOptionPool(
  card: Card,
  allCards: Card[],
  groups: Map<string, Card[]>,
  answerSide: 'term' | 'definition' = 'definition',
): string[] {
  const key = normalizeAnswer(card.term);
  const group = groups.get(key) ?? [card];
  const groupIds = new Set(group.map((c) => c.id));
  const correctNorm = normalizeAnswer(card[answerSide]);

  const seen = new Set<string>();
  const pool: string[] = [];
  for (const c of allCards) {
    if (groupIds.has(c.id)) continue;
    const candidate = c[answerSide];
    const norm = normalizeAnswer(candidate);
    if (!norm || norm === correctNorm || seen.has(norm)) continue;
    seen.add(norm);
    pool.push(candidate);
  }
  return pool;
}

/**
 * Returns terms of cards NOT in the same equivalence group, suitable for wrong answer options
 * when answering with the term (def-to-term direction).
 */
export function getWrongTermPool(
  card: Card,
  allCards: Card[],
  groups: Map<string, Card[]>,
): string[] {
  const key = normalizeAnswer(card.term);
  const group = groups.get(key) ?? [card];
  const groupIds = new Set(group.map((c) => c.id));

  return allCards
    .filter((c) => !groupIds.has(c.id))
    .map((c) => c.term);
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
