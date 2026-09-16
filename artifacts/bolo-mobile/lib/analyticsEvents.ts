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
  // THE FUNNEL SET (owner audit, 2026-09-16). Every event also carries the super
  // properties from analytics.ts: app, platform, app_version, environment and
  // first-touch acquisition_source / _medium / _campaign / referral_code.
  // app_open: launch (cold_start true) and each return to the foreground.
  APP_OPEN: 'app_open',
  // signup_completed: the new name for sign_up_completed. Both fire during the
  // switch so existing charts keep working; retire the old one after a month.
  SIGNUP_COMPLETED: 'signup_completed',
  // journey_started: the first journey-stop session in a language, once per
  // install per language (language, category_id, stop_id).
  JOURNEY_STARTED: 'journey_started',
  // lesson_started / lesson_completed: EVERY practice session (unlike the
  // first_* pair), with lesson_type station | topic | sentences | testout.
  LESSON_STARTED: 'lesson_started',
  LESSON_COMPLETED: 'lesson_completed',
  // station_completed: this session carried a journey stop over the server's
  // completion line (80% of its phrases at a full-credit score).
  STATION_COMPLETED: 'station_completed',
  // share_clicked: any share sheet or copy (property: surface).
  SHARE_CLICKED: 'share_clicked',
  // referral_clicked: the learner shared or copied their invite link (surface,
  // action, referral_code).
  REFERRAL_CLICKED: 'referral_clicked',
  // trial_started and subscription_started are SERVER events (api-server
  // lib/posthogCapture.ts, from the store webhooks); they are listed in the web
  // and mobile sets only so the names are reviewed in one place.
  TRIAL_STARTED: 'trial_started',
  SUBSCRIPTION_STARTED: 'subscription_started',
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
