import { JOURNEY_LINES, getJourneyLine } from '@/lib/journeyLines';

// Journey 2's station names, ported from the web twin in build 25 for the
// iPad zone rail's onward card ("Sarnath to Gorakhpur"). Every line carries
// six, none of them a repeat of journey 1's, and an unknown code still gets
// six placeholders rather than a crash.
describe('journey 2 station names', () => {
  it('gives every line six onward stations, none from journey 1', () => {
    const codes = Object.keys(JOURNEY_LINES);
    expect(codes).toHaveLength(22);
    for (const code of codes) {
      const line = JOURNEY_LINES[code]!;
      expect(line.zones2).toHaveLength(6);
      for (const name of line.zones2) {
        expect(name.trim().length).toBeGreaterThan(0);
        expect(line.zones).not.toContain(name);
      }
    }
  });

  it('continues the Ganga Line from Sarnath to Gorakhpur', () => {
    const hi = getJourneyLine('hi');
    expect(hi.zones2[0]).toBe('Sarnath');
    expect(hi.zones2[5]).toBe('Gorakhpur');
  });

  it('falls back to placeholders for a code with no line', () => {
    expect(getJourneyLine('zz').zones2).toHaveLength(6);
  });
});
