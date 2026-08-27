import { allAccessBenefits } from '@/app/(app)/paywall';

/**
 * The chai drop on the paywall.
 *
 * The figure is SERVED, never a literal, because tokenEconomy.ts owns every
 * economy number and this one already moved once (50 to 15) server-side
 * precisely so no client release was needed. These pin the two things that
 * would undo that: a hardcoded number creeping back in, and the row rendering
 * a blank where a figure should be while the query is still in flight.
 */
describe('the paywall chai benefit', () => {
  it('renders the served figure, whatever it is', () => {
    const row = allAccessBenefits(15).find((b) =>
      b.title.startsWith('Free Chai Drop'),
    );
    expect(row).toBeDefined();
    expect(row!.desc).toBe('15 Chai to spend in BOLO Bazaar');
  });

  it('follows the server if the allowance ever changes again', () => {
    // The regression guard. If somebody replaces this with a literal, the
    // number below stops tracking and this fails.
    const row = allAccessBenefits(40).find((b) =>
      b.title.startsWith('Free Chai Drop'),
    );
    expect(row!.desc).toBe('40 Chai to spend in BOLO Bazaar');
  });

  it('shows no chai row at all until the figure has loaded', () => {
    // A paywall promising "null Chai" or a bare "Chai to spend" is worse than
    // one that never mentioned the benefit.
    for (const missing of [null, 0]) {
      const rows = allAccessBenefits(missing);
      expect(rows.some((b) => b.title.startsWith('Free Chai Drop'))).toBe(false);
      // The other five survive, so a slow query never empties the list.
      expect(rows.length).toBe(5);
    }
  });
});
