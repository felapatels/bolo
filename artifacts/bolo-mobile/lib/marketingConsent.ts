// Optional marketing-email consent, the phone twin of the web app's
// lib/marketingConsent.ts (owner, 2026-09-19: "a checkbox on all sign ups for
// a general email marketing consent"). Off unless the learner ticks it.
//
// Stored on the Clerk user as unsafeMetadata.marketingEmails, so no database
// change is needed and web and phone share one record. Each record keeps WHEN,
// WHERE and the EXACT WORDING agreed to. A "no" is recorded too.

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
// The sign-up screen cannot write to a user that does not exist yet, so the
// box's answer is parked here (in memory: the app stays alive through the
// email code and the Google or Apple round trip) and MarketingConsentSync
// writes it onto the account once sign-up has finished.

let parked: MarketingEmails | null = null;
/** Only a brand-new account takes a parked choice, never an existing one signed into later. */
export const PENDING_NEW_ACCOUNT_WINDOW_MS = 30 * 60 * 1000;

export function parkMarketingChoice(record: MarketingEmails): void {
  parked = record;
}

export function takeParkedMarketingChoice(): MarketingEmails | null {
  const r = parked;
  parked = null;
  return r;
}

/** A parked choice applies to a new account when it has no record yet or an older, different one. */
export function shouldApplyParkedChoice(
  choice: MarketingEmails | null,
  existing: MarketingEmails | null,
  accountCreatedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!choice || !accountCreatedAt) return false;
  if (now.getTime() - accountCreatedAt.getTime() > PENDING_NEW_ACCOUNT_WINDOW_MS) return false;
  if (!existing) return true;
  return Date.parse(choice.at) > Date.parse(existing.at) && choice.optedIn !== existing.optedIn;
}
