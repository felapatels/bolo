# Voice Data Contribution Program Spec

**Status:** Design spec. Build 32 implementation only. No production code, schema migrations, or store re-submissions are made as part of authoring this document.
**Scope:** Complete design for the "Contribute your voice" opt-in program that ships alongside pronunciation scoring v2 in build 32.
**Audience:** A developer joining in build 32 can read this document without referring back to the planning task.
**Today's date:** July 31, 2026

---

## Cross-references

- `docs/CODEBASE-FACTS.md` -- codebase inventory and architectural conventions
- `docs/specs/pronunciation-scoring-v2.md` -- gpt-audio ensemble grading pipeline (build 32+)
- `docs/specs/token-economy.md` -- token ledger schema and source enum (build 32/33)
- `docs/specs/android-parity.md` -- Play data safety table (audio row changes under this program)

---

## 1. Consent UX

### 1.1 Permanent home: account settings

The contribution toggle lives in account settings alongside the existing preference toggles (`dailyReminderEnabled`, `hasCompletedTour`, `ttsVoice`). It is always reachable from the settings screen on both web and mobile. No other permanent entry point exists.

### 1.2 Non-blocking introduction moment

The program is introduced exactly once, on the practice result screen, after the learner's FIRST pronunciation attempt that would qualify for retention (i.e. after build 32 ships and the `voiceContributionEnabled` flag is off). It appears as a non-modal bottom sheet, dismissable with no consequence. A "Learn more and enable" CTA opens account settings directly to the contribution toggle.

This is explicitly NOT a first-run interstitial and NOT a consent wall. Dismissing the sheet has no effect on the learner's session or on any feature access.

### 1.3 Plain-language disclosure copy

The following copy is the canonical text for the introduction sheet and the account settings description. It must appear verbatim (or in translation with equivalent meaning) wherever the program is disclosed.

**What is kept:** your practice recordings and the pronunciation scores they receive.

**What for:** helping Bolo learn to recognise different accents more fairly, so the scoring gets better for everyone.

**How long:** up to 24 months from the date of each recording.

**How to delete:** tap "Delete my voice contributions" in account settings at any time, or delete your account entirely.

### 1.4 Token incentive

When a learner turns the toggle on for the first time, they receive a one-time grant of 10 tokens (train fare tokens, same currency as the `token_ledger` spec). The grant source is `voice_contribution_optin` with `ref_id = users.id` (idempotent via the `UNIQUE (user_id, source, ref_id)` constraint on `token_ledger`).

Token copy: "As a thank-you for helping Bolo get better, we'll add 10 train fare tokens to your account."

The copy must not suggest that the learner is selling their voice or that their data will be used commercially.

### 1.5 Toggle semantics

Turning the toggle OFF stops future retention. Past contributions are NOT silently deleted.

Silent auto-delete on toggle-off is deliberately rejected: it would create a false sense that the data never existed and would undermine the evaluation dataset's integrity. Instead, the account settings section must surface a separate "Delete my voice contributions" button (see section 8). The button is always visible when the user has any retained contributions, regardless of the toggle state.

### 1.6 Age gating

Bolo collects no date of birth. Accounts created via Clerk carry no verified age signal. The program must therefore apply a best-effort age gate at the settings UI: a declaration checkbox reading "I confirm I am 18 or older" must be checked before the toggle can be turned on for the first time. This is a declaration, not a verified gate.

Whether this is sufficient before launch is an open question for Aakesh (see section 9, Finding 5).

---

## 2. Legal and Policy

### 2.1 Privacy policy additions

Insert the following section into the Bolo! privacy policy before launch:

---

**Voice Contribution Program**

If you choose to participate in the Bolo! Voice Contribution Program, we collect and retain the audio recordings you make during pronunciation practice sessions, together with the pronunciation score and transcript produced for each recording. Participation is entirely voluntary and controlled by a toggle in account settings.

We use retained recordings exclusively to evaluate and improve Bolo!'s pronunciation scoring models. Your recordings help us calibrate the scoring system across different accents and speaking styles, making the feedback fairer for all learners. We do not use retained recordings for advertising, profiling, or any purpose beyond model evaluation and improvement.

Your recordings are stored for up to 24 months from the date of each recording. After 24 months they are automatically deleted. You may also delete all your voice contributions at any time using the "Delete my voice contributions" button in account settings, or by deleting your account entirely.

Your recordings are processed by OpenAI (for pronunciation scoring, the same as all pronunciation attempts regardless of participation) and stored by Cloudflare (as a storage service provider under a data processing agreement). No other third party receives your recordings. No human outside of Aakesh's direct team accesses raw recordings without an internal access log entry.

---

### 2.2 iOS privacy label changes

The current iOS privacy label does not list audio data as collected and retained. The voice contribution program changes this for participating users. The label must be updated before build 32 ships to the App Store:

| Category | Field | Before program | After program (for opted-in users) |
|---|---|---|---|
| Audio Data | Collected | No | Yes |
| Audio Data | Linked to Identity | N/A | Yes |
| Audio Data | Used for | N/A | App Functionality and Product Personalization |

Note: "App Functionality" covers the scoring pipeline (unchanged). "Product Personalization" covers model evaluation that improves the learner's own scoring accuracy over time.

The existing "Audio Data -- sent for processing" entry (if any) must be updated to reflect both the transient processing path (all users) and the retained path (opted-in users only).

### 2.3 Google Play data safety corrections

The android-parity spec (section 5, data safety table) currently records the audio row as: "Audio recordings -- not stored after processing."

After the voice contribution program ships, this row must be corrected for opted-in users. The corrected row:

| Data type | Collected? | Shared with third parties? | Encrypted in transit? | User can request deletion? | Notes |
|---|---|---|---|---|---|
| Audio recordings | Yes | Yes (OpenAI for scoring; Cloudflare as storage processor) | Yes | Yes -- via "Delete my voice contributions" in settings or account deletion | Transient for all users (sent to OpenAI for scoring and discarded); additionally retained with explicit user consent for opted-in users, deletable on request |

The Play data safety form must be re-submitted after build 32 ships (see section 7, task g).

### 2.4 DPDP (India Digital Personal Data Protection Act 2023)

The consent basis for the program is explicit opt-in, which satisfies DPDP's consent requirement. Voice recordings are not listed as a special category of personal data under DPDP, but the program treats them as sensitive per its own principles.

The deletion right is provided by two mechanisms: the "Delete my voice contributions" button (contribution-specific) and the account deletion flow (full account). Both are already specified in this document and in the existing account deletion handler.

DPDP breach notification duty: once DPDP rules are notified by the Indian government, a breach involving retained voice data must be reported to the Data Protection Board within 72 hours. This obligation requires a lawyer's review before the program is promoted to users. Flag to Aakesh (see section 9, Finding 3).

### 2.5 GDPR and UK GDPR

If EU or UK users are served, the following applies:

The consent basis for GDPR purposes is valid: the opt-in toggle is freely given (no feature is gated on it), specific (voice recordings for model evaluation only), informed (the disclosure copy in section 1.3 satisfies the information requirement), and unambiguous (an affirmative toggle action).

The right to erasure is satisfied by the "Delete my voice contributions" action and by the account deletion flow.

A Data Processing Agreement with Cloudflare (as the storage processor for R2) is required before retained data is stored in R2 if any EU or UK users participate. Cloudflare publishes a standard DPA for R2. Confirm whether EU/UK users are in scope with Aakesh before launch (see section 9, Finding 4).

### 2.6 US state law (CCPA/CPRA)

Voice recordings qualify as sensitive personal information under CCPA/CPRA, requiring opt-in consent before collection and use. The program design already satisfies this requirement: participation is opt-in and no recording is retained without an affirmative toggle action. No additional "Do Not Sell or Share" flow is required because the data is not sold and is not shared for cross-context behavioral advertising.

### 2.7 OpenAI processing disclosure

Recordings contributed and retained under this program are still sent to gpt-audio for pronunciation scoring, exactly as today. The existing disclosure that "audio is sent to OpenAI for processing" is unchanged. Retained recordings continue to flow through the same scoring pipeline as non-retained recordings. This disclosure is explicitly unchanged by the contribution program.

Open question: confirm with Aakesh whether OpenAI's API terms permit the use of contributed audio for offline model evaluation (distinct from real-time scoring). This is a terms-of-service question, not a technical one (see section 9, Finding 7).

---

## 3. Storage and Data Architecture

### 3.1 Existing storage audit

A codebase search (`rg -r "s3\|r2\|supabase\|@aws-sdk\|blob" artifacts/ lib/ --include="*.ts" -l`) found no existing S3, R2, Supabase Storage, or blob storage client anywhere in the current codebase or deployment configuration. No object storage is provisioned for the project today.

### 3.2 Recommended storage provider: Cloudflare R2

Cloudflare R2 is recommended as the external bucket:
- Free egress (no bandwidth cost for reads, unlike S3)
- S3-compatible SDK (uses `@aws-sdk/client-s3` with a custom endpoint -- no new SDK category)
- Default AES-256 encryption at rest (no application-level encryption needed)
- Cloudflare publishes a standard DPA

Credentials are stored as Replit deployment secrets:
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

None of these secrets exist today. Aakesh must provision them before any storage work begins (see section 9, Finding 2).

### 3.3 Object storage path scheme

```
voice-contributions/{userId}/{attemptId}.m4a
```

Format: M4A, 16 kHz mono, 32 kbps, approximately 3 seconds per clip, approximately 50 KB per file.

### 3.4 Storage sizing and cost estimate

At 50 KB per clip:

| Monthly attempts | Opt-in rate | Monthly clips | Storage growth | Annual storage |
|---|---|---|---|---|
| 10,000 | 5% | 500 | 25 MB | 300 MB |
| 10,000 | 15% | 1,500 | 75 MB | 900 MB |
| 10,000 | 30% | 3,000 | 150 MB | 1.8 GB |
| 100,000 | 5% | 5,000 | 250 MB | 3 GB |
| 100,000 | 15% | 15,000 | 750 MB | 9 GB |
| 100,000 | 30% | 30,000 | 1.5 GB | 18 GB |

R2 pricing: $0.015/GB/month storage, $0.36/million Class A operations (writes), $0.00/GB egress. At 18 GB (100K attempts, 30% opt-in, one year), storage cost is under $0.30/month. At a 24-month retention window, the corpus stabilises at twice those figures once the program is mature. Storage cost is negligible relative to API costs.

### 3.5 Clip registry table: `voice_contribution_clips`

Build 32 schema migration adds this table:

```sql
CREATE TABLE voice_contribution_clips (
  id           serial PRIMARY KEY,
  attempt_id   integer     NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  user_id      text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language_code text       NOT NULL REFERENCES languages(code),
  storage_key  text,                       -- R2 path; nulled on soft-delete
  band         text        NOT NULL,        -- five-band result at time of recording
  transcript   text        NOT NULL,        -- STT transcript at time of recording
  scoring_path text        NOT NULL,        -- 'audio_ensemble' | 'audio_fallback_transcript' | 'transcript' | 'fast_path'
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz                  -- soft-delete; null = active
);

CREATE INDEX voice_contribution_clips_user_idx ON voice_contribution_clips (user_id, created_at DESC);
CREATE INDEX voice_contribution_clips_deleted_idx ON voice_contribution_clips (deleted_at) WHERE deleted_at IS NOT NULL;
```

This table is the clip registry and the join to transcript, band, and language makes the labeled evaluation dataset. The `scoring_path` column aligns with the column added to `attempts` by the scoring v2 migration (section 6 of the scoring v2 spec).

### 3.6 Retention mechanism: server-side tee

The clip is already in memory server-side during scoring: the audio bytes are received in the request body of `POST /openai/pronunciation`. Retention is a conditional upload to R2 AFTER scoring completes. It is a "tee" not a new upload from the client. The client never knows whether retention occurred; the response is identical either way.

### 3.7 Retention window and nightly sweep

Clips are retained for up to 24 months from `created_at`. A nightly sweep:
1. Soft-deletes clips older than 24 months by setting `deleted_at = now()` and nulling `storage_key`
2. After 7 days from soft-delete, hard-deletes the clip row from the DB

The 7-day gap between soft-delete and hard-delete provides an audit window if the R2 deletion job fails.

### 3.8 Failure posture

If the R2 upload fails after scoring, log the error at WARN level and continue. The attempt result is returned to the client unaffected. The `voice_contribution_clips` row is NOT inserted if the R2 upload fails (no orphaned registry rows pointing to missing objects).

If the `voice_contribution_clips` insert fails after a successful R2 upload, log at ERROR level (Sentry) and continue. The R2 object becomes orphaned; the nightly sweep can be extended to detect and delete orphaned R2 objects with no registry row.

---

## 4. Server Enforcement

### 4.1 Flag storage

A boolean column `voice_contribution_enabled` on the `users` table, following the exact pattern of `daily_reminder_enabled`:

```typescript
// lib/db/src/schema/users.ts -- add alongside dailyReminderEnabled
voiceContributionEnabled: boolean("voice_contribution_enabled")
  .notNull()
  .default(false),
```

Column: `voice_contribution_enabled boolean NOT NULL DEFAULT false`

### 4.2 API field

The flag is exposed via `PATCH /account/preferences` with the field name `voiceContributionEnabled`, following the existing validation pattern:

```typescript
if ("voiceContributionEnabled" in body) {
  if (typeof body.voiceContributionEnabled !== "boolean") {
    res.status(400).json({ error: "voiceContributionEnabled must be a boolean" });
    return;
  }
  set.voiceContributionEnabled = body.voiceContributionEnabled;
}
```

The field appears in the `preferences` response object under `learning` (alongside `activeLanguage`, `dailyGoal`, `theme`, `timezone`, `hasCompletedTour`, `hasChosenLanguage`, `ttsVoice`).

### 4.3 Retention decision point

The retention decision is made server-side in the `POST /openai/pronunciation` handler (`artifacts/api-server/src/routes/openai.ts`), AFTER scoring completes, by reading `users.voiceContributionEnabled` from the already-loaded user row. The flag is never trusted from the client.

Write path: after the band result is computed, if `voiceContributionEnabled` is true:
1. Upload the audio bytes (already in memory as the request body buffer) to R2 at `voice-contributions/{userId}/{attemptId}.m4a`
2. Insert a `voice_contribution_clips` row with `attempt_id`, `user_id`, `language_code`, `storage_key`, `band`, `transcript`, and `scoring_path`

Both operations are wrapped in a try/catch that logs on failure and does NOT affect the response or the returned band result.

### 4.4 Token grant on first enable

When `PATCH /account/preferences` sets `voiceContributionEnabled = true`, the handler checks whether a `voice_contribution_optin` row already exists in `token_ledger` for this user. If not, it inserts one:

```sql
INSERT INTO token_ledger (user_id, source, ref_id, amount)
VALUES ($userId, 'voice_contribution_optin', $userId, 10)
ON CONFLICT (user_id, source, ref_id) DO NOTHING;
```

The `ref_id` is the user's own id, making the grant idempotent across repeated enable/disable/enable cycles.

---

## 5. Deletion Machinery

### 5.1 Per-user contribution deletion endpoint

A new endpoint `DELETE /account/voice-contributions`:

- Soft-deletes all active `voice_contribution_clips` rows for the user: sets `deleted_at = now()` and nulls `storage_key`
- Enqueues async deletion of the corresponding R2 objects (using R2's batch delete API, max 1,000 keys per call; loop if more than 1,000 clips exist)
- Returns 204 immediately

Database rows are updated synchronously. R2 object deletion is async and completes within 1 hour. The async job logs completion and any per-object failures at WARN level.

### 5.2 Audit answer: proving deletion

The `voice_contribution_clips` table uses a soft-delete pattern: after the deletion action, the row remains with `deleted_at` set and `storage_key` nulled. The data itself (band, transcript, language_code) remains for 30 days as an audit trail, then a purge job hard-deletes the row entirely.

If a user deletes their account (see section 5.3), the rows are hard-deleted immediately as part of the account deletion cascade. In this case the audit trail does not apply; the fact of deletion is recorded in Sentry as a structured event at the time of account deletion.

### 5.3 Account deletion integration

The existing `DELETE /account` handler in `artifacts/api-server/src/routes/account.ts` currently deletes in this order (lines 425-456):

1. `familySeatsTable` (member seat, line 426)
2. Owned family plan's seats + plan (lines 428-437)
3. `chatTurnsTable` (line 439)
4. `friendInvitesTable` (line 441)
5. `attemptsTable` (line 443)
6. `badgesTable` (line 444)
7. `lessonGenerationsTable` (line 446)
8. `friendshipsTable` (line 449)
9. `usersTable` (line 456)

A new step must be inserted BEFORE the `attemptsTable` delete at line 443, because `voice_contribution_clips` has an FK to `attemptsTable` (ON DELETE CASCADE would handle it automatically, but the R2 objects must be deleted first and the cascade would leave them orphaned). The hook goes between `chatTurnsTable` (line 439) and `attemptsTable` (line 443):

```typescript
// Build 32: insert between chatTurnsTable delete (line 439) and attemptsTable delete (line 443)
// Hard-delete all voice_contribution_clips rows and enqueue R2 object deletion.
// The storage_key column is nulled atomically so orphan sweeps see no key to clean up.
const clipKeys = await db
  .select({ storageKey: voiceContributionClipsTable.storageKey })
  .from(voiceContributionClipsTable)
  .where(and(
    eq(voiceContributionClipsTable.userId, id),
    isNotNull(voiceContributionClipsTable.storageKey),
  ));
await db.delete(voiceContributionClipsTable).where(eq(voiceContributionClipsTable.userId, id));
// Fire-and-forget R2 batch deletion; account deletion should not wait on object storage.
if (clipKeys.length > 0) {
  deleteR2ObjectsBatch(clipKeys.map(r => r.storageKey!)).catch(err =>
    logger.error({ err, userId: id, count: clipKeys.length }, "R2 batch delete failed during account deletion")
  );
}
```

### 5.4 Tables the current deletion handler does NOT cover (orphaned rows)

The following tables are NOT deleted by the current `DELETE /account` handler. These are orphaned rows independent of the voice contribution program, but build 32 is the right moment to fix them when adding the voice clip hook:

| Table | Key column | Notes |
|---|---|---|
| `xp_ledger` | `user_id` | XP history orphaned on account deletion |
| `user_ability` | `user_id` | Elo/theta rows orphaned |
| `user_item_memory` | `user_id` | FSRS state orphaned |
| `phrase_reports` | `user_id` | Report rows orphaned |
| `daily_quiz_completions` | `user_id` | Quiz history orphaned |
| `token_ledger` | `user_id` | Will be orphaned once build 32 adds the table |
| `token_spend_ledger` | `user_id` | Same |

All of these should cascade-delete when `users` row is removed if the FK is defined with `ON DELETE CASCADE`. Audit the schema definitions for each table and add `ON DELETE CASCADE` to any FK that is missing it, or add explicit deletes to the handler in FK-safe order. See section 9, Finding 1.

---

## 6. Access and Use Governance

Voice contributions are used exclusively for calibrating and evaluating Bolo!'s pronunciation scoring models. They are not shared with any third party beyond Cloudflare (as storage processor) and OpenAI (as scoring processor, already disclosed for all pronunciation attempts). No human reviewer outside of Aakesh's direct team accesses raw recordings without an internal access log entry. The corpus is never used for advertising, sold, or provided to partners for any purpose. Access to raw recordings requires an explicit log entry (reviewer name, date, purpose, clip count) in a designated internal log maintained by Aakesh's team.

---

## 7. Build-32 Task Breakdown

Tasks are ordered by dependency. Items at the same level can be parallelised. All tasks are gated on build 31 beta approval.

**(a) Schema migration**

Add `voice_contribution_enabled` boolean to the `users` table and create the `voice_contribution_clips` table. Migration file in `lib/db/drizzle/`. Update Drizzle schema in `lib/db/src/schema/users.ts` and `lib/db/src/schema.ts`. Validate via `db-drift` and `db-migrations` checks. Also add the `voice_contribution_optin` source to the `token_ledger` source enum documentation in `docs/specs/token-economy.md` (code-only, no Postgres enum).

Files: `lib/db/src/schema/users.ts`, `lib/db/src/schema.ts`, new migration file, `docs/specs/token-economy.md`
Size: Small

**(b) Storage write path**

Set up the R2 client using `@aws-sdk/client-s3` with a Cloudflare R2 endpoint (using deployment secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`). Implement the upload tee in `POST /openai/pronunciation` after scoring completes: read `voiceContributionEnabled` from the loaded user row, upload audio bytes to R2 at `voice-contributions/{userId}/{attemptId}.m4a`, insert the `voice_contribution_clips` registry row. Wrap both in try/catch that does not affect the response.

Files: new `artifacts/api-server/src/lib/voiceContributionStorage.ts`, `artifacts/api-server/src/routes/openai.ts`
Depends on: (a)
Size: Medium

**(c) Consent UI**

Add the `voiceContributionEnabled` toggle to account settings on both web (`artifacts/gujarati-coach/src/pages/account/`) and mobile (`artifacts/bolo-mobile/app/(app)/account/`), alongside the existing preference toggles. Include the 18+ declaration checkbox that must be checked before first enable. Add the "Delete my voice contributions" button in the same settings section. Implement the one-time non-modal bottom sheet introduction on the practice result screen (fires once, after the first qualifying attempt, when the flag is off).

Files: account settings pages on web and mobile, practice result screen on web and mobile
Depends on: (a)
Size: Medium-Large

**(d) Token incentive**

Add `voice_contribution_optin` as a recognised source in the token earn path. In `PATCH /account/preferences`, when `voiceContributionEnabled` transitions to true, attempt an idempotent `token_ledger` insert (10 tokens, source `voice_contribution_optin`, ref_id = userId). Include `tokensEarned: 10` in the preferences response when the grant fires, so the client can show the earn toast.

Files: `artifacts/api-server/src/routes/account.ts`, `artifacts/api-server/src/lib/tokenEngine.ts` (once created by the token economy task)
Depends on: (a), token economy task (a) from `docs/specs/token-economy.md`
Size: Small

**(e) Deletion integration**

Implement `DELETE /account/voice-contributions` endpoint. Hook voice clip deletion into `DELETE /account` between `chatTurnsTable` (line 439) and `attemptsTable` (line 443). Implement the async R2 batch delete job. Also fix the orphaned-row gap for `xp_ledger`, `user_ability`, `user_item_memory`, `phrase_reports`, `daily_quiz_completions`, `token_ledger`, and `token_spend_ledger` (add `ON DELETE CASCADE` or explicit deletes as appropriate).

Files: `artifacts/api-server/src/routes/account.ts`, new `DELETE /account/voice-contributions` route, `lib/api-spec/openapi.yaml` (new endpoint)
Depends on: (a), (b)
Size: Medium

**(f) Policy and label updates**

Update the privacy policy with the text from section 2.1. Update the iOS privacy label via the App Store Connect Privacy tab (manual step for Aakesh). Update the Play data safety form with the corrected audio row from section 2.3 (manual step for Aakesh).

Files: privacy policy document (external), App Store Connect, Play Console
Size: Small (engineering side minimal; store steps are manual)

**(g) Store re-attestation**

Re-submit the Play data safety form after the corrected audio row is drafted and reviewed. Update the iOS privacy label submission in App Store Connect. Both require a new app review cycle if the changes are material.

Files: Play Console, App Store Connect
Depends on: (f), store review approval
Size: Small (mostly waiting on review)

**Explicit rule:** Retention ships OFF by default (`voice_contribution_enabled` defaults to false). The program can ship dark (flag wired, bottom sheet not yet shown) if build 32 schedule tightens. The storage write path and deletion machinery must be present and tested before the UI is shown to users; the UI is the only enablement vector.

---

## 8. Token Ledger Source Enum Addition

The `token_ledger` source enum in `docs/specs/token-economy.md` (section 1.1) must be extended with:

| source | ref_id | language_code |
|---|---|---|
| `voice_contribution_optin` | `users.id` of the opting-in user | NULL (cross-language grant) |

This source is idempotent by construction: since `ref_id = users.id` and the unique constraint is `(user_id, source, ref_id)`, a user who toggles on, off, and on again will only ever receive one grant.

---

## 9. Findings

All open questions listed here require Aakesh's decision or a lawyer's review before the program is promoted to users.

**Finding 1 -- Orphaned rows in the account deletion handler (engineering, not a blocker for the voice program itself):**
The existing `DELETE /account` handler in `artifacts/api-server/src/routes/account.ts` (lines 405-460) does NOT delete from: `xp_ledger`, `user_ability`, `user_item_memory`, `phrase_reports`, `daily_quiz_completions`, `token_ledger` (build 32), or `token_spend_ledger` (build 32). These produce orphaned rows on account deletion today. Build 32 should audit and fix the FK cascade rules on these tables when hooking in the voice clip deletion step. The location for the voice clip hook is between the `chatTurnsTable` delete at line 439 and the `attemptsTable` delete at line 443, because `voice_contribution_clips` has an FK to `attemptsTable`.

**Finding 2 -- No object storage client exists (blocker):**
No S3, R2, Supabase Storage, or blob storage client exists anywhere in the current codebase or deployment configuration. Credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) must be provisioned before any storage work begins. Aakesh's decision: provider (R2 is recommended; see section 3.2) and region (see Finding 4 for DPDP region considerations).

**Finding 3 -- DPDP breach notification (lawyer's review required before launch):**
Once DPDP rules are notified by the Indian government, a personal data breach involving retained voice data requires notification to the Data Protection Board within 72 hours. Bolo! does not currently have a documented breach response procedure. A lawyer familiar with DPDP must review this obligation and confirm whether the program can launch before the rules are notified, or whether a breach response plan is a prerequisite.

**Finding 4 -- GDPR/UK DPA with Cloudflare (Aakesh to confirm scope):**
If any EU or UK users participate in the program, a Data Processing Agreement with Cloudflare for R2 is required before their recordings are stored. Additionally, DPDP's rules (once notified) may require data residency within India; R2's default distribution is global. Aakesh to confirm: (a) whether EU/UK users are in scope; (b) whether India-region storage must be specified in the R2 bucket configuration before the program launches.

**Finding 5 -- Age gating (Aakesh's decision):**
Bolo collects no date of birth. The 18+ declaration checkbox at the consent UI is a best-effort measure, not a verified gate. Aakesh to decide: is the declaration checkbox sufficient before the program is promoted, or is a stricter mechanism (e.g. parental consent flow, DOB collection) required? Legal jurisdictions differ on what "best effort" means for voice data from minors.

**Finding 6 -- Token grant amount (Aakesh to confirm):**
The spec proposes a one-time grant of 10 tokens (`voice_contribution_optin` source). The `voice_contribution_optin` source must be added to the `token_ledger` source enum documented in `docs/specs/token-economy.md` before build 32 token work begins. Confirm with Aakesh that 10 tokens is the correct grant amount. This number can be changed at any time before launch by editing the constant; existing grants are not retroactively adjusted.

**Finding 7 -- OpenAI API terms and offline evaluation (confirm before using corpus):**
Retained recordings continue to flow through gpt-audio for real-time scoring (unchanged). The additional use case -- using the labeled corpus for offline evaluation of alternative scoring backends (see `docs/specs/pronunciation-scoring-v2.md`, Backend swappability note) -- is a distinct use of the audio data from real-time API processing. Confirm with Aakesh (and if necessary with legal counsel) whether OpenAI's API terms permit the use of audio data submitted via the API as an offline evaluation corpus. This is a terms-of-service question, not a technical one, and it affects whether the corpus can be used to qualify a self-hosted replacement backend.

### Decisions (July 31, 2025)

- **Finding 1:** Fix pulled forward to a standalone pre-build-32 task (orphaned deletion rows).
- **Finding 2:** Provider confirmed as Cloudflare R2; credential provisioning happens at the start of build 32.
- **Finding 3:** Bundled into a single legal consultation at build 32 planning, together with Finding 4's India-residency question and Finding 7.
- **Finding 4:** Cloudflare's standard DPA will be signed at account creation regardless of EU/UK scope.
- **Finding 5:** 18+ declaration checkbox is sufficient for launch; revisit before any India-focused marketing push.
- **Finding 6:** 10 tokens confirmed.
- **Finding 7:** See Finding 3 bundle.
