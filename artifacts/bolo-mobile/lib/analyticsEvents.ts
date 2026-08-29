// The deliberate, complete set of product analytics events for the mobile
// app. Do not add events ad hoc — extend this file (and its web twin,
// artifacts/gujarati-coach/src/lib/analyticsEvents.ts) so the set stays
// reviewed.
//
// Payload policy: NO phrase content, transcripts, audio, or user email in any
// event payload. User id and language code are fine.

export const ANALYTICS_EVENTS = {
  SIGN_UP_COMPLETED: 'sign_up_completed',
  LANGUAGE_SELECTED: 'language_selected',
  FIRST_PRACTICE_SESSION_STARTED: 'first_practice_session_started',
  FIRST_PHRASE_ATTEMPTED: 'first_phrase_attempted',
  SESSION_COMPLETED: 'session_completed',
  PAYWALL_VIEWED: 'paywall_viewed',
  PURCHASE_COMPLETED: 'purchase_completed',
  // Build 31 one-path restructure: the home topic list became a single
  // Phrasebook door backed by a library surface. phrasebook_opened fires when
  // the surface mounts; topic_opened fires when a topic is opened from it.
  // (No topic-open event existed before this; both names are new.)
  PHRASEBOOK_OPENED: 'phrasebook_opened',
  TOPIC_OPENED: 'topic_opened',
  // Build 19: the first-run walkthrough. reason is 'done' or 'skipped', step
  // is the card the learner was on (0-based), so a skip rate per card can be
  // read without a second event.
  WALKTHROUGH_FINISHED: 'walkthrough_finished',
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
