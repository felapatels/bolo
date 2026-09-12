# BOLO SUPERVISOR HANDOFF

## New owner request — 2026-09-11

Add an optional **Show meaning / Hide meaning** helper to all six apps’ phone-call games. This is queued, not implemented. See [the shared roadmap](ROADMAP.md) for scope and proposed acceptance criteria. Claude should retain the caller’s native caption and reveal the current utterance’s English meaning without disrupting the call.

Written 2026-09-10 by the outgoing supervisor session.
Read this, then `~/bolo-supervisor/SUPERVISOR.md`, then grep `LEDGER.md`.

---

## 0. THE LIVE BUG, SOLVED TONIGHT, NOT YET FIXED

**India web returns 500 on every authenticated route.** Owner has been chasing
this for hours. It is NOT Clerk. The Repl deployment logs give it exactly:

    column "ai_consent" of relation "users" does not exist
      at ensureLocalUser (artifacts/api-server/src/lib/userIdentity.ts:69)
      at requireAuth   (artifacts/api-server/src/middlewares/requireAuth.ts:29)

**What happened.** The AI-consent work added `ai_consent`, `ai_consent_at`,
`ai_consent_version` and `share_stats` to the `users` table in CODE.
`ensureLocalUser` does an upsert naming the FULL column list on every
authenticated request. India's PRODUCTION database never got the migration.
So the insert fails, `requireAuth` throws, and every route behind auth 500s
while the public `/api/languages` stays 200.

**Symptoms this explains, all of which I chased down blind alleys first:**
- 500 not 401, on `/api/progress/summary`, `/api/entitlements`, `/api/tokens`,
  `/api/account`, `/api/categories*`, `/api/badges`, `/api/friends/leaderboard`,
  `/api/referral`, `/api/attempts/recent`.
- Incognito changed nothing (it is not a session).
- Both India Clerk secrets being `sk_live` was a red herring.
- The stats bar never loads because `/api/progress/summary` is one of the 500s.

**WHAT I GOT WRONG, so the new supervisor does not repeat it.** I spent three
rounds probing from outside (401-vs-500 shape, secret kinds, bundle key, Clerk
host) and told the owner the client looked correct. All true and all useless.
**The answer was in the server logs the whole time.** When authenticated routes
fail as a CLASS and a public one passes, read the deployment log FIRST.

**THE FIX IS NOT WRITTEN YET.** It needs the migration applied to India's
production DB. Do NOT hand-write ALTER TABLE from this document: open the
migration that added the columns and apply that, because `share_stats` is in
the same insert list and may or may not be in the same migration.

**AND CHECK ALL SIX FORKS.** The consent columns went into shared code. Any
fork whose deployed DB is behind has the same latent 500 the moment a user
signs in. Africa and LATAM are the least exercised and most likely broken.

---

## 1. STANDING OWNER INSTRUCTIONS, still in force

- **COST SAVING IS TOP OF THE LIST UNTIL SATURDAY 1PM.** Overage is high. One
  targeted action beats three probes. This is why the India bug should have
  gone to the logs on round one.
- **WEB CONSENT AUTHORING IS HELD UNTIL SATURDAY.** Do not start it.
- **TODAY IS ONLY: get the App Store apps into a ready-for-review state.**
- **ONE ACTION PER MESSAGE, then stop.** Owner has ADHD. A second step
  "just so you know it is coming" is still a wall. End with "Your plate".
- **The Replit Shell renders BLANK for Claude.** Every Shell command is a paste
  handed to the owner. Name the Repl every time.
- **Claude drives everything else**: ASC API, EAS, Replit publish connector,
  git, Chrome consoles.

---

## 2. THE FLEET

Six forks, each its own repo, Repl, domain, Clerk instance, Stripe, RevenueCat
and App Store record.

| Fork | Dir | Domain | App Store id |
|---|---|---|---|
| India | `~/bolo` | bolo-india.app | 6790907772 |
| SEA | `~/bolo-sea` | bolo-sea.app | 6808769785 |
| East Asia | `~/bolo-east` | bolo-eastasia.app | 6809205852 |
| Europe | `~/bolo-europe` | bolo-europe.app | 6809198565 |
| Africa | `~/bolo-africa` | bolo-africa.app | 6809208363 |
| LATAM | `~/bolo-latam` | bolo-latam.app | 6809805287 |

India is the parent of SEA. SEA is the parent of the other four.
**Audit a fork against the MERGE-BASE, not against the parent's HEAD**, or a
parent that moved on makes the child look clean.

**The gate model.** Every cross-fork change is one of three:
- **REGION** rewrite per fork (copy, art, language content)
- **ENGINE** cherry-pick unchanged
- **CONTRACT** STOP and get an owner ruling (`lib/api-spec/openapi.yaml`)

---

## 3. WHAT IS DONE

- LATAM full localisation (it shipped SEA's copy verbatim; rewritten).
- Kopi / Southeast Asia references purged from the other forks.
- Stripe live in all six. Web pricing 200 everywhere (was 503 in five).
- Clerk `pk_live` in all six.
- **Clerk proxy secret bug fixed in all six.** `clerkProxyMiddleware.ts` chose
  the secret once at boot; it now chooses per request by host. Script:
  `scratchpad/fix-clerk-proxy.mjs`.
- RevenueCat configured in all six.
- iPad tab bar fixed in all six.
- Zone film tones, with a DERIVED fallback that cannot go stale.
- Africa and LATAM art landed.
- Seamless film loops in four forks (`scratchpad/seamless-loop.sh`).
- ASC review details for LATAM and Africa.
- All six web deployments verified CURRENT by CONTENT HASH, not by the panel.

---

## 4. WHAT IS OPEN, in priority order

1. **The `ai_consent` migration**, above. Blocking, owner's active complaint.
2. **Cut iOS builds for all six with `pk_live`.** EAS env confirmed correct for
   East Asia ONLY; verify the other five before building.
   `EXPO_PUBLIC_*` is COMPILE TIME and EAS does NOT read `.replit`.
3. **Screenshots.** Four forks have NONE in App Store Connect: East Asia,
   Europe, Africa, LATAM. They must come from the NEW builds, because every
   existing build has a baked `pk_test`. **Builds first, then screenshots.**
   I got this order wrong once.
4. **Demo passwords** for Africa and LATAM in ASC. Usernames are set;
   `demoAccountRequired` untouched. Passwords are the OWNER'S to enter.
5. **Consent gate**: server half plus mobile doors in the five non-India forks.
   Web authoring HELD until Saturday. `AI_CONSENT_ENFORCED = false` everywhere.
   LATAM has TWO sheets and its server half IS mounted but no client door.
6. **Art**: ~86 slots in `~/Downloads/BOLO-ART-PROMPTS.md`. `story/` is 129
   files per fork and is unowned.
7. **India bugs, filed not chased**: boarding pass overlaps the GANGA LINE
   header (a REAL layout bug, it survives with data loaded); homepage slow.
8. Bug pass: splash blur / double splash; East Asia cha cup art;
   `stall.mp4` needs a landscape source.

---

## 5. TRAPS THIS FLEET HAS ALREADY SPRUNG

- **`tsc -p` lies in this repo.** Use `tsc -b` / `pnpm typecheck`.
  Never typecheck an app alone.
- **Replit publish deploys the WORKSPACE, not GitHub.** Publish AFTER the pull.
  A failed publish looks IDENTICAL to a success from the app. Verify by hashing
  a served asset against the repo.
- **Publishing all six before the Repls pulled cost a wasted round**, and
  Replit then refuses new publishes while promoting.
- **Two Clerk secret slots** is the owner standard:
  `CLERK_SECRET_KEY` = `sk_test` (replit.dev + simulator),
  `CLERK_SECRET_KEY_PROD` = `sk_live` (custom domain).
  I published that standard without checking each fork's `app.ts` and BROKE
  INDIA. Check every fork before publishing a cross-fork convention.
- **India's `App.tsx` derives `pk_live` at runtime from the hostname**
  (lines ~198-222). The `pk_test` in the bundle is the replit.dev fallback.
  Reading the bundle key and calling it "the" key is wrong; I did it.
- **Apple IAP ids are account-unique.** A 409 on creation is the reference
  NAME colliding, not the id. Rename the old one `RETIRED ...`.
- **Grep counts are hypotheses.** My "all four non-SEA forks have SEA's copy"
  was LATAM only; the count included comments and tests. Open every hit.
- **Measure, do not assume.** I told SEA it carried `PILOT_CAPTURE_USER_IDS`
  entries; SEA is empty, only India has two. Caught before it reached an
  Apple-facing document.

---

## 6. SECURITY LINES I HELD, keep holding them

- I do not enter passwords or create accounts.
- I do not handle secrets in plain text.
- I refuse to perform an action another session's permission classifier
  blocked (permission laundering).
- There are Google OAuth `client_secret_*.json` files loose in the art folder.
  I flagged them, refused to copy them into a repo, and did not open them.

---

## 7. TOOLS LEFT BEHIND

- `~/bolo-supervisor/LEDGER.md` fleet memory. GREP IT BEFORE BUILDING.
- `~/bolo-supervisor/SUPERVISOR.md` the role definition.
- `~/Downloads/BOLO-ART-PROMPTS.md` every outstanding art slot.
- `scratchpad/readiness.sh` repo + live + store state for all six.
- `scratchpad/art-gaps.sh` which assets still match the parent byte-for-byte.
- `scratchpad/seamless-loop.sh` tail-into-head dissolve for film loops.
- `scratchpad/cutout.swift` Vision subject cut-out with real alpha.
- `scratchpad/asc-*.mjs` App Store Connect API.
  Key `AuthKey_9JRH367W88.p8`, issuer `5976462f-a05b-45a5-b9dc-84036df23eb3`.

---

## 8. THE FIRST THING THE NEW SUPERVISOR SHOULD SAY

Not a status summary. The owner already knows the status.
**Hand him the one paste that applies the `ai_consent` migration to India's
production database**, and nothing else in that message.
