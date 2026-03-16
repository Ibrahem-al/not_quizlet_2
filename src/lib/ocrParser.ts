/**
 * Parses OCR-extracted text into term-definition pairs.
 * Attempts multiple formats in order of specificity.
 */
export function parseOCRText(
  text: string
): { term: string; definition: string }[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  // 1. Try numbered list: "1. term - definition" or "1) term - definition"
  const numberedRegex = /^\d+[.)]\s*(.+?)\s*[-–:]\s*(.+)$/;
  const numberedPairs = lines
    .map((line) => numberedRegex.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ term: m[1].trim(), definition: m[2].trim() }));

  if (numberedPairs.length >= 2) {
    return filterValid(numberedPairs);
  }

  // 2. Try tab-separated
  const tabPairs = lines
    .filter((line) => line.includes('\t'))
    .map((line) => {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        return { term: parts[0].trim(), definition: parts.slice(1).join(' ').trim() };
      }
      return null;
    })
    .filter((p): p is { term: string; definition: string } => p !== null);

  if (tabPairs.length >= 2) {
    return filterValid(tabPairs);
  }

  // 3. Try dash or colon separated: "term - definition" or "term: definition"
  const separatorPairs = lines
    .map((line) => {
      // Try " - " first (with spaces around dash to avoid splitting hyphenated words)
      const dashIndex = line.indexOf(' - ');
      if (dashIndex > 0) {
        return {
          term: line.slice(0, dashIndex).trim(),
          definition: line.slice(dashIndex + 3).trim(),
        };
      }
      // Try en-dash
      const enDashIndex = line.indexOf(' – ');
      if (enDashIndex > 0) {
        return {
          term: line.slice(0, enDashIndex).trim(),
          definition: line.slice(enDashIndex + 3).trim(),
        };
      }
      // Try colon
      const colonIndex = line.indexOf(': ');
      if (colonIndex > 0) {
        return {
          term: line.slice(0, colonIndex).trim(),
          definition: line.slice(colonIndex + 2).trim(),
        };
      }
      return null;
    })
    .filter((p): p is { term: string; definition: string } => p !== null);

  if (separatorPairs.length >= 1) {
    return filterValid(separatorPairs);
  }

  return [];
}

function filterValid(
  pairs: { term: string; definition: string }[]
): { term: string; definition: string }[] {
  return pairs.filter((p) => p.term.length > 0 && p.definition.length > 0);
}
