/**
 * THE ONE-PAGER MAP'S POSTER (build 20).
 *
 * One painted poster per language, generated to a fixed brief (the line
 * name, the six cities in the language's own script, the six zones, no
 * numbers anywhere but the zone badges), served from the web app's public
 * folder rather than bundled: twenty-two posters would weigh more than the
 * rest of the app's art together, and a language's poster can be replaced
 * without a build. The phone loads it by URL and falls back to a drawn
 * placeholder when the file is not there yet. Web twin: lib/journey-map.ts.
 *
 * THE COUNTS ARE NEVER IN THE ART. Stops per zone differ per language and
 * grow as the replenisher opens groups (owner, 2026-08-29), so the legend
 * under the poster draws them live from the same payloads the journey uses.
 */
import { useEffect, useState } from 'react';

export const JOURNEY_MAP_POSTER_ORIGIN = 'https://bolo-india.app';

/** Width over height. The brief asks for 9:16 portrait. */
export const JOURNEY_MAP_POSTER_ASPECT = 9 / 16;

export function journeyMapPosterUrl(languageCode: string): string {
  return `${JOURNEY_MAP_POSTER_ORIGIN}/journey/maps/${encodeURIComponent(languageCode)}.jpg`;
}

export function journeyMapBoardsUrl(languageCode: string): string {
  return `${JOURNEY_MAP_POSTER_ORIGIN}/journey/maps/${encodeURIComponent(languageCode)}.json`;
}

/**
 * THE POSTER CARRIES NO TEXT; THE APP WRITES THE WORDS (owner ruling,
 * 2026-08-29). Every text-bearing poster the generator made came back with
 * a wrong city, a borrowed row or a misspelt sign, so the art has empty
 * boards and the words come from here and from the API. A poster's boards
 * are found once by scripts/detect-journey-boards.py (web package) and
 * published beside it as <code>.json, boxes as fractions of the image so
 * any size works. No JSON means an older poster with painted text: it
 * renders as-is with nothing written over it.
 */
export interface JourneyMapBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface JourneyMapBoards {
  /** The poster's pixel size the boxes were measured on. */
  size: [number, number];
  title: JourneyMapBox | null;
  greeting: JourneyMapBox | null;
  bottom: JourneyMapBox | null;
  badge: JourneyMapBox | null;
  /** The six zone panels, journey order. */
  zones: (JourneyMapBox | null)[];
  /** The small dark disc on each panel's corner for its number. */
  numbers: (JourneyMapBox | null)[];
  /** The six station signs, top to bottom. */
  signs: (JourneyMapBox | null)[];
  /** Each panel's round medallion; the app draws the zone's icon in it. */
  medallions: (JourneyMapBox | null)[];
  /**
   * True for the early posters whose medallions carry painted pictures (the
   * app draws nothing in them); false for text-free posters with empty discs.
   * Absent in a file means painted, the safe reading.
   */
  iconsPainted: boolean;
}

/** One line under each zone's name on the poster; {language} is filled in. */
export const JOURNEY_MAP_ZONE_BLURBS: readonly string[] = [
  'Learn how to greet, be polite and introduce yourself.',
  'Words for family members and people you love.',
  'Count, learn and use numbers in {language}.',
  'Food, drinks and eating together.',
  "Useful words you'll use every day.",
  'Learn words to express how you feel.',
];

export function journeyMapZoneBlurb(zoneIndex: number, languageName: string): string {
  return (JOURNEY_MAP_ZONE_BLURBS[zoneIndex] ?? '').replace('{language}', languageName);
}

export function journeyMapWelcome(languageName: string): string {
  return `Welcome to your ${languageName} journey. Everyday words, step by step.`;
}

export function journeyMapTagline(languageName: string): string {
  return `Learn a little every day, speak with confidence, and make ${languageName} a part of your life.`;
}

/** Parses a boards file; anything not shaped like one is treated as absent. */
export function parseJourneyMapBoards(raw: unknown): JourneyMapBoards | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const box = (v: unknown): JourneyMapBox | null => {
    if (!v || typeof v !== 'object') return null;
    const b = v as Record<string, unknown>;
    const nums = [b.x, b.y, b.w, b.h];
    return nums.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? { x: b.x as number, y: b.y as number, w: b.w as number, h: b.h as number }
      : null;
  };
  const list = (v: unknown, n: number): (JourneyMapBox | null)[] =>
    Array.from({ length: n }, (_, i) => (Array.isArray(v) ? box(v[i]) : null));
  const size = r.size;
  if (!Array.isArray(size) || size.length !== 2 || !size.every((n) => typeof n === 'number' && n > 0)) {
    return null;
  }
  return {
    size: [size[0] as number, size[1] as number],
    title: box(r.title),
    greeting: box(r.greeting),
    bottom: box(r.bottom),
    badge: box(r.badge),
    zones: list(r.zones, 6),
    numbers: list(r.numbers, 6),
    signs: list(r.signs, 6),
    medallions: list(r.medallions, 6),
    iconsPainted: r.iconsPainted !== false,
  };
}

/**
 * The boards for a language's poster, or null while loading and for a
 * poster that has none. Plain fetch rather than react-query: it is one small
 * static file beside the image, cached by the OS like the image is.
 */
export function useJourneyMapBoards(languageCode: string): JourneyMapBoards | null {
  const [boards, setBoards] = useState<JourneyMapBoards | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBoards(null);
    fetch(journeyMapBoardsUrl(languageCode))
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setBoards(parseJourneyMapBoards(json));
      })
      .catch(() => {
        if (!cancelled) setBoards(null);
      });
    return () => {
      cancelled = true;
    };
  }, [languageCode]);
  return boards;
}
