# Progression Completion: Polish + Zone Capstone (Web)

Build 32 (web-only; mobile parity is a separate batch task).

## Step 0 Findings

### 1. Stop-completion flow (web)

`artifacts/gujarati-coach/src/pages/practice.tsx` renders the `summary` state (lines 1223-1375 in build 32). It holds `sessionResults: Record<phraseId, { band, xpAwarded, english, feedback, tip }>`. Sub-top-band phrases are identifiable as entries where `band` is not `"perfect"` or `"great"`. The phrase native text is available from the `phrases` state already loaded in practice.tsx. The summary is triggered client-side when all phrases in the session have been attempted; the server is not re-called at that moment. No zone-complete moment exists inside practice.tsx -- it only knows about the stop.

### 2. Zone-completion detection

The journey map (`journey.tsx`) computes `doneCount` / `totalCount` across all stations in a zone from the lesson-group listing data. There is no explicit zone-complete UI moment today; completion is derived on the journey map when all stations show `status: "completed"` or `"tested_out"`. `ZonePostcard` has a stamp/postmark visual but no all-complete state branching. The zone-complete capstone CTA must be added to journey.tsx, triggered when all stations in a zone flip to done on the next journey-map load after the last stop is completed.

### 3. Best-score guarantee

The `attempts` table stores every attempt as a new row (no overwrite). "Best score" is always `MAX(score)` across all attempts for a (user, phrase) pair, computed in `buildPhraseStats` (`lib/progressMetrics.ts`). The mastery latch in `lesson_group_progress` (`lessonGroupAccess.ts`) is idempotent and never downgrades. **No server change is needed for the best-score guarantee** -- it is inherent in the schema. A worse polish attempt physically cannot lower progress metrics. A pinning test (`best-band-regression.test.ts`) was added to anchor this guarantee against future refactors.

### 4. Chat system prompt assembly

`artifacts/api-server/src/lib/parrotChat.ts`. Static system prompt = `BOLO_PERSONA_PROMPT` + `LANGUAGE_RULES_PROMPT`. Context injected into the user message via `buildUserPrompt(languageName, history, transcript)`. Route: `POST /openai/chat` in `routes/openai.ts`. Web entry: `/chat` route in `App.tsx`, `pages/chat.tsx`. Payload fields: `languageCode`, `audioBase64|textInput`, `history[]`, `clientDurationSeconds`. Scenario framing is injected at the user-message level (not system prompt) to preserve OpenAI prompt-cache hits on the static system prompt.

### 5. Completed-stop / zone re-entry on journey map

`StationCard` shows "Completed"/"Tested out", 100% progress bar, full-width `Link` to `/practice/:zoneId?group=:stationId`. No explicit Polish or replay button existed before build 32. `ZonePostcard` showed stamp/postmark; no completed-zone state or capstone CTA. Both were extended in build 32.

### 6. Content storage for scenarios

Scenario definitions do not need a DB table for build 32. They are config-time content and live in a static object in `artifacts/api-server/src/lib/scenarios.ts`, keyed by scenario id. Adding zone N's scenario is a content-only code change.

### 7. API test baseline

Task #947 (Retire 14-failure baseline) was in-progress at the time of build 32. The 14-failure baseline applies. New api-server tests must pass or explicitly inherit the existing 14-failure set with no additions. New tests must not be run until Task #947 is merged.

---

## Part A: Checkpoint Polish (flag-gated, default OFF)

### Design decisions

**Feature flag**: `POLISH_ENABLED` server env var, read in `artifacts/api-server/src/lib/featureFlags.ts`. Default `false`. Exposed as `polishEnabled: boolean` on every `Category` item in `GET /categories` response. The journey map already fetches this; practice.tsx adds a `useListCategories` query (result served from React Query cache in most cases -- no extra network request).

**Polish card**: Rendered in practice.tsx `summary` state when `polishEnabled && !polishDismissed && subTopPhrases.length > 0`. Sub-top phrases = `sessionResults` entries where `band` is not `"perfect"` or `"great"`. Card lists sub-top phrases with band color chips and English gloss. "Re-run" CTA navigates to `/practice/:zoneId?group=:stationId&phraseIds=id1,id2,...`. "Skip" dismisses with zero friction (no navigation, no state change). Card never blocks the existing summary or "Back to journey" flow. When flag is off the conditional is entirely absent -- not a component that returns null.

**phraseIds filter**: practice.tsx reads `?phraseIds=<csv>` and filters the loaded phrases to only those IDs before starting the session. IDs are validated as a subset of the stop's phrases to prevent URL injection. No server change needed.

**polish=1 mode**: practice.tsx reads `?polish=1` and, after loading phrases (which now include `bestBand?: string | null` per phrase), filters to sub-top-band phrases. Used by the journey-map Polish pill (where phraseIds are not known at map-time). `bestBand` is derived from `buildPhraseStats` inside the existing phrases endpoint.

**allTopBand field**: Added per `LessonGroupSummary` in `GET /categories/:id/lesson-groups/:lang`. True when all phrases in the group have `bestScore >= 80` (Great threshold, FROZEN) AND at least one attempt exists. Derived from `buildPhraseStats` results in `deriveAndLatchUnlock`.

**allTopBand stamp on station cards**: When `polishEnabled && station.allTopBand`, a gold star icon (`lucide-react Star`, `fill-amber-400`) appears next to the progress bar inside the station card.

**Polish pill on journey map**: When `polishEnabled && (completed || tested_out) && !allTopBand`, a "Polish phrases" link pill is rendered below the station card (outside the card Link to avoid nested interactives), navigating to `/practice/:zoneId?group=:stationId&polish=1`.

### Best-score guarantee confirmation

The guarantee is inherent in the schema -- `buildPhraseStats` computes `MAX(score)` across all attempts. No guard was added in build 32 (adding one would be redundant). A pinning test in `best-band-regression.test.ts` anchors this.

---

## Part B: Conversation Capstone (live, no flag)

### Design decisions

**Scenarios config**: `artifacts/api-server/src/lib/scenarios.ts`. `Scenario` type: `{ id, zoneIndex, categorySlug, title, framingCopy, targetPhrases[], steerInstructions }`. `SCENARIOS` map keyed by id. `getScenarioByZoneIndex(i)` helper. `toPublicScenario(s)` strips `steerInstructions` for the client-facing endpoint.

**Prompt injection**: Scenario framing is injected into the user message (not the system prompt) via an optional `scenario` param in `buildUserPrompt`. This keeps `BOLO_PERSONA_PROMPT` + `LANGUAGE_RULES_PROMPT` unchanged and preserves OpenAI prompt-cache hits. The Scenario block (framing copy + steer instructions) is prepended to the user message after `Language:` and before `History:`.

**phrasesUsed detection**: Computed in the route handler (routes/openai.ts), not inside parrotChat.ts. Method: case-insensitive substring match of each target phrase's romanized form against the current turn's transcript. Accumulation across turns is done client-side (the route returns only the current turn's matches).

**sceneDone detection**: `true` when the majority of target phrases have been used across the session. The route computes total used phrases from `history` (learner turns, case-insensitive substring match) plus the current turn's transcript. Majority = `usedCount > targetPhrases.length / 2`.

**Zone 1 free, zone 2+ Plus**: `POST /openai/chat` checks `featuresForPlan(resolvedPlan.plan).allLanguages` for scenarios with `zoneIndex >= 1`. Returns 402 `upgrade_required` for free users. Zone 1 (`zoneIndex: 0`) is always accessible.

**XP award**: 20 XP on first completion. Written via `writeZoneCapstoneXp(db, userId, languageCode, stampId)` in `xpEngine.ts`, `source: "zone_capstone"`, `refId: stampId` for idempotency (same stamp id = same XP row = ON CONFLICT DO NOTHING on the xp_ledger).

**Chai token hook stub**: `tokensEarned: 0` is returned in the chat turn response. When `tokenEngine.ts` lands (token economy task), the Chai earn row will be added at the same call site in routes/openai.ts where `writeZoneCapstoneXp` is called. The field is already in openapi.yaml.

**zone_conversation_stamps table**: `(id serial PK, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, language_code text NOT NULL, zone_index integer NOT NULL, created_at timestamptz DEFAULT now(), UNIQUE (user_id, language_code, zone_index))`. Migration `0033_zone_conversation_stamps.sql`. Applied to dev DB in build 32.

**GET /scenarios/:id endpoint**: Returns `ScenarioPublic` (title, framingCopy, targetPhrases). Auth required; no entitlement gate (the gate is on POST /chat). Steering instructions are never exposed to the client.

**GET /journey/zone-stamps endpoint**: Returns `ZoneStamp[]` for the authenticated user and a given `lang` query param. Used by journey.tsx to render "Replay the chat" vs "Chat with Bolo" on ZonePostcard.

**Zone capstone CTA on journey map**: `ZonePostcard` shows a "Chat with Bolo at the chai stall" button when all stations in a zone are completed and a scenario exists for that zone. Shows "Replay the chat" when a stamp exists. Both navigate to `/chat?scenario=<id>`. No feature flag -- Part B is live.

**Scenario mode in chat.tsx**: URL param `?scenario=<id>` triggers scenario mode. Metadata fetched via `useGetScenario`. A non-dismissible banner shows title + framing copy. Target-phrase chips (romanized) are displayed above the input; they turn green when the phrase appears in `phrasesUsed` from any turn's reply. On `sceneDone`, a full-screen completion overlay shows Bolo in cheer pose, "+20 XP" chip, and "Back to journey" CTA. The overlay is session state (not persisted); a revisit shows the same chat surface.

---

## Zone 1 Scenario Content

**id**: `greetings-manners`
**zoneIndex**: 0
**categorySlug**: `greetings`
**title**: "At the platform chai stall"
**framingCopy**: "You are at the platform chai stall in Gujarat. The attendant greets every traveller with a warm 'kem cho?' and serves chai with a smile."

**Target phrases**:
| Romanized | Native |
|---|---|
| namaste | નમસ્તે |
| kem cho? | કેમ છો? |
| majaa-maan | મઝામાં |
| aabhaar | આભાર |
| jay shri krushna | જય શ્રી કૃષ્ણ |
| tamaro divas kevo rahyo? | તમારો દિવસ કેવો રહ્યો? |

**Steer instructions**: Play the chai-stall attendant. Greet the learner warmly, steer conversation naturally toward the target phrases, acknowledge warmly whenever the learner uses a target phrase, never grade or score, and deliver a warm closing line when the majority of target phrases have been used.

---

## Free-tier posture

| Zone | Scenario id | Free access? |
|---|---|---|
| 1 | greetings-manners | Yes |
| 2+ | (future content) | Plus required |

---

## XP amounts

| Event | XP | Source tag | Idempotency |
|---|---|---|---|
| Zone capstone first completion | 20 | zone_capstone | stamp id (refId) |
| Polish session attempts | Normal per-attempt XP | attempt | attempt row id |

---

## Chai token hook stub

Location: `artifacts/api-server/src/routes/openai.ts`, inside the `if (sceneDone && !existingStamp)` block, immediately after `writeZoneCapstoneXp`. When `tokenEngine.ts` lands, replace `tokensEarned: 0` with the actual earn call:
```typescript
const tokensEarned = await writeChaiEarn(db, userId, { source: "zone_capstone", refId: stamp.id });
```

---

## Build-32 task breakdown

| Step | Status | Files |
|---|---|---|
| 1. Spec document | Done | docs/specs/progression-completion.md |
| 2. DB migration zone_conversation_stamps | Done | lib/db/src/schema/zoneConversationStamps.ts, lib/db/drizzle/0033_zone_conversation_stamps.sql |
| 3. Feature flag + polishEnabled on Category | Done | api-server/src/lib/featureFlags.ts, routes/learning.ts, openapi.yaml |
| 4. allTopBand on LessonGroupSummary | Done | routes/learning.ts, openapi.yaml |
| 5. Scenarios config | Done | api-server/src/lib/scenarios.ts |
| 6. Scenario prompt injection in parrotChat.ts | Done | api-server/src/lib/parrotChat.ts |
| 7. Scenario route logic in openai.ts | Done | api-server/src/routes/openai.ts, api-server/src/lib/xpEngine.ts |
| 8. Polish card in practice.tsx | Done | artifacts/gujarati-coach/src/pages/practice.tsx |
| 9. phraseIds + polish=1 filter in practice.tsx | Done | artifacts/gujarati-coach/src/pages/practice.tsx |
| 10. Polish pill on journey map station cards | Done | artifacts/gujarati-coach/src/pages/journey.tsx |
| 11. allTopBand stamp on station cards | Done | artifacts/gujarati-coach/src/pages/journey.tsx |
| 12. Zone capstone CTA on ZonePostcard | Done | artifacts/gujarati-coach/src/pages/journey.tsx |
| 13. Scenario mode in chat.tsx | Done | artifacts/gujarati-coach/src/pages/chat.tsx |
| 14. GET /scenarios/:id endpoint | Done | api-server/src/routes/openai.ts, openapi.yaml |
| 15. Tests | Done (not yet run -- awaiting Task #947 merge) | See test files |
| 16. Spec finalization | Done | docs/specs/progression-completion.md |

---

## End-of-line note: Varanasi arrival (Build 33+)

**Concept (design sketch only -- not implemented in build 32):**

After the learner completes all six zones of their first language journey, the app shows a full-screen "Varanasi arrival" moment: an animated ticket-tear followed by a still image of the Varanasi ghats at dawn (brand palette overlay), Bolo in "cheer" pose on top, and a single line in the learned language + English gloss: "You arrived. Keep exploring." The moment uses the existing ticket-tear animation pattern and the canonical Bolo PNGs. No new art is generated. A "Explore the city" CTA opens a free-chat session with Bolo without a weekly cap for that session (celebration reward). The moment fires once per language journey completion and is recorded in a new `journey_completions` table (same shape as `zone_conversation_stamps`).

This is a design sketch for planning purposes. Implementation belongs in a separate build task.
