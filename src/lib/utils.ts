export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent?.trim() ?? '';
}

export function hasTextContent(content: string): boolean {
  const text = stripHtml(content);
  return text.length > 0;
}

export function isImageOnly(content: string): boolean {
  const div = document.createElement('div');
  div.innerHTML = content;
  const hasImg = div.querySelector('img') !== null;
  const text = div.textContent?.trim() ?? '';
  return hasImg && text.length === 0;
}

export function hasContent(card: { term: string; definition: string }): boolean {
  return hasTextContent(card.term) || isImageOnly(card.term) ||
         hasTextContent(card.definition) || isImageOnly(card.definition);
}

export function hasTermContent(card: { term: string }): boolean {
  return hasTextContent(card.term) || isImageOnly(card.term);
}

export function hasDefinitionContent(card: { definition: string }): boolean {
  return hasTextContent(card.definition) || isImageOnly(card.definition);
}

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 10);
  const t = Math.floor((seconds % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}

export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function normalizeAnswer(text: string): string {
  return stripHtml(text).toLowerCase().trim().replace(/\s+/g, ' ');
}

export function gradeAnswer(userAnswer: string, correctAnswers: string[]): boolean {
  const normalized = normalizeAnswer(userAnswer);
  if (!normalized) return false;
  return correctAnswers.some(correct => {
    const norm = normalizeAnswer(correct);
    if (normalized === norm) return true;
    const maxLen = Math.max(normalized.length, norm.length);
    if (maxLen === 0) return false;
    const dist = levenshteinDistance(normalized, norm);
    const threshold = maxLen <= 4 ? 0 : maxLen <= 8 ? 1 : Math.floor(maxLen * 0.15);
    return dist <= threshold;
  });
}

/**
 * Fair card repetition: returns `count` cards from the pool, repeating evenly.
 * No card appears N+1 times unless every card has appeared N times.
 */
export function fairRepeatCards<T>(items: T[], count: number): T[] {
  if (count <= 0) return [];
  if (count <= items.length) return shuffleArray(items).slice(0, count);
  const result: T[] = [];
  while (result.length < count) {
    result.push(...shuffleArray(items));
  }
  return result.slice(0, count);
}

export function compressImage(file: File | Blob, maxSizeKB = 500): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxDim = 1024;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width *= ratio;
          height *= ratio;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.8;
        let result = canvas.toDataURL('image/jpeg', quality);
        while (result.length > maxSizeKB * 1024 * 1.37 && quality > 0.1) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(result);
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Re-compress base64 image via Canvas. Returns compressed data URI. */
function recompressBase64(dataUri: string, maxDim = 1024, maxSizeKB = 500): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width *= ratio;
        height *= ratio;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.7;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > maxSizeKB * 1024 * 1.37 && quality > 0.1) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.onerror = () => resolve(dataUri); // keep original on error
    img.src = dataUri;
  });
}

/** Find all base64 images in HTML and re-compress any over 500 KB. */
export async function compressBase64InHtml(html: string): Promise<string> {
  const regex = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
  const matches = html.match(regex);
  if (!matches) return html;

  let result = html;
  for (const match of matches) {
    // ~750 KB in base64 chars ≈ 500 KB decoded
    if (match.length > 500 * 1024 * 1.37) {
      const compressed = await recompressBase64(match);
      if (compressed.length < match.length) {
        result = result.replace(match, compressed);
      }
    }
  }
  return result;
}

export const FOLDER_COLORS: Record<string, string> = {
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  pink: '#ec4899',
  teal: '#14b8a6',
  gray: '#6b7280',
};
