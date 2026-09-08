import { allAccessBenefits } from '@/app/(app)/paywall';

/**
 * The Chai benefit on the paywall.
 *
 * INVERTED 2026-09-08. It used to advertise a MONTHLY ALLOWANCE, "Free Chai
 * Drop Every Month", and the owner killed that: All-Access now gets a
 * multiplier on the daily gift instead. The trade is deliberately generous, 15
 * Chai a month lost against roughly 225 gained, so this is a raise dressed as a
 * removal.
 *
 * WHAT SURVIVES UNCHANGED IS THE THING WORTH PINNING, and it is why these are
 * inverted rather than deleted: the figure is SERVED, never a literal, because
 * tokenEconomy.ts owns every economy number. The allowance already moved once
 * that way (50 to 15) precisely so no client release was needed, and the
 * multiplier inherits the same property. These pin the two things that would
 * undo it: a hardcoded number creeping back in, and the row rendering
 * something meaningless while the query is still in flight.
 *
 * THE `> 1` GUARD IS ALSO WHAT RETIRES THE OLD COPY FOR FREE. Every build
 * already in the stores drops this row when the served figure is not above its
 * floor, and the dead allowance now answers 0, so those builds stop advertising
 * it with no release at all.
 */
describe('the paywall Chai benefit', () => {
  it('renders the served multiplier, whatever it is', () => {
    const row = allAccessBenefits(2).find((b) => b.title.includes('Daily Gift'));
    expect(row).toBeDefined();
    expect(row!.title).toBe('2X Daily Gifts!');
    expect(row!.desc).toBe('Every gift you open pays 2 times, in Chai for the Bazaar');
  });

  it('follows the server if the multiplier ever changes again', () => {
    // The regression guard. If somebody replaces this with a literal "2", the
    // number below stops tracking and this fails.
    const row = allAccessBenefits(3).find((b) => b.title.includes('Daily Gift'));
    expect(row!.title).toBe('3X Daily Gifts!');
    expect(row!.desc).toBe('Every gift you open pays 3 times, in Chai for the Bazaar');
  });

  it('shows no multiplier row at all when there is no multiplier', () => {
    // A paywall promising "1X Daily Gifts" is advertising the thing everybody
    // already has, and one promising "nullX" is worse than saying nothing.
    // 1 is included deliberately: it is what a Free learner's own draw reports,
    // and it must never render as a benefit.
    for (const missing of [null, 0, 1]) {
      const rows = allAccessBenefits(missing);
      expect(rows.some((b) => b.title.includes('Daily Gift'))).toBe(false);
      // The other five survive, so a slow query never empties the list.
      expect(rows.length).toBe(5);
    }
  });

  it('no longer advertises the monthly allowance anywhere', () => {
    // The allowance is dead. A paywall that still names it is advertising
    // something that no longer happens, which is the half of this change most
    // likely to be forgotten.
    for (const value of [null, 0, 1, 2, 15]) {
      for (const row of allAccessBenefits(value)) {
        expect(row.title).not.toMatch(/Chai Drop/i);
        expect(row.title).not.toMatch(/Every Month/i);
      }
    }
  });
});
