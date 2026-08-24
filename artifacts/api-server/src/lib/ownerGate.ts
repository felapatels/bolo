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
