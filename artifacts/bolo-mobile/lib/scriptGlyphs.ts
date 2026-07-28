/**
 * Glyph sets for script confetti (Spec 1 v3 §4.1).
 *
 * Resolves a language code to 8–12 representative letterforms of its script,
 * reusing the existing Script Trace script-family mapping (LANG_CHAPTER_IDS)
 * and chapter data. This module defines NO mapping of its own.
 *
 * Returns [] when no glyph set is available — callers fall back to shape
 * confetti.
 */
import {
  LANG_CHAPTER_IDS,
  SCRIPT_TRACE_CHAPTERS,
} from '@/lib/game-data/script-trace-chapters';

const MAX_GLYPHS = 12;

export function glyphsForLanguage(languageCode: string): string[] {
  const chapterIds = LANG_CHAPTER_IDS[languageCode] ?? [];
  if (chapterIds.length === 0) return [];

  const glyphs = new Set<string>();
  for (const chapter of SCRIPT_TRACE_CHAPTERS) {
    if (!chapterIds.includes(chapter.id) || chapter.stage !== 'alphabet') continue;
    for (const character of chapter.characters) {
      const glyph = character.char.trim();
      // Single letterforms only — confetti is glanced at, not read.
      if (glyph.length >= 1 && glyph.length <= 2) glyphs.add(glyph);
      if (glyphs.size >= MAX_GLYPHS) return [...glyphs];
    }
  }
  return [...glyphs];
}
