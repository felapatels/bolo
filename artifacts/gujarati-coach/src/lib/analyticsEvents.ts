// The deliberate, complete set of product analytics events for the web app.
// Do not add events ad hoc — extend this file (and its mobile twin,
// artifacts/bolo-mobile/lib/analyticsEvents.ts) so the set stays reviewed.
//
// Payload policy: NO phrase content, transcripts, audio, or user email in any
// event payload. User id and language code are fine.

export const ANALYTICS_EVENTS = {
  SIGN_UP_COMPLETED: "sign_up_completed",
  LANGUAGE_SELECTED: "language_selected",
  FIRST_PRACTICE_SESSION_STARTED: "first_practice_session_started",
  FIRST_PHRASE_ATTEMPTED: "first_phrase_attempted",
  SESSION_COMPLETED: "session_completed",
  PAYWALL_VIEWED: "paywall_viewed",
  PURCHASE_COMPLETED: "purchase_completed",
  // Demo-day polish (P1 v2 item 2): distinguishes journey entries that come
  // through the home boarding-pass hero from direct /journey navigation.
  JOURNEY_ENTERED_VIA_HERO: "journey_entered_via_hero",
  // Task #906: the Phrasebook surface replaced the home topic grid; fired on
  // each open of the Phrasebook library page. There was never a dedicated
  // topic-open event, so nothing else moved or was renamed.
  PHRASEBOOK_OPENED: "phrasebook_opened",
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
