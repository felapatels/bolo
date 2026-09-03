/**
 * Pins for the living zone backdrop, second pass.
 *
 * WHAT IS PINNED is the ZONE-SWITCH RULE and the asset set, not the dissolve.
 * The rule has a right answer: the film changes when the next zone's board
 * reaches the top of the screen, and a boundary that drifts by one board shows
 * the wrong street behind the wrong stops. The dissolve is a look, and a look
 * is checked in the simulator, phone and iPad both, before any build.
 */
import { describe, it, expect } from '@jest/globals';
import {
  ZONE_FILM,
  ZONE_FILM_COUNT,
  ZONE_FILM_TONES,
  ZONE_FILM_CROSSFADE_MS,
  filmZoneFor,
  zoneFilmTone,
} from '../lib/zoneBackdrops';

// The shape the journey feeds in: the content y where each zone begins.
const TOPS = [0, 1000, 2200, 3400, 4600, 5800];

describe('the zone films themselves', () => {
  it('there are six, one per fare zone, and six tones to match', () => {
    expect(ZONE_FILM_COUNT).toBe(6);
    expect(ZONE_FILM_TONES).toHaveLength(6);
  });

  it('every film resolves to a real bundled asset', () => {
    // A require() that missed returns undefined rather than throwing, and the
    // layer would then show a tone with no film over it, which looks like a
    // deliberate flat backdrop and gets shipped.
    for (let i = 0; i < 6; i++) {
      expect(ZONE_FILM(i)).toBeDefined();
      expect(ZONE_FILM(i)).not.toBeNull();
    }
  });

  it('every tone is a measured hex, and no two are the same', () => {
    for (const tone of ZONE_FILM_TONES) expect(tone).toMatch(/^#[0-9A-F]{6}$/);
    expect(new Set(ZONE_FILM_TONES).size).toBe(6);
  });

  it('past the end of the set there is no film and a safe tone', () => {
    expect(ZONE_FILM(6)).toBeNull();
    expect(ZONE_FILM(-1)).toBeNull();
    expect(zoneFilmTone(99)).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe('filmZoneFor: which film is on screen', () => {
  it('the top of the map is zone 0, including rubber-band overscroll', () => {
    expect(filmZoneFor(0, TOPS)).toBe(0);
    expect(filmZoneFor(-40, TOPS)).toBe(0);
  });

  it('THE RULE: the film changes exactly at the zone top, not before', () => {
    expect(filmZoneFor(999, TOPS)).toBe(0);
    expect(filmZoneFor(1000, TOPS)).toBe(1);
    expect(filmZoneFor(2199, TOPS)).toBe(1);
    expect(filmZoneFor(2200, TOPS)).toBe(2);
  });

  it('every boundary in the set switches, none is skipped', () => {
    TOPS.forEach((top, i) => {
      expect(filmZoneFor(top, TOPS)).toBe(i);
      if (i > 0) expect(filmZoneFor(top - 1, TOPS)).toBe(i - 1);
    });
  });

  it('scrolling past the last zone stays on the last film', () => {
    expect(filmZoneFor(99999, TOPS)).toBe(5);
  });

  it('never returns a zone with no film, however many tops it is given', () => {
    // Journey 2 has the same six-zone shape, so a caller could hand over
    // twelve tops. Returning 7 there would render nothing at all.
    const twelve = Array.from({ length: 12 }, (_, i) => i * 1000);
    expect(filmZoneFor(11_000, twelve)).toBe(5);
    expect(ZONE_FILM(filmZoneFor(11_000, twelve))).not.toBeNull();
  });

  it('an empty or single-zone map does not crash', () => {
    expect(filmZoneFor(500, [])).toBe(0);
    expect(filmZoneFor(500, [0])).toBe(0);
  });
});

describe('the crossfade', () => {
  it('is long enough to read as a dissolve and short enough not to drag', () => {
    expect(ZONE_FILM_CROSSFADE_MS).toBeGreaterThanOrEqual(400);
    expect(ZONE_FILM_CROSSFADE_MS).toBeLessThanOrEqual(1500);
  });
});
