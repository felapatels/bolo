import { describe, expect, it } from 'vitest';
import {
  MARKETING_CONSENT_TEXT,
  parkMarketingChoice,
  shouldApplyParkedChoice,
  takeParkedMarketingChoice,
  hasMarketingConsent,
  marketingEmailsRecord,
  readMarketingEmails,
} from './marketingConsent';

describe('marketing email consent', () => {
  it('records the answer, the moment, the place and the exact wording', () => {
    const at = new Date('2026-09-19T15:00:00Z');
    expect(marketingEmailsRecord(true, 'web-signup', at)).toEqual({
      optedIn: true,
      at: '2026-09-19T15:00:00.000Z',
      source: 'web-signup',
      text: MARKETING_CONSENT_TEXT,
      version: '2026-09-19',
    });
  });

  it('counts only an explicit, recorded yes', () => {
    expect(hasMarketingConsent({ marketingEmails: marketingEmailsRecord(true, 'web-account') })).toBe(true);
    expect(hasMarketingConsent({ marketingEmails: marketingEmailsRecord(false, 'web-signup') })).toBe(false);
    expect(hasMarketingConsent({})).toBe(false);
    expect(hasMarketingConsent(undefined)).toBe(false);
    expect(hasMarketingConsent({ marketingEmails: { optedIn: 'yes', at: 'x' } })).toBe(false);
  });

  it('reads malformed metadata as no record instead of throwing', () => {
    expect(readMarketingEmails(null)).toBeNull();
    expect(readMarketingEmails('text')).toBeNull();
    expect(readMarketingEmails({ marketingEmails: 5 })).toBeNull();
  });

  describe('a tick given after Continue', () => {
    const created = new Date('2026-09-19T15:00:00Z');
    const now = new Date('2026-09-19T15:05:00Z');
    const yesLater = marketingEmailsRecord(true, 'web-signup', new Date('2026-09-19T15:01:00Z'));
    const noAtSubmit = marketingEmailsRecord(false, 'web-signup', new Date('2026-09-19T15:00:00Z'));

    it('lands on a new account whose form sent an earlier no', () => {
      expect(shouldApplyParkedChoice(yesLater, noAtSubmit, created, now)).toBe(true);
    });

    it('lands on a new account with no record at all (Google or Apple)', () => {
      expect(shouldApplyParkedChoice(yesLater, null, created, now)).toBe(true);
    });

    it('never touches an older account signed into later in the same tab', () => {
      const oldAccount = new Date('2026-01-01T00:00:00Z');
      expect(shouldApplyParkedChoice(yesLater, null, oldAccount, now)).toBe(false);
    });

    it('does nothing when the account already holds the same or a newer answer', () => {
      expect(shouldApplyParkedChoice(yesLater, yesLater, created, now)).toBe(false);
      const newerNo = marketingEmailsRecord(false, 'web-account', new Date('2026-09-19T15:04:00Z'));
      expect(shouldApplyParkedChoice(yesLater, newerNo, created, now)).toBe(false);
    });

    it('parks in session storage and hands the choice back exactly once', () => {
      const store = new Map<string, string>();
      const storage = {
        setItem: (k: string, v: string) => void store.set(k, v),
        getItem: (k: string) => store.get(k) ?? null,
        removeItem: (k: string) => void store.delete(k),
      };
      parkMarketingChoice(yesLater, storage);
      expect(takeParkedMarketingChoice(storage)).toEqual(yesLater);
      expect(takeParkedMarketingChoice(storage)).toBeNull();
    });

    it('survives storage that throws', () => {
      const broken = {
        setItem: () => { throw new Error('blocked'); },
        getItem: () => { throw new Error('blocked'); },
        removeItem: () => { throw new Error('blocked'); },
      };
      expect(() => parkMarketingChoice(yesLater, broken)).not.toThrow();
      expect(takeParkedMarketingChoice(broken)).toBeNull();
    });
  });
});
