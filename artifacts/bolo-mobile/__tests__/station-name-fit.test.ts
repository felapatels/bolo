// THE STATION NAME MUST SHRINK, NOT CUT.
//
// Flagged by the owner on 2026-08-27 (chat 12) before it ever shipped: "if the
// zone name is long, make sure the text shrinks and doesn't eat up the boarding
// pass." It is not hypothetical. The line table already ships
// "Thiruvananthapuram Central" at 26 characters, which at the card's 19pt is
// roughly 290 points of type in a column about 140 wide.
//
// `numberOfLines` shrinks nothing, it cuts, and this app's standing rule is
// that a fitted string is shortened by whole words or scaled down, never
// ellipsized mid-word. These cases pin the arithmetic against the REAL longest
// names in the table rather than invented ones.
import {
  STATION_FONT_MAX,
  STATION_FONT_MIN,
  stationFontSize,
} from '@/components/journey/JourneyPassCard';

/** The station column on a full-bleed board at iPhone widths, measured. */
const COLUMN = 137;
/** The same 0.58em per glyph the fit is built on. */
const runOf = (text: string, size: number) => text.length * size * 0.58;

describe('the station name is fitted to its column', () => {
  it('leaves an ordinary name at full size', () => {
    expect(stationFontSize('New Delhi', COLUMN)).toBe(STATION_FONT_MAX);
    expect(stationFontSize('Aligarh', COLUMN)).toBe(STATION_FONT_MAX);
  });

  it('shrinks the worst name in the line table until its longest word fits', () => {
    // The real one, and the reason this file exists.
    const size = stationFontSize('Thiruvananthapuram Central', COLUMN);
    expect(size).toBeLessThan(STATION_FONT_MAX);
    expect(size).toBeGreaterThanOrEqual(STATION_FONT_MIN);
    // THE BINDING CONSTRAINT IS THE LONGEST WORD, not the whole string: a word
    // that overruns the column breaks mid-word, which is the one outcome the
    // rule forbids. Two lines are allowed; a broken word is not.
    expect(runOf('Thiruvananthapuram', size)).toBeLessThanOrEqual(COLUMN);
  });

  it('is bound by the SECOND word when that is the long one', () => {
    // "Bolpur Shantiniketan" fails the other way round, which is why the fit
    // measures the longest word rather than the first.
    const size = stationFontSize('Bolpur Shantiniketan', COLUMN);
    expect(runOf('Shantiniketan', size)).toBeLessThanOrEqual(COLUMN);
  });

  it('keeps every real zone name inside its column at two lines', () => {
    // Whole-table sweep. If a name is ever added that this cannot fit, this
    // fails here rather than on a screenshot after a build.
    const { JOURNEY_LINES } = require('@/lib/journeyLines');
    const names: string[] = Object.values(JOURNEY_LINES as Record<string, { zones: string[] }>)
      .flatMap((line) => line.zones);
    expect(names.length).toBeGreaterThan(50);
    for (const name of names) {
      const size = stationFontSize(name, COLUMN);
      const longest = name.trim().split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), '');
      expect(runOf(longest, size)).toBeLessThanOrEqual(COLUMN);
      expect(runOf(name.trim(), size)).toBeLessThanOrEqual(COLUMN * 2);
      expect(size).toBeGreaterThanOrEqual(STATION_FONT_MIN);
      expect(size).toBeLessThanOrEqual(STATION_FONT_MAX);
    }
  });

  it('never returns something unrenderable for a degenerate measure', () => {
    // Before onLayout has reported, the column is 0. Full size is the honest
    // answer for one frame; a zero or a negative font size is not.
    expect(stationFontSize('New Delhi', 0)).toBe(STATION_FONT_MAX);
    expect(stationFontSize('', COLUMN)).toBe(STATION_FONT_MAX);
    expect(stationFontSize('Thiruvananthapuram Central', 4)).toBe(STATION_FONT_MIN);
  });
});
