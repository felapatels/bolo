import {
  CHAT_FOLLOWUP_CHIPS,
  CHAT_STARTER_CHIPS,
  chatChipsFor,
} from '@/lib/chatChips';

describe('the chat quick chips', () => {
  // Parked as work-queue item 11 and asked for on 2026-08-26. The design note
  // worth keeping is that the two sets are DIFFERENT, and these pin it.
  it('offers openers to an empty screen and follow-ups after that', () => {
    // WAS toBe ON THE ARRAY ITSELF, inverted 2026-08-27 when the row started
    // shuffling: the set is now a reordered copy, so identity is the wrong
    // question and MEMBERSHIP is the right one. The rule being pinned has
    // not changed at all, only the way the row is handed over.
    const sameSet = (got: readonly string[], want: readonly string[]) =>
      expect([...got].sort()).toEqual([...want].sort());
    sameSet(chatChipsFor(0), CHAT_STARTER_CHIPS);
    sameSet(chatChipsFor(1), CHAT_FOLLOWUP_CHIPS);
    sameSet(chatChipsFor(12), CHAT_FOLLOWUP_CHIPS);
  });

  it('shuffles, and holds the order still for the whole of one turn', () => {
    // The shuffle is SEEDED by the message count, and both halves of that
    // matter. Unseeded, the row would reorder on every render and a chip
    // would move out from under a finger mid-tap; unshuffled, with ten per
    // set and three on screen, nobody ever meets the last six.
    expect(chatChipsFor(4)).toEqual(chatChipsFor(4));
    const orders = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => chatChipsFor(n).join('|')),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('never offers a follow-up to somebody who has heard nothing', () => {
    // "Say that slower" on an empty screen is nonsense, and it is the exact
    // failure a single flat list would have shipped.
    for (const chip of CHAT_STARTER_CHIPS) {
      expect(CHAT_FOLLOWUP_CHIPS).not.toContain(chip);
    }
  });

  it('keeps every chip short enough to read at a glance', () => {
    // THE CAP ON SET SIZE IS GONE, AND THE REASONING BEHIND IT IS NOT.
    // It was four per set, because "past four the learner is reading instead
    // of talking". The owner asked for more suggestions on 2026-08-27, and
    // what actually protected that rule was never the SET size: the row
    // scrolls horizontally and seats about three at a time, so how many a
    // learner reads at once is set by the screen, not by this array. The
    // shuffle is what makes a longer set reachable without scrolling.
    //
    // What still has to hold is that no single chip is a paragraph, and
    // that is pinned harder than before because there are more of them.
    for (const chip of [...CHAT_STARTER_CHIPS, ...CHAT_FOLLOWUP_CHIPS]) {
      expect(chip.length).toBeLessThanOrEqual(34);
    }
    // A set nobody could scroll to the end of is a different failure; this
    // catches somebody pasting in fifty.
    expect(CHAT_STARTER_CHIPS.length).toBeLessThanOrEqual(12);
    expect(CHAT_FOLLOWUP_CHIPS.length).toBeLessThanOrEqual(12);
  });
});
