// THE COPY RULES, ASSERTED RATHER THAN JUST WRITTEN DOWN.
//
// Bolo says one of these when a hold carried no speech. Asked for on
// 2026-08-27 (chat 12): "I want to make Bolo funnier, like I know chicks that
// can speak louder than you... funny always, but not cheesy." The first line is
// the owner's own and the rest were written to hold to it.
//
// A rule that only lives in a comment is a rule the next person adding a line
// will not read, and the failure is silent: nobody notices a fifth line with
// three exclamation marks until it is on a child's screen.
import { CANT_HEAR_LINES, pickCantHearLine } from '@/lib/cantHearLines';

describe("what Bolo says when he heard nothing", () => {
  it("keeps the owner's own line, exactly as he wrote it", () => {
    // It sets the register for every other line, so it is the one that must
    // not drift into someone else's idea of the same joke.
    expect(CANT_HEAR_LINES).toContain('I know chicks that can speak louder than you.');
  });

  it('has enough lines to read as a rotation rather than a catchphrase', () => {
    expect(CANT_HEAR_LINES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(CANT_HEAR_LINES).size).toBe(CANT_HEAR_LINES.length);
  });

  it('never shouts and never uses emoji, which is what reads as cheesy', () => {
    for (const line of CANT_HEAR_LINES) {
      // One exclamation mark is a choice; two is a personality made of them.
      expect((line.match(/!/g) ?? []).length).toBeLessThanOrEqual(1);
      // The rest of this screen's copy leans on emoji and it is exactly the
      // thing that makes it read as an app talking rather than a bird.
      expect(/\p{Extended_Pictographic}/u.test(line)).toBe(false);
    }
  });

  it('never mentions the learner\'s ability, only the silence', () => {
    // Volume is fair game because being quiet is not a mistake. Accent,
    // pronunciation and effort are not, because those are, and these learners
    // are often children and often shy.
    const forbidden = /accent|pronunc|wrong|bad|mistake|try harder|practice more/i;
    for (const line of CANT_HEAR_LINES) {
      expect(forbidden.test(line)).toBe(false);
    }
  });

  it('stays short enough to read at a glance', () => {
    for (const line of CANT_HEAR_LINES) {
      expect(line.length).toBeLessThanOrEqual(90);
    }
  });

  it('never repeats the line it just used', () => {
    // A five-line rotation that can repeat immediately reads as a two-line one.
    let previous = '';
    for (let i = 0; i < 40; i++) {
      const next = pickCantHearLine();
      expect(next).not.toBe(previous);
      expect(CANT_HEAR_LINES).toContain(next);
      previous = next;
    }
  });
});
