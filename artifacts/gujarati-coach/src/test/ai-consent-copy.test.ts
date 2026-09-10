/**
 * The consent disclosure and the two derivations that gate it.
 *
 * These live in the web suite because vitest AUTO-DISCOVERS `src/test/**`. The
 * package they test, `@workspace/ai-consent`, is shared with mobile and has no
 * runner of its own: no lib in this repo has a test script, so a test placed
 * beside the source would never run at all.
 */
import { describe, it, expect } from 'vitest';
import {
  AI_CONSENT_REASSURANCE_AND_MEMORY,
  AI_CONSENT_FEATURES,
  AI_CONSENT_IF_NO,
  AI_CONSENT_ACCEPT_LABEL,
  AI_CONSENT_DECLINE_LABEL,
  shouldAskAiConsent,
  aiFeaturesAllowed,
} from '@workspace/ai-consent';

describe('shouldAskAiConsent', () => {
  it('is FALSE while the snapshot is loading', () => {
    // The regression this exists for: a client that reads decision directly
    // draws the consent screen, or a padlock, on every cold start.
    expect(shouldAskAiConsent(null, true)).toBe(false);
    expect(shouldAskAiConsent(undefined, true)).toBe(false);
    expect(shouldAskAiConsent('granted', true)).toBe(false);
  });

  it('is FALSE for undefined even when not loading, because undefined is not undecided', () => {
    expect(shouldAskAiConsent(undefined, false)).toBe(false);
  });

  it('is TRUE only for a loaded null, which is the never-asked learner', () => {
    expect(shouldAskAiConsent(null, false)).toBe(true);
  });

  it('is FALSE for a learner who declined: asked once, never nagged', () => {
    expect(shouldAskAiConsent('declined', false)).toBe(false);
  });
});

describe('aiFeaturesAllowed', () => {
  it('is FALSE while loading, so nothing sends before the answer is known', () => {
    expect(aiFeaturesAllowed('granted', true)).toBe(false);
  });

  it('is TRUE only on an explicit granted', () => {
    expect(aiFeaturesAllowed('granted', false)).toBe(true);
    expect(aiFeaturesAllowed('declined', false)).toBe(false);
    expect(aiFeaturesAllowed(null, false)).toBe(false);
    expect(aiFeaturesAllowed(undefined, false)).toBe(false);
  });
});

describe('the disclosure copy', () => {
  it('holds the reassurance and the memory clause in ONE string', () => {
    // If these are ever two constants, a layout that truncates or collapses
    // shows the comforting half alone, which is 5.1.2(i) rebuilt by accident.
    const s = AI_CONSENT_REASSURANCE_AND_MEMORY;
    expect(s).toMatch(/never send your name/i);
    expect(s).toMatch(/saved as a note/i);
    expect(s).toMatch(/included in later conversations/i);
  });

  it('names no elder, in any fork', () => {
    // Part 6: LATAM's elder is unruled, so no fork's copy names one. India is
    // the fork that loses the warmer sentence here, and should.
    const all = [
      ...AI_CONSENT_FEATURES,
      AI_CONSENT_REASSURANCE_AND_MEMORY,
      AI_CONSENT_IF_NO,
    ].join(' ');
    for (const name of ['Chacha', 'Chachaji', 'Chacha-ji', 'Dadi', 'Nani', 'Abuelo', 'Abuela']) {
      expect(all).not.toContain(name);
    }
  });

  it('says plainly what a no costs, and offers a way back', () => {
    expect(AI_CONSENT_IF_NO).toMatch(/keeps working/i);
    expect(AI_CONSENT_IF_NO).toMatch(/Settings/);
  });

  it('gives the refusal a real label, not a dismissal', () => {
    // Apple reads a hidden "no" as not having offered a choice, and the owner
    // is partially colour blind, so the two buttons must differ in WORDS and in
    // shape, never in hue alone. The label check is the half testable here; the
    // shape is asserted in the component tests.
    expect(AI_CONSENT_DECLINE_LABEL.trim().length).toBeGreaterThan(0);
    expect(AI_CONSENT_DECLINE_LABEL).not.toMatch(/^(x|close|dismiss|not now|later)$/i);
    expect(AI_CONSENT_ACCEPT_LABEL).not.toBe(AI_CONSENT_DECLINE_LABEL);
  });
});
