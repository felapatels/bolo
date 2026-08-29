# Handoff: build 18

Written 2026-08-29 by BOLO BUILD CHAT 17. **Read `CLAUDE.md` first, then this.**

`origin/main` is `e06b6545` plus this handoff, tree clean, nothing unpushed.

---

## 0. WHERE THE BUILD ACTUALLY IS

**TWO STORE BUILDS ARE OUT, AND ONLY THE SECOND IS THE ONE.**

| build | commit | iOS | Android | camera in call | status |
|---|---|---|---|---|---|
| 1.0.5 (520 / 521) | `ca16a295` | TestFlight | Play internal | YES, unswitchable | internal test only, **NEVER submit for review** |
| **1.0.5 (521 / 522)** | `042f1fe3` | TestFlight (uploaded 23:58) | Play internal | no, server flag off | **the candidate** |

Both pairs passed `checkBundleHealth.ts`: iOS 45,539 functions (the build
160 shape), Android 45,522 on both cuts, seventeen off iOS on the same
source and therefore the same compile. The script lives at
`artifacts/bolo-mobile/scripts/checkBundleHealth.ts`, not `scripts/`.

**NOT VERIFIED ON A DEVICE, ANY OF IT.** The owner was asked for ten cold
starts of 521 and had not reported when this was written. Motion, the
ringtone through a real audio session, haptics on the ring and the chai
grant on a live call are all things the simulator could not prove.

**The server is published** at `beba7be0` (Replit status: success, 23:25),
carrying the five previously unpublished commits plus the romanizer. The
owner republished again after pulling `042f1fe3` (the self-view flag) and
said "repub done", but Replit reported the SAME deployment id, so whether
that second publish took is UNVERIFIED. It gates nothing: the client mounts
no camera unless the start response says `selfView: true`, and no server
version sends that.

**The Google Play 512x512 icon is still a by-hand upload in the console.**

---

## 1. WHAT THIS SESSION FOUND, AND WHY THE HANDOFF WAS WRONG

**The build 17 handoff's one open defect did not exist as described.** It
said the DID YOU KNOW box overran its panel by ~40pt onto card 1. The board
is a clipped 184pt box; nothing could leave it. Three separate things were
tangled, each measured with an `onLayout` rather than a screenshot:

1. **The pinned board sat 104pt below its slot.** `5391875e` reserved the
   header's height in the canvas alone. Block children draw canvas relative
   to their own slice, so the cards stayed put; `PinnedZoneBoard` converts
   canvas to content with a constant, so every board moved down and landed
   on its zone's first card. The header was never the problem: the board
   PINS at the safe-area inset, 41pt below the flow's slot. The flow now
   reserves exactly the pin clearance (`journey-header-clearance`), the
   canvas the same, and zone 0's band reaches up by it. `headerH` was
   removed; nothing read it.
2. **The intro shot framed every current card under the pinned board.**
   `INTRO_SCROLL.leadMax` is 260 and the pinned board's foot is at 253.
   `introScrollLead(viewportH, clearance)` now takes a floor that wins over
   the cap; the journey passes the board's foot plus the card's reach. Stop
   1 stays at scroll 0 (`to 0, lead 318` on the sim).
3. **The fact box never fit.** Panel 117, body 86 after the art's insets,
   content 112 on a teaser board. `PC_H` 184 to 200, paddings trimmed 9,
   Free taste folded onto the stops line: content 90 in a 97 body.
   `ZONE_BOARD_MIN_PANEL_H` was 98 from before the fact box existed and is
   124 now, re-measured. Web keeps 184; the two never shared the constant in
   any way that mattered.

**`ZONE_BOARD_MIN_PANEL_H` EXISTS and is asserted.** The handoff grepped
for `minPanelH` and reported it missing. Grep for the exported name.

---

## 2. WHAT ELSE LANDED (fourteen commits)

- **Free taste chips on stops 2 and 3** (`01d82d18`). Showroom listings
  carry no `planLocked`, so `zoneIncluded` read the zone as owned. One
  `!showroom` guard on both platforms. **Web still does not draw the
  tracing and story rows in a showroom at all** (`journey.tsx` 1562, 1610);
  it never adopted `planZoneRows`. The guard is in place for the day it
  does; the port is owed.
- **Card 1 tidy** (`10fa8387`, `ca16a295`). The sign glyph came off (it was
  the 14pt that wrapped the chip); the glow ring came off on the owner's
  choice (it could not pulse on release builds and sat as a second outline).
- **Ringtone** (`1fb55a8e`). `useRingtone` in `IncomingCall.tsx`, a bundled
  6s double ring looped by the player, honours the sound pref and the silent
  switch. Mobile only; web has no call screen. **Unheard by anyone.**
- **Romanizer card style** (`cc94948b`). IAST `c` to `ch`, `ch` to `chh`,
  `ś/ṣ` to `sh`, `ṛ` to `ri`, decided by the seed's own counts (280 `chhe`).
  Every reader sees it: his line, the mirror, games, "We heard". The
  fast-path route test's `kem cho` was inverted (`800eb602`).
- **The self-view flag** (`042f1fe3`). `CHACHA_CALL_SELF_VIEW_ENABLED`,
  default off. **The camera permission string in `app.json` still names a
  profile picture and a QR code**; `SelfView.tsx`'s header has flagged that
  as inaccurate since it was written. It is accurate again while the flag
  is off. **Fix the string before the flag is ever turned on**, and expect
  App Review to read it.
- **`.easignore` overwritten and restored** (`230991d8`, `cc2df3e1`). See
  section 3.

---

## 3. TRAPS THIS SESSION PAID FOR

1. **LOOK AT THE TARGET BEFORE `cat >`.** I wrote a fresh `.easignore` over
   a 92-line one from 2026-08-18 because two handoffs said none existed.
   They had looked in `artifacts/bolo-mobile`; it lives at the git root.
   Mine dropped the weight rules and excluded a whole workspace package,
   which is a frozen-lockfile failure on the builder. The owner's pull
   diffstat (`135 ++++-----`) caught it. `git show HEAD:<path>` first.
2. **The upload is still 209 MB with the restored file in place.** The
   file says it took the archive from 224 MB down; either the tree grew or
   the rules no longer match. Unmeasured.
3. **`eas-cli` was "not installed" in two handoffs.** It is a devDependency:
   `artifacts/bolo-mobile/node_modules/.bin/eas`, 21.0.0.
4. **A single api test file needs `--experimental-test-module-mocks`.**
   Without it a file using `mock.module` fails at import and reads as a
   broken test.
5. **Jest's `mock` prefix rule and BSD sed.** `jest.mock` factories may
   only reference variables named `mock*`; and `sed -i '' 's/\bx\b/…/'`
   silently does nothing on macOS, use perl.
6. **A background Bash watcher gets a ten-minute leash** but kept polling
   past it here; check `pgrep` before assuming it died.
7. **Screenshots were right this time because the owner's were.** The
   owner's own screenshot disproved the handoff in one look; the numbers
   then explained it. When the owner says the handoff is wrong, measure
   before defending it.

---

## 4. PARKED, IN THE ORDER I WOULD TAKE THEM

1. **The ten cold starts of 521, and the release-only checks**: motion,
   ringtone audio, haptics, chai on a real journey call.
2. **Verify the second publish took**: a real call's start response should
   carry `selfView: false`. Every unauthenticated probe 401s; only a real
   call answers.
3. **The camera permission string**, before the flag ever flips.
4. **Web showroom rows**: port `planZoneRows` so stops 2 and 3 exist there.
5. **`openapi.yaml` owes the call routes**: `callsNow`, `heardRomanized`,
   `heardEnglish`, `xpEarned`, and now `selfView`, all read off untyped
   results.
6. **The exhausted card** (`access === 'exhausted'`) is a flow element the
   canvas does not know about, so every pinned board is off by its height
   for an exhausted teaser learner. Same class as this session's bug;
   unfixed, unreported by any user.
7. **`ZoneBandFixed`'s `cap` mode has no caller.** Dead code.
8. **The api-server has never sent one error to Sentry.** Still the largest
   invisible risk in the stack.
9. **The Play icon.**
