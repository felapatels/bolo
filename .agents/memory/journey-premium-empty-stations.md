---
name: Journey premium-empty stations
description: Stations at position 2+ are 100% premium rows; non-extendedLibrary callers get HTTP 200 [] from the group-phrases route while the journey listing advertises the station unlocked with a full phraseCount.
---

**Rule:** The lesson-group phrase route premium-filters AFTER the sequential-unlock guard, and the journey listing's `phraseCount` is NOT plan-filtered. Because the premium split was derived BY INDEX at seed time, starter (free) rows all live in each category's position-1 group — every position-2+ station is 10/10 premium. A Free or One-Language caller (`featuresForPlan(plan).extendedLibrary === false`) who completes station 1 gets station 2 "unlocked · 10 phrases" on the map, then a **200 empty array** on entry, which the web client renders as the genuinely-empty "No phrases found here" copy.

**Why:** Diagnosed 2026-08-01 by minting a Clerk dev session for the affected account and calling the endpoints raw: listing showed group `unlocked, phraseCount: 10` while `/lesson-groups/<id>/phrases` returned `[]` (200). Neither client loaders nor the resume-scan were involved. Flagged HOTFIX (server-side serving) — plan-visibility desync, same family as the plan-filtered-rollups lesson.

**How to apply:** Any fix must reconcile the three layers together: unlock derivation, listing counts, and phrase serving must all agree on plan-visible rows. Also: "No phrases found here" is unreachable via 402/403/network errors (those render UpgradeScreen / LessonErrorScreen) — if a user reports it, suspect a 200-empty, and check the caller's tier FIRST (a dev account's tier can differ from what the user believes).
