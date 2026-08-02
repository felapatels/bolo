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
  // Build 31 one-path restructure: the home topic grid became a single
  // Phrasebook door backed by a library surface. phrasebook_opened fires when
  // the surface mounts; topic_opened fires when a topic is opened from it.
  // (No topic-open event existed before this; both names are new.)
  PHRASEBOOK_OPENED: "phrasebook_opened",
  TOPIC_OPENED: "topic_opened",
  // Public marketing surface (Task 997 South Asian repositioning). These are
  // the ONLY events that fire pre-auth; autocapture and pageviews stay off.
  // Web-only for now: the mobile twin has no public marketing surface, so
  // these have no mobile mirror (note kept per this file's convention).
  // homepage_view: landing page mount.
  HOMEPAGE_VIEW: "homepage_view",
  // section_in_viewport: a named landing section first enters the viewport
  // (property: section).
  SECTION_IN_VIEWPORT: "section_in_viewport",
  // language_entry_click: a language chip in the showcase was clicked
  // (property: language = English name).
  LANGUAGE_ENTRY_CLICK: "language_entry_click",
  // per_language_page_view: a /languages/<slug> page mounted (property: language).
  PER_LANGUAGE_PAGE_VIEW: "per_language_page_view",
  // cta_click: any public-surface CTA (property: placement = hero-primary,
  // hero-secondary, bottom-cta, pricing-free, pricing-allaccess,
  // pricing-family, per-language-cta).
  CTA_CLICK: "cta_click",
  // signup_started: a public-surface CTA routed the visitor to /sign-up
  // (property: source = the placement). Distinct from sign_up_completed,
  // which App.tsx fires post-account-creation.
  SIGNUP_STARTED: "signup_started",
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
