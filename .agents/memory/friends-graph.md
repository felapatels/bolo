---
name: Friends social graph
description: How friendships are modelled and how learner identity is captured; constraints future friends/leaderboard work must respect.
---

# Friends social graph & identity capture

## Friendship storage
A friendship is a **single directional row** (`requester_id` → `addressee_id`)
with `status` `"pending" | "accepted"`. An accepted friendship is stored once
(keeping the original direction) and read from **both** sides.

- DB `unique(requester_id, addressee_id)` only prevents an exact duplicate of
  one ordered pair. It does **not** stop A→B and B→A both existing.
- **Bidirectional duplicate prevention is application-level**: before inserting a
  request, check for an existing row in *either* direction and 409.
- Self-friending is blocked by a DB `CHECK (requester_id <> addressee_id)` plus
  an app guard.

**Why:** direction must be preserved (who requested whom) so a canonical
ordered-pair table wasn't used; the app guard is the real duplicate defense.
**How to apply:** any new write path (auto-accept reverse requests, block, etc.)
must query both directions itself — don't rely on the unique constraint.

## Leaderboard XP
XP = sum of a learner's attempt scores across **all** languages. Reuse
`computeProgressMetrics(attempts).xp` (feed it all of a user's attempts) rather
than re-deriving, so it can't drift from /progress. Rank desc, tie-break by
userId for stable ranks; caller flagged with `isSelf`. Friends-only (no global
board) by design/privacy.

## Identity capture (display name + email)
`requireAuth` calls `ensureLocalUser` which upserts the row with a no-op
`onConflictDoUpdate` so RETURNING yields the *current* email/displayName even on
conflict, then only calls `clerkClient.users.getUser` when a column is still
blank (covers new users + graceful backfill of old rows). Clerk failures are
swallowed — identity capture must never fail an authenticated request.
