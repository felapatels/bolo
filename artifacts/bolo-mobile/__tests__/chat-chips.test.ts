import {
  CHAT_FOLLOWUP_CHIPS,
  CHAT_STARTER_CHIPS,
  chatChipsFor,
} from '@/lib/chatChips';

describe('the chat quick chips', () => {
  // Parked as work-queue item 11 and asked for on 2026-08-26. The design note
  // worth keeping is that the two sets are DIFFERENT, and these pin it.
  it('offers openers to an empty screen and follow-ups after that', () => {
    expect(chatChipsFor(0)).toBe(CHAT_STARTER_CHIPS);
    expect(chatChipsFor(1)).toBe(CHAT_FOLLOWUP_CHIPS);
    expect(chatChipsFor(12)).toBe(CHAT_FOLLOWUP_CHIPS);
  });

  it('never offers a follow-up to somebody who has heard nothing', () => {
    // "Say that slower" on an empty screen is nonsense, and it is the exact
    // failure a single flat list would have shipped.
    for (const chip of CHAT_STARTER_CHIPS) {
      expect(CHAT_FOLLOWUP_CHIPS).not.toContain(chip);
    }
  });

  it('keeps both sets short enough to read at a glance', () => {
    // A chip row is scaffolding, not a menu. Past four the learner is reading
    // instead of talking, which is the thing the chips exist to avoid.
    expect(CHAT_STARTER_CHIPS.length).toBeLessThanOrEqual(4);
    expect(CHAT_FOLLOWUP_CHIPS.length).toBeLessThanOrEqual(4);
    for (const chip of [...CHAT_STARTER_CHIPS, ...CHAT_FOLLOWUP_CHIPS]) {
      expect(chip.length).toBeLessThanOrEqual(28);
    }
  });
});
