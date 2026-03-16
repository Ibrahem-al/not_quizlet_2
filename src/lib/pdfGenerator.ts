import type { StudySet, AnswerDirection, QuestionType } from '@/types';
import { stripHtml, shuffleArray } from '@/lib/utils';

export interface PDFConfig {
  direction: AnswerDirection;
  count: number;
  questionTypes?: QuestionType[];
  multiAnswerMC?: boolean;
}

interface CardPair {
  question: string;
  answer: string;
  imageData?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getJsPDF() {
  // @ts-ignore - jspdf types may not be available
  const { jsPDF } = await import('jspdf');
  return jsPDF;
}

function buildPairs(set: StudySet, config: PDFConfig): CardPair[] {
  const cards = shuffleArray(set.cards).slice(0, config.count);

  if (config.direction === 'both') {
    const pairs: CardPair[] = [];
    cards.forEach((c) => {
      if (Math.random() < 0.5) {
        pairs.push({ question: stripHtml(c.term), answer: stripHtml(c.definition), imageData: c.imageData });
      } else {
        pairs.push({ question: stripHtml(c.definition), answer: stripHtml(c.term), imageData: c.imageData });
      }
    });
    return pairs;
  }

  return cards.map((c) =>
    config.direction === 'term-to-def'
      ? { question: stripHtml(c.term), answer: stripHtml(c.definition), imageData: c.imageData }
      : { question: stripHtml(c.definition), answer: stripHtml(c.term), imageData: c.imageData }
  );
}

function header(doc: InstanceType<Awaited<ReturnType<typeof getJsPDF>>>, title: string): number {
  doc.setFontSize(16);
  doc.setFont('Helvetica', 'bold');
  doc.text(title, 20, 20);
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'normal');
  doc.text(new Date().toLocaleDateString(), 20, 28);
  doc.setDrawColor(200);
  doc.line(20, 31, 190, 31);
  return 38;
}

function checkPage(doc: InstanceType<Awaited<ReturnType<typeof getJsPDF>>>, y: number, needed: number): number {
  if (y + needed > 280) {
    doc.addPage();
    return 20;
  }
  return y;
}

function addImage(
  doc: InstanceType<Awaited<ReturnType<typeof getJsPDF>>>,
  base64: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
) {
  try {
    doc.addImage(base64, 'JPEG', x, y, maxW, maxH);
  } catch {
    // Silently skip unsupported images
  }
}

function wrapText(
  doc: InstanceType<Awaited<ReturnType<typeof getJsPDF>>>,
  text: string,
  maxWidth: number,
): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

function save(doc: InstanceType<Awaited<ReturnType<typeof getJsPDF>>>, name: string) {
  doc.save(`${name}.pdf`);
}

// ---------------------------------------------------------------------------
// Test PDF
// ---------------------------------------------------------------------------

export async function generateTestPDF(set: StudySet, config: PDFConfig) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });

  const pairs = buildPairs(set, config);
  const types = config.questionTypes ?? ['written'];

  // Questions page
  let y = header(doc, `${set.title} — Test`);
  doc.setFontSize(11);

  pairs.forEach((pair, i) => {
    y = checkPage(doc, y, 20);

    const qType = types[i % types.length];
    doc.setFont('Helvetica', 'bold');
    doc.text(`${i + 1}.`, 20, y);
    const lines = wrapText(doc, pair.question, 150);
    doc.setFont('Helvetica', 'normal');
    doc.text(lines, 28, y);
    y += lines.length * 5 + 2;

    if (pair.imageData) {
      y = checkPage(doc, y, 32);
      addImage(doc, pair.imageData, 28, y, 30, 30);
      y += 32;
    }

    if (qType === 'written') {
      doc.setDrawColor(180);
      doc.line(28, y + 4, 180, y + 4);
      y += 12;
    } else if (qType === 'multiple-choice') {
      const distractors = shuffleArray(
        pairs.filter((_, idx) => idx !== i).map((p) => p.answer)
      ).slice(0, config.multiAnswerMC ? 4 : 3);
      const options = shuffleArray([pair.answer, ...distractors]).slice(0, 4);
      const labels = ['A', 'B', 'C', 'D'];
      options.forEach((opt, oi) => {
        y = checkPage(doc, y, 6);
        doc.text(`   ${labels[oi]}) ${opt}`, 28, y);
        y += 5;
      });
      y += 4;
    } else if (qType === 'true-false') {
      const isTrue = Math.random() > 0.5;
      const shown = isTrue ? pair.answer : shuffleArray(pairs.filter((_, idx) => idx !== i).map((p) => p.answer))[0] ?? pair.answer;
      y = checkPage(doc, y, 8);
      doc.text(`   "${shown}"`, 28, y);
      y += 5;
      doc.text('   True  /  False', 28, y);
      y += 8;
    }
  });

  // Answer key
  doc.addPage();
  y = header(doc, `${set.title} — Answer Key`);
  doc.setFontSize(10);
  pairs.forEach((pair, i) => {
    y = checkPage(doc, y, 8);
    const answerLines = wrapText(doc, `${i + 1}. ${pair.answer}`, 160);
    doc.text(answerLines, 20, y);
    y += answerLines.length * 5 + 2;
  });

  save(doc, `${set.title} - Test`);
}

// ---------------------------------------------------------------------------
// Line Matching PDF
// ---------------------------------------------------------------------------

export async function generateLineMatchingPDF(set: StudySet, config: PDFConfig) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });

  const pairs = buildPairs(set, config);
  const shuffledAnswers = shuffleArray(pairs.map((p) => p.answer));

  let y = header(doc, `${set.title} — Line Matching`);
  doc.setFontSize(10);

  const lineH = 8;
  pairs.forEach((pair, i) => {
    y = checkPage(doc, y, lineH);
    doc.text(`${i + 1}. ${pair.question}`, 20, y);
    doc.text(`${String.fromCharCode(65 + i)}. ${shuffledAnswers[i]}`, 115, y);
    y += lineH;
  });

  // Answer key on new page
  doc.addPage();
  y = header(doc, `${set.title} — Line Matching Key`);
  doc.setFontSize(10);
  pairs.forEach((pair, i) => {
    const matchIdx = shuffledAnswers.indexOf(pair.answer);
    y = checkPage(doc, y, 7);
    doc.text(`${i + 1} → ${String.fromCharCode(65 + matchIdx)}`, 20, y);
    y += 7;
  });

  save(doc, `${set.title} - Line Matching`);
}

// ---------------------------------------------------------------------------
// Flashcards PDF
// ---------------------------------------------------------------------------

export async function generateFlashcardsPDF(set: StudySet, config: PDFConfig) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });

  const pairs = buildPairs(set, config);
  const cols = 2;
  const rows = 4;
  const cardW = 80;
  const cardH = 55;
  const marginX = 15;
  const marginY = 20;
  const gapX = 10;
  const gapY = 8;
  const perPage = cols * rows;

  // Front sides
  for (let p = 0; p < Math.ceil(pairs.length / perPage); p++) {
    if (p > 0) doc.addPage();
    doc.setFontSize(8);
    doc.setFont('Helvetica', 'normal');
    doc.text('FRONT', 95, 12, { align: 'center' });

    for (let i = 0; i < perPage; i++) {
      const idx = p * perPage + i;
      if (idx >= pairs.length) break;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = marginX + col * (cardW + gapX);
      const y = marginY + row * (cardH + gapY);
      doc.setDrawColor(150);
      doc.rect(x, y, cardW, cardH);
      doc.setFontSize(10);
      const lines = wrapText(doc, pairs[idx].question, cardW - 8);
      doc.text(lines, x + 4, y + 10);
      if (pairs[idx].imageData) {
        addImage(doc, pairs[idx].imageData, x + 4, y + 22, 20, 20);
      }
    }
  }

  // Back sides
  for (let p = 0; p < Math.ceil(pairs.length / perPage); p++) {
    doc.addPage();
    doc.setFontSize(8);
    doc.setFont('Helvetica', 'normal');
    doc.text('BACK', 95, 12, { align: 'center' });

    for (let i = 0; i < perPage; i++) {
      const idx = p * perPage + i;
      if (idx >= pairs.length) break;
      // Mirror column order so cards match when flipped
      const col = (cols - 1) - (i % cols);
      const row = Math.floor(i / cols);
      const x = marginX + col * (cardW + gapX);
      const y = marginY + row * (cardH + gapY);
      doc.setDrawColor(150);
      doc.rect(x, y, cardW, cardH);
      doc.setFontSize(10);
      const lines = wrapText(doc, pairs[idx].answer, cardW - 8);
      doc.text(lines, x + 4, y + 10);
    }
  }

  save(doc, `${set.title} - Flashcards`);
}

// ---------------------------------------------------------------------------
// Matching Game PDF
// ---------------------------------------------------------------------------

export async function generateMatchingGamePDF(set: StudySet, config: PDFConfig) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });

  const pairs = buildPairs(set, config);

  let y = header(doc, `${set.title} — Matching Game (cut out cards)`);

  const cardW = 80;
  const cardH = 28;
  const gapX = 10;
  const gapY = 5;

  // Shuffle all cards together
  const allCards = shuffleArray([
    ...pairs.map((p) => ({ text: p.question, type: 'Q' as const })),
    ...pairs.map((p) => ({ text: p.answer, type: 'A' as const })),
  ]);

  doc.setFontSize(9);
  let col = 0;

  allCards.forEach((card) => {
    y = checkPage(doc, y, cardH + gapY);
    const x = 15 + col * (cardW + gapX);
    doc.setDrawColor(120);
    doc.setLineDashPattern([2, 2], 0);
    doc.rect(x, y, cardW, cardH);
    doc.setLineDashPattern([], 0);

    const lines = wrapText(doc, card.text, cardW - 8);
    doc.text(lines, x + 4, y + 8);

    col++;
    if (col >= 2) {
      col = 0;
      y += cardH + gapY;
    }
  });

  save(doc, `${set.title} - Matching Game`);
}

// ---------------------------------------------------------------------------
// Cut & Glue PDF
// ---------------------------------------------------------------------------

export async function generateCutAndGluePDF(set: StudySet, config: PDFConfig) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });

  const pairs = buildPairs(set, config);

  // Page 1: definitions with blank space to glue terms
  let y = header(doc, `${set.title} — Cut & Glue`);
  doc.setFontSize(10);

  pairs.forEach((pair, i) => {
    y = checkPage(doc, y, 16);
    doc.text(`${i + 1}.`, 20, y);
    const lines = wrapText(doc, pair.answer, 90);
    doc.text(lines, 28, y);
    // Blank box for gluing
    doc.setDrawColor(180);
    doc.rect(130, y - 4, 55, 12);
    y += Math.max(lines.length * 5, 12) + 4;
  });

  // Page 2: cut-out term strips
  doc.addPage();
  y = header(doc, `${set.title} — Cut-Out Terms`);
  doc.setFontSize(10);

  const shuffledPairs = shuffleArray(pairs);
  shuffledPairs.forEach((pair) => {
    y = checkPage(doc, y, 14);
    doc.setDrawColor(120);
    doc.setLineDashPattern([2, 2], 0);
    doc.rect(20, y - 4, 55, 12);
    doc.setLineDashPattern([], 0);
    const lines = wrapText(doc, pair.question, 50);
    doc.text(lines, 23, y);
    y += 14;
  });

  save(doc, `${set.title} - Cut and Glue`);
}

// ---------------------------------------------------------------------------
// Lift the Flap PDF
// ---------------------------------------------------------------------------

export async function generateLiftTheFlapPDF(set: StudySet, config: PDFConfig) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });

  const pairs = buildPairs(set, config);

  let y = header(doc, `${set.title} — Lift the Flap`);
  doc.setFontSize(9);
  doc.text('Fold along the dotted line so the answer is hidden beneath the question.', 20, y);
  y += 10;

  const flapH = 24;

  pairs.forEach((pair) => {
    y = checkPage(doc, y, flapH + 6);

    // Question area
    doc.setDrawColor(80);
    doc.rect(20, y, 170, flapH);

    // Fold line
    doc.setDrawColor(150);
    doc.setLineDashPattern([3, 3], 0);
    doc.line(20, y + flapH / 2, 190, y + flapH / 2);
    doc.setLineDashPattern([], 0);

    // Question on top half
    doc.setFont('Helvetica', 'bold');
    const qLines = wrapText(doc, `Q: ${pair.question}`, 160);
    doc.text(qLines, 24, y + 5);

    // Answer on bottom half (upside-down hint: small text)
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    const aLines = wrapText(doc, `A: ${pair.answer}`, 160);
    doc.text(aLines, 24, y + flapH / 2 + 5);
    doc.setFontSize(9);

    y += flapH + 6;
  });

  save(doc, `${set.title} - Lift the Flap`);
}
