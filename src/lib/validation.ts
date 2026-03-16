import type { Card, StudySet, ValidationIssue } from '@/types';
import { stripHtml, normalizeAnswer } from '@/lib/utils';

export function validateCard(card: Card): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const termText = stripHtml(card.term);
  const defText = stripHtml(card.definition);

  // EMPTY_CONTENT: term or definition completely empty
  if (!termText && !card.term.includes('<img')) {
    issues.push({
      code: 'EMPTY_CONTENT',
      message: 'Term is empty',
      severity: 'error',
      cardId: card.id,
    });
  }
  if (!defText && !card.definition.includes('<img')) {
    issues.push({
      code: 'EMPTY_CONTENT',
      message: 'Definition is empty',
      severity: 'error',
      cardId: card.id,
    });
  }

  // MAX_LENGTH: content > 10000 chars
  if (card.term.length > 10000) {
    issues.push({
      code: 'MAX_LENGTH',
      message: 'Term exceeds 10,000 characters',
      severity: 'error',
      cardId: card.id,
    });
  }
  if (card.definition.length > 10000) {
    issues.push({
      code: 'MAX_LENGTH',
      message: 'Definition exceeds 10,000 characters',
      severity: 'error',
      cardId: card.id,
    });
  }

  // SUSPICIOUSLY_SIMILAR: term ≈ definition (warning)
  if (termText && defText) {
    const normTerm = normalizeAnswer(card.term);
    const normDef = normalizeAnswer(card.definition);
    if (normTerm === normDef) {
      issues.push({
        code: 'SUSPICIOUSLY_SIMILAR',
        message: 'Term and definition are identical',
        severity: 'warning',
        cardId: card.id,
      });
    }
  }

  // URL_AS_CONTENT: just a URL (warning)
  const urlPattern = /^https?:\/\/\S+$/i;
  if (urlPattern.test(termText.trim())) {
    issues.push({
      code: 'URL_AS_CONTENT',
      message: 'Term appears to be just a URL',
      severity: 'warning',
      cardId: card.id,
    });
  }
  if (urlPattern.test(defText.trim())) {
    issues.push({
      code: 'URL_AS_CONTENT',
      message: 'Definition appears to be just a URL',
      severity: 'warning',
      cardId: card.id,
    });
  }

  // ALL_CAPS_DETECTED: all uppercase (warning)
  if (termText.length > 3 && termText === termText.toUpperCase() && termText !== termText.toLowerCase()) {
    issues.push({
      code: 'ALL_CAPS_DETECTED',
      message: 'Term is all uppercase',
      severity: 'warning',
      cardId: card.id,
    });
  }
  if (defText.length > 3 && defText === defText.toUpperCase() && defText !== defText.toLowerCase()) {
    issues.push({
      code: 'ALL_CAPS_DETECTED',
      message: 'Definition is all uppercase',
      severity: 'warning',
      cardId: card.id,
    });
  }

  return issues;
}

export function validateSet(set: StudySet): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // MIN_CARDS: fewer than 2 cards
  if (set.cards.length < 2) {
    issues.push({
      code: 'MIN_CARDS',
      message: 'Set needs at least 2 cards',
      severity: 'error',
    });
  }

  // MAX_CARDS: > 500 cards (warning)
  if (set.cards.length > 500) {
    issues.push({
      code: 'MAX_CARDS',
      message: 'Set has more than 500 cards, which may affect performance',
      severity: 'warning',
    });
  }

  // DUPLICATE_TERMS: multiple cards same term (warning)
  const termMap = new Map<string, number>();
  for (const card of set.cards) {
    const norm = normalizeAnswer(card.term);
    if (norm) {
      termMap.set(norm, (termMap.get(norm) ?? 0) + 1);
    }
  }
  for (const [, count] of termMap) {
    if (count > 1) {
      issues.push({
        code: 'DUPLICATE_TERMS',
        message: 'Some cards have duplicate terms',
        severity: 'warning',
      });
      break;
    }
  }

  // TAG_MISSING: no tags (warning)
  if (set.tags.length === 0) {
    issues.push({
      code: 'TAG_MISSING',
      message: 'No tags added to set',
      severity: 'warning',
    });
  }

  // Validate individual cards
  for (const card of set.cards) {
    issues.push(...validateCard(card));
  }

  return issues;
}

export function getHardErrors(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => i.severity === 'error');
}

export function hasHardErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
