/**
 * feedLineFor is a pure function: no query, no provider, no render. These
 * tests build FeedEntry literals inline and assert the sentence, which is the
 * whole contract the two feed surfaces depend on.
 *
 * Twin of artifacts/gujarati-coach/src/test/feed-copy.test.ts, case for case:
 * the same event must not read differently on the two platforms.
 */
import type { FeedEntry } from '@workspace/api-client-react';
import { feedActorName, feedLineFor } from '@/lib/feedCopy';

function entry(overrides: Partial<FeedEntry> = {}): FeedEntry {
  return {
    id: 1,
    type: 'equip_outfit',
    refId: 'station-cap',
    payload: null,
    createdAt: new Date('2026-08-15T12:00:00.000Z'),
    actor: {
      userId: 'user_1',
      displayName: 'Aakesh',
      equippedOutfit: null,
      equippedAccessory: null,
      firstClassActive: false,
    },
    ...overrides,
  };
}

const NO_NAMES = { itemName: () => null, badgeName: () => null };

describe('feedLineFor', () => {
  it('names the outfit when the catalog resolves it', () => {
    const line = feedLineFor(entry({ type: 'equip_outfit' }), {
      itemName: (id) => (id === 'station-cap' ? 'Station Cap' : null),
    });
    expect(line).toBe('Aakesh put on Station Cap');
  });

  it("falls back to 'something new' when the item does not resolve", () => {
    const line = feedLineFor(entry({ type: 'equip_outfit' }), NO_NAMES);
    expect(line).toBe('Aakesh put on something new');
  });

  it('names the badge when badgeName resolves the key on refId', () => {
    const line = feedLineFor(
      entry({ type: 'badge_earned', refId: 'first_phrase' }),
      {
        itemName: () => null,
        badgeName: (key) => (key === 'first_phrase' ? 'First Words' : null),
      },
    );
    expect(line).toBe('Aakesh earned First Words');
  });

  it("falls back to 'a badge' when badgeName returns null", () => {
    const line = feedLineFor(
      entry({ type: 'badge_earned', refId: 'first_phrase' }),
      NO_NAMES,
    );
    expect(line).toBe('Aakesh earned a badge');
  });

  it("falls back to 'a badge' when badgeName is omitted entirely", () => {
    const line = feedLineFor(
      entry({ type: 'badge_earned', refId: 'first_phrase' }),
      { itemName: () => null },
    );
    expect(line).toBe('Aakesh earned a badge');
  });

  it('describes a zone closeout', () => {
    const line = feedLineFor(
      entry({ type: 'zone_closeout', refId: 'hi:greetings' }),
      NO_NAMES,
    );
    expect(line).toBe('Aakesh finished a zone');
  });

  it('returns null for a type this build does not know', () => {
    const line = feedLineFor(entry({ type: 'invented_later' }), NO_NAMES);
    expect(line).toBeNull();
  });
});

describe('feedActorName', () => {
  it('falls back when the display name is null', () => {
    expect(feedActorName({ displayName: null })).toBe('Fellow learner');
  });

  it('falls back when the display name is only whitespace', () => {
    expect(feedActorName({ displayName: '   ' })).toBe('Fellow learner');
  });
});
