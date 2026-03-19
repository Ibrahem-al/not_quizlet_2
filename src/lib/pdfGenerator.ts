import type { StudySet, Card, AnswerDirection, QuestionType } from '@/types';
import { stripHtml, shuffleArray } from '@/lib/utils';
import { buildEquivalenceGroups, getEquivalentAnswers, getWrongOptionPool } from '@/lib/equivalence';

export interface PDFConfig {
  direction: AnswerDirection;
  count: number;
  questionTypes?: QuestionType[];
  multiAnswerMC?: boolean;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CardPair {
  card: Card;
  question: string;
  answer: string;
  questionImages: string[];
  answerImages: string[];
  equivalentAnswers: string[];
}

type DocType = InstanceType<Awaited<ReturnType<typeof getJsPDF>>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getJsPDF() {
  // @ts-ignore
  const { jsPDF } = await import('jspdf');
  return jsPDF;
}

/** Extract base64 image srcs from HTML content */
function extractImages(html: string): string[] {
  if (!html) return [];
  const div = document.createElement('div');
  div.innerHTML = html;
  const imgs = div.querySelectorAll('img');
  const results: string[] = [];
  imgs.forEach((img) => {
    const src = img.getAttribute('src');
    if (src && src.startsWith('data:')) results.push(src);
  });
  return results;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

function buildPairs(set: StudySet, config: PDFConfig): CardPair[] {
  const groups = buildEquivalenceGroups(set.cards);
  let cards = shuffleArray(set.cards.filter((c) => stripHtml(c.term) || stripHtml(c.definition)));

  // If count > card count, repeat cards evenly
  if (config.count > cards.length) {
    const repeated: Card[] = [];
    while (repeated.length < config.count) {
      repeated.push(...shuffleArray(cards));
    }
    cards = repeated.slice(0, config.count);
  } else {
    cards = cards.slice(0, config.count);
  }

  return cards.map((c) => {
    const isTtD = config.direction === 'both' ? Math.random() < 0.5 : config.direction === 'term-to-def';
    const question = isTtD ? stripHtml(c.term) : stripHtml(c.definition);
    const answer = isTtD ? stripHtml(c.definition) : stripHtml(c.term);
    const questionImages = isTtD ? extractImages(c.term) : extractImages(c.definition);
    const answerImages = isTtD ? extractImages(c.definition) : extractImages(c.term);

    // Get equivalent answers
    const eqDir = isTtD ? 'definition' : 'term';
    const eqAnswers = getEquivalentAnswers(c, eqDir, groups).map(stripHtml).filter((a) => a && a !== answer);

    return { card: c, question, answer, questionImages, answerImages, equivalentAnswers: eqAnswers };
  });
}

/** PDF header: title + subtitle + rule. Returns Y position after header. */
function header(doc: DocType, title: string, setTitle: string): number {
  doc.setFontSize(16);
  doc.setFont('Helvetica', 'bold');
  doc.text(title, 15, 18);
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(120);
  const date = new Date().toLocaleDateString();
  doc.text(`${setTitle}  |  ${date}`, 15, 25);
  doc.setTextColor(0);
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(15, 28, 195, 28);
  return 35;
}

function pageNumber(doc: DocType) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
    doc.setTextColor(0);
  }
}

function checkPage(doc: DocType, y: number, needed: number): number {
  if (y + needed > 275) {
    doc.addPage();
    return 20;
  }
  return y;
}

function tryAddImage(doc: DocType, base64: string, x: number, y: number, maxW: number, maxH: number) {
  try {
    // Detect format from data URI, default to JPEG
    const format = base64.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(base64, format, x, y, maxW, maxH);
  } catch {
    // Skip unsupported images
  }
}

/** Render images in a grid layout. Returns height used. */
function renderImageGrid(doc: DocType, images: string[], x: number, y: number, maxW: number, imgH: number): number {
  if (images.length === 0) return 0;
  const gap = 2;
  const count = Math.min(images.length, 6);

  if (count === 1) {
    tryAddImage(doc, images[0], x, y, Math.min(maxW, 40), imgH);
    return imgH + 2;
  }

  const cols = count <= 3 ? count : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const cellW = (maxW - gap * (cols - 1)) / cols;
  const cellH = imgH;

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    tryAddImage(doc, images[i], x + col * (cellW + gap), y + row * (cellH + gap), cellW, cellH);
  }

  return rows * (cellH + gap);
}

function wrapText(doc: DocType, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

function save(doc: DocType, type: string, title: string) {
  pageNumber(doc);
  doc.save(`studyflow-${type}-${slugify(title)}.pdf`);
}

// ---------------------------------------------------------------------------
// 1. Printable Test
// ---------------------------------------------------------------------------

export async function generateTestPDF(set: StudySet, config: PDFConfig) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const groups = buildEquivalenceGroups(set.cards);
  const pairs = buildPairs(set, config);
  const types = config.questionTypes ?? ['written'];

  // Questions pages
  let y = header(doc, `${set.title} — Test`, set.title);

  // Student info
  doc.setFontSize(10);
  doc.setFont('Helvetica', 'normal');
  doc.text('Name: ________________________________________', 15, y);
  y += 6;
  doc.text(`Date: _________________    Score: ______ / ${pairs.length}`, 15, y);
  y += 4;
  doc.setDrawColor(200);
  doc.line(15, y, 195, y);
  y += 8;

  const answerKey: { idx: number; type: QuestionType; answer: string; equivalents: string[]; letter?: string; tf?: boolean }[] = [];

  pairs.forEach((pair, i) => {
    const qType = types[i % types.length];

    if (qType === 'written') {
      y = checkPage(doc, y, 28);
      doc.setFontSize(10);
      doc.setFont('Helvetica', 'bold');
      const verb = config.direction === 'def-to-term' ? 'What term means' : 'Define';
      doc.text(`${i + 1}.`, 15, y);
      doc.setFont('Helvetica', 'normal');
      const qLines = wrapText(doc, `${verb}: "${pair.question}"`, 150);
      doc.text(qLines, 23, y);
      y += qLines.length * 4.5 + 2;

      // Question images
      if (pair.questionImages.length > 0) {
        y = checkPage(doc, y, 20);
        y += renderImageGrid(doc, pair.questionImages, 20, y, 40, 18);
      }

      // Answer lines
      doc.setDrawColor(180);
      doc.setLineWidth(0.2);
      doc.line(23, y + 2, 180, y + 2);
      y += 8;
      doc.line(23, y, 180, y);
      y += 6;

      answerKey.push({ idx: i, type: 'written', answer: pair.answer, equivalents: pair.equivalentAnswers });

    } else if (qType === 'multiple-choice') {
      y = checkPage(doc, y, 36);
      doc.setFontSize(10);
      doc.setFont('Helvetica', 'bold');
      const verb = config.direction === 'def-to-term' ? 'Which term matches' : 'What is the definition of';
      doc.text(`${i + 1}.`, 15, y);
      doc.setFont('Helvetica', 'normal');
      const qLines = wrapText(doc, `${verb} "${pair.question}"?`, 150);
      doc.text(qLines, 23, y);
      y += qLines.length * 4.5 + 2;

      if (pair.questionImages.length > 0) {
        y = checkPage(doc, y, 20);
        y += renderImageGrid(doc, pair.questionImages, 23, y, 40, 18);
      }

      // Build options: correct + 3 wrong (or more if multi-answer)
      const wrongPool = getWrongOptionPool(pair.card, set.cards, groups).map(stripHtml).filter(Boolean);
      const wrongOptions = shuffleArray(wrongPool).slice(0, 3);
      const correctAnswers = [pair.answer, ...(config.multiAnswerMC ? pair.equivalentAnswers.slice(0, 1) : [])];
      const allOptions = shuffleArray([...correctAnswers, ...wrongOptions]).slice(0, 4);
      const labels = ['a', 'b', 'c', 'd'];

      // Find correct letters
      const correctLetters: string[] = [];
      const correctNorm = correctAnswers.map((a) => a.toLowerCase().trim());

      allOptions.forEach((opt, oi) => {
        y = checkPage(doc, y, 7);
        // Empty circle
        doc.setDrawColor(120);
        doc.setLineWidth(0.3);
        doc.circle(26, y - 1.2, 2);
        doc.text(`${labels[oi]})  ${opt}`, 30, y);

        if (correctNorm.includes(opt.toLowerCase().trim())) {
          correctLetters.push(labels[oi]);
        }
        y += 5.5;
      });
      y += 3;

      answerKey.push({
        idx: i,
        type: 'multiple-choice',
        answer: pair.answer,
        equivalents: pair.equivalentAnswers,
        letter: correctLetters.join(', '),
      });

    } else if (qType === 'true-false') {
      y = checkPage(doc, y, 22);
      const isTrue = Math.random() > 0.5;
      const shownAnswer = isTrue
        ? pair.answer
        : shuffleArray(pairs.filter((_, idx) => idx !== i).map((p) => p.answer))[0] ?? pair.answer;

      doc.setFontSize(10);
      doc.setFont('Helvetica', 'bold');
      doc.text(`${i + 1}.`, 15, y);
      doc.setFont('Helvetica', 'normal');

      const statement = config.direction === 'def-to-term'
        ? `"${shownAnswer}" is the term for "${pair.question}"`
        : `"${pair.question}" means "${shownAnswer}"`;

      const qLines = wrapText(doc, `True or False: ${statement}`, 150);
      doc.text(qLines, 23, y);
      y += qLines.length * 4.5 + 3;

      // Images
      const allImages = [...pair.questionImages, ...pair.answerImages];
      if (allImages.length > 0) {
        y = checkPage(doc, y, 20);
        y += renderImageGrid(doc, allImages, 23, y, 60, 18);
      }

      // True / False circles
      doc.setDrawColor(120);
      doc.setLineWidth(0.3);
      doc.circle(28, y - 1, 2.5);
      doc.text('True', 33, y);
      doc.circle(58, y - 1, 2.5);
      doc.text('False', 63, y);
      y += 8;

      answerKey.push({ idx: i, type: 'true-false', answer: pair.answer, equivalents: pair.equivalentAnswers, tf: isTrue });
    }
  });

  // Answer key page
  doc.addPage();
  y = header(doc, 'Answer Key — Test', set.title);
  doc.setFontSize(10);

  answerKey.forEach((entry) => {
    y = checkPage(doc, y, 10);
    doc.setFont('Helvetica', 'bold');
    doc.text(`${entry.idx + 1}.`, 15, y);
    doc.setFont('Helvetica', 'normal');

    let answerText = '';
    if (entry.type === 'written') {
      answerText = entry.answer;
      if (entry.equivalents.length > 0) answerText += ` (or ${entry.equivalents.join(', ')})`;
    } else if (entry.type === 'multiple-choice') {
      answerText = `${entry.letter}) ${entry.answer}`;
      if (entry.equivalents.length > 0) answerText += ` (or ${entry.equivalents.join(', ')})`;
    } else if (entry.type === 'true-false') {
      answerText = entry.tf ? 'True' : 'False';
    }

    const lines = wrapText(doc, answerText, 160);
    doc.text(lines, 23, y);
    y += lines.length * 4.5 + 3;
  });

  save(doc, 'test', set.title);
}

// ---------------------------------------------------------------------------
// 2. Line Matching
// ---------------------------------------------------------------------------

export async function generateLineMatchingPDF(set: StudySet, config: PDFConfig) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const pairs = buildPairs(set, config);
  const shuffledAnswers = shuffleArray(pairs.map((p, i) => ({ answer: p.answer, origIdx: i, images: p.answerImages })));
  const groups = buildEquivalenceGroups(set.cards);

  let y = header(doc, 'Line Matching Worksheet', set.title);

  // Instruction
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('Draw a line from each item on the left to its match on the right.', 15, y);
  doc.setTextColor(0);
  y += 8;

  // Column headers
  const leftLabel = config.direction === 'def-to-term' ? 'Definitions' : 'Terms';
  const rightLabel = config.direction === 'def-to-term' ? 'Terms' : 'Definitions';
  doc.setFontSize(10);
  doc.setFont('Helvetica', 'bold');
  doc.text(leftLabel, 15, y);
  doc.text(rightLabel, 125, y);
  doc.setFont('Helvetica', 'normal');
  y += 6;

  const itemsPerPage = 10;

  pairs.forEach((pair, i) => {
    if (i > 0 && i % itemsPerPage === 0) {
      doc.addPage();
      y = 20;
    }
    y = checkPage(doc, y, 18);

    // Left: numbered question
    doc.setFontSize(10);
    const leftLines = wrapText(doc, `${i + 1}. ${pair.question}`, 70);
    doc.text(leftLines, 15, y);

    // Right: lettered answer (shuffled)
    const letter = String.fromCharCode(65 + i);
    const rightLines = wrapText(doc, `${letter}. ${shuffledAnswers[i].answer}`, 70);
    doc.text(rightLines, 125, y);

    // Dotted connecting line
    const midY = y + Math.max(leftLines.length, rightLines.length) * 2;
    doc.setDrawColor(200);
    doc.setLineDashPattern([1, 1], 0);
    doc.setLineWidth(0.2);
    doc.line(85, midY, 123, midY);
    doc.setLineDashPattern([], 0);

    const leftH = leftLines.length * 4.5;
    const rightH = rightLines.length * 4.5;
    let rowH = Math.max(leftH, rightH) + 2;

    // Left images
    if (pair.questionImages.length > 0) {
      const imgY = y + leftH;
      const ih = renderImageGrid(doc, pair.questionImages, 25, imgY, 28, 14);
      rowH = Math.max(rowH, leftH + ih);
    }
    // Right images
    if (shuffledAnswers[i].images.length > 0) {
      const imgY = y + rightH;
      const ih = renderImageGrid(doc, shuffledAnswers[i].images, 135, imgY, 28, 14);
      rowH = Math.max(rowH, rightH + ih);
    }

    y += rowH + 4;
  });

  // Answer key
  doc.addPage();
  y = header(doc, 'Answer Key — Line Matching', set.title);
  doc.setFontSize(11);

  pairs.forEach((pair, i) => {
    y = checkPage(doc, y, 7);
    const matchIdx = shuffledAnswers.findIndex((s) => s.origIdx === i);
    const letter = String.fromCharCode(65 + matchIdx);

    // Check for equivalent matches
    const eqLetters: string[] = [];
    shuffledAnswers.forEach((s, si) => {
      if (si !== matchIdx && pair.equivalentAnswers.includes(s.answer)) {
        eqLetters.push(String.fromCharCode(65 + si));
      }
    });

    let text = `${i + 1} = ${letter}`;
    if (eqLetters.length > 0) text += ` (or ${eqLetters.join(', ')})`;

    doc.text(text, 15, y);
    y += 7;
  });

  save(doc, 'matching-worksheet', set.title);
}

// ---------------------------------------------------------------------------
// 3. Flashcards
// ---------------------------------------------------------------------------

export async function generateFlashcardsPDF(set: StudySet, config: PDFConfig) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const pairs = buildPairs(set, config);

  const cols = 2;
  const rows = 4;
  const perPage = cols * rows;
  const marginX = 15;
  const marginY = 15;
  const gapX = 6;
  const gapY = 2;
  const cardW = (180 - gapX) / cols; // ~87mm
  const cardH = (270 - marginY * 2) / rows; // ~60mm

  for (let p = 0; p < Math.ceil(pairs.length / perPage); p++) {
    if (p > 0) doc.addPage();

    // Page label
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`${set.title} — Flashcards`, marginX, 10);
    doc.setTextColor(0);

    for (let i = 0; i < perPage; i++) {
      const idx = p * perPage + i;
      if (idx >= pairs.length) break;

      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = marginX + col * (cardW + gapX);
      const y = marginY + row * (cardH + gapY);
      const pair = pairs[idx];

      // Card border (dashed)
      doc.setDrawColor(180);
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([2, 2], 0);
      doc.roundedRect(x, y, cardW, cardH, 2, 2);
      doc.setLineDashPattern([], 0);

      // Card number
      doc.setFontSize(7);
      doc.setTextColor(180);
      doc.text(`#${idx + 1}`, x + cardW - 8, y + 4);
      doc.setTextColor(0);

      const halfH = cardH / 2;
      const textPad = 4;

      // Top half: prompt (bold)
      doc.setFontSize(10);
      doc.setFont('Helvetica', 'bold');
      const qLines = wrapText(doc, pair.question, cardW - textPad * 2);
      // Auto-shrink if needed
      let qFontSize = 10;
      while (qLines.length * 4.5 > halfH - 8 && qFontSize > 7) {
        qFontSize--;
        doc.setFontSize(qFontSize);
      }
      const qWrapped = wrapText(doc, pair.question, cardW - textPad * 2);
      doc.text(qWrapped, x + textPad, y + 8, { maxWidth: cardW - textPad * 2 });

      // Images in top half
      if (pair.questionImages.length > 0) {
        const imgY = y + 8 + qWrapped.length * 4;
        const availH = halfH - (imgY - y) - 2;
        if (availH > 4) {
          renderImageGrid(doc, pair.questionImages, x + textPad, imgY, cardW - textPad * 2, Math.min(availH, 18));
        }
      }

      // Dashed divider
      doc.setDrawColor(200);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(x + 2, y + halfH, x + cardW - 2, y + halfH);
      doc.setLineDashPattern([], 0);

      // Bottom half: answer (normal)
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      const aLines = wrapText(doc, pair.answer, cardW - textPad * 2);
      let aFontSize = 9;
      while (aLines.length * 4 > halfH - 8 && aFontSize > 7) {
        aFontSize--;
        doc.setFontSize(aFontSize);
      }
      const aWrapped = wrapText(doc, pair.answer, cardW - textPad * 2);
      doc.text(aWrapped, x + textPad, y + halfH + 6, { maxWidth: cardW - textPad * 2 });

      // Images in bottom half
      if (pair.answerImages.length > 0) {
        const imgY = y + halfH + 6 + aWrapped.length * 3.5;
        const availH = cardH - (imgY - y) - 2;
        if (availH > 4) {
          renderImageGrid(doc, pair.answerImages, x + textPad, imgY, cardW - textPad * 2, Math.min(availH, 18));
        }
      }
    }

    // Instruction on first page
    if (p === 0) {
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text('Cut along dashed lines to create individual flashcards.', 105, marginY + rows * (cardH + gapY) + 2, { align: 'center' });
      doc.setTextColor(0);
    }
  }

  save(doc, 'flashcards', set.title);
}

// ---------------------------------------------------------------------------
// 4. Matching Game
// ---------------------------------------------------------------------------

export async function generateMatchingGamePDF(set: StudySet, config: PDFConfig) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const pairs = buildPairs(set, config);

  const cols = 3;
  const tileW = (180 - 3 * 2) / cols; // ~58mm
  const tileH = 38;
  const gapX = 3;
  const gapY = 3;

  // Build tiles: each pair produces a T tile and a D tile
  const tiles = shuffleArray(
    pairs.flatMap((p, i) => [
      { text: p.question, type: 'T' as const, matchNum: i + 1, images: p.questionImages },
      { text: p.answer, type: 'D' as const, matchNum: i + 1, images: p.answerImages },
    ]),
  );

  // First page header
  doc.setFontSize(14);
  doc.setFont('Helvetica', 'bold');
  doc.text('Matching Game', 15, 16);
  doc.setFontSize(8);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`${set.title}  |  Cut out cards. Match each term (T) with its definition (D).`, 15, 22);
  doc.text('Matching numbers in the corners can be used to verify correct pairs.', 15, 27);
  doc.setTextColor(0);

  let y = 33;
  let col = 0;
  let row = 0;

  tiles.forEach((tile) => {
    if (col === 0) y = checkPage(doc, y, tileH + gapY);

    const x = 15 + col * (tileW + gapX);

    // Dashed border
    doc.setDrawColor(160);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([2, 1.5], 0);
    doc.roundedRect(x, y, tileW, tileH, 2, 2);
    doc.setLineDashPattern([], 0);

    // Type badge
    const badgeColor = tile.type === 'T' ? [59, 130, 246] : [16, 185, 129];
    doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
    doc.roundedRect(x + 2, y + 2, 8, 5, 1, 1, 'F');
    doc.setFontSize(7);
    doc.setTextColor(255);
    doc.setFont('Helvetica', 'bold');
    doc.text(tile.type, x + 6, y + 5.5, { align: 'center' });
    doc.setTextColor(0);

    // Match number
    doc.setFontSize(6);
    doc.setTextColor(190);
    doc.setFont('Helvetica', 'normal');
    doc.text(`#${tile.matchNum}`, x + tileW - 3, y + 5.5, { align: 'right' });
    doc.setTextColor(0);

    // Content
    const contentY = y + 10;
    const availH = tileH - 12;
    doc.setFontSize(9);
    doc.setFont('Helvetica', tile.type === 'T' ? 'bold' : 'normal');
    const lines = wrapText(doc, tile.text, tileW - 8);

    // Auto-shrink
    let fontSize = 9;
    while (lines.length * 4 > availH - (tile.images.length > 0 ? 14 : 0) && fontSize > 6) {
      fontSize--;
      doc.setFontSize(fontSize);
    }
    const wrapped = wrapText(doc, tile.text, tileW - 8);
    doc.text(wrapped, x + 4, contentY, { maxWidth: tileW - 8 });

    // Images
    if (tile.images.length > 0) {
      const imgY = contentY + wrapped.length * 3.5 + 1;
      const imgAvail = y + tileH - imgY - 2;
      if (imgAvail > 4) {
        renderImageGrid(doc, tile.images, x + 4, imgY, tileW - 8, Math.min(imgAvail, 12));
      }
    }

    col++;
    if (col >= cols) {
      col = 0;
      row++;
      y += tileH + gapY;
    }
  });

  // Instruction on first page
  doc.setPage(1);
  const tilesOnPage1 = Math.min(tiles.length, cols * 5);
  if (tilesOnPage1 <= cols * 5) {
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text('Cut along dashed lines. Match term cards (T) with definition cards (D).', 105, 285, { align: 'center' });
    doc.setTextColor(0);
  }

  save(doc, 'matching-game', set.title);
}

// ---------------------------------------------------------------------------
// 5. Cut & Glue
// ---------------------------------------------------------------------------

export async function generateCutAndGluePDF(set: StudySet, config: PDFConfig) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const pairs = buildPairs(set, config);

  // Section 1: Definition sheet with glue spaces
  let y = header(doc, 'Cut & Glue Activity', set.title);

  // Student info
  doc.setFontSize(10);
  doc.text('Name: ________________________________________', 15, y);
  y += 6;
  doc.text('Date: _________________', 15, y);
  y += 6;

  // Instruction
  doc.setFontSize(9);
  doc.setTextColor(120);
  const instrText = config.direction === 'def-to-term'
    ? 'Cut out the definitions and glue each one next to its matching term.'
    : 'Cut out the terms and glue each one next to its matching definition.';
  doc.text(instrText, 15, y);
  doc.setTextColor(0);
  y += 8;

  const glueBoxW = 58;
  const contentW = 180 - glueBoxW - 6;
  const itemsPerPage = 8;

  pairs.forEach((pair, i) => {
    if (i > 0 && i % itemsPerPage === 0) {
      doc.addPage();
      y = 20;
    }
    y = checkPage(doc, y, 24);

    // Answer text (left side)
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    const lines = wrapText(doc, `${i + 1}. ${pair.answer}`, contentW);
    doc.text(lines, 15, y);

    let textH = lines.length * 4.5;

    // Answer images
    if (pair.answerImages.length > 0) {
      const imgY = y + textH + 1;
      const ih = renderImageGrid(doc, pair.answerImages, 20, imgY, contentW - 10, 14);
      textH += ih + 1;
    }

    const rowH = Math.max(22, textH + 4);

    // Glue box (right side)
    const boxX = 15 + contentW + 6;
    doc.setDrawColor(160);
    doc.setLineWidth(0.4);
    doc.roundedRect(boxX, y - 3, glueBoxW, rowH, 1.5, 1.5);

    // "Glue here" text
    doc.setFontSize(7);
    doc.setTextColor(210);
    doc.text('Glue here', boxX + glueBoxW / 2, y - 3 + rowH / 2 + 1, { align: 'center' });
    doc.setTextColor(0);

    y += rowH + 4;
  });

  // Section 2: Cut-out terms
  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('Helvetica', 'bold');
  doc.text('Cut Out & Glue', 15, 16);
  doc.setFontSize(8);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(120);
  doc.text('Cut along the dotted lines. Glue each term next to its matching definition.', 15, 22);
  doc.setTextColor(0);

  // Dashed divider
  doc.setDrawColor(150);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(15, 25, 195, 25);
  doc.setLineDashPattern([], 0);

  y = 30;
  const termCols = 3;
  const termW = (180 - 4 * (termCols - 1)) / termCols; // ~58mm
  const termH = 22;
  const termGapX = 4;
  const termGapY = 4;

  const shuffledPairs = shuffleArray(pairs);
  let col = 0;

  shuffledPairs.forEach((pair) => {
    if (col === 0) y = checkPage(doc, y, termH + termGapY);

    const x = 15 + col * (termW + termGapX);

    // Dotted border (heavier for cutting)
    doc.setDrawColor(80);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([2, 2], 0);
    doc.roundedRect(x, y, termW, termH, 1.5, 1.5);
    doc.setLineDashPattern([], 0);

    // Term text (centered, bold)
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    const lines = wrapText(doc, pair.question, termW - 6);
    let fontSize = 9;
    while (lines.length * 4 > termH - 6 && fontSize > 6) {
      fontSize--;
      doc.setFontSize(fontSize);
    }
    const wrapped = wrapText(doc, pair.question, termW - 6);
    const textH = wrapped.length * 3.5;
    const startY = y + (termH - textH) / 2 + 3;
    doc.text(wrapped, x + termW / 2, startY, { align: 'center', maxWidth: termW - 6 });

    // Images
    if (pair.questionImages.length > 0) {
      const imgY = startY + textH;
      const availH = y + termH - imgY - 2;
      if (availH > 4) {
        renderImageGrid(doc, pair.questionImages, x + 4, imgY, termW - 8, Math.min(availH, 10));
      }
    }

    col++;
    if (col >= termCols) {
      col = 0;
      y += termH + termGapY;
    }
  });

  // Instruction at bottom of cut page
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('Cut along dotted lines, then glue each one next to its matching pair.', 105, 285, { align: 'center' });
  doc.setTextColor(0);

  // Answer key
  doc.addPage();
  y = header(doc, 'Answer Key — Cut & Glue', set.title);
  doc.setFontSize(10);

  pairs.forEach((pair, i) => {
    y = checkPage(doc, y, 8);
    let text = `${i + 1}. ${pair.question} = ${pair.answer}`;
    if (pair.equivalentAnswers.length > 0) {
      text += ` (or ${pair.equivalentAnswers.join(', ')})`;
    }
    const lines = wrapText(doc, text, 170);
    doc.text(lines, 15, y);
    y += lines.length * 4.5 + 3;
  });

  save(doc, 'cut-and-glue', set.title);
}

// ---------------------------------------------------------------------------
// 6. Lift the Flap
// ---------------------------------------------------------------------------

export async function generateLiftTheFlapPDF(set: StudySet, config: PDFConfig) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const pairs = buildPairs(set, config);

  const marginX = 12;
  const contentW = 210 - marginX * 2; // 186mm
  const cellH = 28;
  const gapY = 4;
  const glueStripW = 10;
  const itemsPerPage = Math.floor((270 - 25) / (cellH + gapY)); // ~7-8

  // Process pairs in chunks for page pairs
  for (let chunk = 0; chunk < Math.ceil(pairs.length / itemsPerPage); chunk++) {
    const chunkPairs = pairs.slice(chunk * itemsPerPage, (chunk + 1) * itemsPerPage);

    // --- Page 1 of pair: Base Sheet (Answers) ---
    if (chunk > 0) doc.addPage();

    // Header
    doc.setFontSize(11);
    doc.setFont('Helvetica', 'bold');
    doc.text(set.title, marginX, 14);
    doc.setFontSize(7);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(120);
    doc.text('Base Sheet — Answers are revealed when flaps are lifted', marginX, 20);
    doc.setTextColor(0);

    let y = 25;

    chunkPairs.forEach((pair) => {
      // Cell border
      doc.setDrawColor(180);
      doc.setLineWidth(0.3);
      doc.rect(marginX, y, contentW, cellH);

      // Glue strip (right side)
      doc.setFillColor(230);
      doc.rect(marginX + contentW - glueStripW, y, glueStripW, cellH, 'F');
      doc.setDrawColor(180);
      doc.line(marginX + contentW - glueStripW, y, marginX + contentW - glueStripW, y + cellH);

      // "GLUE HERE" rotated text
      doc.setFontSize(6);
      doc.setTextColor(160);
      doc.text('GLUE HERE', marginX + contentW - glueStripW / 2, y + cellH / 2, {
        align: 'center',
        angle: 90,
      });
      doc.setTextColor(0);

      // Answer content (left of glue strip)
      const answerW = contentW - glueStripW - 6;
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      const lines = wrapText(doc, pair.answer, answerW);
      let fontSize = 9;
      while (lines.length * 4 > cellH - 6 && fontSize > 6) {
        fontSize--;
        doc.setFontSize(fontSize);
      }
      const wrapped = wrapText(doc, pair.answer, answerW);
      const textH = wrapped.length * 3.5;
      const textY = y + (cellH - textH) / 2 + 3;
      doc.text(wrapped, marginX + 4, textY, { maxWidth: answerW });

      // Answer images
      if (pair.answerImages.length > 0) {
        const imgY = textY + textH;
        const availH = y + cellH - imgY - 2;
        if (availH > 4) {
          renderImageGrid(doc, pair.answerImages, marginX + 4, imgY, answerW - 4, Math.min(availH, 14));
        }
      }

      y += cellH + gapY;
    });

    // --- Page 2 of pair: Flap Sheet (Questions) ---
    doc.addPage();

    // Instruction
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      'Cut along the dotted lines. Apply glue to the shaded strip on the base sheet, then press the flap onto the matching cell.',
      marginX,
      14,
    );
    doc.setTextColor(0);

    y = 25;

    chunkPairs.forEach((pair) => {
      // Flap border (dashed — cut line)
      doc.setDrawColor(80);
      doc.setLineWidth(0.4);
      doc.setLineDashPattern([2, 2], 0);
      doc.rect(marginX, y, contentW, cellH);
      doc.setLineDashPattern([], 0);

      // Question content (centered in full cell)
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      const lines = wrapText(doc, pair.question, contentW - 10);
      let fontSize = 9;
      while (lines.length * 4 > cellH - 6 && fontSize > 6) {
        fontSize--;
        doc.setFontSize(fontSize);
      }
      const wrapped = wrapText(doc, pair.question, contentW - 10);
      const textH = wrapped.length * 3.5;
      const textY = y + (cellH - textH) / 2 + 3;
      doc.text(wrapped, marginX + contentW / 2, textY, { align: 'center', maxWidth: contentW - 10 });

      // Question images
      if (pair.questionImages.length > 0) {
        const imgY = textY + textH;
        const availH = y + cellH - imgY - 2;
        if (availH > 4) {
          renderImageGrid(doc, pair.questionImages, marginX + 20, imgY, contentW - 40, Math.min(availH, 14));
        }
      }

      y += cellH + gapY;
    });
  }

  save(doc, 'lift-the-flap', set.title);
}
