/**
 * The name a learner wears on a GLOBAL surface.
 *
 * A username if they have chosen one. Otherwise a stable pseudonym, because a
 * feed that only shows the two people who have named themselves is not a feed:
 * it was empty on 2026-08-25 with 22 real accounts and 29 activity rows behind
 * it, and the owner asked for it to "look alive and busy".
 *
 * WHAT THIS DOES AND DOES NOT PUBLISH. It publishes that somebody did
 * something. It does NOT publish who: the display name is private and never
 * leaves the server on a global payload, and the pseudonym is derived from the
 * user id by a one-way sum, so it cannot be read back into an identity and
 * carries no email, no name and no Clerk id.
 *
 * STABLE ON PURPOSE. The same learner is the same "Learner 4821" tomorrow, so
 * a feed reads as people rather than as noise. That stability is also the
 * limit of the anonymity: somebody who watches long enough can follow one
 * pseudonym's activity, which is true of every pseudonymous system and is why
 * choosing a real username is presented as the better option rather than the
 * only one.
 *
 * LIVES HERE RATHER THAN IN routes/friends.ts because the blocked-accounts
 * list needs it too (2026-08-25, the Guideline 1.2 block control), and
 * importing a route module for a pure function pulls a Router in as a side
 * effect. friends.ts re-exports it, so its own surface is unchanged.
 */
export function publicNameFor(userId: string, username: string | null): string {
  if (username) return username;
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) % 100000;
  }
  // Four digits, padded, so every pseudonym is the same shape on a row.
  return `Learner ${String(h % 10000).padStart(4, "0")}`;
}
