// The real ApiError takes (response, data, requestInfo), which needs a whole
// Response to build. The suite mocks it the way home-quiz-gate.test.tsx does,
// so `instanceof` still matches the class the component imports.
jest.mock('@workspace/api-client-react', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super('api error');
      this.status = status;
      this.data = data;
    }
  },
}));

import { shortfallFromSpendError } from '@/components/ChaiWallet';
import { ApiError } from '@workspace/api-client-react';

// ---------------------------------------------------------------------------
// Owner ruling 2026-08-19: a learner who cannot afford something should be told
// HOW MUCH they are short and offered the packs there, rather than a notice
// telling them to go away and earn.
//
// The file used to say "rejections are never paywall moments", and the spirit
// of that survives in what this gates: ONLY a genuine shortfall opens the
// sheet. Every other rejection stays a plain notice, because a shop that
// answers "you already have two of those" by trying to sell you a third is the
// exact thing that note was protecting against.
// ---------------------------------------------------------------------------

function conflict(data: unknown) {
  return new ApiError(409, data);
}

describe('shortfallFromSpendError', () => {
  it('returns the gap when the learner is genuinely short', () => {
    expect(shortfallFromSpendError(conflict({
      error: 'insufficient_tokens', balance: 5, cost: 30,
    }))).toBe(25);
  });

  it('ONLY insufficient_tokens opens the sheet', () => {
    // The other 409s have no purchase that would fix them. Offering packs there
    // would be selling a solution to a problem the learner does not have.
    for (const other of ['pause_max_equipped', 'multiplier_active', 'first_class_horizon']) {
      expect(shortfallFromSpendError(conflict({ error: other, balance: 0, cost: 9 })))
        .toBeNull();
    }
  });

  it('a non-409 is never a shortfall', () => {
    expect(shortfallFromSpendError(new ApiError(500, null))).toBeNull();
    expect(shortfallFromSpendError(new Error('offline'))).toBeNull();
    expect(shortfallFromSpendError(null)).toBeNull();
  });

  it('a zero or negative gap is not a shortfall', () => {
    // The server rejected for a reason it did not name. Offering to sell
    // nothing is worse than the plain notice.
    expect(shortfallFromSpendError(conflict({
      error: 'insufficient_tokens', balance: 30, cost: 30,
    }))).toBeNull();
    expect(shortfallFromSpendError(conflict({
      error: 'insufficient_tokens', balance: 50, cost: 30,
    }))).toBeNull();
  });

  it('missing numbers do not produce a nonsense figure', () => {
    expect(shortfallFromSpendError(conflict({ error: 'insufficient_tokens' }))).toBeNull();
  });
});

describe('THE SHEET STILL NAMES EARNING', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'components', 'ChaiShortfallSheet.tsx'),
    'utf8',
  ) as string;

  it('leads with the number, not the packs', () => {
    expect(src).toContain('You need');
    expect(src.indexOf('You need')).toBeLessThan(src.indexOf('<ChaiPackShop />'));
  });

  it('says practice earns Chai and that road is free', () => {
    // The guard against this becoming a pure paywall moment.
    expect(src).toMatch(/keep riding/i);
    expect(src).toMatch(/free/i);
  });

  it('handles one Chai without saying "1 Chais"', () => {
    expect(src).toContain("'You need 1 more Chai'");
  });
});
