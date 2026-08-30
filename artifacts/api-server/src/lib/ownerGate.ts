/**
 * THE OWNER GATE. Who is allowed to see internal tooling on a customer-facing
 * app.
 *
 * WHY 404 AND NEVER 403, and this is the whole design rather than a detail. A
 * 403 confirms the page exists and says "you are not allowed", which tells
 * anybody probing exactly what to keep probing. A 404 says there is nothing
 * here, which is the only honest answer to give a stranger about a page that
 * is none of their business. Callers of `isOwner` must fail this way; a helper
 * cannot enforce it for them, so it is written on every route that uses this.
 *
 * IT FAILS CLOSED. An unset allowlist and an unauthenticated request both
 * resolve to "not the owner", so a missing environment variable hides the tool
 * rather than opening it. CLAUDE.md records that several secrets exist only in
 * Replit's Secrets panel and go missing; this is the direction that survives
 * that.
 *
 * THE IDS ARE COMMITTED AS A FALLBACK, and that is deliberate rather than lazy.
 * A Clerk user id is an opaque identifier, not a credential: knowing one does
 * not let anybody authenticate as it, and this gate compares the id on an
 * ALREADY AUTHENTICATED session against the list. The same reasoning already
 * applies to the committed PostHog project key and to google-services.json.
 * Committing them means the gate cannot lock the owner out of their own tool
 * because an env var went missing, which is the failure mode that would
 * actually happen.
 *
 * THE IDS THEMSELVES were verified on 2026-08-24 by querying the PRODUCTION
 * users table, not by their shape and not by PostHog. Clerk ids look identical
 * across instances, and a pair supplied earlier that day turned out to belong
 * to a different app entirely. PostHog cannot settle it either: the Replit dev
 * preview is a production build wearing a dev identity, so a DEV Clerk id shows
 * up in production PostHog. Presence in PostHog can REJECT an id and can never
 * confirm one. If a fourth id is ever added here, check it against production
 * users first.
 */

/** Set OWNER_USER_IDS to override, comma-separated. Trimmed, blanks dropped. */
const FROM_ENV = (process.env.OWNER_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * aakeshp@gmail.com via Google, aakesh_patel@yahoo.com via Apple and via email.
 * Every one confirmed as a real row in the production users table.
 */
const COMMITTED = [
  "user_3H8vsSZW9Pcc2iZsjVzvOffeG0a",
  "user_3HBsmeNhc3jxT6rCH1WXI4R0Ykv",
  "user_3HrkEYs5PZFbfBDPMeTympT8yqC",
];

export const ownerUserIds: Set<string> = new Set(
  FROM_ENV.length > 0 ? FROM_ENV : COMMITTED,
);

/**
 * Accounts that are not real learners, for COUNTING purposes only.
 *
 * TWO LISTS, NOT ONE, AND THE SPLIT IS THE WHOLE POINT. ownerUserIds above
 * answers "who may open the internal tooling". This answers "who is not a
 * customer". They overlap but they are not the same question, and merging them
 * would hand the Nest to whoever gets added here next.
 *
 * appletester721-bolo@yahoo.com is the App Review tester account. It must NEVER
 * be able to open the cockpit, and it must never be counted as a learner or as
 * a paying customer. Measured 2026-08-26: it carried an active "plus"
 * subscription and so appeared in the paid tile, and it had filed all 47 phrase
 * reports. Reported the same day: "anything from appletester721 should be
 * hidden with the hide your account flag."
 *
 * Set NON_LEARNER_USER_IDS to override, comma-separated. Falls back to the
 * owners plus the committed testers, so an unset variable still subtracts the
 * accounts we know about rather than silently counting them.
 */
const TESTERS_FROM_ENV = (process.env.NON_LEARNER_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Verified against the PRODUCTION users table on 2026-08-26, the same way the
 * owner ids were. A Clerk id looks identical across instances and a pair
 * supplied by eye once turned out to belong to a different app entirely.
 */
const COMMITTED_TESTERS = [
  // ---- Apple's own testing ----
  // appletester721-bolo@yahoo.com. Filed all 47 phrase reports.
  "user_3H97Yl6xs67Emq2ZlNKa5KoMt7r",
  // THREE ACCOUNTS NAMED "John Apple", every one an Apple private relay
  // address with ZERO attempts. That is App Review's own naming, and the
  // pattern is what identified them: a reviewer opens the app, exercises the
  // purchase flow and never practises. The first of these carried the last
  // remaining "active plus" subscription on the whole product, which is why
  // RevenueCat shows subscribers and the bank shows nothing. It is a SANDBOX
  // purchase, and until routes/revenuecat.ts stores the `environment` it
  // already receives, this list is the only thing that knows.
  "user_3I6RFpE3ZvvfMpinJbXg9VP4OzI", // 6py9rdkbmt@privaterelay.appleid.com, the sandbox "paid"
  "user_3IEBTljvXwLeBcLtc09qFAeUHPX", // h2ptc85k27@privaterelay.appleid.com
  "user_3IQsFcPQMEdijFXj7hoKNAqbcRi", // vskbgyr2ct@privaterelay.appleid.com

  // ---- The owner's other accounts ----
  // ownerUserIds above holds three ids and was believed to be the whole set.
  // It was not: the drill-down built on 2026-08-26 put the owner's own two
  // busiest accounts at the TOP of the learner board, 45 and 42 attempts,
  // ahead of every real learner. Confirmed by the owner the same day.
  //
  // These are here and NOT in ownerUserIds on purpose. This list answers "who
  // is not a customer"; that one answers "who may open the cockpit", and
  // widening access is not a side effect a counting fix should have.
  "user_3GVMAKJJLK20kk90kwIV7TYMAUl", // aakeshp@gmail.com, 45 attempts
  "user_3HDweLghKEamfSQqIJ4QhP5no1b", // f6ysmyb6p5@privaterelay.appleid.com, 42 attempts.
                                      // SAME Apple relay address as an id already in
                                      // ownerUserIds. A relay address is unique per Apple
                                      // ID per app, so two rows carrying one address is one
                                      // person with two Clerk users, not two people.
  "user_3HS3dgTAz4BjDPnXgwOgHxvhFy0", // aakesh_patel@outlook.com, 2 attempts
  "user_3GdmYFr3KFW0QntIRs5aGn7HgKV", // aakesh_patel@yahoo.com, duplicate of an owner id
  "user_3GVXSGyUrSfNfOnrfnSGNNShCPh", // aakeshp+applereview@gmail.com
  "user_3HrjrJGKwKMEPlaWqTf206bLMpM", // bollymovesdance@gmail.com, the business address

  // ---- People the owner knows are testing, added 2026-08-30 ----
  // "naina c and ansh are testers and should be excluded with that toggle."
  // Both verified against the PRODUCTION users table before being written here,
  // which is the rule at the top of this file and not a formality: the drill
  // shows a display name and an email, and neither of those is the id.
  "user_3IL4Nk85MbjxiGi615BbxnIT13o", // nainachhabra11@icloud.com, 29 attempts
  //
  // ANSH HAS TWO ACCOUNTS ON ONE EMAIL AND BOTH ARE HERE. The drill only showed
  // the August one, because the July one falls outside the window that was on
  // screen. Excluding only what was visible would have left a duplicate
  // counting as a learner forever, in every all-time figure, with nothing to
  // make it obvious. Found by querying the email rather than the id.
  "user_3IMzxsxGJsJMontcvbiNkW5Oa6Y", // dr.wala0126@gmail.com, 2026-08-24, 19 attempts
  "user_3GdvZ37lLUHAPsZOWQHZjkDveeE", // dr.wala0126@gmail.com, 2026-07-17, 0 attempts
];

export const nonLearnerUserIds: Set<string> = new Set(
  TESTERS_FROM_ENV.length > 0
    ? TESTERS_FROM_ENV
    : [...ownerUserIds, ...COMMITTED_TESTERS],
);

/**
 * Whether this request's authenticated user owns the product.
 *
 * `undefined` in, `false` out: an unauthenticated caller is never the owner,
 * and callers must not have to remember that.
 */
export function isOwner(userId: string | undefined | null): boolean {
  return typeof userId === "string" && ownerUserIds.has(userId);
}

/**
 * Where the Nest currently lives.
 *
 * NOT A SECRET. The artifact is private to the owner's Claude account and
 * knowing the URL grants nothing; the gate in front of this exists so the
 * PRODUCT does not advertise that an internal tool is reachable, not because
 * the address is sensitive.
 *
 * TEMPORARY BY DESIGN. This is option A, agreed with the owner 2026-08-24: a
 * gated redirect that ships immediately and works while the page itself is
 * moved into the product. When that move lands this constant goes, and so does
 * the route that serves it.
 */
export const NEST_ARTIFACT_URL =
  "https://claude.ai/code/artifact/845b4500-4612-4019-8e06-b36e58257435";
