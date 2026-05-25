// _shared/word-count.ts
// CJK-aware word/character counting for OCR pipelines.
//
// Chinese, Japanese (kanji/kana), and Korean text is billed per character
// (each character ~ 1 translatable unit). Latin-script text is billed per
// word. Mixed documents get a combined count.

// CJK ideographs, kana, and Hangul — translatable content only (no punctuation).
// Ranges: CJK Unified Ideographs, Extension A/B/C/D, Compatibility,
//         Hiragana, Katakana, Hangul Syllables, Hangul Jamo.
const CJK_RANGE =
  /[぀-ゟ゠-ヿ㐀-䶿一-鿿가-힯豈-﫿]/g;

export const WORDS_PER_PAGE_LATIN = 225;
export const CHARS_PER_PAGE_CJK = 500;

/**
 * Count translatable units in text.
 * - CJK characters (ideographs + kana + Hangul) counted individually (1 char = 1 unit).
 * - Non-CJK tokens counted by whitespace splitting (standard word count).
 * - CJK punctuation is NOT counted — only content characters.
 */
export function countWords(text: string): number {
  if (!text) return 0;

  const cjkMatches = text.match(CJK_RANGE);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  const nonCjkText = text.replace(CJK_RANGE, " ");
  const nonCjkCount = nonCjkText
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  return cjkCount + nonCjkCount;
}

/**
 * True if a language code represents a CJK script language.
 * Accepts ISO 639-1 (zh, ja, ko) and subtags (zh-Hans, zh-TW, etc.).
 */
export function isCjkLanguage(langCode: string | null | undefined): boolean {
  if (!langCode) return false;
  const base = langCode.toLowerCase().split("-")[0].split("_")[0];
  return base === "zh" || base === "ja" || base === "ko";
}

/**
 * Return the appropriate words-per-page divisor for billing.
 * CJK: 500 characters/page. Latin/other: 225 words/page.
 */
export function getWordsPerPage(langCode: string | null | undefined): number {
  return isCjkLanguage(langCode) ? CHARS_PER_PAGE_CJK : WORDS_PER_PAGE_LATIN;
}

/**
 * Detect CJK from raw text content when language metadata is unavailable.
 * Returns "zh" if ≥ 30% of non-whitespace characters are CJK ideographs/kana/Hangul.
 */
export function detectLanguageFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const stripped = text.replace(/\s+/g, "");
  if (stripped.length < 5) return null;
  const cjkMatches = stripped.match(CJK_RANGE);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  return cjkCount / stripped.length >= 0.3 ? "zh" : null;
}

/**
 * Determine the dominant language from an array of per-page language detections.
 * Falls back to text-based CJK detection when no language metadata is available.
 */
export function getDominantLanguage(
  pages: Array<{ detectedLanguage: string | null; rawText?: string }>
): string | null {
  const counts = new Map<string, number>();
  for (const p of pages) {
    if (p.detectedLanguage) {
      const lang = p.detectedLanguage.toLowerCase();
      counts.set(lang, (counts.get(lang) || 0) + 1);
    }
  }
  if (counts.size === 0) {
    // No language metadata — detect from text content
    const allText = pages.map((p) => p.rawText || "").join(" ");
    return detectLanguageFromText(allText);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
}
