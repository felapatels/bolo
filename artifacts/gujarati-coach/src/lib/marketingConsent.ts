// Optional marketing-email consent (owner, 2026-09-19: "a checkbox on all sign
// ups for a general email marketing consent"). Off unless the learner ticks it.
//
// Stored on the Clerk user as unsafeMetadata.marketingEmails, so no database
// change is needed and the choice travels with the account. Each record keeps
// WHEN, WHERE and the EXACT WORDING that was agreed to, which is what a consent
// record has to prove later. A "no" is recorded too.

export const MARKETING_CONSENT_VERSION = '2026-09-19';
export const MARKETING_CONSENT_TEXT =
  'Email me Bolo news, new languages and offers. I can unsubscribe any time.';

export type MarketingConsentSource = 'web-signup' | 'web-account' | 'mobile-signup' | 'mobile-account';

export interface MarketingEmails {
  optedIn: boolean;
  at: string;
  source: MarketingConsentSource;
  text: string;
  version: string;
}

export function marketingEmailsRecord(
  optedIn: boolean,
  source: MarketingConsentSource,
  now: Date = new Date(),
): MarketingEmails {
  return { optedIn, at: now.toISOString(), source, text: MARKETING_CONSENT_TEXT, version: MARKETING_CONSENT_VERSION };
}

/** The stored record, or null when there is none or it is malformed. Never throws. */
export function readMarketingEmails(unsafeMetadata: unknown): MarketingEmails | null {
  if (!unsafeMetadata || typeof unsafeMetadata !== 'object') return null;
  const raw = (unsafeMetadata as Record<string, unknown>).marketingEmails;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.optedIn !== 'boolean' || typeof r.at !== 'string') return null;
  return r as unknown as MarketingEmails;
}

/** Only an explicit, recorded yes counts. No record means no. */
export function hasMarketingConsent(unsafeMetadata: unknown): boolean {
  return readMarketingEmails(unsafeMetadata)?.optedIn === true;
}

// ---------------------------------------------------------------------------
// A tick given AFTER Clerk created the sign-up (the box sits below the form, so
// someone may tick it while typing the email code, or on the way back from
// Google or Apple) never reaches Clerk through the form. It is parked in this
// tab's sessionStorage and written onto the account once sign-up finishes.

const PENDING_KEY = 'bolo.pendingMarketingConsent';
/** Only a brand-new account takes a parked choice, never an existing one signed into later in the same tab. */
export const PENDING_NEW_ACCOUNT_WINDOW_MS = 30 * 60 * 1000;

export function parkMarketingChoice(record: MarketingEmails, storage: Pick<Storage, 'setItem'> | undefined = safeSession()): void {
  try {
    storage?.setItem(PENDING_KEY, JSON.stringify(record));
  } catch {
    // Private mode or blocked storage: the form's own metadata still covers a tick made before Continue.
  }
}

export function takeParkedMarketingChoice(
  storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined = safeSession(),
): MarketingEmails | null {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    if (!raw) return null;
    storage?.removeItem(PENDING_KEY);
    return readMarketingEmails({ marketingEmails: JSON.parse(raw) });
  } catch {
    return null;
  }
}

/** A parked choice applies to a new account when the account has no record yet or an older one. */
export function shouldApplyParkedChoice(
  parked: MarketingEmails | null,
  existing: MarketingEmails | null,
  accountCreatedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!parked || !accountCreatedAt) return false;
  if (now.getTime() - accountCreatedAt.getTime() > PENDING_NEW_ACCOUNT_WINDOW_MS) return false;
  if (!existing) return true;
  return Date.parse(parked.at) > Date.parse(existing.at) && parked.optedIn !== existing.optedIn;
}

function safeSession(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}
