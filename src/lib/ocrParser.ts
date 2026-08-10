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

  // 1. Try numbered list: "1. term - definition" or "1) term - definition".
  // Strip the number prefix, then split on the first space-delimited separator
  // so hyphens/colons inside the term (e-mail, x-ray, ratio a:b) don't mis-split.
  const numberedRegex = /^\d+[.)]\s*(.+)$/;
  const numberedPairs = lines
    .map((line) => {
      const m = numberedRegex.exec(line);
      if (!m) return null;
      return splitTermDefinition(m[1]);
    })
    .filter((p): p is { term: string; definition: string } => p !== null);

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
    .map((line) => splitTermDefinition(line))
    .filter((p): p is { term: string; definition: string } => p !== null);

  if (separatorPairs.length >= 1) {
    return filterValid(separatorPairs);
  }

  return [];
}

/**
 * Splits a line into term/definition on the first space-delimited separator.
 * Requires spaces around the dash (" - ", " – ") or a ": " colon so hyphenated
 * or colon-bearing terms (e-mail, x-ray, ratio a:b) are not split mid-term.
 */
function splitTermDefinition(
  text: string
): { term: string; definition: string } | null {
  // Try " - " first (spaces around the dash avoid splitting hyphenated words)
  const dashIndex = text.indexOf(' - ');
  if (dashIndex > 0) {
    return {
      term: text.slice(0, dashIndex).trim(),
      definition: text.slice(dashIndex + 3).trim(),
    };
  }
  // Try en-dash
  const enDashIndex = text.indexOf(' – ');
  if (enDashIndex > 0) {
    return {
      term: text.slice(0, enDashIndex).trim(),
      definition: text.slice(enDashIndex + 3).trim(),
    };
  }
  // Try colon ("term: definition")
  const colonIndex = text.indexOf(': ');
  if (colonIndex > 0) {
    return {
      term: text.slice(0, colonIndex).trim(),
      definition: text.slice(colonIndex + 2).trim(),
    };
  }
  return null;
}

function filterValid(
  pairs: { term: string; definition: string }[]
): { term: string; definition: string }[] {
  return pairs.filter((p) => p.term.length > 0 && p.definition.length > 0);
}
