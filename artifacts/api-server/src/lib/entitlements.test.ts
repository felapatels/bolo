import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FREE_DAILY_NEW_LESSON_CAP,
  FREE_LANGUAGE,
  allowedLanguagesForPlan,
  buildEntitlements,
  dailyNewLessonLimit,
  featuresForPlan,
  isLanguageAllowed,
  resolvePlan,
  type SubscriptionState,
} from "./entitlements";

// Pure-unit coverage of the plan resolver and entitlements assembly — the
// single source of truth for who gets what. No DB or Express involved, so the
// trial/expiry rules are pinned deterministically here rather than inferred from
// the route tests.

const NOW = new Date("2026-07-13T12:00:00.000Z");
const future = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
const past = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);

function state(over: Partial<SubscriptionState> = {}): SubscriptionState {
  return {
    tier: "free",
    subscriptionStatus: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    chosenLanguage: null,
    ...over,
  };
}

test("a plain free user resolves to the free plan", () => {
  const r = resolvePlan(state(), NOW);
  assert.equal(r.plan, "free");
  assert.equal(r.status, "none");
});

test("a plus tier resolves to plus", () => {
  const r = resolvePlan(state({ tier: "plus", subscriptionStatus: "active" }), NOW);
  assert.equal(r.plan, "plus");
  assert.equal(r.status, "active");
});

test("an active trial counts as plus", () => {
  const r = resolvePlan(
    state({ subscriptionStatus: "trialing", trialEndsAt: future }),
    NOW,
  );
  assert.equal(r.plan, "plus");
  assert.equal(r.status, "trialing");
});

test("a lapsed trial reads as expired free", () => {
  const r = resolvePlan(
    state({ subscriptionStatus: "trialing", trialEndsAt: past }),
    NOW,
  );
  assert.equal(r.plan, "free");
  assert.equal(r.status, "expired");
});

test("a plus tier whose paid period has lapsed downgrades to expired free", () => {
  const r = resolvePlan(
    state({ tier: "plus", subscriptionStatus: "active", currentPeriodEnd: past }),
    NOW,
  );
  assert.equal(r.plan, "free");
  assert.equal(r.status, "expired");
});

test("a plus tier within its paid period stays plus", () => {
  const r = resolvePlan(
    state({ tier: "plus", subscriptionStatus: "active", currentPeriodEnd: future }),
    NOW,
  );
  assert.equal(r.plan, "plus");
  assert.equal(r.status, "active");
});

test("a paused subscription within its window suspends access but is not expired", () => {
  const r = resolvePlan(
    state({
      tier: "plus",
      subscriptionStatus: "paused",
      currentPeriodEnd: future,
      pauseUntil: future,
    }),
    NOW,
  );
  assert.equal(r.plan, "free");
  assert.equal(r.status, "paused");
  assert.equal(r.pauseUntil?.getTime(), future.getTime());
});

test("a paused subscription past its window resumes to the underlying tier", () => {
  const r = resolvePlan(
    state({
      tier: "plus",
      subscriptionStatus: "paused",
      currentPeriodEnd: future,
      pauseUntil: past,
    }),
    NOW,
  );
  assert.equal(r.plan, "plus");
  assert.equal(r.status, "active");
  assert.equal(r.pauseUntil, null);
});

test("language access follows the plan", () => {
  assert.equal(isLanguageAllowed("free", FREE_LANGUAGE), true);
  assert.equal(isLanguageAllowed("free", "gu"), false);
  assert.equal(isLanguageAllowed("plus", "gu"), true);
  assert.equal(isLanguageAllowed("plus", FREE_LANGUAGE), true);
});

test("free entitlements expose the daily cap and only the free language", () => {
  const r = resolvePlan(state(), NOW);
  const e = buildEntitlements(r, 1, ["hi", "gu", "es"]);
  assert.equal(e.plan, "free");
  assert.deepEqual(e.allowedLanguages, [FREE_LANGUAGE]);
  assert.equal(e.features.allLanguages, false);
  assert.equal(e.features.review, false);
  assert.equal(e.features.advancedAnalytics, false);
  assert.equal(e.features.extendedLibrary, false);
  assert.equal(e.limits.dailyNewLessons.limit, FREE_DAILY_NEW_LESSON_CAP);
  assert.equal(e.limits.dailyNewLessons.used, 1);
  assert.equal(e.limits.dailyNewLessons.remaining, FREE_DAILY_NEW_LESSON_CAP - 1);
});

test("free remaining allowance never goes negative", () => {
  const r = resolvePlan(state(), NOW);
  const e = buildEntitlements(r, FREE_DAILY_NEW_LESSON_CAP + 5, ["hi"]);
  assert.equal(e.limits.dailyNewLessons.remaining, 0);
});

test("plus entitlements are unlimited and list every language", () => {
  const r = resolvePlan(state({ tier: "plus", subscriptionStatus: "active" }), NOW);
  const all = ["hi", "gu", "es", "fr"];
  const e = buildEntitlements(r, 99, all);
  assert.equal(e.plan, "plus");
  assert.deepEqual(e.allowedLanguages, all);
  assert.equal(e.features.allLanguages, true);
  assert.equal(e.features.unlimitedLessons, true);
  assert.equal(e.features.review, true);
  assert.equal(e.features.advancedAnalytics, true);
  assert.equal(e.features.extendedLibrary, true);
  assert.equal(e.limits.dailyNewLessons.limit, null);
  assert.equal(e.limits.dailyNewLessons.remaining, null);
  assert.equal(e.chosenLanguage, null);
});

// --- One Language ($6.99) middle tier --------------------------------------

test("an active one_language tier resolves to one_language and carries the chosen language", () => {
  const r = resolvePlan(
    state({
      tier: "one_language",
      subscriptionStatus: "active",
      chosenLanguage: "gu",
    }),
    NOW,
  );
  assert.equal(r.plan, "one_language");
  assert.equal(r.status, "active");
  assert.equal(r.chosenLanguage, "gu");
});

test("a one_language tier whose period has lapsed downgrades to expired free", () => {
  const r = resolvePlan(
    state({
      tier: "one_language",
      subscriptionStatus: "active",
      currentPeriodEnd: past,
      chosenLanguage: "gu",
    }),
    NOW,
  );
  assert.equal(r.plan, "free");
  assert.equal(r.status, "expired");
  assert.equal(r.chosenLanguage, null);
});

test("one_language features: unlimited lessons on, everything else off", () => {
  const f = featuresForPlan("one_language");
  assert.equal(f.unlimitedLessons, true);
  assert.equal(f.allLanguages, false);
  assert.equal(f.review, false);
  assert.equal(f.advancedAnalytics, false);
  assert.equal(f.extendedLibrary, false);
});

test("one_language lifts the daily cap", () => {
  assert.equal(dailyNewLessonLimit("one_language"), null);
  assert.equal(dailyNewLessonLimit("plus"), null);
  assert.equal(dailyNewLessonLimit("free"), FREE_DAILY_NEW_LESSON_CAP);
});

test("one_language allows Hindi plus the chosen language, nothing else", () => {
  assert.deepEqual(allowedLanguagesForPlan("one_language", "gu"), [
    FREE_LANGUAGE,
    "gu",
  ]);
  assert.equal(isLanguageAllowed("one_language", FREE_LANGUAGE, "gu"), true);
  assert.equal(isLanguageAllowed("one_language", "gu", "gu"), true);
  assert.equal(isLanguageAllowed("one_language", "es", "gu"), false);
});

test("one_language with no chosen language yet is just Hindi", () => {
  assert.deepEqual(allowedLanguagesForPlan("one_language", null), [
    FREE_LANGUAGE,
  ]);
  assert.equal(isLanguageAllowed("one_language", "gu", null), false);
});

test("one_language entitlements snapshot: Hindi + chosen, unlimited, chosen reported", () => {
  const r = resolvePlan(
    state({
      tier: "one_language",
      subscriptionStatus: "active",
      chosenLanguage: "gu",
    }),
    NOW,
  );
  const e = buildEntitlements(r, 5, ["hi", "gu", "es", "fr"]);
  assert.equal(e.plan, "one_language");
  assert.deepEqual(e.allowedLanguages, [FREE_LANGUAGE, "gu"]);
  assert.equal(e.chosenLanguage, "gu");
  assert.equal(e.features.unlimitedLessons, true);
  assert.equal(e.features.allLanguages, false);
  assert.equal(e.features.review, false);
  assert.equal(e.features.advancedAnalytics, false);
  assert.equal(e.features.extendedLibrary, false);
  assert.equal(e.limits.dailyNewLessons.limit, null);
  assert.equal(e.limits.dailyNewLessons.remaining, null);
});
