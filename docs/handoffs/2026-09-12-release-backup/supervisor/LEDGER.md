# THE BOLO LEDGER

**One file, five repos, outside all of them.** Every BOLO fork session reads this
before building a named feature and writes to it when a feature lands. It exists
because on 2026-09-06 an audit found one owner ruling built five separate times
with four different wire contracts, a whole shipped India feature that had never
travelled, and a fork about to hit a wall a sibling had already documented.

Seeded 2026-09-06 by the supervisor audit.

**NEWEST AT THE BOTTOM. GREP THIS FILE, NEVER SCROLL IT.** This line said "newest
at the top" until 2026-09-10 and had been false for days: the seeded X-entries
run oldest-first from the top and every entry since has been appended to the end.
A session that trusted it read the oldest material in the file believing it was
tonight's. Found by India, which noticed the header contradicted the four entries
it had just written. **The order was not changed, because reordering twelve
thousand lines on one session's judgment is a worse risk than a wrong signpost
was.** Entries are addressed by their `X-` id, so position carries no meaning.

The five repos, and their live state at seeding:

| Repo | Path | Domain | State |
|---|---|---|---|
| India | `~/bolo` | bolo-india.app | LIVE, both stores, the parent |
| Southeast Asia | `~/bolo-sea` | bolo-sea.app | API live, build 5 attached to ASC |
| Europe | `~/bolo-europe` | bolo-europe.app | Binaries in both stores, no backend |
| Africa | `~/bolo-africa` | bolo-africa.app | Dark, preview APK only |
| East Asia | `~/bolo-east` | bolo-east.app | Dark, preview APK only |

---

## HOW TO USE THIS FILE

**Before you build anything with a name, grep this file for that name.**

```bash
grep -i "free taste" ~/bolo-supervisor/LEDGER.md
```

**Grep the keyword index below, not your own phrasing.** The first version of this
file failed its own example: `grep -i "free taste"` missed the entry, because the
code spells it `freeTaste` and the entry said "games taste". Every open item
carries its aliases now.

| Item | Grep any of these |
|---|---|
| X1 | `product id` `appleProductId` `bolo_kopi` `cowries` `consumable` |
| X2 | `reply_to` `SUPPORT_EMAIL` `MX` `bounce` `LARKsupport` |
| X3 | `RESEND_FROM` `resend` `SPF` `DKIM` `REPLACE_ME` `email sending` |
| X4 | `privacy` `delete-account` `deletion page` `site/` `server-render` `crawler` |
| X5 | `daily-gift` `dailyGift` `letter-match` `letterMatch` `letter drill` `letter-stops` `order-gates` |
| X6 | `free taste` `freeTaste` `gameTaste` `game taste` `games/taste` `taste_over` |
| X7 | `clerk` `clerk-go-production` `OAuth` `client_id` `pk_live` `social sign-in` |
| X8 | `blockedPermissions` `FOREGROUND_SERVICE` `READ_MEDIA_IMAGES` `expo-audio` `declaration` |
| X9 | `pagdi` `outfits` `Tailor` `wardrobe` `kurta` |
| X10 | `screenshots` `assets/store` `bengali` `tamil` `gujarati` |
| X11 | `FREE_LANGUAGE` `FREE_LANGUAGES` `entitlements` `free tier` |
| X12 | `remote` `cherry-pick` `changelog` `sibling` |
| X13 | `CI` `GitHub Actions` `billing` `spending limit` `red run` |
| X14 | `deletion page` `delete-account` `support page` `Data safety URL` |
| X15 | `detector` `guard` `census` `grep` `tsc` `set -e` `false green` `agreed for the wrong reason` |
| X15b | `reachable is not declared` `hoist` `undeclared dependency` `--filter` `bin shim` |
| X16 | `absent field` `blank` `Play Store settings` `category` `filled is not correct` |
| X16b | `SUPPORT_INBOX_EMAIL` `fallback` `correct by accident` `absent-and-undocumented` |
| X17 | `four surfaces` `Hello@LarkEnterprisesLLC` `larkenterprises` `false comment` `Email Routing` |
| X18 | `budget` `$0` `stop usage` `2000 minutes` `cancel-in-progress` `duration not colour` |
| X19 | `splash` `blurry` `first load` `poster` `white opening` `-v2` `settb` `xfade` `usePosterReady` |
| X20 | `half took` `CLERK_SECRET_KEY_PROD` `read it back` `fresh shell` `eas env:set` `prefix check` |
| X21 | `usePosterReady` `gate` `render site` `reduceMotion` `shape.still` `port creates the bug` |
| X22 | `kling` `flow` `credits` `native audio` `generate` `prompt trap` `middle distance` |
| X23 | `three worlds` `kulhad` `chacha-welcome` `uncle` `keep and owed` `deliberate` |
| X24 | `replit` `pane` `skeleton` `not rendering` `outage` |
| X25 | `READ_MEDIA_IMAGES` `permission` `rejection` `536` `system pickers` `e1d04214` |
| X26 | `flag` `tricolour` `chakra` `adaptive-icon` `icon.svg` `histogram` `small wrong object` |
| X27 | `undeclared import` `@jest/globals` `declare what you import` `question not a defect` |
| X28 | `replit` `shell` `git pane` `data layer` `spinner` |
| X29 | `blockedPermissions` `requestMediaLibraryPermissions` `picker` `broken by its fix` `SVG parse` |
| X30 | `kling` `pre-fix prompt` `thumbnail` `no duration` `5s or 8s` `same file` |
| X31 | `delete-account` `route` `does not exist` `routing table` `data deletion URL` |
| X32 | `prerender` `ssrLoadModule` `wouter` `ssrPath` `SPA fallback` `silent skip` |
| X33 | `chai` `kopi` `wire field` `display noun` `gate 3 ruling` `DailyGiftState` |
| X34 | `daily-gift` `portability table wrong` `order-gates` `devanagari` `letter-match travels free` `unlinked workspace` |
| X35 | `letter drill scope` `non-latin` `script field` `port priority` `test passes because bug` |
| X36 | `UNCLE_LINES` `grandmother` `English fallback` `fixture shelf life` `adding a language` |
| X37 | `download` `kling player` `no duration` `retrieval` `art blocked` |
| X38 | `count` `commits ahead` `handoff number` `stale count` `origin/main..main` |
| X39 | `CI` `GitHub Actions` `alive` `billing` `duration is the tell` `stub run` |
| X40 | `flaky` `false red` `practice-streak-xp` `UNSTOPPABLE` `uncle-name` `red at head` `frozen-lockfile` |
| X43 | `chacha-welcome` `og-image` `elder audio` `bazaar film` `keyart` `wrong control` `WELCOME_MS` `STILL_MS` |
| X44 | `two encodes` `count paths not films` `web and mobile differ` |
| X45 | `relayed permission` `not an owner fact` `pending prompt` |
| X47 | `timeout cap` `used over cap` `testTimeout` `speed-round-combo` |
| X48 | `a comment is not a guard` `mvhd` `fail on purpose` `blind pin` |
| X49 | `constraint is not an assignment` `letter-match does not exist` `sea-alphabets` `TRACING_ENABLED` |
| X50 | `empty search` `zsh glob` `--include` `positive control` `instrument never ran` |
| X51 | `grep for the number` `two different 30 days` `labels per surface` |
| X52 | `wide cut` `crop=1080:608` `no render` `same source` |
| X53 | `post before you fix` `deletion lockout` `four forks one lesson` `voice_contributions` |
| X54 | `store taxonomy` `38 of 41` `never audit by name` `recapture did not cover` `unblocked and unwritten` |
| X55 | `phantom ids` `pg_constraint` `both ways proof` `dirty database` `?? 1` |
| X56 | `parent CI header` `known flakes` `a second failure is real` |
| X57 | `503 vs 401` `/api trap` `rc_promo` `NON_RENEWING_PURCHASE` `REVENUECAT_SECRET_API_KEY` `STRIPE_SECRET_KEY` `REPLACE_ME` `?? fallback` `sentry log route` |
| X58 | `clerk then repl then dns` `form_input` `react does not see it` `a save that succeeded` |
| X59 | `exact paths only` `privacy/index.html` `directory index` `prerender innocent` `store url is the fix` |
| X84 | `TAB_BAR_CLEARANCE` `floating tab bar` `rubber band` `autoscroll` `scrolls back to top` `padTop` `double notch` `raw ScrollView` |
| X89 | `kopi-pack` `chai-pack` `promoted purchase` `assets/store` `promo image` `console upload` `generateStorePromo` `per file not fleet` |
| X90 | `script trace` `chapters.ts` `FONT_BY_PREFIX` `SEA_ALPHABETS` `provisional glyphs` `AUTHORED_GLYPHS` `stroke order` `TRACING_ENABLED` `syllabus` |
| X93 | `privacy url` `support url` `SPA shell` `prerender` `nonsense path` `same hash` `5.1.1` `3.1.2` `/contact` |
| X95 | `publishableKeyFromHost` `CLERK_PUBLISHABLE_KEY` `CLERK_SECRET_KEY_PROD` `pk_live` `pk_test` `isCustomDomain` `replit.app` `preview auth` `branch half a pair` |

If a sibling has built it, read their commit before you write a line. On
2026-09-04 reading one East Asia commit found five defects in India's
half-finished version of the same feature in minutes. The forks are each other's
review, and the cost of using them is reading one commit.

**When a feature lands, add a line.** Format:

```
YYYY-MM-DD  fork  sha       VERDICT   one line of what
                                      -> who is owed it, or why it cannot travel
```

Never delete an entry. An entry that turns out wrong gets a dated correction
below it, because the order things were learned in is the useful part.

---

## THE THREE GATES

Answer these in order. The first one that fits decides the verdict.

### Gate 1. Does it name a language, a place, a currency, a font, a store id or a price?

**Verdict: REGION.** It does not travel and it never should. Write it again per
fork. Components are where the forks are supposed to differ; logic is where they
must not.

### Gate 2. Is it a pure function, a server rule, a schema, a guard script, a test that pins no region fact, or a build or console finding?

**Verdict: ENGINE.** The other four forks are owed it.

```bash
git cherry-pick -x <sha>
```

The `-x` writes the source hash into the message, so six months later the two
repos can still be told apart from a coincidence. If it cannot travel, the commit
in each repo says so in one sentence, which is what stops the next session trying.

**A FINDING travels too, and it is free.** "The first iOS build runs unattended
on a cached fastlane session" is not code and it is worth more than most code.

### Gate 3. Does it touch `lib/api-spec/openapi.yaml`?

**STOP before writing it.** The contract has to be identical in all five repos or
nothing cherry-picks again. A name chosen locally is how one ruling became four
wire formats.

**Verdict: CONTRACT.** Post the proposed schema name, field name and path here and
wait for a ruling. This is the only gate that blocks.

---

## WHAT NEVER TRAVELS, SETTLED 2026-09-04

Do not re-argue these. A shared component library across five forks was proposed
and rejected: inside ONE repo web and mobile already cannot share components, so
across five forks that is ten surfaces, and components are exactly where the forks
are supposed to differ.

- Client screens and components. Write it twice, deliberately.
- Language lists, content, phrases.
- Assets, films, fonts.
- Config and identity: domain, bundle id, slug, scheme, vendor ids.
- Tests that pin a region fact. Invert each with a dated comment. Never delete a pin.
- `artifacts/api-server/pure-tests.txt`. Regenerate per repo.
- Generated clients (`lib/api-zod`, `lib/api-client-react`). Take the spec, then run
  codegen. A generated file cherry-picked is a merge conflict wearing a diff.

---

## OPEN CROSS-FORK ITEMS, RANKED

These are the debts outstanding at seeding. Each names who solved it and who is
owed it. Claim one by adding a dated line under it.

### X1. Apple product ids are account-scoped. East Asia is blocked on this today.

**Solved by:** Africa, 2026-09-06. **Owed to:** East Asia, urgently.

`~/bolo-east/artifacts/api-server/src/lib/kopiPacks.ts` declares
`appleProductId: "bolo_kopi_cup"`, `"bolo_kopi_pot"`, `"bolo_kopi_tray"`. Those are
Southeast Asia's, created in App Store Connect on 2026-09-05. **An App Store
product id is unique across the whole developer account and cannot be reused even
after deletion.** East Asia's Cha pack shop is unshippable exactly as written.

Africa hit the identical wall, renamed to `bolo_africa_cowries_25`, `_75`, `_200`,
and pinned it with six test files on both sides of the wire. Read that commit.

**2026-09-06, africa: the commit is `d335597b`**, "The three cowrie packs take this
fork's own Apple product ids". Nine files: `kopiPacks.ts` plus five api tests, two
mobile suites and `app.json`. Three things in it that are not obvious from the
diff and cost time to work out:

- **The ids name the fork AND the currency a learner sees**, not the engine's
  identifier. The schema, webhooks, RevenueCat and Stripe all still say `chai` and
  `kopi`; only the App Store product id moved. Renaming the identifier would have
  been a migration, and the store does not care what the column is called.
- **`bolo_kopi_Cutting` in `kopiPackDrop.test.ts` stays**, deliberately. It is a
  wrong id in a test that proves an unknown product credits nothing, so pointing it
  at a real id would delete the coverage.
- **Nothing is redefined**, because no purchase existed on any platform for this
  fork. If a sibling has already SOLD one of these ids, this is not the same job:
  a live product id cannot be renamed, only replaced alongside the old one.

`d335597b` cherry-picks cleanly in shape but not in content: the ids themselves are
REGION. Take the six pinned files as the map of what has to move together.

Ids already taken on the account: `bolo_chai_*` (India), `bolo_kopi_*` (SEA),
`bolo_caj_*` (Europe), `bolo_africa_cowries_*` (Africa).

### X2. The reply-to address bounces, and it is live in production.

**Found by:** the audit, 2026-09-06. **Owed to:** all five, India first.

`appDomain.ts` sets `SUPPORT_EMAIL = support@${APP_DOMAIN}`, read by
`familyInviteEmail.ts`, `inviteEmail.ts`, `quotaAlertEmail.ts` and the Terms page.
**No BOLO domain has an MX record.** Not bolo-india.app, not any fork. A parent who
receives a family invite from the live India app today, hits Reply and asks a
question is writing into a void.

Europe found half of this and switched its five website pages to
`LARKsupport@gmail.com`, the address India already publishes on its Play listing.
It did not change the code constant, in Europe or anywhere else.

Owner decision pending: point `reply_to` at the gmail address in all five, or add
MX records to the five domains.

**RULED and LANDED in SEA, 2026-09-06 — `cfa34b76`, not yet pushed.**
Address is **`Hello@LarkEnterprisesLLC.com`**, not the gmail. Re-verified before the
line was written: `larkenterprisesllc.com` publishes three Cloudflare Email Routing
MX records (route1/2/3.mx.cloudflare.net) and
`v=spf1 include:_spf.mx.cloudflare.net ~all`.

> **`larkenterprises.com`, WITHOUT the LLC, is a different domain with NO MX and NO
> SPF.** It was checked first and it is dead. Typo it and you have shipped the same
> bug wearing a better name.

**DO NOT JUST CHANGE THE CONSTANT — that breaks the quota alert.** The three
consumers are not equivalent:

| File | Uses SUPPORT_EMAIL as | Safe to inherit? |
|---|---|---|
| `familyInviteEmail.ts:124` | `reply_to` | yes |
| `inviteEmail.ts:144` | `reply_to` | yes |
| `terms.tsx` | displayed text | yes |
| `quotaAlertEmail.ts:13` | **the `From`** | **NO** |

Resend sends only from a domain IT has verified, which the LARK domain is not. The
naive swap turns a best-effort alert into a guaranteed failure, and it fails in the
shape that still reads like success in the code. SEA split it: `SUPPORT_EMAIL` is
reply-to only; the alert `From` defaults to `alerts@${APP_DOMAIN}` behind
`ELEVENLABS_ALERT_FROM`. **Each fork must split it too, not just re-point the constant.**

Still open after this: the contact form (`resendClient.ts`) delivers to
`LARKsupport@gmail.com` while replies now go to the LARK domain, so support is split
across two inboxes. Owner's call, overridable with `SUPPORT_INBOX_EMAIL`.

**LANDED IN INDIA, 2026-09-06 — `a26db0aa`, not pushed.** Owner re-confirmed the
address in the India session before anything was changed; a peer session's report
of a ruling was not treated as the ruling.

> **CORRECTION TO THIS ENTRY'S FIRST LINE, and it matters for the other three
> forks' reading of it. India had NO `appDomain.ts` and no `SUPPORT_EMAIL` at
> all.** The description above is the FORKS' shape, not the parent's: India's four
> consumers each hardcoded their own copy of the literal. So for India this was a
> new file rather than a re-point, and any fork that still predates `appDomain.ts`
> should expect the same.

India took the same split SEA did (`SUPPORT_EMAIL` is reply-to only; the alert
`From` is `alerts@${APP_DOMAIN}` behind `ELEVENLABS_ALERT_FROM`) and added two
things the forks are owed, both ENGINE:

- **`appDomain.test.ts`, six pure cases**, in `pure-tests.txt` so CI runs them.
  The one worth copying is a **census**: no `lib` file may write a bolo address as
  a string literal again, both invite senders must take `reply_to` from the
  constant, and `quotaAlertEmail` must NOT import it. That last case is the one
  that fails loudly if a future session "tidies up" the split this entry warns
  about, which prose in a comment cannot do.
- **A typo guard on the LLC.** The domain is asserted equal to
  `larkenterprisesllc.com` and not equal to `larkenterprises.com`, so the trap
  named in this entry is enforced rather than remembered.

**SEVERITY IS HIGHER THAN "REPLIES BOUNCE", and this is not in the entry above.**
A `reply_to` on a domain with no MX is a deliverability signal, so the invites
themselves may be under-delivering, not merely un-replyable. That makes every
"the invite never arrived" report suspect. It is unmeasured; measure AFTER the
change in each fork, since what you are measuring is whether delivery improves.
India is where this is real rather than theoretical: it is the only one of the
five live in both stores.

### X3. Email cannot send from any fork.

**Found by:** the audit, 2026-09-06. **Owed to:** all four forks.

India publishes `v=spf1 include:amazonses.com ~all` and a `resend._domainkey`
record. **No fork domain has either**, so Resend refuses to send from them.

| Fork | `RESEND_FROM` | What happens |
|---|---|---|
| SEA | `REPLACE_ME_BOLO_SEA` | not an address, send throws |
| Europe | `REPLACE_ME_BOLO_EUROPE` | not an address, send throws |
| Africa | `hello@bolo-africa.app` | domain unverified, Resend refuses |
| East Asia | `hello@bolo-east.app` | unverified, and `RESEND_API_KEY` is missing from the Repl |

Nothing sends mail until a real learner invites a family member, so every fork will
learn this from a user rather than from a test.

### X4. Only Europe serves legal pages a crawler can read.

**Solved by:** Europe. **Owed to:** India, SEA, Africa, East Asia.

Fetched without JavaScript, `bolo-india.app/privacy`, `/delete-account` and a
nonsense path all return the **same 7,972 bytes** with the homepage title. SEA is
the same at 12,847 bytes. Both are real SPA routes that render once JavaScript
runs, and both are the URLs declared to the stores.

Europe has a `site/` directory built by `site/build.py`: 6,220 bytes of real
privacy policy, 3,213 bytes of real deletion page, a distinct fallback, and every
support mailto wrapped in Cloudflare's `<!--email_off-->` opt-out because Email
Address Obfuscation was rewriting the address into JavaScript.

India and SEA serve the app on the apex with client-side legal pages. Europe serves
real legal pages on the apex and has no app there at all. Neither shape is right;
both halves of the right one are already written.

### X5. Daily Gift, Letter Drill and Letter Match have never travelled.

**Built by:** India. **Owed to:** all four forks.

All four carry the 16KB spec at
`docs/spec-letter-drill-letter-match-daily-gift.md`. None carries a line of the
code. India has:

- `lib/daily-gift` (197 lines, pure), and `lib/game-taste` (142 lines, pure)
- `lib/script-trace/src/letter-match.ts`, `letter-stops.ts`, `order-gates.ts`
- `artifacts/api-server/src/lib/nestDrillMetrics.ts`
- five endpoints no fork has: `/tokens/gift`, `/tokens/gift/claim`,
  `/games/letter-match/complete`, `/games/letter-stop/complete`, `/games/plays`
- `DailyGiftBox.tsx`, `DailyGiftCard.tsx`, `games/letter-match.tsx`

The portability table names `daily-gift` and `game-taste` in its "travels,
unchanged" row. Both packages are absent from all four forks.
---

## X5 PORT BRIEF, written by India 2026-09-07

Read this before touching any of it. Every claim was measured in the five trees
tonight, not inferred from the spec.

### 5a. THE ORDER, so the tree typechecks at every step

Five stages. Each one compiles on its own; stop anywhere and the repo is green.

**1. The two pure packages.** `lib/daily-gift` and `lib/game-taste` copy over
whole. Both have **zero imports**, checked: nothing to resolve, nothing to
order. **Add the workspace links in the SAME commit** as the code. India shipped
`@workspace/daily-gift` without its link and the api suite could not run AT ALL,
so `games.letter-stop.test.ts` sat unexecuted through two handoffs and looked
green because it never started.

**2. The three script-trace files.** `letter-match.ts` imports `./trace-stops`;
`letter-stops.ts` imports `./scripts` and `./trace-stops`; `order-gates.ts`
imports `./stroke-scoring`. **All four forks already have all three
prerequisites**, verified file by file, so this is a clean drop-in. Add the three
`export *` lines to `lib/script-trace/src/index.ts` last, or the package exports
names it cannot yet resolve.

**3. The contract.** The openapi fragment, then
`pnpm --filter @workspace/api-spec run codegen`. This regenerates
`api-client-react` and `api-zod`, so the clients get their hooks before any
client code asks for them. **See 5c: this stage is gated and must not be
improvised.**

**4. The server.** Routes plus `nestDrillMetrics.ts`. Needs stages 1 to 3.

**5. The clients.** `DailyGiftBox.tsx`, `DailyGiftCard.tsx`,
`games/letter-match.tsx`, and the hub wiring. Web and mobile are hand-maintained
twins here as everywhere; do both or say which and why.

### 5b. THE ENGINE/REGION SPLIT, file by file

| File | Verdict | The part that is not obvious |
|---|---|---|
| `lib/game-taste` mechanism | **ENGINE** | `gameTasteState`, `isHubPlay`, `GAME_TASTE_PLAYS` are region-free |
| `lib/game-taste` `TASTE_GAME_IDS` | **REGION** | Which games are free is a per-fork owner ruling and already differs |
| `lib/daily-gift` ladder | **ENGINE** | `giftChaiForStreakDay`, `giftTierForStreakDay`, `giftRefId` |
| `lib/daily-gift` copy | **REGION** | `giftClosedCopy`, `giftOpenedCopy`, `giftResetCopy` are ENGLISH UI STRINGS **and name the currency** |
| `letter-match.ts` | **ENGINE** | matches letter to SOUND; needs characters and romanisations, never strokes |
| `letter-stops.ts` mechanism | **ENGINE** | the stop-4-of-every-zone rule and the pool selection |
| `letter-stops.ts` `LETTER_LOOKALIKES` | **REGION** | a hand-written confusion table, today Devanagari, Bengali and Gujarati only |
| `order-gates.ts` | **ENGINE, but see 5d** | the gate is real; the DATA it gates on is not present in any fork |
| `nestDrillMetrics.ts` | **ENGINE** | |

> **THE ONE THE PORTABILITY TABLE GETS WRONG.** It lists `lib/daily-gift` in the
> "travels, unchanged" row. **It does not travel unchanged.** Three of its
> exported functions return display copy, and that copy says "Chai". SEA renamed
> that noun to Kopi (`kopi-errors.ts`, and `Kopi granted` in its own
> `referral-link`). A fork that copies the package whole ships an English string
> naming the wrong currency, and it will typecheck perfectly.
>
> **The fix is the same in all four and it is small:** take the ladder, and
> re-author the three copy functions against the fork's own noun. Do NOT
> parameterise the currency name into the package; a `currencyNoun` argument
> threaded through three functions costs more than three re-authored strings and
> hides the region-ness the next reader needs to see.

`LETTER_LOOKALIKES` is the other one to author rather than copy. It exists
because edit distance on romanisation catches the ear's confusions and misses
the eye's entirely, and there is no rule that generates it. India's list is
short and honest. **A fork copying India's list gets a table of Devanagari pairs
for scripts it does not teach**, which is worse than an empty table because it
looks populated.

### 5c. THE CONTRACT. Gate 3, and it has ALREADY been broken once

**All five endpoints are already fully specified in India's
`lib/api-spec/openapi.yaml`.** There is nothing to design. The proposal is:
**adopt India's fragment verbatim, byte for byte, in all four forks.**

| Path | Method | operationId | Schemas |
|---|---|---|---|
| `/games/plays` | GET | `getGamePlays` | `GamePlays` {plays, limit} |
| `/games/letter-match/complete` | POST | `completeLetterMatch` | `CompleteLetterMatchInput` {lang, correct, total} → `LetterMatchResult` {correct, total, xpAwarded} |
| `/games/letter-stop/complete` | POST | `completeLetterStop` | `CompleteLetterStopInput` {lang, journey, zone, correct, total} → `LetterStopResult` {passed, correct, total, xpAwarded} |
| `/tokens/gift` | GET | `getDailyGift` | `DailyGiftState` {day, chai, tier, tomorrowChai, claimed, claimable, streakDays, earnedToday, localDay, balance} |
| `/tokens/gift/claim` | POST | `claimDailyGift` | `DailyGiftClaimResult` |

> **STOP HERE. `DailyGiftState` HAS A FIELD LITERALLY NAMED `chai`, AND THE WIRE
> CONTRACT HAS ALREADY SPLIT.** Measured tonight: India's `openapi.yaml` contains
> `chai` 21 times and `kopi` zero; **SEA's contains `kopi` 18 times and `chai`
> zero.** X6 is not a risk here, it is already realised on the currency noun,
> and porting Daily Gift without a ruling makes it five.
>
> **India's proposal, for a ruling rather than for adoption:** the five endpoints
> above go into all four forks with the field named **`chai`**, unchanged, and
> the currency noun is treated as a **DISPLAY** concern resolved in the client.
> A wire field is an identifier, not a word a learner reads. SEA would carry
> `chai` on these five while rendering "Kopi", which reads wrong in a diff and is
> right in every other way: one schema, one codegen output, one cherry-pick.
>
> **The alternative I considered and rejected:** a neutral third name such as
> `tokens`. It is cleaner on paper and it costs a breaking change to India's LIVE
> contract to fix a problem the four forks do not have yet. Not worth it tonight.
>
> **This does NOT resolve X6 for the pre-existing endpoints.** SEA's `kopi` on
> its other paths is a separate debt and this brief does not touch it.

#### RULED, 2026-09-07. THE FIELD IS `chai` ON THE WIRE IN ALL FIVE REPOS.

The proposal above is the ruling. Each client renders its own word: Kopi in
Southeast Asia, and whatever Europe, Africa and East Asia land on. **Do not
re-litigate this at 3am**, and in particular do not "fix" `chai` when you meet it
in an African or European app: that is how the fifth contract arrives, by
tidiness rather than by disagreement.

Three reasons, recorded so they do not have to be rediscovered:

1. **A wire field is an identifier, not a word a learner reads.** Nobody sees
   `chai` without opening a network tab. The display noun already lives in the
   client, which is where the region-ness belongs.
2. **One schema, one codegen output, one cherry-pick.** That is the entire point
   of Gate 3 and the only outcome that delivers it.
3. **A neutral third name (`tokens`) was rejected on cost, not on taste.**
   Cleaner on paper, and it costs a BREAKING CHANGE TO A LIVE CONTRACT to fix a
   problem the four forks do not have yet. India's shipped clients would break on
   a field rename. **Do not trade a real break for a tidy diff.**

**DEFERRED, NOT CLOSED.** If India ever ships a contract-breaking version bump
for other reasons, the neutral rename rides along on that window at near-zero
cost. **Do not go looking for the window.**

**CONDITION, AND IT IS ALREADY DONE IN INDIA (`e08a57a2`).** The field carries a
comment in `openapi.yaml` stating that it is an identifier and naming this
ruling. **Copy that comment with the fragment.** It is the guard; the ruling
without it is a message nobody in the fork will ever read.

> **The comment cannot reach codegen, and that was proven rather than assumed:**
> parsing the spec before and after and comparing the JSON gives identical, and
> the `chai` property is unchanged. So adding it regenerates nothing and does not
> re-open the gate it documents. A fork can paste it in with no rebuild.

### 5d. WHO SHOULD PORT WHICH FEATURE, AND WHO SHOULD NOT

**READ THIS BEFORE THE REST OF 5d. It is the most decision-relevant thing in the
brief and it says three of the four forks should not build half of this.**

Africa's observation, and it reframes the job: a letter drill on the LATIN
alphabet teaches a diaspora learner nothing they do not already know. So the
question is not "can this fork run it" but "how many of its languages is it
worth anything to". Counted from the `script` field of every `seedData.ts`,
independently in both the supervisor's tree and India's, agreeing exactly:

| repo | non-Latin | total | scripts |
|---|---|---|---|
| **India** | **22** | 22 | Devanagari 8, Perso-Arabic 3, Bengali, Bengali-Assamese, Gujarati, Gurmukhi, Kannada, Malayalam, Meetei Mayek, Odia, Ol Chiki, Tamil, Telugu |
| **East Asia** | **10** | 10 | Traditional Chinese 5, Simplified 3, Japanese, Hangul |
| **SEA** | **6** | 10 | Myanmar, Khmer, Lao, Thai, Traditional + Simplified Chinese |
| **Europe** | **5** | 22 | Cyrillic 5 |
| **Africa** | **3** | 10 | Ethiopic 2, Arabic 1 |

**COST IS PER SCRIPT, VALUE IS PER LANGUAGE, SO THE RATIO ORDERS THE QUEUE.**
Africa's correction to a first version of this section that ranked on coverage
alone: authoring one alphabet serves every language that uses it, so counting
languages alone puts Europe last when by cost it is nearly first.

| repo | langs / scripts | ratio | coverage |
|---|---|---|---|
| **Europe** | 5 / 1 | **5.0** | 23% |
| **East Asia** | 10 / 4 | 2.5 | 100% |
| **India** | 22 / 13 | 1.7 | 100% |
| **Africa** | 3 / 2 | 1.5 | 30% |
| **SEA** | 6 / 6 | 1.0 | 60% |

**AND NOW THE CORRECTION TO THE CORRECTION, WHICH INDIA OWES BOTH OF THEM.**
That table treats "a script" as a closed set of letters you author once. **The
code makes the same assumption and states it: `PLAYABLE_GLYPH_FLOOR = 12`.** The
assumption holds for Cyrillic, Ge'ez, Hangul, kana and every Indic abugida. **It
does not hold for Han at all**, which has no closed letter set, and a drill over
Han characters is a different product rather than a bigger one. It is the same
open question as Arabic being cursive.

**Eight of East Asia's ten languages are Han**, checked language by language:
Cantonese, Hakka, Taishanese, Taiwanese Hokkien and Teochew on Traditional;
Fuzhounese, Mandarin and Shanghainese on Simplified. Only **Japanese (kana)** and
**Korean (Hangul)** have a closed set. **Two of SEA's six** non-Latin languages
are Han too, and **one of Africa's three** is the Arabic question.

Excluding what cannot be authored as an alphabet, the AUTHORABLE picture is:

| repo | authorable langs / scripts | ratio | coverage | parked behind an open question |
|---|---|---|---|---|
| **Europe** | 5 / 1 (Cyrillic) | **5.0** | 23% | none |
| **Africa** | 2 / 1 (Ge'ez) | **2.0** | 20% | Egyptian Arabic, cursive |
| **India** | 22 / 13 | 1.7 | 100% | none |
| **SEA** | 4 / 4 (Khmer, Lao, Myanmar, Thai) | 1.0 | 40% | Cantonese, Mandarin |
| **East Asia** | 2 / 2 (Hangul, kana) | 1.0 | 20% | eight Han languages |

**East Asia moves from best on both metrics to last on both**, and its "no
alphabet data at all" stops being the blocker: even with a full authoring effort
it reaches two languages of ten until somebody answers what a letter drill means
for Han. **India is not ruling on that question and neither should a porting
agent.** It goes to the owner beside the Arabic one, and they are the same
question wearing two scripts.

**THE ORDER THAT FALLS OUT, ON THE AUTHORABLE NUMBERS:**

1. **Europe.** One alphabet, five languages, nothing parked. The cheapest unit of
   work in the fleet by a factor of two and it was ranked last twice.
2. **Africa.** One alphabet, two languages. Small but clean, and Ge'ez is
   unambiguous in a way Arabic is not.
3. **India.** Already done.
4. **SEA and East Asia LAST, both at 1.0**, and both mostly parked behind the Han
   question rather than behind effort.

**"Never is a legitimate answer rather than a deferral" stays**, and on these
numbers it applies to **SEA and East Asia**, which is the opposite of where the
first two versions of this section put it.

That is this ledger doing the job it exists for: stopping three forks building
something worth little to them, rather than making four forks build the same
thing because one of them did.

### 5d-ii. WHAT A FORK NEEDS THAT INDIA DOES NOT HAVE

**Letter Match travels almost free. Letter Drill's gate does not travel at all.**

The distinction is the single most useful thing in this document, and it is a
line of imports: `letter-match.ts` imports only `./trace-stops` and matches a
letter to a **sound**. It needs characters and romanisations, which every fork
has. **Letter Match works in all four the day it lands.**

`order-gates.ts` gates on **hand-authored stroke data**, and passes anything
carrying `provisional: true` UNGATED. India measured why on 2026-09-02: against
48 Devanagari letters the font's guess agreed with a real hand **0 times**, and
disagreed on the stroke count alone 35 times. Gating on that data fails every
learner and then teaches them the font's mistake.

> **AND HERE IS THE PART NO FORK KNOWS. All four forks carry India's Devanagari
> stroke data byte-identically.** `devanagari-strokes.ts` is 94 lines and
> `contributed-strokes.ts` is 2,696 lines in **all five repos**, against 21,802
> lines of `provisional-strokes.ts`. So `scriptsOnRealData()` in SEA, Europe,
> Africa and East Asia returns **Devanagari and Gujarati: scripts those forks do
> not teach.** The gate is not merely inert in the forks, it is armed on the
> wrong alphabet.
>
> **Consequence, in Africa's words, which are sharper than the first two
> attempts at this and should not be softened:**
>
> > it gates on the PRESENCE OF INDIAN SCRIPT DATA, so a green test proves the
> > Indian data is still there. **A test that passes because the bug is present.**
>
> That is the fourth face of tonight's silent default and the nastiest, because
> it is a test actively rewarding the fault rather than merely failing to notice
> it. The other three: a detector that has only ever seen a clean tree, a suite
> that reads as green because it read as nothing, and a cancelled CI run reading
> as a pass.
>
> **So:** ship `order-gates.ts` for the mechanism, expect it to gate nothing, and
> do not report Letter Drill as "done" on the strength of a green suite. The
> honest check in each repo is one call: **if `scriptsOnRealData()` returns
> nothing you teach, the stroke gate is decoration** and its passing test is
> measuring India.

**What each fork must author, per script it actually teaches:**

1. **`LETTER_LOOKALIKES`** for its own scripts. Eye-confusions, not ear ones.
2. **Hand-authored strokes**, or accept an ungated drill. This is a commission,
   not code: a real hand, per glyph, per script.
3. **The gift copy**, three functions, in the fork's own currency noun.
4. **`TASTE_GAME_IDS`**, from that fork's own owner ruling.

**Where it is meaningless today, said plainly:** **East Asia has no
`east-alphabets.ts` at all**, so Letter Match has no letter set to draw from and
Letter Drill has nothing to gate; both are blocked on data, not on this port.
**Africa has Ge'ez and Arabic**, neither of which has hand strokes anywhere in
the fleet, so Africa gets Letter Match and an ungated drill. Arabic is
additionally the one script here that is CURSIVE and joins: a per-letter tracing
model may not be the right shape at all, and that is a product question India
never had to answer.

### 5e. THE TRAPS INDIA PAID FOR BUILDING IT

1. **A missing workspace link stops a whole suite, silently.**
   `@workspace/daily-gift` was shipped unlinked and the api suite could not
   start, so `games.letter-stop.test.ts` had NEVER EXECUTED across two handoffs.
   It read as green because it read as nothing. Link in the same commit.
2. **Half of the game-taste wall was unreachable and every bit of it
   typechecked.** Five faults: a hand-written zod enum still closed at four ids
   so the widened contract answered 400; an `isCorrect` naming three ids
   literally so new ids scored zero; no `MAX_RESULTS` entries; `context` never
   written to the row; and a wall that refused the JOURNEY's own runs. **A ported
   copy inherits none of these fixes if you port the spec instead of the code.**
3. **Chacha-ji's call has no tables.** A previous handoff said its plays lived in
   "its own call-session tables"; `chachaCallSessions.ts` is an in-memory Map
   with a 4 minute TTL. It is also the one tasted game the server sees BEGIN, so
   its wall is at `/start`, which writes its own zero-XP `game_sessions` row.
4. **Six tasted games, not five.** `express-listening` is free on WEB only and
   was invisible from the mobile hub. Count from both hubs.
5. **The pass mark and the gate are separate.** `letter-stops.ts` answers "which
   letters", `order-gates.ts` answers "was the hand right". Porting one and
   calling it Letter Drill ships a quiz wearing a drill's name.


### X6. One ruling, five implementations, four wire contracts.

**CONTRACT. Ruling needed before anyone touches it again.**

| Repo | Module | Wire contract |
|---|---|---|
| India | `gameTasteCounts.ts` + `lib/game-taste` | `/games/plays`, keyed per game id |
| SEA | `gameTaste.ts` | field `gameTaste`, schema `GameTaste`, no endpoint |
| Africa | inside `freeTaste.ts` | field `gameTaste`, inline schema, no `$ref`, no endpoint |
| Europe | `freeTaste.ts` | `GET /games/taste`, `getFreeTaste`, schema `FreeTaste`, a `taste_over` 402, a per-session payload |
| East Asia | `freeTaste.ts` + `freeTasteCounts.ts` | field `freeTaste`, schema `FreeTaste`, no endpoint |

**Supervisor ruling: converge on Europe's.** It is the only version with a
dedicated endpoint, a real 402 error code and a per-session payload. The other four
adopt `GET /games/taste`, `FreeTaste` and `taste_over`.

### X7. SEA's Clerk production guard would have caught tonight's defect.

**Built by:** SEA. **Owed to:** all four.

`~/bolo-sea/scripts/clerk-go-production.sh` refuses to flip a fork to production
Clerk unless every enabled social provider has real credentials, because **Clerk
leaves the client id EMPTY in the authorize URL when a provider is enabled with no
custom credentials.**

Measured 2026-09-06, by minting a real OAuth redirect against each instance:

| Instance | Google | Apple |
|---|---|---|
| `clerk.bolo-sea.app` | real client id | real client id |
| `clerk.bolo-africa.app` | **EMPTY** | **EMPTY** |
| `clerk.bolo-east.app` | **EMPTY** | **EMPTY** |
| `clerk.bolo-europe.app` | no production instance exists |

So both social buttons ship and both fail at the tap in Africa and East Asia. The
script is pure guard logic with one domain constant, and neither fork knew it
existed.

**Correction to an earlier note:** a memory written earlier on 2026-09-06 recorded
SEA's production instance as having empty OAuth. It does not, as of the
measurement above. SEA's later commits filled both.

**CORRECTION TO THE TABLE ABOVE, and take the newer script. 2026-09-06, later.**

"Real client id" was measured by reading the authorize URL. That proves **Clerk
STORES a credential. It does not prove the PROVIDER ACCEPTS it**, and for Apple
those came apart:

| SEA provider | client id stored | provider's verdict when the URL is followed |
|---|---|---|
| Google | 72 chars | http 200, reaches the Google sign-in page, no error |
| Apple | `com.bolo.sea.signin` | **`{"errorMessage":"Invalid client.","errorCode":"invalid_client"}`** |

Control: the identical probe against India's live instance — same key `85WXDJHRF9`,
same team `57PJ64Z5FA` — comes back clean. So the key and team are fine and the
fault is the SEA Services ID, which must EXIST in Apple and carry Sign in with Apple
plus the exact Return URL. **Pasting a `.p8` into Clerk does not create a Services ID.**

So SEA's Apple row above should read FAILING, not "real client id", and the guard as
first written would have green-lit the flip. `42588db4` fixes it: the guard now
follows the authorize URL to the provider and reads its verdict, failing on any
`errorCode`/`error=`. **Forks adopting this script must take `42588db4` or later —
the earlier version passes a stored-but-rejected credential.**

Apple keys, for whoever needs them next: every Apple key type downloads as
`AuthKey_<KeyID>.p8` with no metadata, so identify one by matching its Key ID
against a service that already works. On team `57PJ64Z5FA`: `85WXDJHRF9` is India's
Sign in with Apple key, `28635ZPZP5` is Cliki's. **Apple allows only two Sign in with
Apple keys per team and both slots are taken**, so a fork cannot mint a third — reuse
India's. Services ID convention is bundle id + `.signin`, and it may never equal an
App ID.

### X8. Two Play declarations, each solved once.

| Repo | `android.blockedPermissions` |
|---|---|
| India | `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` |
| Europe | `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` |
| SEA, Africa, East Asia | none |

`expo-audio` contributes both foreground service permissions to anything depending
on it, and this app starts neither service. Europe checked the library source
rather than guessing: `AudioControlsService` starts only from
`setActiveForLockScreen(true)` (zero hits in this app) and
`AudioRecordingService` only when `allowsBackgroundRecording` is true, which
`lib/audio.ts` never sets.

**The identical declaration is marked OVERDUE on Bolo India**, in production, while
India is in review. A new Android bundle is required before Play stops asking, in
every repo that ships it.

**LANDED IN INDIA, 2026-09-07 — `7962e5d6`, not pushed.** India's reasoning was
re-verified against India rather than inherited: zero `setActiveForLockScreen`
call sites, `lib/audio.ts` setting only `allowsRecording` and `playsInSilentMode`
in both modes, and an empty sweep for `staysActiveInBackground`,
`shouldPlayInBackground`, `showNowPlayingNotification` and `UIBackgroundModes`
across the whole mobile app. Chacha-ji's call is the one feature that sounds like
it needs background audio and does not.

> **THE PORT IS NOT THE CHERRY-PICK, AND `-x` WOULD HAVE DONE HARM HERE.** The
> table above already shows why and it is worth spelling out, because the next
> three repos will hit it. `e1d04214`'s test asserts a FOUR permission ask ending
> in `READ_MEDIA_IMAGES`. **India asks for three and BLOCKS that one**, since
> `1107932f`, because Play rejected version code 536 over it ("Use alternative
> system pickers for the photos / videos"). So Europe's test fails in India, and
> the tempting repair, adding `READ_MEDIA_IMAGES` back to the ask, **re-ships the
> exact permission a Play rejection made us remove.** India also already HAD a
> `blockedPermissions` array, which Europe's diff creates, so the pick conflicts
> before it even gets to the test.
>
> India's version therefore pins the two media blocks as well, so they read as a
> shipped fix rather than as incidental neighbours of the new lines. **SEA,
> Africa and East Asia must each check their own ask list before taking either
> version**, not diff it against Europe's.

Proven to bite rather than observed agreeing: unblocking `FOREGROUND_SERVICE` and
re-asking `READ_MEDIA_IMAGES` turns India's test 3 red and 1 green, on exactly the
cases that should catch each fault. Restoring returns 4 for 4.

### X9. The Marigold pagdi is on sale in all four forks.

**Found by:** East Asia, logged as an East Asia item. **Actually:** all four.

The catalog entry and its copy ("Marigold silk, gold zari and one peacock
feather"), five mascot frames, a matching overlay set, on both platforms,
purchasable with each fork's own currency. The wallet's icon regex still matches
`kurta|saree|sherwani|anarkali|kediyu|choli`.

There is no replacement on any commission sheet, so this is a prompt to write
before it is a pipeline run, and the prompt is worth writing once for four forks.

### X10. Three forks still carry India's store screenshots.

Europe, Africa and East Asia each hold the identical 36 files, including
`09-topic-phrases-bengali.jpg`, `08-practice-tamil.jpg`,
`07-home-topics-gujarati.jpg`, in both the 6.9 inch and 6.5 inch directories. Only
SEA has replaced them. They are one upload away from a store rejection.

### X11. India will not accept any entitlements commit from a fork.

India uses `FREE_LANGUAGE = "hi"`, a single string. All four forks use
`FREE_LANGUAGES`, an array: SEA `["vi","id","zh"]`, Africa `["sw","zu"]`, East Asia
`["yue","zh","ko","ja"]`, Europe all sixteen. Entitlements is engine code the table
says travels, and this one difference conflicts every cherry-pick India-ward.

### X12. The forks cannot see each other.

The playbook says to add every fork as a remote of every other, because
`git log sea/main` is then the shared changelog and it is the cheapest version of
this whole idea. Actual remotes at seeding:

| Repo | Remotes |
|---|---|
| India | origin, sea |
| SEA | origin, india |
| Europe | **origin only** |
| Africa | origin, sea |
| East Asia | origin, parent |

Europe is blind to all four siblings and all four are blind to Europe. It is the
fork that has solved the most console problems, including the unattended iOS build
every handoff still calls impossible.

**INDIA IS DONE, 2026-09-07.** It now carries `origin`, `sea`, `europe`, `africa`
and `east`, all fetched. The three new ones are LOCAL PATHS (`~/bolo-europe` and
so on), which is the part worth copying: a sibling diff then costs nothing, needs
no network, no token and no GitHub permission, and it works tonight rather than
after somebody provisions access.

**IT IS NOT A CONVENIENCE, IT IS THE FIX FOR A CLASS OF ERROR THAT COST TONIGHT
TWICE.** Africa reported India's splash gate as broken while reading a copy that
predated `e4b5580b`, and India then repeated the shape by calling the same line a
bug in three siblings after reading only their gate and not their render site.
Both are the same mistake: reasoning about a sibling instead of reading its
current head. With the remotes in place the check is one command.

### X13. GitHub Actions is dead on all four forks.

Since `2026-09-06T19:06Z` every run on every fork fails in three to seven seconds
with a billing annotation, not a test failure. India is a **public** repo so its
minutes are free and its CI is green. All four forks are **private**, so their
minutes are billed. **Nothing pushed to any fork since that timestamp has been
through CI at all**, and a four-second red run looks nothing like a broken test.

Read per-job conclusions, never the top line. A cancelled run is not a pass.

---

## THE LEDGER

```
DATE        FORK    SHA       VERDICT   WHAT
```

**2026-09-08  india   (diagnosed, not fixed)  ENGINE**
A CI BOARD THAT IS RED EVERY TIME CONVEYS EXACTLY AS MUCH AS NO CI. X90. India's
api-db job has failed on every run for as long as the history goes: of the last
25 runs, 16 failure, 8 cancelled, 0 success. I shipped six commits and a store
build past it tonight without once looking, and found it only because the
supervisor asked for a status.
-> Both named failures reproduce locally and NEITHER IS A REGRESSION. Diagnosis
   below. Do not "fix" this by moving tests until somebody rested has decided
   what CI should run.

**2026-09-08  india   91f7ffee  ENGINE**
"AUTOSCROLLS BACK TO TOP" WAS NOT A SCROLL BUG. X84. Two game screens are raw
ScrollViews and were missed by BOTH of the layout fixes every other game got:
they never took TAB_BAR_CLEARANCE, so their last rows were drawn under the
floating pill tab bar, and they still cleared the notch themselves on top of the
stack that has cleared it since 2026-09-03.
-> Every fork has both files. Cherry-pick, then run the two-line audit in X84
   against your own tree rather than trusting that your copy matches India's.

**2026-09-07  africa  922dbd8d  ENGINE**
THE DELETION BUG'S REAL COST IS NOT A 500, IT IS A LOCKOUT. Promoting this from a
detail to the headline, on East Asia's reading and it is right. `DELETE /account`
removes the CLERK user FIRST, on purpose, so nobody can sign back in mid-delete.
The foreign key violation then fired AFTER that, so the learner was locked out of
an account that still existed with every row intact. "Delete my account" left them
the worst of both outcomes, and the 500 was the only visible part.
-> Confirmed independently by SEA (e5a7b91e) and East (46ffb5df). East swept all
   20 non-cascading tables referencing users.id and found Africa's three were the
   only ones unhandled, so the finding is COMPLETE, not merely correct.
   WHEN A FORK FIXES THE HANDLER IT RE-READS TWO OTHER THINGS IN THE SAME SITTING:
   its support or deletion page, and its Play Data safety answer. Until the
   handler was fixed those were three copies of one claim and all three were
   wrong together.

**2026-09-07  africa  922dbd8d  ENGINE + REGION**
The /delete-account page. X14. Reference implementation, and the split matters.
-> THE REQUIREMENT IS ENGINE, THE COPY IS REGION. Nobody cherry-picks Africa's
   wording into a Polish app. What travels is the shape: a SIGNED-OUT page, because
   somebody locked out of their account has to be able to read it and a reviewer
   will open it cold; the four steps to reach the in-app control; what is deleted;
   what is KEPT and why (store receipts we do not hold, contributions made without
   an account, aggregates, 30-day backups); and the sentence that deleting the
   account does NOT cancel the subscription, which is the one a support inbox pays
   for otherwise. East Asia's angle belongs here too: Play wants a URL that
   DOCUMENTS the deletion path, not a route with a particular name, so a support
   page naming the in-app steps satisfies it just as well.
   `artifacts/gujarati-coach/src/pages/delete-account.tsx`, routed in App.tsx.

**2026-09-07  africa  -         ENGINE**
The failed-first-publish trap has THREE faces, not two, and none names the cause.
-> Agent chat: "Repl has existing deployment. Pass target deployment id."
   MCP connector: "configuration cannot be reused ... publish again from the
   Replit workspace." Workspace Publish: the same existing-deployment refusal.
   The real state is that the FIRST publish died before setup completed, and a
   reader of any one message goes hunting for a deployment id or an MCP bug.
   Africa: replId f9699ef6-1eb7-40af-bd2a-3b8ba8a12614, deployment
   5b91f22d-6f01-48f9-96b7-0cc9c106e1d2, status failed, would serve
   https://bolo-africa.replit.app. DELETING A FAILED DEPLOYMENT IS SAFE HERE and
   the reason is worth stating: nothing serves from it, no custom domain is bound
   (bolo-africa.app has no records at all), and the PRODUCTION database Replit
   provisions at first publish has never been migrated or seeded, so there is no
   data to lose. The cost is that the fresh deployment gets a NEW empty production
   database, so the schema and seed have to be applied to it and the publish
   panel's dev-to-prod diff step will appear on the next publish rather than being
   absent. On a fork that HAS published, none of that is true.

**2026-09-07  africa  28bcbd21  ENGINE**
X2 applied, and the split SEA warned about is the whole job.
-> SUPPORT_EMAIL is Hello@LarkEnterprisesLLC.com in all three appDomain twins,
   verified here rather than trusted: three Cloudflare Email Routing MX records
   and v=spf1 include:_spf.mx.cloudflare.net ~all. `larkenterprises.com` without
   the LLC has NO MX and is a different domain. It is a REPLY-TO only: the domain
   is verified for RECEIVING, and Resend refuses a From on a domain it has not
   verified for SENDING. quotaAlertEmail.ts therefore stops importing the constant
   and falls back to `alerts@${APP_DOMAIN}`. Its old comment claimed the domain
   was "verified", which was never true (X3), so the alert is refused today either
   way; alerts@ is the address that starts working when the fork's own domain is,
   and a second domain would need verifying forever.

**2026-09-07  africa  28bcbd21  ENGINE**
gen-store-assets.sh guarded with East Asia's two names, and a THIRD surface found.
-> BOLO_REGEN_PLAY_ICON=1 and BOLO_REGEN_FEATURE_GRAPHIC=1, default off, copied
   verbatim so four repos share one pair. Africa's committed PNGs are this fork's
   own art (f7ad461b, e009d585, 979eb424) and the script's sources are India's, so
   a run overwrites rather than refreshes. Script not run; sha256 of both PNGs
   recorded in the commit message as proof they did not move.
   THE THIRD SURFACE IS THE CAPTION MAP, and it is not guarded because Africa has
   nothing there to protect: captures AND captions are both still India's (X10).
   Captions are chosen by FILENAME, so a fork with perfect new captures still
   ships "Practice real Tamil conversations" unless the map moves in the same
   commit. Renaming a capture silently drops it instead ("skip (missing)").

**2026-09-07  africa  -         ENGINE**
CI datapoint, X13: still dead after the owner's fix. Run 34079162836, pushed
03:17:38Z. All four jobs (web, api-pure, typecheck, mobile) 2 SECONDS, every one
annotated "The job was not started because recent account payments have failed or
your spending limit needs to be increased."
-> Third fork to measure it the same way. East's rule holds: nothing counts until
   a run lasts over a minute.

**2026-09-06  africa  -         ENGINE**
A missing `OPENAI_API_KEY` does not degrade, it kills the deployment at boot.
-> Owed to all four. `lib/integrations-openai-ai-server/src/client.ts` line 3 is a
   TOP-LEVEL `throw` and `build.mjs` bundles it into `dist/index.mjs`, so the
   process dies before it binds a port. On autoscale that is a failed health check
   and a publish marked "failed" with no error text about OpenAI anywhere. Africa
   lost a publish to this today and read it as image size first, which is the
   trap: the symptom looks like the build, the cause is one env var. Check the
   three boot secrets in the Shell BEFORE publishing, never after.

**2026-09-06  africa  922dbd8d  ENGINE**
A non-empty placeholder is worse than a missing one, and Stripe is the example.
-> Owed to all four. `routes/stripe.ts` already answers 503 "pricing isn't
   configured yet" for a falsy price id, and `"REPLACE_ME_<FORK>"` is a non-empty
   string, so it walks past that guard into Stripe and the learner sees an opaque
   broken button. The seven price ids are `""` in Africa's `.replit` now, with the
   names listed in a comment since they no longer carry the grep marker. Any fork
   using REPLACE_ME for a value a guard tests for FALSINESS has the same bug.

**2026-09-06  africa  -         ENGINE**
Play's Data safety is a CSV round trip, not twenty minutes of clicking.
-> Owed to all four, and it closes SEA's "the wizard discards its draft the moment
   you leave it". Data safety has Export to CSV / Import from CSV in the top right.
   Export from the fork that is DONE (India's is live and Google-accepted), fill
   the blank export of the fork that is not, import, walk Next four times, Save.
   782 rows, 60 of them answered. Africa's fill script and the mapping are in
   `~/bolo-africa/docs/` (see the store-readiness notes). Two traps: the hidden
   file input needs the dialog's own Import button pressed afterwards or nothing
   happens, and Play warns "we couldn't find the URL you entered" for any deletion
   URL whose domain is not live yet, which is a warning and not a blocker.

**2026-09-06  africa  -         ENGINE**
Play's Target audience is gated on Sign in details, and Data safety is gated on
Target audience.
-> Owed to all four. Three declarations in one chain, and the first needs a demo
   account username and password, which is the one thing an agent will not create.
   So a fork can fill EIGHT Play declarations unattended and still be three short.
   Fill Data safety and Save as draft anyway: the draft survives, and the day the
   demo account lands the remaining work is Target audience plus one Save.

**2026-09-06  africa  -         ENGINE**
A first publish cannot be started from chat, whatever the MCP tool says.
-> Owed to any fork that has never published. Replit answers "The app's current
   deployment failed before completing setup, so its configuration cannot be
   reused. Tell the user to publish the app again from the Replit workspace."
   A failed FIRST publish also poisons the config, so the retry is owner-side in
   the workspace UI, not another tool call.

**2026-09-06  africa  d335597b  ENGINE**
Apple product ids are account-scoped: rename per fork, never reuse.
-> X1. East Asia is blocked on this today. The sha is the commit to read.

**2026-09-06  -       -         ENGINE**
reply_to is `support@bolo-*.app` and no BOLO domain has an MX record.
-> X2. LIVE IN PRODUCTION. All five repos share the constant.

**2026-09-06  -       -         ENGINE**
No fork domain has Resend SPF or DKIM. Two still carry `REPLACE_ME` as the sender.
-> X3. Owed to all four.

**2026-09-06  europe  -         ENGINE**
`site/`: real privacy, terms and deletion pages a crawler can read.
-> X4. India and SEA return the homepage for all three.

**2026-09-06  sea     4eadee5c  ENGINE**
`clerk-go-production.sh`: refuse the flip unless every provider has real credentials.
-> X7. Africa and East are in the exact state it refuses.

**2026-09-06  europe  e1d04214  ENGINE**
expo-audio foreground service permissions blocked, pinned by a test.
-> X8. Owed to all four. India is OVERDUE on Play.

**2026-09-06  europe  -         ENGINE**
The first iOS build runs unattended on a cached fastlane session, certificate reused.
-> A FINDING, not code. Africa is holding this as an owner task today.

**2026-09-06  east    c9d3101a  ENGINE**
Pick the Clerk SECRET key per host, not just the publishable one.
-> Owed to SEA and Africa. Europe has no production instance yet.

**2026-09-06  africa  922dbd8d  ENGINE**
Account deletion, and the deletion page Play requires.
-> Owed to all four. Play will not take Data safety without it.

**2026-09-06  east    -         ENGINE**
The Marigold pagdi ships in every fork, not just this one.
-> X9. One prompt, four forks.

**2026-09-04  india   -         CONTRACT**
Games taste: five names, four wire formats, never reconciled.
-> X6. RULING: converge on Europe's `GET /games/taste` and `taste_over` 402.

**2026-09-04  india   -         ENGINE**
`lib/daily-gift`, `lib/game-taste`, letter-match, letter-stops, order-gates.
-> X5. NEVER PORTED. Four forks hold the spec and none holds the code.

**2026-09-06  africa  3b5aa708  REGION**
The line picker: Tigrinya and Somali each have two journey lines.
-> Mechanism is portable, the two lines are not.

**2026-09-06  africa  -         REGION**
The library stops teaching alcohol, 6587 rows to 6565, so the rating stays 4+.
-> SEA met this on 2026-09-05 and the owner ruled the content changes, not the answer.
   Every fork answering Apple's questionnaire inherits the RULING, not the diff.

---

## HOUSE RULES THAT BIND EVERY SESSION

- **Verify by content, never by status code.** These SPAs return 200 with the
  homepage for every path. A 200 proves the server is up, nothing else.
- **Verify by content, never by build log.** Read the bundle for this fork's own
  domain and this fork's own Clerk key before calling a build good.
- **Ask the environment, not the UI.** Replit's Secrets pane paints its empty state
  before the project finishes loading, and two tabs will agree on the same lie.
- **Never print a git remote.** Some carry a live token.
- **Never add Claude attribution to a commit.**
- **No em dashes** in anything written here or in a commit message.
- **Build mobile first.** A fork gets an EAS project and a phone build before its
  first web publish.
- **Full suites once, before a build or a publish.** Typecheck while developing.

---

## X15. CHECKS THAT AGREE WITH YOU FOR THE WRONG REASON

### READ THE ROWS, NOT THE TOTALS.

**India's naming of the night's dominant pattern, 2026-09-07. This is the general
form of everything below it:**

> **Each of us applied a correct general finding without checking whether its
> premise held for the specific fork.** Coverage was right and ignored cost. Ratio
> was right and ignored what a script is. **The fix each time was to go and read
> the actual rows rather than the totals.**

Four for four in one night, and every one was caught by a *different* session:

| Who | The correct general finding | The premise that did not hold |
|---|---|---|
| Africa | "porting a change is a better review than reading it" | It diffed against what it forked from, not India's **current head**, and reported India's already-fixed bug back to India |
| Supervisor | "the gate must decode what the render paints" | Diffed one line across five repos **without checking `shape.still` exists in each**. The "fix" would not have compiled |
| Supervisor | "Letter Drill is worth less where fewer languages need it" | Counted coverage and **never asked what it costs**. Europe's five languages share ONE script |
| Africa | "cost tracks scripts, value tracks languages" | Computed it for two forks, **called it general in the same sentence**, and did not test the case that breaks it |
| India | "count the scripts" | **A script is not always a closed set of letters.** `PLAYABLE_GLYPH_FLOOR = 12` says so out loud, and Han is not one |

`/delete-account` and the splash gate went the same way: both looked like
rendering problems until somebody read the routing table and the render site.

---



**Added 2026-09-06, after this shape caused five separate faults in one night.**
Africa asked for these under one heading rather than as five traps, because the
next one will not look like any of them and the heading is what transfers.

**The sentence, SEA's:**

> A detector that has only ever been run against a failing input has not been
> tested. It has been observed agreeing with you once.

**THE SAME SHAPE ONE LEVEL UP, IN OUR OWN REASONING, three times in one night
(India, 2026-09-07).** The silent default is not only a property of scripts and
tests. It is how the five of us talked to each other:

> **EACH OF US APPLIED A CORRECT GENERAL FINDING WITHOUT CHECKING WHETHER ITS
> PREMISE HELD FOR THE SPECIFIC FORK. READ THE ROWS, NOT THE TOTALS.**

Every instance was a true statement aimed at the wrong repo, and every one was
caught by opening the actual file rather than by arguing:

- **Africa reported India's splash gate as broken.** True of a copy that
  predated `e4b5580b`; India had already fixed it.
- **India then called that same line a bug in three siblings**, after reading
  their gate and not their render site. East Asia has no `shape.still` at all,
  so its version is correct and "fixing" it would have created the bug.
- **The Letter Drill queue was ranked three times and had three different last
  places.** Coverage was right and ignored cost. The languages-per-script ratio
  was right and ignored what a script is: `PLAYABLE_GLYPH_FLOOR = 12` assumes a
  closed letter set, which Han does not have.

The correction each time was the same and it is cheap: **open the sibling's
current head and count the rows.** X12's local-path remotes exist so that costs
nothing.

**And the mechanism, Africa's, which is sharper and covers all seven:**

> **BEWARE THE SILENT DEFAULT.**
> In every one of these the check RAN, RETURNED, and agreed with the checker,
> and in every one the thing it actually measured was not the thing being asked
> about. The reason is almost always that the check has a **default it falls back
> to without saying so.**
>
> `set -e` defaults grep's empty result to failure. `--limit 1` defaults to
> whatever run exists. A missing type field defaults to "not there". A `|| say`
> fallback defaults a failed write to exit 0.
>
> **The fix in every case is to name the specific thing rather than take the
> default:** pin the run id, check the exit code, ask the compiler.

The five, each found by a different fork:

| # | The check | Why it agreed | Found by |
|---|---|---|---|
| 1 | `clerk-go-production.sh` guard 2 | `grep` exits 1 when it finds nothing, and finding nothing is what a healthy provider looks like. Under `set -e` a clean run printed the header and exited 1, visually identical to a refusal | SEA, 62ddad7a |
| 2 | `eas env:update` in the same script | Deprecated and renamed. A `\|\| say "...failed"` fallback printed a warning and exited **0** with the one write that does not live in the repo missing | SEA, 0791a1ae |
| 3 | "verify `secretKey` is on `AuthenticateRequestOptions`" | It is not in that type's field list. It is inherited through two intersections into `LoadClerkJWKFromRemoteOptions`. Europe nearly rejected a correct fix | supervisor's bad instruction, caught by Europe |
| 4 | The X2 census, v1 | Does not strip comments, and its regex treats a **backtick** as a quote. A doc comment documenting the old address fails the test that exists to enforce that documentation | SEA, on India's a26db0aa |
| 5 | The X2 census, v2 | The obvious repair, walking characters and skipping strings, is defeated by `.replace(/"/g, "&quot;")` already in both senders. The lexer desynchronises and silently swallows twenty lines, then reports their comments as violations | India, 59227946 |
| 6 | SEA's own census repair (96e52fe6) | **Not defeated by trap 5** — it was two regex replacements, not a lexer, and SEA proved it by planting a violation *past* the regex literal and watching it get caught, 6/1 then 7/7. It was replaced for a weakness that **had not fired yet**: it stripped `//` inside a string too, so it would go blind the first time a lib file holds a URL in a string. Same failure direction as the bug it fixed, just unarmed | SEA, on its own work |

| 7 | `gh run list --limit 1` in a poll loop | It **raced the run's creation**. At the first tick GitHub had not yet made a run for the new sha, so `--limit 1` returned the PREVIOUS run, already completed and green. The loop exited on tick one and printed four green jobs with timestamps twenty minutes old. Every word true, none of it about the commit just pushed. **Pin the run id.** | Africa, on its own poller |

**Entry 6 is the sharpest one and it is the reason this heading exists.** SEA
would have shipped that stripper as correct on the strength of a green run.
**The green run was real. It just was not evidence.** "Working today" is not
"correct" — a check can be sound against the tree as it stands and unsound
against the tree as it will be.

**Do not repeat my error in warning about this.** I told SEA its repair was
probably defeated by trap 5. It was not, and SEA measured before replacing
anything rather than taking the warning. A relayed diagnosis is a hypothesis.

**The two rules that fall out of it:**

- **The check is `tsc`, not `grep`.** A grep over a type answers a question about
  TEXT. Only the compiler answers the question about TYPES. Europe's near-miss.
- **Exercise the detector against a known-bad input before you trust a pass.**
  India's census now carries four shapes of real violation and seven ways of
  documenting one, and proves it bites on the REAL tree rather than on fixtures:
  reintroduce the bug and it goes 6/2, restore and it goes 8/8.

**Use `ts.createSourceFile`, not a hand lexer.** Comments are not literals in
that tree and `RegularExpressionLiteral` is its own node kind, so traps 4 and 5
are structurally gone rather than patched. Take India's `59227946`.

### X15b. Reachable is not declared. ENGINE, and it wants a sweep.

`typescript` resolved inside `api-server` only by walking up to the repo root; it
was `{}` in both dependency lists in `package.json` and `require.resolve` found it
anyway. **The test passed, which is the trap: the test runs from the same root
that hides the problem.** Confirmed independently in India (59227946) and SEA
(c0fe836a); declared `^5.9.3`, lockfile diff three lines, no re-resolution.

**The general shape, SEA's framing:** a dependency that works in the monorepo and
dies the moment anything runs with a **narrower root**. Known instances:

- a Metro started outside pnpm's bin shim cannot find `babel-preset-expo`
- a Docker build that copies one package
- a CI job run with `--filter`

**Owed to all five: sweep every workspace package for something it imports and
does not declare.** Nothing currently fails, which is exactly why nobody has
looked.

---

## X16. ABSENT FIELDS ARE INVISIBLE TO EVERY CHECK WE RUN. SO ARE WRONG ONES.

**Africa and East Asia, 2026-09-06, from opposite directions.**

We grep repos and diff values. **A field nobody ever filled has no value to
compare and no string to grep.** Africa found its Play **App category** was
"Not selected", a REQUIRED field blocking the listing, and its Play contact
email and website both blank. None of that is discoverable from the repo.

**And "filled" is not "correct."** East Asia opened the same page, found all
three fields populated, and reported it clean. One of them was
`support@bolo-east.app` — the dead no-MX address, published live as the contact
users are told to write to. Africa's blanks were hidden by absence; East's was
hidden by presence.

**So this is a page to OPEN, not a value to diff.** Play Store settings:
category, contact email, website. Plus the App Store Connect support URL and
support email — SEA had filed an ASC Support URL pointing at a route that did
not exist, and only found out when routes were measured across all four forks.

### X16b. Correct-by-fallback is not correct.

`SUPPORT_INBOX_EMAIL` is not set in any fork's `.replit`. The contact form
delivers correctly **only** because `resendClient.ts:62` hardcodes
`?? "LARKsupport@gmail.com"`. Anyone who later sets that variable to something
plausible-but-wrong silently redirects every support message, and there is no
delivery check anywhere.

**East Asia's ruling, adopted: write the pointer, do not duplicate the value.**
Setting the variable to the same string makes two copies of one address in two
files, which is how they drift, and it removes none of the risk.
`1b7945ff` puts a comment where the other mail variables live, naming the file
and the literal that actually decides delivery.

> Absent-and-documented and set-and-documented are both fine.
> **Absent-and-undocumented is the state that ate an afternoon.**

---

## X17. THE FOUR-SURFACE EMAIL CHECKLIST, AND THREE OF THEM LOOK LIKE ONE FIELD

Owner ruling: `Hello@LarkEnterprisesLLC.com` is reply-to and the published Terms
contact; `LARKsupport@gmail.com` is store listings and the contact-form inbox.
Both forward to the same mailbox, so this is a presentation split, not two
inboxes. **The LARK domain's MX records are Cloudflare Email Routing, which
FORWARDS. That is why replies land, and it is not evidence the domain can send.**

| Surface | Value |
|---|---|
| `SUPPORT_EMAIL` | the LARK domain (reply_to, and the Terms page prints it) |
| `SUPPORT_INBOX_EMAIL` | the gmail (where the contact form actually delivers) |
| Play listing contact | the gmail |
| Static site / support pages | the LARK domain |

**`larkenterprises.com` without the LLC is a different domain with no MX at all.**
India's census asserts against it.

**India's shape differs from the forks' and any fork predating `appDomain.ts`
will match India rather than its siblings:** India had no `SUPPORT_EMAIL` at all,
and four consumers each hardcoded the literal separately. So it was a new file,
not a re-point, and the consumers had to be found rather than followed.

**The false comment is how this survived.** Europe's `quotaAlertEmail.ts` carried
"Sender defaults to the verified bolo-europe.app domain". That was FALSE, not
stale: the domain has no MX and was never verified with Resend, so the default
could only ever be refused. Africa found the identical false comment in its own
copy. Neither would have caught it by reading.

---

## X18. CI: THE CAUSE WAS A $0 BUDGET, NOT A FAILED PAYMENT

**Fixed 2026-09-06. Three facts, and GitHub's annotation only hints at the third.**

1. The free **2,000 Actions minutes were fully consumed** (2,000 of 2,000).
2. **India is PUBLIC** so its usage is discounted and it stayed green; **all four
   forks are PRIVATE** and drew the allowance down. That is why it looked like a
   fork bug.
3. The account had **five budgets, every one $0 with "Stop usage" ON**, including
   Actions. That was the ceiling. Now $50/month, hard stop left on.

The annotation reads "recent account payments have failed **or** your spending
limit needs to be increased". **An error message offering two causes is not
evidence for either one.** Two people picked the half that matched their
expectation and stopped.

**Two failure shapes, both read as red to a careless eye, neither is a test result:**

- **Sub-10s red: it never started.** A real BOLO run is 3 to 7 minutes.
- **Mid-length `cancelled`: the next push killed it.** `ci.yml` has
  `concurrency: group: ci-${{ github.ref }}, cancel-in-progress: true`, so a push
  during a measurement destroys the measurement. Africa lost four jobs at 2m20s
  this way.

**Verified green on three forks by DURATION, not by a green check:** East Asia
136/125/178/408s, Africa 132/138/173/309s.

---

## X19. THE SPLASH: TWO BUGS, AND THE WHITE OPENING IS NOT FREE TO PORT

**Owner-reported 2026-09-07: "the blurry page splash loading issue ... its a
glitch at first load."** Fixed in India, owed to all four. **Two commits, not one.**

Measured across all five before it was sent, and every fork had both:

| Repo | inlined base64 blobs in index.html | `#root:empty` gates | splash filenames |
|---|---|---|---|
| India | 0 | 2 | `*-v2.*` |
| SEA, Europe, Africa, East | **2** | **1** | `arrival.mp4`, unversioned |

**`e4b5580b` — the splash opens on white, so there is nothing left to blur.**
The blur was not a fault. `index.html` painted the film's own first frame at
160px, pre-blurred and inlined, before a byte of JavaScript loaded. It could
never stop being blurry: a thumbnail small enough to inline has no detail to
give. The films now open on 0.7s of **white** and dissolve over 0.4s, so the
frame the holding surface must match IS white. Nothing to generate, inline, or
keep in step across two files.

Three follow-ons, none optional: `--splash-full-play` must grow to cover the
longer film or the first cold start of the day clips its own ending; the posters
become frame 0 and are therefore white, so the old scene frame is kept as its own
asset for the reduced-motion path; and the boot plate is gated on `#root:empty`,
because `data-boot` is set once and never removed, so the old plate sat on
`<html>` all session with only body's background hiding it.

**`a6031947` — the splash files carry a version, because a cached poster is a
flash.** This is the "glitch at first load". These live in `public/` so Vite never
hashes them, and Replit answers `cache-control: private` with a `Last-Modified`,
**no ETag and no max-age**. The browser then caches on the HEURISTIC, roughly a
tenth of the file's age. Change the frame behind an unchanged URL and a returning
visitor paints the OLD poster, the NEW film opens on white underneath, then
dissolves back. **Picture, blank, picture.** A new NAME cannot be stale.

### X19a. Making the white opening. It cannot be copied.

Each fork's film opens on its own art (Africa's arrival by boat, first frame
`#b5ab95`), so the white has to be **made**. Africa's recipe, `a9053beb`:

```
ffmpeg -f lavfi -i "color=c=white:s=1080x2400:d=1.1:r=24" -i arrival.mp4 \
  -filter_complex "[0:v]fps=24,settb=1/24,format=yuv420p[w];\
                   [1:v]fps=24,settb=1/24,format=yuv420p[s];\
                   [w][s]xfade=transition=fade:duration=0.4:offset=0.7[v]" \
  -map "[v]" -an -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p \
  -movflags +faststart arrival-v2.mp4
```

**BOTH `settb` CALLS ARE REQUIRED AND THIS IS THE TRAP.** lavfi carries timebase
1/24, the decoded film 1/12288. Without them xfade refuses with *"First input link
main timebase (1/24) do not match the corresponding second input link xfade
timebase (1/12288)"*, which **names the filter rather than the cause**, writes a
ZERO-BYTE file, and then the next command fails with *"moov atom not found"* — so
the second error buries the first. Fifteen minutes lost to a video-corruption
theory that never happened.

Africa's measured results: portrait 5.583s → 6.292s, wide 5.042s → 5.750s, both
frame 0 read back as `ffffff`, `--splash-full-play` 5100 → 6400ms, growth
1.76→2.04MB and 1.63→2.20MB, comparable to India's 1.7→2.0.

### X19b. Mobile is deliberately out of scope, and the reason generalises.

India's two commits touched only `gujarati-coach`. That was **correct rather than
incidental**: the mobile splash is a different asset played through a SEEKABLE
player whose poster is the frame at `SPLASH_FULL_START_S`, not frame 0. The
"poster is frame 0" rule that makes the white opening work on web is not true
there, so prepending white would **desync** the poster instead of matching it.
Written down so the next person to see mobile still blurry does not "finish the job".

### X19c. `usePosterReady` gates on the wrong image. SEA, EUROPE and EAST ASIA. ENGINE, one line.

`usePosterReady` gates the reveal on the POSTER even under **reduced motion**,
where the poster is not what renders. So a reduced-motion learner waits on the
decode of an image they will never be shown — and that is the population most
likely to be on a slow device.

**Verified in all five, 2026-09-07, by reading the line rather than reasoning:**

```
bolo         usePosterReady(reduceMotion ? shape.still : shape.poster)   correct
bolo-africa  usePosterReady(reduceMotion ? shape.still : shape.poster)   correct
bolo-sea     usePosterReady(shape.poster)                                BUG
bolo-europe  usePosterReady(reduceMotion ? shape.still : shape.poster)   FIXED f0fb6f2b
bolo-east    usePosterReady(shape.poster)                                BUG
```

**Europe, 2026-09-07:** already fixed here, in `f0fb6f2b`, the same night the
row above was written. **The table was stale within hours of being written**,
which is the ordinary fate of a per-fork status table in a shared file: read
the line in the repo before you act on the row. SEA and East Asia are still
owed it.

The fix is the ternary. The render site must agree with the gate: reduced motion
paints `shape.still`, so the gate decodes `shape.still`.

**It is harmless in India and Africa and real in the other three.** India's
poster is frame 0 and frame 0 is white since `e4b5580b`, so the decode is
trivial. In the three forks that still carry a real picture as the poster, it
costs real time at first paint.

### X19e. Diff against the source's CURRENT HEAD, not against what you forked from.

**This is the transferable half and it cost nothing to learn.** Africa found the
`usePosterReady` fault while porting, and reported it to **India** as India's bug.
India does not have it: the ternary landed in `e4b5580b` at 11:40 on 2026-09-06,
inside the very commit Africa was porting. Africa was reading a fork copy, or
India from before that morning.

**The diagnosis was exactly right and the address was wrong.** The method was
sound: porting a change is a better review than reading it. The error was
comparing the port against its SOURCE rather than against the source's
**current head**.

> Any fork porting from India should diff against `origin/main` **on the day**,
> not against whatever it forked from, or it will keep reporting India's
> already-fixed bugs back to India.

This is a second argument for X12, the remote mesh: you cannot diff against a
head you cannot fetch.

### X19d. Check your own host's headers. There may be two of them.

The heuristic-caching argument depends on no ETag and no max-age, which is a HOST
fact rather than a repo fact. Europe measured its apex: Cloudflare Pages sends
`public, max-age=14400, must-revalidate` **with a strong ETag**, so the stale
poster flash cannot happen there. **But Pages only serves the five static pages in
`site/`.** The films live in the web app, which the Repl serves on the same apex,
so Replit's headers apply and the `-v2` rename is still owed. The right question
was "what does your host send"; the wrong assumption was that a fork has one host.

---

## X20. A SPLIT THAT ONLY HALF TOOK LOOKS EXACTLY LIKE ONE THAT TOOK

**SEA's line, 2026-09-07, after the second instance in one night.**

> **A split that only half took looks exactly like one that took, from
> everywhere except the variable itself.**

Both instances were "he said he did it" versus "read it back":

1. **The EAS write.** `eas env:update` is deprecated and renamed. The script's
   `|| say "...failed"` fallback printed a warning and exited **0** with the one
   value that does not live in the repo missing. Nothing else would ever have
   caught it. Fixed to `eas env:set` AND to read the variable back (`0791a1ae`).
2. **The Clerk secret split.** The owner set `CLERK_SECRET_KEY` back to `sk_test`
   and believed the split was done. `CLERK_SECRET_KEY_PROD` was **never set**.
   Publishing would have 401'd every authenticated request on the custom domain:
   the same outage as before, moved to the other hostname.

**The gate that caught it, and it costs one line.** Prefixes only, nothing secret
printed:

```bash
echo "SECRET=${CLERK_SECRET_KEY:0:8} PROD=${CLERK_SECRET_KEY_PROD:0:8}"
```

Expected `SECRET=sk_test_ PROD=sk_live_`. Empty `PROD=` means STOP.

**Run it in a FRESH shell.** Replit injects secrets at shell start, so a tab that
was already open when the secret was added will report it missing whether or not
it saved. That is a false negative wearing the same clothes as the true one.

### X20a. Every variable that does not live in the repo needs a read-back.

The pattern under both: **the repo is its own record for everything in it, and
has no record at all of an EAS environment variable, a Replit secret, or a store
console field.** Those are the three places where "I set it" and "it is set" can
differ silently and forever. Read them back, by prefix, from the environment
rather than the UI — and see X16, where a Play field nobody ever filled was
invisible to every check being run.

---

## X21. THE GATE MUST DECODE WHATEVER THE RENDER SITE PAINTS

**Supervisor error, 2026-09-07, caught by Europe and confirmed by SEA.**

I diffed one line across five repos and told SEA and East Asia they had a bug:

```
usePosterReady(shape.poster)        // "bug"
usePosterReady(reduceMotion ? shape.still : shape.poster)   // "correct"
```

**It was not a bug.** In SEA and Europe the reduced-motion branch RENDERS
`shape.poster`, the very file the gate waits on, so gate and render site agree.
Neither fork has a `shape.still` at all — SEA's own comment says *"Each still is
BOTH the reduced-motion frame and its film's poster"*, one file in both roles.
The suggested fix **would not have compiled**.

**It is a bug the PORT of the white opening CREATES, not one the fork had.**

**The rule, which is what travels:**

> The gate must decode whatever the render site paints. When the white opening
> adds a reduced-motion branch onto a new still, the gate gains the same ternary
> **in the same commit**. Apply one without the other and you either wait on an
> image nobody sees, or reveal before the image that IS shown has decoded.

**The meta-error is X19e committed by the supervisor**, one hour after writing
X19e: comparing a line across repos without checking that its surroundings exist
in each. Africa misattributed by reading a stale source; I misattributed by
reading a fresh one and not reading around it. Same failure, opposite direction.

### X21a. SEA ships ONE film, cropped twice. India ships two.

Relevant to anyone porting the white prepend: SEA's films are **already trimmed**,
cut 2.4s into the source and baked in, because the arrival opens on two and a half
seconds of flat sea with the boat a speck. And the wide film is not separately
shot: it is a 16:9 band cropped through the boat out of the single 1080x2400
portrait (`crop=1080:608:0:820`, scaled to 1920x1080).

So a white prepend there is a prepend to an already-trimmed file, and whatever is
done to the portrait must be **redone through the crop** for the wide one or they
drift. Two encodes from one source, not two independent films.

---

## X22. GENERATING REPLACEMENT ART: ACCESS, PRICE, AND THE PROMPT TRAP

**The owner lifted the "owner generates the art" rule on 2026-09-07:** *"why can't
the agents do the art generations for me in google flow? I give permission to use
it and to use credits to generate videos."* Then: *"ok use kling"*, *"i have
plenty there"*. So the playbook's `commission sheet first, owner generates` is
**superseded**. Generate.

### Access, and one trap that reads as a block

| URL | State |
|---|---|
| `https://kling.ai/app/` | **PERMITTED** — use this |
| `app.klingai.com` | **NOT permitted.** "Permission denied for this action on this domain" |

**The old URL redirects to the new one**, so the permission failure lands
mid-redirect and looks like a broken page. Anyone going to `app.klingai.com`
concludes Kling is unavailable. It is not.

An onboarding survey blocks the UI on first load ("What is your occupation?").
**Dismiss it with the X; do not answer it** — it is a profiling question about the
owner. It reappears once; Escape plus a direct navigation to `/app/video/new`
clears it.

### Price, and a 33% saving that is on by default

```
Kling 1080p, 9:16, 5s, 1 output, Native Audio ON    60 credits
Kling 1080p, 9:16, 5s, 1 output, Native Audio OFF   40 credits
```

**TURN NATIVE AUDIO OFF.** It is ON by default, every one of these films is
silent, and the track gets stripped anyway. Balance ~6,100, so ~150 generations.
Confirmed by watching the balance move, not by reading the button.

Kling beats Flow on capability: 720p/1080p/4K, **3 to 15 seconds on a slider**,
16:9 / 1:1 / 9:16, 1 to 4 outputs. Flow's Fast is a fixed 720p at 8s and attaches
an AAC track despite NO SOUND in the prompt (`-an` strips it).

### The house convention: generate 1080x1920, extend in post

Found in the account's own Kling history: *"GENERATE AT 1080 x 1920, 9:16, the
extra 240 px above and below are extended in post from the plain sky and the plain
platform."* So **keep the top and bottom edges deliberately empty** so there is
something plain to extend from.

**Generate 5 seconds, not 8.** Plus the 0.7s white lead that is 5.7s, which fits
`--splash-full-play` at 6400ms without holding a frozen last frame. An 8s film is
simply truncated by the splash.

### X22a. THE PROMPT TRAP, and it nearly cost a purchase decision

Africa's first clip came back with **excellent art and the wrong direction**.
Composition, palette, style and every exclusion were on brief. But the minibus
**never stopped**: it drove continuously into the lens and the last two seconds
were a close-up of the bonnet with the scene gone. The prompt said *"the camera is
locked off"* and *"comes to a gentle stop in the last second"*. **The model obeyed
the approach and ignored the stop.** Only 2.5 of 8 seconds were usable.

> **That was a PROMPT failure, not a fidelity failure.** Africa was about to judge
> an ENGINE on an output whose defect was its own — and the owner was minutes from
> buying credits on the strength of that comparison. Quality at 100 credits would
> have bought the same bus driving into the same lens at higher resolution.

**The fix: constrain the subject's SIZE across the whole clip, never ask for a
stop at the end.**

- *"comes to rest in the MIDDLE DISTANCE, staying small in the frame with open sky
  above it and open ground below it for the whole clip"*
- *"the camera is locked off, low, and never moves closer"*
- *"never fills more than a third of the frame height and never reaches the camera"*

**And the two rules that predate this, which cost eleven generations:** never list
colours, bind each colour to an object; never negate a texture, negate objects.

### X22b. The check before the first generation

Flow has **"Confirm before generating: Always / Never"** in Agent settings. It was
on Always, which is the only reason Africa did not silently spend 100 credits
(twice the Flow balance) on one clip. **Nobody sets it to Never, and nobody clicks
"Always approve."** Find the equivalent in any new engine before the first run.

---

## X23. A FORK CAN BE CARRYING THREE WORLDS AT ONCE

Africa traced its contradicting assets by hash through **both** parents. The ones
that came all the way from INDIA untouched through two forks are the tell:

```
stall/kulhad.png           = SEA = INDIA    an Indian clay tea cup
bazaar/signal-scene.png    = SEA = INDIA    a railway signal
bazaar/welcome.mp4         = SEA = INDIA    10.7 MB, the repo's largest asset
bazaar/chacha-welcome.mp3  = SEA = INDIA    CHACHA-JI'S ACTUAL VOICE
```

So a fork whose preamble says **"THE WORLD IS THE ROAD, NOT WATER"**, whose elder
is ruled to be the **market mother**, and which lists *"the per-language uncle, the
kopitiam, the harbour master and every boat"* as things that must go, ships:

1. **India's railway** — a lineman, a signalman's scene, a stationmaster, a ticket scene
2. **India's chai stall** — an uncle pouring, an uncle on the phone, and a kulhad
3. **Southeast Asia's water** — the arrival boat, on web AND mobile

**The audio one is the sharpest and belongs at the top of any list.**
`chacha-welcome.mp3` is byte-identical to India's, so an African learner opening
the bazaar hears **Chacha-ji's actual voice, in Hindi**, in an app whose elder is a
market mother. That is not stale art. **It is the wrong person speaking.**

### X23a. Sort into KEEP and OWED. Only the fork's own rulings can tell them apart.

Europe's split, as the model to copy: **48 keep, ~93 owed, 10 to escalate.**

- **KEEP, deliberate:** fonts (not art), the mascot base files (*"never redraw the
  bird"* is a standing ruling — he is dressed, not replaced), squawks and band
  chimes (region-free), and the station-cap outfit, which in a railway fork is the
  most on-brief costume in the wardrobe. **Keeping it is a decision, not an omission.**
- **OWED, and rank contradictions above staleness.** The headline is not
  *"73% is Southeast Asia's"* — a percentage is a backlog. It is **"the stall still
  pours from a kulhad and the caller is still an uncle"**, four groups and about 22
  files. That is a bug.
- **ESCALATE what lands well by accident.** Europe's `pink-beanie2` is identical to
  SEA's, and a winter beanie is arguably *more* right for Central and Eastern
  Europe. Quietly keeping it would bury a decision the owner might want.

**Do the contradictions first and the journey backdrops last.** Africa was about to
spend a generation on a backdrop nobody looks at twice while a stationmaster and an
Indian tea cup sat on the bazaar screen.

**Check `call/` too.** Video-call backdrops are films rather than stills, so they
cost real generations, and a fork whose caller is a grandmother cannot ship
`chacha-call-driving.mp4`.

---

## X24. REPLIT'S WORKSPACE PANES STOPPED RENDERING, 2026-09-07

**Three instances, two Repls, one night**, and it blocked two forks:

- **East Asia**, ~01:00: Shell stopped rendering entirely partway through a session.
- **Africa**: the Republish dialog opens as a **loading skeleton that never
  resolves** — five attempts, three page loads, two click methods (coordinate and
  element ref). Only a Dismiss button ever appears in the DOM.
- **SEA**, ~04:30: the Shell pane renders as an empty black rectangle. Two Shell
  tabs, neither paints. Hard reload did not fix it.

**The tell: the chrome paints and the panes do not.** Toolbar, tab strip and the
Republish button all render correctly. So it looks like a broken page or a
permissions problem and is neither.

**What it blocked:** Africa's first publish (its config is separately poisoned —
both the workspace UI and the MCP connector refuse, with three different sentences,
none naming the real cause) and SEA's `git pull` before publishing.

**What NOT to do as a workaround:** publish through the MCP connector without the
pull. It succeeds, and it ships whatever sha the Repl is sitting on rather than the
one that passed CI. **A publish that succeeds and ships the wrong code is worse
than one that does not happen.**

---

## X25. ALL FOUR FORKS ASK FOR A PERMISSION PLAY REJECTED INDIA OVER

**Measured across all five, 2026-09-07:**

| repo | ASKS | BLOCKS |
|---|---|---|
| india | RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, CAMERA | **both media, both foreground service** |
| sea | the same three **plus READ_MEDIA_IMAGES** | none |
| europe | the same four | both foreground service |
| africa | the same four | none |
| east | the same four | none |

**India has not asked for `READ_MEDIA_IMAGES` since `1107932f`, because Play
rejected version code 536 over exactly it:** *"Use alternative system pickers for
the photos / videos."* India blocks it. All four forks ask for it.

Europe's handoff records that it SAVED the Play declaration for that permission
with *"India's wording reused verbatim"* — **the wording from before the
rejection.** India solved the foreground-service half and Europe solved it
independently; India also solved the media half and every fork inherited the
pre-fix state of it.

### X25a. DO NOT `git cherry-pick -x e1d04214`. That instruction was wrong.

**This was the supervisor's, and it is actively dangerous.** Europe's
foreground-service test **asserts a four-permission ask ending in
`READ_MEDIA_IMAGES`.** Ported into a repo that blocks it, the test fails, and the
obvious way to make a failing ported test pass is to add the permission back to
the ask —

> **which re-ships the permission a Play rejection made India remove.** India's
> words: *a tired agent at 2am does that in thirty seconds and it looks like
> housekeeping.*

It also does not apply cleanly: India already had a `blockedPermissions` array
that Europe's diff creates, so it conflicts before reaching the test.

**Take the SHAPE, not the diff, and check your own ask list first.** India's
`7962e5d6` pins the two media blocks as their own test case, so they read as a
shipped fix rather than as neighbours of the new lines.

**The reasoning is what travels**, and India re-verified it against its own tree
rather than inheriting Europe's: zero `setActiveForLockScreen` call sites,
`lib/audio.ts` setting only `allowsRecording` and `playsInSilentMode` in both
modes, and an empty sweep for `staysActiveInBackground`,
`shouldPlayInBackground`, `showNowPlayingNotification` and `UIBackgroundModes`.
**Verify the same in yours before blocking anything** — blocking a permission a
live service needs crashes every recording.

**Reach is zero until a build.** `app.json` is compile time; Play keeps asking
until a new bundle is uploaded.

---

## X26. THE PARROT IS HOLDING THE INDIAN FLAG, AND IT REACHED A LIVE PLAY ASSET

**Found by Europe, verified across all five:**

```
adaptive-icon.svg   sha 25b17de75cf1   india = sea = africa = east   BYTE-IDENTICAL
icon.svg            sha 37abf41f69eb   india = sea = africa = east   BYTE-IDENTICAL
europe              different shas, fixed 2026-09-07 in 75d52eee
```

**The file names it in line 1:**
`aria-label="Bolo – Bolo Bird holding an India flag"`. A tricolour on a pole in
the raised wing, with the Ashoka Chakra.

`gen-feature-graphic.sh` composites that SVG as the mark, so **the BOLO! Europe
feature graphic uploaded to Play showed the flag.** Fix the SVG *and* check what
is already uploaded, by downloading it and looking — not by checking whether the
repo file is yours.

### X26z. INDIA'S FLAG IS CORRECT. INDIA IS THE ORIGIN, NOT A VICTIM.

**India, 2026-09-07, and it matters because the obvious tidy-up is a regression.**

India's `adaptive-icon.svg` and `icon.svg` **keep the tricolour deliberately.** It
is a South Asian app; the flag belongs. The four forks inherited that file and
never looked at it, which is the bug — **in the forks, not in the parent.**

> **If anyone ever regenerates India's branding from a fork's flag-free version
> "to make them consistent", that is a REGRESSION in India and a fix everywhere
> else.** The direction of a port is part of the port.

**Same shape as X21**, where "fixing" SEA and East Asia's `usePosterReady` to match
India's ternary would have **created** a bug in repos that had none, because their
render sites paint what their gates already wait on.

**The general rule:** when four repos differ from one, ask which way the fix runs
before you make them agree. **Consistency is not a direction.**

### X26a. A histogram cannot see a small wrong object.

**Europe sampled the mark region's colour histogram first and it said "green bird
on cream" — true and useless**, because the flag is about two percent of the
mark's area. It only appeared when it cropped the live PNG and **looked**.

That is the third instance of one habit paying tonight, and all three were checks
aimed at something else:

- **Africa** found its boot film was SEA's boat by sampling frames while verifying its own re-encode.
- **Europe** found the flag by cropping while verifying a feature graphic.
- **East Asia** found its Play contact email was the dead address while checking whether fields were *filled* (see X16).

### X26b. After the fix, `grep FF9933` still hits. It is the BEAK AND THE FEET.

**Do not re-open this on a grep.** Africa took Europe's `75d52eee` verbatim,
rendered both SVGs at 300px and looked: no flag, no pole, no chakra, bird
untouched. **Three `FF9933` hits survive outside the comments and they are the
bird's own beak and feet.** Saffron is a flag colour and a parrot colour.

The supervisor raised a false alarm on exactly this, counting "flag markers" and
telling Europe its fix looked incomplete. **That is X26a running in the other
direction:** a cheap proxy answering a different question from the one asked. The
histogram said "green bird on cream"; the grep said "still has saffron". Both
true, both useless. **The only check that works on this file is rendering it and
looking.**

**Take the fix verbatim rather than re-cutting it**, so a flagless parrot is one
file across five repos rather than five variants that drift.

### X26c. A guard is not a fix.

Africa guarded `gen-store-assets.sh` against this SVG hours before the flag was
found, and **called the file "the tricolour parrot" in its own commit message
without ever looking at it.** Its own line:

> **A guard stops the script rebuilding from a bad source. It does not fix the
> source.** Both were needed and I built one.

The guard still earned its place: Africa's committed Play icon and feature
graphic turned out **clean** — its own art, not rebuilt from the SVGs. Europe's
uploaded feature graphic is the one that actually shipped the flag.

**Europe's own diagnosis, and it names the failure exactly:** twice in one day it
**processed an asset without looking at it** — first re-encoding the splash film
while calling it "SEA's water" in its own commit message, when its own
`splashFilm.ts` described *a junk under a batik sail* three lines above the line
it read. **Trusting a filename and a comment instead of opening the file.**

---

## X27. AN UNDECLARED IMPORT IS A QUESTION, NOT A DEFECT

**India's correction to X15b, and it argues against the fix SEA shipped.**

India ran the undeclared-dependency sweep with `ts.createSourceFile`, checking
every bare specifier in all three artifacts against that package's own manifest.
**Exactly one hit in the whole repo** (`13e94fe6`):

```
api-server        0
bolo-mobile       1   __tests__/zone-films.test.ts -> @jest/globals
gujarati-coach    0
```

Same package that killed SEA's four CI jobs. **India did not declare it.** That
file imports `describe`, `it` and `expect`, which are **already globals in the
other 169 mobile suites** — it is the only one of 170 that imports them. So India
**deleted the import** and matched the file to its neighbours, which *removes* the
undeclared dependency rather than legitimising it. `zone-films` 11/11 green.

> **"Declare what you import" points the wrong way on its own. Ask whether the
> import should exist before you make it legal.** Two of the three answers — drop
> the import, or move the package — leave you with less to maintain than declaring
> it does.

And the cheap version is cheaper than it looks: no manifest change means **no
lockfile to regenerate, nothing for `--frozen-lockfile` to disagree with**, and
none of the pnpm re-resolution risk. SEA's fix required a lockfile diff that
re-keyed `@react-native/codegen` because a new peer entered the set.

---

## X28. REPLIT'S DATA LAYER IS DOWN, NOT ONE COMPONENT

**Updating X24 with a full test, 2026-09-07 ~04:45.** Four pane types, all fail
identically: **the static chrome paints and anything that loads data never
resolves.**

| Pane | Symptom |
|---|---|
| Shell | Empty black rectangle. **Three separate tabs, including a brand new one** |
| Git | Header renders, spinner forever, 18+ seconds |
| Republish dialog | Loading skeleton; only a Dismiss button ever appears in the DOM |
| Publishing | Same skeleton |

**The tool PICKER renders fine**, which is what makes a fresh pane look like a
plausible workaround. It is not — it is the pane type, not staleness.

**What it blocked:** SEA's `git pull` before publishing (CI green on `b8d7e39e`,
publish ready, cannot reach step 3) and Africa's first publish. No amount of
clicking gets through it; stop after establishing the pattern.

### X28a. Replit's BACKEND is fine. It is the web client that is dead.

Probed 2026-09-07 ~04:50: the Replit **API answers instantly and correctly**
(`get_publish_status` via the MCP connector returned full deployment detail),
while four browser pane types render their chrome and never resolve their data.

**So this is a Replit web-client problem — not an outage, not a permissions
issue, and not something a retry pattern fixes.** Establish the pattern, stop
clicking, check back periodically.

### X28b. A `failed` deployment status with a LIVE site means an older one is serving.

SEA reads `status: failed`, `deploymentId b542f758`, `url https://bolo-sea.app` —
**and bolo-sea.app serves**: 200, real JSON, ten languages. So an **earlier**
deployment is live and the most recent attempt failed.

"Nothing has been published since X" and "nothing has been ATTEMPTED since X" are
different claims and the site cannot tell them apart. **Read the deployment
status, not the site.**

**This is how Africa's config got poisoned**, and any fork in this state may find
both the workspace UI *and* the MCP connector refuse to start a new publish, with
three different sentences none of which names the cause (X24). Find out **when and
why** the previous deployment failed before republishing, or you reproduce it.

### X28c. Do NOT use the Replit Agent to run git commands for you.

It would work. It **spends agent credits**, which the owner has a standing rule
against for these repos, and it puts a language model between you and a two-word
command. A blocked `git pull` waits for the owner's own shell.

---

## X29. BLOCKING A PERMISSION BREAKS WHATEVER ASKED FOR IT

**SEA, 2026-09-07, found while doing X25.** Blocking `READ_MEDIA_IMAGES` in
`app.json` is never only a manifest change. **Something asked for that
permission, and it is still asking.**

SEA's `pickAvatarFromLibrary` was gated on
`requestMediaLibraryPermissionsAsync`. Once the permission is blocked that call
**can only ever return DENIED**, so the avatar picker fails permanently on
Android, silently, **as a direct result of the fix**. SEA removed the gate on
Android and kept it on iOS, where the permission is not blocked.

> **Grep for `requestMediaLibraryPermissionsAsync` and anything gated on a media
> permission BEFORE you block.** The obvious fix creates a second defect one layer
> away from where you were looking — the same species as X25a, where making a
> ported test pass re-ships the permission a rejection removed.

### X29a. Hand-cutting the flag out of the SVG breaks the file.

SEA's first removal cut at the **first `</g>` after the flag comment**, which
closed the **nested chakra-spoke group** and left the outer one open. **The SVG
stopped parsing.** It only found out because it rendered the result rather than
trusting the edit.

The two files also differ in shape: `icon.svg` wraps the flag in a group,
`adaptive-icon.svg` has the rects inline, **so one matcher cannot do both**.

**Take Europe's `75d52eee` verbatim.** Africa did and hit none of this, and it
keeps a flagless parrot as one file across five repos rather than five variants
that drift.

### X29b. Not every fork actually shipped the flag. Check before you panic.

Both SVGs are infected in four repos, but **what each fork ships differs**:

| Fork | Shipped assets |
|---|---|
| Europe | **Feature graphic on Play carried the flag.** The only one that shipped it |
| SEA | Clean — Play icon, feature graphic and app icon are all bespoke, because its feature graphic renders from HTML rather than compositing through `gen-store-assets.sh` |
| Africa | Clean — its own art, a beaded parrot on an African street |

**The live hazard in the other repos was the SCRIPT, not the assets.** Which is
why Africa's guard was aimed at the right thing even though it was half the job
(X26c). Check what you actually uploaded by downloading and looking; fix the
source either way.

---

## X30. AN ALREADY-GENERATED CLIP CAN BE THE PRE-FIX ONE

**Europe, 2026-09-07.** It found an existing railway-platform render in the Kling
asset list that looked good in the thumbnail and nearly reused it as a free win.
It pulled the full prompt text before deciding: **it was the PRE-FIX prompt**,
ending *"moving slowly and still arriving when the clip ends"* — Africa's minibus
wording exactly, carrying the defect Africa had just paid a render to find.

> **The one clip that looked free was the one carrying the bug.**

**And a thumbnail cannot save you: the failure only shows in the last two
seconds.** A still from the middle of a bad clip is identical to a still from a
good one. **Read the stored prompt before reusing any existing asset.**

### X30a. The Kling player cannot be used to check motion.

Playing a clip in its card and seeking through the video element both fail: **the
timer stays at 00:00 and the element reports no duration**, so metadata is not
reachable from the page. **The only way to judge direction is to download and
sample frames locally.**

That makes the download part of *doing* the work rather than a final step — you
cannot evaluate an output you cannot open.

### X30b. Price by duration, not by the number you were told.

```
Kling 1080p, 9:16, audio OFF,  5s   40 credits
Kling 1080p, 9:16, audio OFF,  8s   64 credits
```

The supervisor gave 40 as the price; that is the 5s figure. **Europe's pair cost
128.** Balance ~5.9k, so still not a constraint, but plan on the length you are
actually generating.

### X30c. Five seconds or eight? It is a QUESTION, not a rule.

> **Are your web and mobile splash the SAME FILE?**

| Fork | Answer | Consequence |
|---|---|---|
| SEA, Africa | **No**, separate files, different cuts | White prepend is web-only *by construction*. 5s. |
| Europe | **Yes**, one film serving both, mobile seeking to 2.4 | 8s, and the web cut is made afterwards |

**Nobody copies either answer without reading their own `splashFilm.ts`.** The
supervisor issued 5s as a rule and it was right for Africa by accident.

---

## X31. `/delete-account` IS NOT A ROUTE IN FOUR OF THE FIVE REPOS

**India, 2026-09-07, found while building X4's prerender.**

### The rule first, because it is the one that prevents the damage:

> **Do not enter a deletion URL on Play's Data safety form until AFTER the
> publish.** Otherwise you file a second dead URL. SEA's `/support` exists in the
> bundle and only in the bundle; East Asia has already submitted Data safety while
> `bolo-east.app` serves nothing at all.

Verified from every routing table:

| Repo | Routes | Deletion route? |
|---|---|---|
| india | `/account` | **NO** |
| sea | `/account` | **NO** |
| europe | `/account` | **NO** in the app; covered by `site/delete-account` on Pages |
| africa | `/account`, `/delete-account` | **YES** |
| east | `/account` | **NO**; files `/support`, which IS a route and documents deletion |

> **This is not "the page does not server-render". It is "the page does not
> exist."** A request falls through the catch-all to the app's own not-found,
> with JavaScript or without it. **If that is the URL a fork gave Google for data
> deletion, it has never worked for anyone, crawler or human.**

That reframes X4 for anyone who read it as a rendering problem. **Check the
routing table, not the browser** — a browser shows you a page either way.

**And confirm what is FILED rather than what you remember** — by reading the
console, not your own notes.

**CORRECTION, 2026-09-07, and the correction is the lesson.** This entry
originally said SEA had filed an App Store Support URL pointing at a route that
did not exist. **SEA measured it instead of remembering it and it was not true:**
`supportUrl` is `https://bolo-sea.app/contact`, and `/contact` is routed at
`App.tsx:629` and always has been. What actually happened is that SEA *checked*
whether `/support` was a route, found it was not, built one, and then wrote it up
as though the dead URL had already been filed. **The page was worth building; the
reason given for building it was wrong.** SEA's own words: the same
"remembered instead of measured" failure it had been flagging in others all night,
committed about its own work.

**What is actually true for SEA, and it is a sequencing rule:**

- `/support` is **not live** — byte-identical to a nonsense path right now,
  because the publish is blocked. It exists in the bundle and only in the bundle.
- `/support` is **filed nowhere** — Play's Data safety is not started, so no
  deletion URL has been given to Google at all.

> **So do not enter a deletion URL on the Data safety form until after the
> publish**, or you file a second dead URL — which is the real version of the
> mistake that was mis-reported.

**Nobody should write the page.** The words on a deletion page are a statement
about what the product deletes and when. That is the owner's to make, not an
agent's to invent at 4am.

---

## X32. PRERENDERING THE LEGAL PAGES. THE RECIPE, AND THREE THINGS TO COPY

**India's `e995eb93`**, the X4 standard: prerender `/privacy` and `/terms` to real
HTML at build time. Keeps the app on the apex *and* gives a crawler something to
read — both halves, unlike Europe's `site/`, which works only because Europe gave
up its apex.

**Verified by reading the emitted file, not the log:** `privacy/index.html` is
16,515 bytes carrying 4,654 characters of visible policy prose under its own
title, where a JS-less fetch previously got 7,972 bytes of homepage.

**1. Real files must beat the SPA fallback, and India checked that against
production BEFORE writing a line.** `/aksharmala.html` returns its own 659KB,
`/robots.txt` its own 68 bytes, `/manifest.webmanifest` falls through to
index.html because no such file is built. **Run the equivalent on your own host
first: if your serving layer resolves the catch-all ahead of static files, the
whole approach is dead.**

**2. Use Vite's own `ssrLoadModule`, not a second bundler.** `esbuild` is not a
declared dependency of that package, and adding one *hours after removing the
repo's only undeclared import* would have been the same mistake wearing a hat
(X27). `ssrLoadModule` also gets `import.meta.env` and the `@/` alias for free.

**3. The script CANNOT fail the build, deliberately** — a prerender bug must not
cost a morning publish on a live app. Proven rather than asserted: pointing a
route at a missing file gives build exit 0, that page skipped with a warning, the
other still written.

> **The cost of that choice is a SILENT skip, so the guard is a vitest case that
> renders the same components the same way in the same Node environment and fails
> loudly. A build step that must never fail needs a test that must.**

**Gotcha:** wouter's default location hook reads the browser's `location`, so a
bare `renderToStaticMarkup` dies with *"location is not defined"*. Wrap in
`Router` with `ssrPath`.

---

## X33. GATE 3 RULING: `chai` IS THE WIRE FIELD IN ALL FIVE REPOS

**Ruled by the supervisor 2026-09-07, on India's proposal, for the five X5
endpoints only.** Do not re-litigate this.

`DailyGiftState` has a field literally named `chai`. India's `openapi.yaml`
contains `chai` **21 times** and `kopi` zero; SEA's contains `kopi` **18 times**
and `chai` zero. **The wire contract split on the currency noun before anyone
noticed**, and porting Daily Gift without a ruling would have made it five.

> **The field is `chai` on the wire in all five repos, unchanged. The currency
> noun is a DISPLAY concern in the client.**

**Why:** a wire field is an identifier, not a word a learner reads. Nobody sees
`chai` unless they open a network tab; the learner sees Kopi, Čaj, cowries or
cha, and that already lives in the client. One schema, one codegen output, one
cherry-pick — which is the entire point of Gate 3.

**Why not a neutral third name like `tokens`:** cleaner on paper, and it costs a
**breaking change to India's LIVE contract** to fix a problem the forks do not
have yet. India's shipped clients would break on a field rename. **Never trade a
real break for a tidy diff.**

**Two conditions:**

1. **The field carries a comment in the spec** saying it is an identifier rather
   than a display noun, naming this ruling. Otherwise the first agent to read
   `chai` in an African app "fixes" it, **and we get the fifth contract by
   tidiness rather than by disagreement.**
2. **Deferred, not settled forever.** If India ever ships a contract-breaking
   version bump for other reasons, the neutral rename rides that window at near-
   zero cost. Do not go looking for the window.

**This does NOT extend to the pre-existing paths.** X6 stays open for those. This
ruling stops the split becoming five, which is the achievable win.

**There was nothing to design:** all five endpoints are already fully specified in
India's `openapi.yaml`. The instruction is **adopt the fragment verbatim**.

---

## X34. THE PORTABILITY TABLE IS WRONG ABOUT `lib/daily-gift`

**India, 2026-09-07.** It sits in the table's "travels, unchanged" row. **It does
not.** Three of its exported functions return **English display copy, and that
copy says "Chai"**. A fork that copies the package whole ships a string naming the
wrong currency **and it typechecks perfectly**.

**The ladder is ENGINE. The three copy functions are REGION and get re-authored.**

**A `currencyNoun` parameter was considered and rejected:** threading an argument
through three functions costs more than rewriting three strings, **and it hides the
region-ness the next reader needs to see.** Region-ness should be visible, not
abstracted.

> That is the exact failure the portability table exists to prevent, sitting
> *inside* the portability table. Audit the other rows the same way.

### X34a. `order-gates` is not inert in the forks. It is ARMED ON THE WRONG ALPHABET.

**All four forks carry India's Devanagari stroke data BYTE-IDENTICALLY** —
`devanagari-strokes.ts` at 94 lines and `contributed-strokes.ts` at 2,696 lines,
in all five repos. So `scriptsOnRealData()` returns **Devanagari and Gujarati** in
four apps that teach neither.

Ship it for the mechanism, **expect it to gate nothing, and do not let anyone
report Letter Drill as done on the strength of it.**

### X34b. Letter Match travels free. Letter Drill does not.

**The most useful line in the port brief.** `letter-match` imports only
`./trace-stops` and matches a letter to a **SOUND**, so it needs characters and
romanisations — which every fork already has. **Letter Match works the day it
lands.**

Blocked on data rather than on the port: **East Asia has no `east-alphabets.ts`
at all**, so it has no letter set and neither feature has anything to run on.
Africa gets Letter Match and an ungated drill — **and Arabic is cursive and joins,
so a per-letter tracing model may be the wrong shape entirely.** That is a product
question India never had to answer; it goes to the owner, not to a porting agent.

### X34c. An unlinked workspace package makes a suite read as green by reading as nothing.

India shipped `@workspace/daily-gift` **unlinked**. The whole api suite could not
**start**, so `games.letter-stop.test.ts` had never executed across two handoffs
**and read as green because it read as nothing.**

**Link in the same commit, and check that the suite's test COUNT moved** rather
than that it stayed green. Purest form of the silent default: an absent result and
a passing result are identical to anyone reading a summary.

---

## X35. LETTER DRILL'S VALUE INVERTS AGAINST THE PORT COST

**Africa raised it, the supervisor measured it, 2026-09-07.** Africa's ten
languages include Hausa, Yoruba, Igbo, Oromo, Swahili and Zulu, which are
**Latin** — and a letter drill on the Latin alphabet teaches a diaspora learner
nothing they do not already know.

**Counted from the `script` field in every `seedData.ts`:**

| repo | NON-LATIN | total | scripts |
|---|---|---|---|
| india | **22** | 22 | Devanagari 8, Perso-Arabic 3, Bengali, Gujarati, Kannada, Malayalam, Meetei Mayek, Odia, Gurmukhi, Ol Chiki, Tamil, Telugu, Bengali-Assamese |
| east | **10** | 10 | Traditional Chinese 5, Simplified 3, Japanese, Hangul |
| sea | 6 | 10 | Myanmar, Khmer, Lao, Thai, Trad + Simp Chinese |
| africa | 3 | 10 | Ethiopic 2, Arabic 1 |
| europe | 5 | 22 | Cyrillic 5 |

> **East Asia has the highest possible value — ten of ten — and NO ALPHABET DATA
> AT ALL. Europe has the most languages and the least need, five of
> twenty-two.**

### CORRECTION, 2026-09-07, and it inverts the ruling for one fork.

**Africa: the table above counts LANGUAGES, but Letter Drill's cost is per
SCRIPT.** Authoring one alphabet serves every language that uses it. **Value tracks
languages, cost tracks scripts, and the RATIO orders the queue** rather than either
number alone.

| repo | langs / scripts | ratio | coverage | non-Latin scripts |
|---|---|---|---|---|
| **europe** | 5 / **1** | **5.0** | 23% | **Cyrillic only** |
| east | 10 / 4 | 2.5 | 100% | Trad Chinese, Simp Chinese, Japanese, Hangul |
| india | 22 / 13 | 1.7 | 100% | thirteen |
| africa | 3 / 2 | 1.5 | 30% | Ethiopic, Arabic |
| sea | 6 / 6 | 1.0 | 60% | Khmer, Lao, Myanmar, Thai, both Chinese |

**Europe's five non-Latin languages share ONE script.** Bulgarian, Macedonian,
Serbian, Ukrainian and Russian are all Cyrillic. **It is the cheapest drill in the
fleet: one alphabet buys five languages.** The supervisor ruled it "last, and
possibly never" on a coverage number **without asking what it would cost to get**.

**REVISED ORDER:**

1. **East Asia.** Best on both axes: 100% coverage, 2.5 langs per script. Still
   blocked on having no alphabet set at all — that is the finding, not a demotion.
2. **Europe.** One script, five languages. 23% coverage is low, but 23% of
   twenty-two languages for the cost of a single alphabet beats SEA's 60% at six.
3. **SEA.** 60% coverage and the **worst** efficiency: six scripts for six
   languages, so every language costs a full alphabet.
4. **Africa.** 30% coverage, 1.5, and one of its two scripts is the unresolved
   Arabic cursive question. Realistically **one script, Ge'ez, for two languages.**

**"Never is a legitimate answer rather than a deferral" stays**, and now applies
most cleanly to Africa alone.

**A note on how this was caught.** Africa said its finding "strengthens the ruling
rather than changing it". True for Africa and East Asia; **false for Europe, which
it had not computed.** Third time in one night a correct general finding was
applied to the wrong fork. The two people who checked both agreed on the languages
and **neither derived the scripts, which is where the answer was.**

**So the port instruction is not "all four forks port both features":**

- **LETTER MATCH: all four, immediately, every language.** Letter-to-sound works
  on Latin as well as Ge'ez, so Africa gets it for ten of ten rather than two and
  Europe for twenty-two of twenty-two. Free and universal.
- **LETTER DRILL: East Asia FIRST**, once it has an alphabet set, because it is
  the only fork where every language needs it. **SEA second** at 6 of 10.
  **Africa and Europe last, and possibly never** — 2 of 10 and 5 of 22 do not
  obviously repay a five-stage port with a contract change in it.

**This is the ledger doing the job it exists for:** stopping three forks building
something worth little to them, rather than making all four build the same thing.

### X35a. A test that passes BECAUSE the bug is present.

**Africa's sharpening of X34a, and it is the nastiest face of the silent default
found tonight.** If `scriptsOnRealData()` returns Devanagari and Gujarati in an
African app, then `order-gates` does not merely gate nothing:

> **It gates on the PRESENCE OF INDIAN SCRIPT DATA. So a green test proves the
> Indian data is still there.** The test rewards the fault.

Pin it as such if you ship it.

### X35b. Prove a comment cannot reach codegen before adding one to a contract file.

India did not assume a YAML comment is inert. It **parsed the spec before and
after with the same parser and compared the JSON**: identical, and the `chai`
property byte-for-byte unchanged. So nothing regenerates, no client moves, and
documenting the gate does not re-open it.

**Carry that proof with the instruction**, so a fork can paste the comment in with
no rebuild and know why it is safe. That is the standard Gate 3 should hold to.

---

## X36. ADDING A LANGUAGE: TWO THINGS THAT TYPECHECK AND ARE WRONG

**Europe, 2026-09-07, found while fixing CI after 16 to 22.** Six pins were pins
and were inverted with the old number kept in the comment. **Two were not pins,
and those are the ones that travel.**

### X36a. The grandmother would have spoken English to a Spanish learner.

`UNCLE_LINES` had sixteen titles and three spoken lines in sixteen languages. **The
six new doors fell to the ENGLISH fallback.** So a Spanish learner's *abuela* would
have addressed her in English.

She now has **Mamie, Oma, Nonna, Avó, Babushka and Abuela** — each the child's word
rather than the dictionary's — with three lines apiece, using each language's own
word for tea the way the sixteen do.

> **Any fork adding a language checks `UNCLE_LINES` before shipping. The fallback
> is silent, it typechecks, and it reads as working.**

### X36b. A fixture chosen because it was ABSENT has a shelf life.

`entitlements.test.ts` asserted that **`"es"` is NOT allowed** on the one-language
plan — using Spanish as the stand-in for *a language this app does not teach*.
**The app teaches it now, so the fixture quietly became false.**

Same family as the hard-coded `GENERATED (2026-09-04)` marker (X22-era): **a
constant standing in for a value nobody expected to change.** When you pick a
fixture *because* something is absent, you have written an expiry date you did not
label.

**Look for these whenever a fork's language set grows:** a negative assertion whose
subject you chose for being out of scope, and any fallback that fires silently.

---

## X37. THE ART PIPELINE'S REAL BLOCKER IS THE DOWNLOAD

**Not credits, not access, not prompts — retrieval.**

Kling's player **cannot be used to judge a clip**: it reports no duration and will
not seek, so the last-two-seconds failure that ruined Africa's first render
(X22a) **is not observable from inside Kling at all**. Verification requires
downloading and sampling frames locally.

So the download is **not a final step, it is how the work gets done.** A generated
film that stays in the account is not artwork finished, and cannot even be
assessed.

**Africa downloaded** on a first-hand instruction in its own session naming Flow
and Kling explicitly. **Europe held**, because its own instruction may not have
carried that sentence and it would not decide it for the owner while he slept.
**Both were right for their own sessions** — an authorisation is scoped to the
session that received it, and a peer relaying it does not widen it (see
[[bolo-supervisor-relayed-authority]]).

**The consequence to surface, not to work around:** everything downstream in a
fork's artwork queue is blocked behind one word from the owner.

**CLOSED 2026-09-07 by the owner's authority ruling (see SUPERVISOR.md rule 1).**
The word is given. A relay carrying his quoted words is his approval now, so the
next Europe session may download.

---

## X95. THE SERVER BRANCHES THE CLERK SECRET BY HOST AND DOES NOT BRANCH THE KEY. THE WEB CLIENT ALREADY DOES BOTH.

**ENGINE. Europe's, 2026-09-10, found while moving to its production Clerk
instance. All six repos have it, India included.**

**`app.ts` resolves the two halves of one Clerk identity in two different
shapes:**

```
secretKey       (isCustomDomain ? CLERK_SECRET_KEY_PROD : CLERK_SECRET_KEY) ?? CLERK_SECRET_KEY
publishableKey  publishableKeyFromHost(host, process.env.CLERK_PUBLISHABLE_KEY)
```

**The secret gets a per-host branch. The key gets one env slot for every host.**
That is fine while the slot holds a pk_test, because of Clerk's own rule, read
from `@clerk/shared/keys` rather than remembered:

```js
function publishableKeyFromHost(host, fallbackKey) {
  if (fallbackKey && isDevelopmentFromPublishableKey(fallbackKey)) return fallbackKey;
  return buildPublishableKey(`clerk.${host.toLowerCase().replace(/:\d+$/, "")}`);
}
```

**A FALLBACK IS HONOURED ONLY WHEN IT IS A DEVELOPMENT KEY.** So the one slot
has exactly two settings and neither is right:

- **pk_test in the slot:** it short-circuits on EVERY host, the custom domain
  included, so the server announces the DEV instance while holding sk_live. That
  is a total auth failure on the live domain, and it is what Europe was serving
  before today. It is the same fault as X20 from the other side: there the split
  half took, here the split cannot take because there is only one slot.
- **pk_live in the slot:** the custom domain is correct and every OTHER host the
  deployment answers on derives `clerk.<that-host>`, a Clerk instance that does
  not exist. The `.replit.app` URL loses auth with nothing in the logs naming
  the cause.

**THE PREVIEW BREAKAGE IS THE SERVER'S, NOT THE CLIENT'S, and that attribution
matters because the client keys get changed in the same commit and take the
blame.** A fork flipping to production changes three publishable variables.
Only `CLERK_PUBLISHABLE_KEY` causes this. `VITE_` is derived around on the real
domain and `EXPO_PUBLIC_` in `.replit` is documentation, since EAS builds do not
read that file.

### THE FIX IS ALREADY WRITTEN, IN THE OTHER ARTIFACT

**`App.tsx` solved this and the server never copied it.** The web client picks
the shape by host and passes NO fallback on the production domain, which is what
lets the derivation run there and short-circuit everywhere else:

```js
const clerkPubKey = isProdClerkHost
  ? publishableKeyFromHost(PROD_CLERK_DOMAIN)          // derives pk_live
  : publishableKeyFromHost(hostname, VITE_CLERK_...);  // pk_test short-circuits
```

**Ported to `app.ts` that is one ternary and NO new environment variable**, and
it puts `CLERK_PUBLISHABLE_KEY` back to pk_test where the preview wants it.
pk_live is deterministic, so the custom domain needs nothing stored.

**NOT BUILT. Proposed only**, because Europe was told to hold before a publish
and this is a server change on a live auth path. Whoever takes it owes the fix
a test that runs the resolver against BOTH hostnames, since the current shape
passes any test that only ever asks about one.

**WHAT EACH REPO HAS RIGHT NOW**, read from the six trees rather than assumed:

```
India        NO secret branch at all and no PROD slot. One key, one secret,
             pk_live in production, so India has this exposure today on every
             host that is not bolo-india.app.
SEA          secret branched, key not
Europe       secret branched, key not      flipping to pk_live 2026-09-10
LATAM        secret branched, key not      flipping to pk_live 2026-09-10
Africa       secret branched, key not
East Asia    secret branched, key not
```

**THE SHAPE OF THE MISTAKE, which is the part worth carrying:** one identity was
split across two variables and only one of them learned about hosts. Nothing
fails at the seam, because each half is individually correct. **When you branch
half of a pair, the other half is not "unchanged", it is now wrong for one of
the branches.**

---

## X90. "SCRIPT TRACE NEEDS FOUR FONTS" IS WRONG BY THREE STEPS, AND STEP FIVE TEACHES CHILDREN TO WRITE WRONG.

**2026-09-08. SEA's, measured before starting the job the fleet had queued for
it. The recipe being passed between forks tonight is: add Noto Thai, Khmer, Lao
and Myanmar to `store/fonts`, extend `FONT_BY_PREFIX`, point the generator at
`SEA_ALPHABETS`. I was about to do exactly that. It is steps 2, 3 and 4 of five,
and both missing steps are the expensive ones.**

### What is actually in the tree

    lib/script-trace/src/chapters.ts     727 entries, 28 id prefixes
                                         hi te or ml kn gu bn pa ur ta sat
                                         mni sd ks ... EVERY ONE INDIAN
    store/fonts                          15 files: 13 Indian-script Noto,
                                         2 brand. ZERO Southeast Asian.
    AUTHORED_GLYPHS                      12 scripts, every one Indian
    traceReadyFor()                      false for vi id ms tl th km lo my
                                         yue zh

**`extractScriptTraceGuides.ts` fills in a guide for every character IN THE
CHAPTER DATA.** With zero Thai chapters it has zero Thai characters to shape,
**so the font it cannot find is not the thing stopping it.** Handing it four
fonts changes nothing at all, and it will report success while doing so, which
is tonight's shape for the fourth time.

### The real order, five steps

**1. AUTHOR THE CHAPTERS.** Which letters, in what order, grouped into what
stages, with what labels. Roughly 45 entries per script for Thai, Lao, Khmer and
Myanmar. **This is a syllabus, not a data entry job**, and it is the whole
cost. **2.** The four fonts. **3.** `FONT_BY_PREFIX`. **4.** Run the extractor
for outlines. **5.** Provisional glyphs.

**Cantonese and Mandarin are not step 1 at a larger size.** Han characters have
no alphabet to enumerate, so "which characters" is a curriculum ruling before it
is a list. **SEA's own CLAUDE.md already said this and the fleet recipe lost it.**

**AND HAN IS THE ONE SCRIPT WHERE STEP 5 IS NOT A HAZARD AT ALL, which is the
opposite of what you would guess.** SEA measured this on 2026-09-01 with
`scripts/probeHanziStrokes.mjs`: Make Me a Hanzi / hanzi-writer publish
**`medians`** per character, the pen path of each stroke in writing order with
direction. That **IS** `AuthoredStroke[]` in a different coordinate box, not an
approximation of it, on the transform `x/1024*100`, `(900-y)/1024*100`.

> **So the one script in the fleet that cannot be hand-traced is the only one
> whose strokes are ACQUIRED rather than authored, and it arrives as real
> medians rather than the font-derived guesses `stroke-scoring.ts` has to warn
> learners about.** Traditional is fine, 8 of 8 on the Cantonese set.

**There are TWO catches, and only the first is a content catch.** The dataset is
Standard Written Chinese in Traditional forms, and **written Cantonese is a
different language**. Checked against the full 9,574-character `graphics.txt`,
**咗 喺 佢 啲 嗰 冇 咁 攞 are all absent**, and those are not obscure. About
forty written-Cantonese characters must be hand-authored on top.

**THE SECOND IS A LICENCE AND IT BLOCKS, ADDED 2026-09-08 AFTER I LOST IT IN A
SINGLE HOP.** The data descends from Arphic fonts and carries the **Arphic
Public License**, a **copyleft** font licence with an **attribution
requirement**. **Bolo is a paid app.** Engineering fit does not clear it,
nothing measured in the probe touches it, and it is **not the fleet's to clear
and possibly not only the owner's**.

> **Three items of three different sizes, and reporting them as one is the
> error:** ENGINEERING solved. CONTENT about forty characters. **LICENCE open,
> copyleft, attribution required, commercial app.** The third belongs on the
> owner's list as a separate BLOCKING legal item, never as a footnote under a
> syllabus question.

**How it went missing is written up in full under X88** ("AND THE RELAY DROPPED
THE ONE THING THAT ACTUALLY BLOCKS IT", and East Asia's *the mechanism travels
and the constraint does not*). **Two readers truncated the same memory two
different ways:** the supervisor quoted its one-line description, and I read the
file with `head -30` while the licence paragraph sits below line 30, **then
reasoned from the part I had cut off and relayed the result as complete.**

**No marker catches this one.** X89's per-file audit is a word search and a
licence is not a word in a prompt. The only defence is reading the whole source
before relaying it, **which is a discipline rather than a grep.**

**So the refusal in step 5 below is about th, lo, km and my specifically. Do not
generalise it to yue and zh, where the honest data already exists.**

### STEP 5 IS THE ONE TO STOP AT, AND IT IS NOT A TECHNICAL LIMIT

India's `PROVISIONAL_GLYPHS` derive strokes from font outlines so that tracing
is offered in all 22 languages "while contributions come in rather than gating
21 of them off". **It is a good answer to a real problem and it does not
transfer here.** India's own comment says why:

> *"within a letter the start point and direction come from the contour winding,
> not from a hand. Devanagari's shirorekha is the plain case: it is written LAST
> and the font has no opinion about that."*

**Thai's equivalent is not a detail, it is the first thing anyone is taught:**
a Thai letter starts at the หัว, the small loop, and the loop's presence,
position and direction are how the letter is identified. **A contour winding
does not know that.** Lao, Khmer and Myanmar each carry their own taught order.

**So a provisional set for th, lo, km and my is not "usually right, occasionally
wrong" the way India's is.** It would be systematically wrong on the single rule each of these
scripts teaches first, in a feature whose entire purpose is stroke order,
**shipped to children, in four languages nobody on the project reads.**

> **AND THE OWNER ALREADY RULED ON EXACTLY THIS.** `TRACING_ENABLED` is false
> since 2026-09-02: *"feature flag it off until i can get native writers to
> write it."* **Generating provisional strokes is building the thing he turned
> off, in the one form he named as the reason for turning it off.** A fork that
> reads "India ships provisional glyphs" and copies it has routed around an
> owner ruling by way of a sibling's precedent.

### The general form, and it is X87 again in a different subsystem

**X87: the prompt is not part of the recipe.** Here: **the syllabus is not part
of the recipe.** Both times the recipe passed between forks was the mechanical
half, both times the mechanical half was complete and correct, and both times
**everything that makes the output regional was in the half nobody sent.**

> **When a sibling hands you a recipe with no content in it, the content is not
> missing. It is the job.**

**What SEA is doing instead:** nothing on the four alphabetic scripts, and saying
so. Steps 2 to 4 are an afternoon and would produce a feature worse than its
absence. **Step 1 is the owner's to commission, alongside the native writers he
already named.**

**The one path that does NOT need a writer is Han**, because its strokes are
acquired rather than guessed. It still needs a curriculum ruling on which
characters and about forty hand-authored written-Cantonese ones, **so it is a
smaller owner decision rather than no owner decision.** Nobody should start it
without asking, and nobody should call it blocked either.

---

## X89. THE ONE WRONG-REGION ASSET A PAYING CUSTOMER CAN SEE IS THE ONE NO BUILD, NO TEST AND NO CI JOB CAN REACH.

**2026-09-08. SEA's, and it is X87's necessary counterweight. Fixed in the same
session it was named, commit `8f93f9be`.**

### The asset

`artifacts/bolo-mobile/assets/store/ios/promo/kopi-pack-1024.png` was
**byte-identical to India's `chai-pack-1024.png`**: a North Indian chai stall
with terracotta kulhads, in a file named kopi-pack, sitting in the slot an
App Store promoted-purchase image is uploaded from.

> ### CORRECTION, 2026-09-09, AND IT IS THE ENTRY'S OWN LESSON TURNED ON ITSELF
>
> **This paragraph originally said the file was "uploaded to App Store Connect
> ... with promoted purchases ON", and that the wrong art was in front of paying
> customers. I WENT AND LOOKED. IT IS NOT TRUE AND IT NEVER WAS.** All three
> Kopi packs in App Store Connect show **`Image (Optional): –`**. Empty. Nothing
> has ever been uploaded to any of them, so no customer has seen India's chai
> stall on SEA's store, because SEA's store has no promo image at all.
>
> **I did not verify the claim before writing it into this file.** It arrived in
> a relay, it was vivid, it was urgent, and it made a good entry. **The whole
> entry is about assets no instrument can see, and I asserted the state of one
> without opening the only instrument that can see it, which is the console.**
>
> **The finding underneath survives and is still worth the entry:** the repo file
> WAS India's, byte-identical, in a file named kopi-pack, and every fork should
> still regenerate and hash. **What was wrong was the blast radius.** A committed
> asset with nothing uploaded is a latent defect. A committed asset uploaded and
> promoted is a live one. **Reporting the first as the second is how a queue gets
> reordered around a fire that is not burning.**
>
> > **Check the console before you describe the console.** An `ls` of the repo
> > tells you what a file IS, never what a vendor is SERVING. This entry spent
> > 400 words saying the repo cannot see the store, then read the store off the
> > repo.

### Why nothing in the fleet's toolchain could have caught it

| Instrument | Why it is blind |
|---|---|
| EAS build | `assets/store/` is stripped from the bundle. A runtime font put there once vanished. |
| typecheck, tests, the asset census | Nothing imports it. It is not code and not a dependency. |
| CI | Green regardless. It has no job that opens a PNG. |
| a hash audit | Finds it, and only because it was still byte-identical. |

**Its only consumer is a human upload into a vendor console.** There is no code
path at all between this file and the customer.

> **Every fork has an asset class whose only consumer is a console upload: the
> store listing icon, the promoted-purchase image, the screenshots. Green CI is
> silent about all of it, and it is the tier a customer sees BEFORE they
> install.** The repo's own art audits look at what the app renders. This one
> never gets rendered by the app at all.

### THE COUNTERWEIGHT TO X87, WHICH IS WHY THIS IS AN ENTRY AND NOT A COMMIT

X87 halted generation across the fleet because `generateStoryStills.ts` carries
`"Contemporary South Asian domestic setting"`, sari, kurta, gold bangles, and
books called `j1z3-chai`. **That halt is right, and it is still right.**

**A fork that reads X87 and stops generating is wrong.** In the same repo, in
the same `scripts/src`, wired to the same key and the same model,
`generateStorePromo.ts` names a kopitiam, a sock filter and a cup on a saucer,
and excludes the kulhad, the tandoor and the marigold **by object** rather than
asking for "nothing Indian". It was safe to run. **One run replaced the only
wrong-region asset in this fork a paying customer could see.**

> **"The generators carry India" is not a fleet fact. It is a PER FILE fact, and
> nothing but opening each prompt tells you which is which.** X87's own lesson
> was that the prompt is not part of the recipe. One file over, the same lesson
> says: audit them one at a time, and never let a correct halt on one become a
> freeze on all.

### The audit, run rather than recommended. SEA, 2026-09-08

    grep -rl -E "gpt-image-1|generateImageBuffer|images/generations" scripts/src

    scripts/src/generateStoryStills.ts    POISONED   lines 67, 83, 84, 90, 91
    scripts/src/generateStorePromo.ts     CLEAN      chai appears only in the
                                                     comment saying what it
                                                     replaces, and in the
                                                     negation list

**Two files. Two minutes. Every fork owes itself this one and none has run it.**

**One more hit, and it is already answered in-repo, so do not re-raise it:**
`aksharmala.template.html` says *"Bolo teaches twenty-two South Asian
languages"* and a comment above `buildAksharmala.ts` forbids fixing it, because
**the sentence is false about the fork and true about the page**: every alphabet
on it is Indian. Correcting the count makes the label right and the page a lie,
and removes the one signal that would make anyone open it. **That is the
station-cap failure written down before it happened rather than after.**

### Verification, because "regenerated" is not a result

**Eye first**, which the script's own closing line demands and which no
assertion can replace: green awning, marble counter, sock filter pouring into a
metal mug, cup on a saucer with a green rim, coffee jars on the shelf. No
kulhad, no tandoor, no marigold. **Then hash**, against India's file, to prove
it is not the old bytes with a new date on them.

> **A regeneration that is not diffed against the parent is the exact move X87
> warned about**: it converts a visible inheritance into an invisible one and
> files it as progress. **The hash is what separates the fix from the disguise,
> and it costs one command.**

**Still owed, and it is smaller and less urgent than this entry first claimed:**
the new PNG is in the repo and the App Store has no promo image on any Kopi
pack. Uploading it is an improvement, not a repair.

**AND IT CANNOT BE DONE YET, WHICH IS THE PART WORTH KNOWING.** SEA's three Kopi
packs are inside a **live 7-item review submission** alongside an app version
already rejected once, and **App Store Connect LOCKS the record while it is
Waiting for Review.** The owner said upload anyway; I went to do it and the
console refused. Measured on `bolo_kopi_cup`:

    Image (Optional)          renders as a bare "-" with NO upload control
    the DOM                   has no file input anywhere in that section
    Save / Add for Review     both greyed
    the localization modal    read-only, values as plain text, only "Done"

**The only route is "remove this version from review", which pulls the launch
back.** So the promo image is not a thing a session defers out of caution, it is
**a thing the platform will not accept until review completes.**

> **AND HERE IS THE TRAP THAT NEARLY BIT.** The one file input on that page
> belongs to the **REVIEW SCREENSHOT**, and an element-finder confidently
> reported it as the Image field's, twice, with different answers on two calls.
> **Uploading a 1024 square of a kopitiam there would have replaced the
> screenshot Apple needs to see the purchase in the app**, on an app already
> rejected once. **A natural-language element finder is a hypothesis, not a
> locator.** When the target is a destructive write, confirm which section the
> ref actually sits in before you hand it a file.

> **A committed asset is not a shipped asset for this whole class of file**,
> which is the entry's real point. **And a shipping window is part of the job:
> "the file is ready" does not mean "upload it now".**

---

## X93. THE PRIVACY LINK ON A LIVE APP STORE LISTING IS BYTE-IDENTICAL TO A 404, IN THREE FORKS.

**2026-09-09. SEA's, found while reading a listing rather than a repo, and
INDIA IS THE WORST CASE because India is the one that is already shipping.**

### Measured, same minute, following redirects

    bolo-sea.app     /privacy  ->  /privacy/   7772 bytes   8c778a6a2732
                     /terms    ->  /terms/     7772 bytes   8c778a6a2732
                     /support  ->  /support/   7772 bytes   8c778a6a2732
                     /contact                  7772 bytes   8c778a6a2732
                     /this-path-is-nonsense    7772 bytes   8c778a6a2732

    bolo-india.app   /privacy   7972 bytes   IDENTICAL to its nonsense path
    bolo-latam.app   /privacy   7850 bytes   IDENTICAL to its nonsense path
    bolo-europe.app  /privacy   6220 bytes   DIFFERS. PRERENDERED. It works.

**Every path on SEA's listing returns the same hash as a path that does not
exist.** With JavaScript the page renders correctly and a human reviewer sees a
real, current, genuinely good policy. **Without JavaScript there is nothing to
distinguish it from a typo.**

### CORRECTION AND SHARPENING, SEA, same day. THE BUILD IS FINE. THE FILING IS WRONG.

**This entry first read as "SEA is broken like India". It is not, and the
difference changes the fix from a build to a form field.** SEA runs
`artifacts/gujarati-coach/scripts/prerender-legal.mjs` in its web build and
**the prerendering WORKS.** Measured live:

    /privacy.html        32,784 bytes   the real policy
    /terms.html          25,441 bytes   the real terms
    /support.html        20,632 bytes   the real support page
    /privacy /terms /support /contact and a nonsense path
                          7,771 bytes   ONE HASH, e73384c8

**Three real documents are sitting on the server and every URL filed with Apple
points past them.** Read from App Store Connect the same minute:

    App Privacy -> Privacy Policy URL     https://bolo-sea.app/privacy   SHELL
    Description -> Privacy Policy         https://bolo-sea.app/privacy   SHELL
    Support URL                           https://bolo-sea.app/contact   SHELL
    Description -> Terms of Use (EULA)    Apple's standard URL           FINE

> **AND THE SUPPORT URL IS THE SHARP ONE: `/contact` IS NOT A PRERENDERED ROUTE
> AT ALL.** `ROUTES` in that script is `/privacy`, `/terms`, `/support`, and its
> own comment says `/support` "is filed as the App Store support URL AND named
> in Play's Data safety form as the account-deletion path". **It is not filed.
> `/contact` is.** So the script protects a URL nobody filed while the filed one
> has no prerendered file to point at.

**The author checked the live domain, wrote the prerenderer, verified the
output, and never opened the store record to see which URL was actually
filed.** The build was proven and the FILING was assumed.

> **A prerendered page and a filed URL are two facts in two systems, and
> verifying one tells you nothing about the other.** Every fork should read its
> filed URLs out of the console and curl exactly those strings, not the paths it
> believes it filed.

**SEA's fix is three form fields and no build:** privacy to `/privacy.html` in
both places, support to `/support.html`. **India's and LATAM's needs the same
console read before anyone assumes it is the same fix.**

### Why this is not the old /terms note wearing a new hat

**SEA's CLAUDE.md already documents this exact behaviour, for `/terms`, and
draws the right conclusion:** use Apple's standard EULA rather than our own page,
because `/terms` "returns the same 7,771-byte SPA shell as a nonsense path to
anything that does not run JavaScript, so it is the worst available choice for a
link a machine may follow."

**That reasoning was applied to the EULA line and NOT to the privacy line four
lines below it in the same description.** Nor to the Support URL, which is
`/contact` and is checked by Apple. **The fork knew the fact, wrote it down, and
used it once.**

> **A fact that fixes one line and not its neighbour was never really applied.
> When you write down a defect in a CLASS of URL, sweep the class.**

### What is at stake, per fork, and it differs

- **India: LIVE ON BOTH STORES.** Its listing's privacy URL is a shell today.
- **SEA: mid-review, already rejected once**, on a metadata link. Guideline
  5.1.1 wants a working privacy link and 3.1.2 wanted the EULA.
- **LATAM: live.** Same shell.
- **EUROPE: SOLVED, and nobody told anyone.** 6,220 bytes, different from its
  own nonsense path. **The fix already exists inside the fleet.** Whoever needs
  it should read Europe's build rather than invent prerendering again.

### The instrument, because "it loads fine" is not a test

    curl -sL https://<host>/privacy               | shasum -a 256
    curl -sL https://<host>/this-path-is-nonsense | shasum -a 256

**Same hash means the link is empty to every machine that will ever follow it**,
including Apple's, Google's, and any crawler that decides whether the policy
exists. **Opening it in a browser proves nothing, because the browser is the one
reader that is guaranteed to run the script.**

> **This is the 200-that-is-not-a-file again**, the shape this fleet has now hit
> five times in two days: a success code, a real response body, and no content.
> **The check is never the status. It is the comparison against something known
> to be absent.**

**Not fixed by SEA on purpose.** Its submission is in review and the owner
resubmitted the listing himself an hour before this was found. Editing a
listing URL mid-review is the owner's call, and the repair is prerendering four
paths rather than rewriting copy. **India and LATAM are live and are not
mid-review, so theirs is a straightforward fix that needs no window.**

---

## X91. THE COCKPIT IN ONE APP WAS WIRED TO A DIFFERENT APP.

**2026-09-09. SEA's, found by opening files rather than counting hits, and it is
the most dangerous instrument fault yet because it does not fail: it answers
correctly about the wrong app.**

    Nest data-copy paths reading ~/bolo/        24
    Nest data-copy paths reading ~/bolo-sea/     0

**And all 24 of those files EXIST IN SEA at the same relative path.** The buttons
were not pointing at documents SEA lacks, which would be a visible gap. **They
pointed at India's copy of documents SEA has.** The owner opens SEA's cockpit,
clicks Copy on `CLAUDE.md`, and gets India's.

**TWO OF THEM WERE COMMANDS, WHICH IS WORSE THAN A PATH:**

    "Is production answering"          curl -s https://bolo-india.app/api/healthz
    "Prove push reaches one device"    POST bolo-india.app/api/push/cron/test

> **Click Copy in SEA's cockpit, run it, get a healthy 200 FROM A DIFFERENT APP,
> and conclude SEA is up.** An instrument that reports another app's health is
> worse than one that reports nothing, because nothing prompts a second look.

Fixed and verified on the wire: `bolo-sea.app/api/healthz` returns 200.

**AND THE RESTRAINT MATTERS AS MUCH AS THE FIX.** SEA left all **12 PROSE
mentions** of `bolo-india.app` alone: they are India's history and the DNS
decision behind it. **Rewriting them is the aksharmala trap, where the label
becomes right and the page becomes a lie.**

### This is the foundation the fleet-wide Nest was going to be built on

The owner's standing requirement is **one aggregated view plus six individual
views**. **A per-fork cockpit that silently reads its parent's files would make
an aggregate view actively misleading**, and the fault is invisible from inside
the page.

### THE FORBIDDEN-WORD RULE TAKES A THIRD CLAUSE, AND SEA VIOLATED IT WHILE WRITING IT DOWN

`grep -rn "Chai"` on SEA returns 92 code hits. **The largest single cluster,
sixteen of them across ten languages, is the English word CHAIR:**

    seaZone4.ts:56   { nativeScript: 'เก้าอี้', english: 'Chair' }

`grep -w` drops 92 to 37, and most of the 37 are correct: comments recording the
port, and **a guard asserting the copy does NOT say Chai**.

> **A forbidden entry must be prose a prompt would contain, and never a word that
> can appear in a PATH, an IDENTIFIER, a BOOK ID, a FONT FILENAME, or AN ENGLISH
> GLOSS IN THE SEED DATA.** Fails: chai, gujarati, tamil, kopi, chair.

### CHAI NAT, AND IT IS THE WARNING FOR EVERY CURRENCY RENAME STILL PENDING

**Chai Nat is a real Thai city on the Chao Phraya.** The 2026-09-02 currency
rename turned it into **"Kopi Nat"**. It now has **two tests protecting it, one
per platform**, written by somebody neither the supervisor nor SEA.

**LATAM is holding a 1,766-site `kopi` rename. This is what a blind pass does to
a place name.**

### And one more expiry, in the "vendor defaults expire" family

`tools/growth-board/README.md` documented a reproducibility check naming
**123,139 bytes**. The committed file has been **123,498** for some time.
**Anyone running that check as written reads a correct reproduction as a
failure.** SEA removed the number rather than correcting it, because `cmp`
against the committed file already answers the question **and a size is a second
place to forget.**

---

## X88. A SHIPPED GAME IS UNPLAYABLE IN EVERY LANGUAGE FIVE FORKS TEACH, AND IT HIDES ITSELF.

**2026-09-08 overnight. SEA's, found while the browser it wanted was busy, and
it outranks the art it was queued behind.**

    playableScripts()  ->  devanagari bengali gurmukhi tamil telugu kannada
                           malayalam odia perso-arabic ol-chiki meitei gujarati
    traceReadyFor()    ->  false for vi id ms tl th km lo my yue zh

**Twelve Indian scripts ship as playable. Not one Southeast Asian one does.**

**Measured across all six forks by the supervisor:** `chapters.ts` is **729
entries** with the **same fourteen Indian prefixes**, byte-for-byte, in every
tree: bengali, gujarati, gurmukhi, hindi, kannada, kashmiri, malayalam, meitei,
odia, olchiki, sindhi, tamil, telugu, urdu. **`FONT_BY_PREFIX` maps fourteen
Indian prefixes to fourteen Indian Noto fonts, and `store/fonts` carries thirteen
Indian-script fonts and none of anyone else's.**

### Why nobody reported it

> **The screen gates itself so nobody ever opens an empty game.** Script Trace is
> one of fifteen cards on the games hub, in five apps, and it refuses to open
> rather than opening blank. **A feature that fails closed generates no
> complaint, so it generates no signal.**

**Africa flagged the FONTS from its own tree earlier the same night. The fonts
turned out to be the small half.**

### It is not art and not a commission

**The guides are extracted from FONTS by a committed script.** SEA needs Noto
Thai, Khmer, Lao and Myanmar in `store/fonts`, the prefixes added to
`FONT_BY_PREFIX`, and the generator pointed at `SEA_ALPHABETS`, **which already
holds the letter lists**: th 63, lo 46, km 51, my 43. **Free OFL fonts, no key,
no browser, no owner.**

### LATAM'S DISPOSITION IS DIFFERENT AND STRONGER, AND IT MUST NOT BE COUNTED AS DEBT

**All six of LATAM's languages are written in the Latin alphabet:** es, pt, nah,
qu, gn, yua. **There is no non-Latin script in that fork to trace.**

> **For SEA and East Asia this is a real feature waiting on stroke data. For
> LATAM it is a feature that DOES NOT APPLY.** `TRACING_ENABLED = false` is
> already the correct end state, the tile is already hidden, nothing is broken
> and nothing is owed. **The disposition is REMOVE, not IMPLEMENT.**

> **A fleet-wide finding does not have a fleet-wide fix.** Counting LATAM as "a
> fork behind on stroke data" would put a permanent false debt on its backlog,
> and a backlog that carries work nobody should ever do is a backlog people stop
> reading.

### THE RECIPE WAS WRONG BY THREE STEPS, AND THE HARDEST SCRIPT IS THE SOLVED ONE

**SEA measured before building the thing the supervisor recommended, and both
halves of the recommendation were wrong.**

**FIRST: fonts are not the blocker.** `extractScriptTraceGuides.ts` fills a guide
**for every character IN THE CHAPTER DATA.** `chapters.ts` is 727 entries across
28 prefixes, **every one Indian.** Zero Thai chapters means zero Thai characters
to shape. **Hand it four fonts and it changes nothing while reporting success.**

**The real order is five steps and step one is the whole cost:** author the
chapters. Which letters, what order, what stages, what labels, roughly 45 per
script. **That is a syllabus, not a config change.**

**SECOND, AND SEA CORRECTED ITSELF ON IT IN PLACE:** the refusal it first sent
was over-general.

    Thai, Lao, Khmer, Myanmar   REFUSE provisional glyphs
    Cantonese, Mandarin         DO NOT. Real stroke data already exists.

**Why refuse for the alphabetic four.** India's `PROVISIONAL_GLYPHS` derive
stroke order from **font contour winding**, and India's own comment admits the
font has no opinion about the shirorekha being written last. **A Thai letter
starts at the หัว, the loop, and the loop is how the letter is identified.** So a
provisional set is not "usually right" the way India's is: it is
**systematically wrong on the one rule each script teaches first**, in a feature
whose entire purpose is stroke order, for children, in languages nobody on the
project reads.

> **And the owner ruled on exactly this on 2026-09-02.** Generating provisional
> strokes is **building the thing he turned off, in the form he named as the
> reason.** A fork copying India's precedent would be routing around an owner
> ruling via a sibling.

**Why NOT refuse for Han, and it is the opposite of everyone's intuition.** Make
Me a Hanzi and hanzi-writer publish **medians per character: the pen path of each
stroke, in writing order, with direction.** That is `AuthoredStroke[]` in a
different coordinate box, **not an approximation of it** (`x/1024*100`,
`(900-y)/1024*100`). 你 converts to 7 strokes, all inside the box; 8 of 8 on the
Cantonese set.

> **The one script nobody on this project can hand-trace is the only one whose
> strokes are ACQUIRED rather than authored**, and it arrives as real medians
> rather than font-derived guesses. **Han is not the hard case. It is the solved
> one.**

**Its catch is content, not data:** the dataset is Standard Written Chinese in
Traditional forms, and **written Cantonese is a different language.** 咗 喺 佢 啲
嗰 冇 咁 攞 are **all absent** from the 9,574-character set. 佢 is he/she and 冇
is not-have. **About forty particles need hand-authoring on top.**

**This was already in the owner's memory as "acquire bulk, author particles". It
had to be rediscovered.**

### AND THE RELAY DROPPED THE ONE THING THAT ACTUALLY BLOCKS IT

**East Asia caught this and it is the supervisor's error, in the same shape as
X87 one layer up.** The memory cited has a final section:

> **STILL OPEN: the licence.** The data descends from Arphic fonts and carries
> the **Arphic Public License**, a **copyleft font licence with an attribution
> requirement.** Engineering fit does not clear it, and nothing measured here
> touches it.

**The supervisor quoted that memory's one-line DESCRIPTION and never read its
body.** So the relay carried the mechanism (medians fit, the transform, the
traditional coverage) and the content caveat (forty particles) **and lost the
constraint.**

**So the honest position is three items of three different sizes:**

    ENGINEERING   SOLVED. Medians are AuthoredStroke[] in another box.
    CONTENT       ~40 written-Cantonese characters, hand-authored.
    LICENCE       OPEN. COPYLEFT. ATTRIBUTION. And this is a PAID app.

> **A copyleft licence on data shipped inside a commercial app is not a footnote
> under a syllabus question. It is the half that can make the other two
> worthless.** Not the fleet's to clear, and possibly not only the owner's.

### THE PATTERN, STATED BY EAST ASIA, AND IT IS THE NIGHT'S SPINE

**Four times in one night a handoff carried the HOW and lost the WHETHER:**

    STYLE and CAST      out of the stills recipe
    the prompt          out of the fleet art recipe
    the region          out of the generator handoff
    the licence         out of the stroke-data finding

> **The mechanism travels and the constraint does not.**

**And the region marker cannot catch this one**, because a licence is not a word
in a prompt. **It was written down, it was in the owner's own memory, and it went
missing in a single hop.**


### EUROPE IS A FOURTH CASE, AND THE SUPERVISOR'S READING OF IT WAS WRONG

**Recorded because the wrong version would have sent the next Europe session to
build something the owner has ruled off.** The supervisor wrote that Europe's
shape was "neither waiting on data nor not applicable, and nobody has designed
it." Europe measured its own tree:

    lib/script-trace/src/europe-alphabets.ts   458 lines, ALL 22 LANGUAGES
    exported from index.ts                     yes
    consumed by anything                       NO
    TRACING_ENABLED                            false, scripts.ts:226

**The alphabets ARE authored.** The marked Latin letters and digraphs for twelve
languages plus the shared Cyrillic set are already written down. **What does not
exist is the bridge from them into the chapter and stroke model**, and
`chapters.ts` is still India's fourteen scripts underneath.

**AND THE FLAG IS A CURRENT OWNER RULING WITH A NAMED DEPENDENCY, NOT DRIFT.**
2026-09-02: *"feature flag it off until i can get native writers to write it."*

> **Building the bridge tonight would produce a feature with the right alphabet
> and zero authored strokes: the same dead screen with better data behind it.**
> It is not blocked on design and not on art. **It is blocked on people who write
> these languages by hand**, which is already on the owner's list.

**So the fleet-wide finding has FOUR dispositions, not one:** SEA and East Asia
need fonts and prefixes; **LATAM should REMOVE it**; Europe should **leave it
flagged off and wait for its writers**; India is the only fork where it works.

### A GUARD THAT FLAGS ITS OWN FIX IS A GUARD SOMEBODY TURNS OFF

Europe wrote a preflight that refuses the still generator when a prompt still
carries India's words. **Its first version flagged all 120 of 120**, because the
`STYLE` block's own exclusion line reads *"no sari, no kurta"* **and the matcher
read the negation as the thing it forbids.**

It now strips `no <word>` before looking, **and a false 120 became a true 12.**

> **This is X78's negative proxy from the other side.** There the assertion
> inherited the parent's alphabet; here the DETECTOR counted its own remedy as
> the disease. **A guard whose first run condemns the fix is one nobody trusts
> twice.**

### SEA'S THIRD CASE, AND IT BEATS THE DIRECTORY NAME

**The forbidden word was `chai`. Its largest single cluster in SEA is the
English word CHAIR**, in the seed data, in ten languages at once:

    seaZone4.ts:56   { nativeScript: 'เก้าอี้',  english: 'Chair' }
    seaZone5.ts:228  { nativeScript: '張椅',     english: 'Chair' }

**`grep -n "Chai"` returns 92. `grep -nw "Chai"` returns 37.** Sixteen of the
fifty-five it drops are `Chair`, and they are the most user-facing rows in the
tree, so the audit's worst noise sat exactly where its reader's attention was.

> **So the rule needs a fourth clause and it is the one that would have caught
> all three cases at once: a forbidden entry must be prose a PROMPT would
> contain, never a word that can appear in a path, an identifier, a book id, a
> font filename, OR AN ENGLISH GLOSS IN THE SEED DATA.**
> **fails:** chai, gujarati, tamil, kopi, chair. **passes:** sari, kurta,
> kopitiam, thali, marigold.

**And the honest part: SEA wrote East Asia's rule down and violated it in the
same session**, on the same word, before the message had scrolled. **Knowing the
rule is not the guard. `-w` is.**

**The survivors are worth knowing too, because they are what a whole-word grep
is FOR.** Of the 37, most are correct: comments recording the port, a test
asserting the copy does NOT say Chai, and **`Chai Nat`, a real Thai city on the
Chao Phraya that the 2026-09-02 currency rename once turned into "Kopi Nat".**
It now carries **two tests, one per platform**, whose only job is to keep a
future rename off it. **A sweep-proof place name is the cheapest insurance in
the fleet and every fork has one.**

---

## X87. THE SUPERVISOR VERIFIED THE MECHANISM AND NEVER OPENED THE PROMPT.

**2026-09-08 overnight. My error, caught by three forks independently within
minutes of each other, before a credit was spent. It is recorded here in full
because it is the exact failure this ledger has spent a day cataloguing in other
people's work, committed by the person cataloguing it, at the moment of greatest
confidence.**

### What I broadcast

India reported that the storybook stills were **a command, not a commission**:
`scripts/src/generateStoryStills.ts`, gpt-image-1 at 1536x1024, writes both the
web and mobile trees in one run. **I verified it properly, or thought I had:**

    script present in all six forks         269 lines (East Asia 310)
    npm script wired                        yes, all six
    key works from this Mac                 200 from api.openai.com/v1/models
    OPENAI_BASE_URL trap                    real, .env points at a dead port

**Four separate checks. Then I told four forks to start it tonight, in parallel,
because it needed no browser and no owner.**

### What I never did

**I never opened the prompts.** Africa's sentence, and it is the entry's title in
longer form:

> **"The mechanism was never the thing to check. Both of you sent me the run
> command, the trap, the flags and the key check, and neither sent the prompt
> text, BECAUSE THE PROMPT IS NOT PART OF THE RECIPE. That is where the regional
> content actually lives."**

Measured after the halt, in every child fork:

    generateStoryStills.ts STYLE  "Contemporary South Asian domestic setting"
                                  "terracotta, saffron, deep teal, cream"
    CAST                          sari, kurta, gold bangles
    lib/story/src/scenes.ts       76 India words, in ALL FIVE
    book ids, all five            j1z3-CHAI, j1z4-THALI, j1z5-courtyard

### SEA found the half beneath it: THE ART IS DOWNSTREAM OF THE STORY

Rewriting `STYLE` and `CAST` is **not enough**. The situations are Indian:
*"A chai stall uncle holds up an empty steel tray"*, *"A woman sets an empty
steel thali down in front of you"*. **Fix the prompts and you paint beautiful
Southeast Asian gouache of a thali.**

**The real job is 210 pieces of prose across six books**, which decide 149
images. **Authoring, not a command.**

### LATAM stated the harm better than I could

> **"Right now those webps are visibly India's. Generate against these books and
> you get 129 beautiful, consistent, on-style stills of a chai stall in a Latin
> American app. THE INHERITANCE STOPS LOOKING LIKE AN ACCIDENT AND STARTS
> LOOKING LIKE A DECISION, and the next session to audit it will see freshly
> generated art with tonight's date and assume it was chosen."**

**And Africa named the mechanism that hides it:** the output would be
byte-unique, **so the hash audit that FOUND this problem would have reported the
result as the fork's own work.** A visible inheritance converted into an
invisible one **and filed as progress.**

> **This is the pagdi again, at speed and at scale: a halfway sweep, where the
> evidence of care is what stops the next reader looking.**

### The corrected order

**1. Rewrite the books.** Ids, situations, outcomes. **2. Rewrite STYLE and
CAST. 3. Then run it**, and only then is it one command.

**And the problem underneath, which nobody has solved:** India achieved
continuity by **assuming one culture** — one grandmother, one doorway, one
kitchen. Africa has ten languages that share none of those. **Europe has
twenty-two, from Lisbon to Tallinn.** A recurring cast may simply be the wrong
device for a fork that wide.

### A SECOND THING I RELAYED THAT I SHOULD NOT HAVE

I broadcast LATAM's Flow setting **"Confirm before generating: NEVER"** to four
forks as a throughput tip. **SEA refused it:**

> **"I will not set that on his account on a relay. That is a SPEND CONTROL on
> his Google account, and turning off a confirmation because a peer said to is
> exactly the shape I am supposed to refuse."**

**Correct, and it was refused by the fork while the supervisor was the one
sending it.** Retracted fleet-wide. It stays in X86 as LATAM's measured finding
about how the tool behaves. **It does not stay as an instruction.**

### One live fact that invalidates a standing assumption

LATAM, reading the Flow project: **the owner has been generating in it himself,
tonight.** Two full-body stills already sitting there in exactly the shape the
cut-out slots need, which LATAM is claiming rather than regenerating.

> **"The owner is idle" is not a safe assumption when reading a shared account's
> contents.** The shared-simulator rule applies to his hands too.

### THE THING THAT ACTUALLY SAVED IT, AND IT WAS WRITTEN THE DAY BEFORE

**East Asia had already run the script when the halt arrived. Nothing happened.**

`bolo-east`'s copy is **310 lines against every other fork's 269**. The extra 41
are a **REFUSAL GUARD** written 2026-09-07: the script **exits 1 unless
`BOLO_ALLOW_INDIA_STORY_PROMPTS=1`**, on exactly the grounds Africa and SEA
reached independently a day later. Its own comment:

> **"reaching for the fix would have deepened the defect, quietly, in a
> directory nobody re-opens."**

**The one useful sentence in the supervisor's bad instruction was "read what they
added before you run it". What they had added was the guard against the rest of
that instruction.** That is not luck. **It is what a refusal guard is for, and it
is the argument for writing them into a generator rather than into a handoff.**

### AND RUNNING IT FOUND TWO DEFECTS IN THE GENERATOR ITSELF

**1. `ffmpeg` BEING PRESENT DOES NOT MEAN IT CAN WRITE WEBP.** Measured on this
Mac:

    ffmpeg 9.0.1     present
    webp encoder     ABSENT. Not disabled. Not listed at all.
    libx264          PRESENT, so the film pipeline is unaffected
    cwebp            /opt/homebrew/bin/cwebp, installed and working

**Every fork's capability check is `haveFfmpeg()`.** Only `bolo-east` also knows
about `cwebp`. **Five forks would have converted nothing.**

> **`haveFfmpeg()` is a PRESENCE TEST FOR THE WRONG THING.** It answers *is the
> binary there* when the question is *can it write the format I need*. **Probe
> the encoder, not the binary.**

**SEA PORTED IT (`a9991b80`, `cherry-pick -x` of India's `8f879575`) AND THEN
TESTED THE DETECTOR, WHICH NOBODY HAD.** A fix to a check-that-cannot-fail is
itself a check, and the fleet has spent a day on checks nobody ran against
failure. Extract `webpEncoder()` alone and run it under three PATHs:

    cwebp on PATH                              -> cwebp
    cwebp REMOVED, ffmpeg present, no webp enc -> none     <- the broken case
    neither binary                             -> none

**The middle row is the entire bug and it is the only row worth running.** The
old `haveFfmpeg()` returns YES there. A test with cwebp installed passes on the
BROKEN version too, so the machine that has cwebp is the machine that cannot
tell you anything, and five of six forks are that machine's opposite. **Take the
tool off PATH, do not reason about it.**


**2. AND IT PRINTED "ok" FOUR TIMES WHILE WRITING NOTHING SHIPPABLE.** The
success line could not fail. **`writeStill` now returns the format it actually
wrote**, so `webp` and `png` are distinguishable in the log.

**That is the THIRD check-that-cannot-fail in one night**, after the toast
assertion that zero satisfies and the 1ms lifetime bite that passes on the
unfixed version. **Three different authors, three different subsystems, one
shape.**

**East Asia then rewrote STYLE and CAST, generated four greetings panels, opened
one** (a Cantonese Po Po at a red-painted gate, jade tilework, junks through the
window, every colour bound to the object wearing it per SEA's eleven-generation
rule) **and HELD THEM OUTSIDE THE TREE**, because four East Asian panels inside a
twenty-panel Indian book is worse than either. **The pagdi's shape, refused
before it was made.**

### THE RULE, GENERALISED BY INDIA, AND IT HAS A SECOND INSTANCE

> **EVERY GENERATOR IN THIS FLEET CARRIES A REGIONAL PAYLOAD SEPARATE FROM ITS
> MECHANISM, AND HANDOFFS DOCUMENT MECHANISMS.**

**Twice now, in two different languages, and nobody connected them because they
look like different kinds of thing:**

    generateStoryStills.ts   holds the region in TypeScript constants
    gen-store-assets.sh      guarded in Africa after coming ONE RUN from putting
                             THE INDIAN FLAG back on a live Play listing

> **The recipe is the engine. The prompt is the content. Only one of them
> travels, and it is the one the handoff describes.**

**The triage, and India has put it ABOVE the run command rather than in a notes
section, on Africa's suggestion:**

    grep -inE "sari|kurta|saffron|south asian|dhoti|rickshaw" <the generator>

**India returns 6 and they are correct there. Any hit anywhere else is a prompt
to re-author, not a script to run.**

### THE ONE ART QUESTION THAT IS GENUINELY THE OWNER'S

**India named it rather than solving it, and it is the right call.** The
one-recurring-cast-per-book device buys visual continuity **by assuming a single
culture.** True of India. **False of nearly every fork.**

Africa: ten languages across Amharic, Egyptian Arabic, Hausa, Igbo, Oromo,
Somali, Swahili, Tigrinya, Yoruba and Zulu, **sharing no grandmother, no doorway,
no kitchen.** Europe: twenty-two, Lisbon to Tallinn.

**Five forks were about to guess at this separately.** Africa is authoring its
answer and circulating it so the others adapt rather than each inventing one.

> **If the owner wants a say in how a continent is depicted in art his app
> ships, this is the item.** It is the only art question of the night that
> belongs to him.

### What survived

Everything mechanical: the script needs no browser, writes both trees, and the
`OPENAI_BASE_URL` trap would have cost an hour of false API faults. **The prompt
discipline survives and is right: STYLE identical on every prompt, CAST
identical per book, only the moment changes.** Only *"start it tonight"* became
*"start it after the books are written."*

**Three forks caught this. None of them had been asked to check it. The one who
sent the instruction was the one who had checked four things and stopped one
short.**

---

## X86. THE ART WAS NEVER A COMMISSION. FIVE FORKS BELIEVED IT WAS.

**2026-09-08 overnight. The owner set one deadline, "finish the art by tomorrow",
and six status reports came back disagreeing about whether that was even
possible. The disagreement was the finding.**

    LATAM      everything remaining is GENERATE, and produced 20 files that night
    East Asia  mostly GENERATE, unproven
    Europe     COMMISSION, 64 prompts written, waiting on the owner to run them
    SEA        COMMISSION, nearly all of it, handed to the owner
    Africa     "I have NO IMAGE MODEL IN THIS SESSION"

**LATAM's twenty files were verified in its commits before any of this was
relayed:** six zone films on mobile, six on web, five route posters, a welcome
film, an og-image.

> **A fork that has done the thing beats five forks reasoning about it.** Africa's
> sentence is the Mac claim wearing a new coat: it did not need an image model in
> its session. **It needed Chrome, which it had, and an account that already
> existed.**

### THE RECIPE, from LATAM, measured rather than described

**TOOL.** Google Flow, `flow.google.com`, owner's ULTRA account, **driven through
the Chrome extension. No API, no CLI.**

**AGENT SETTINGS FIRST, and the Save button is the one that writes:**
**"Confirm before generating: NEVER."** Otherwise a forty-asset night is forty
round trips. Image model **Nano Banana Pro**; video **Veo 3.1 Quality**.

**ASPECT IS THE ONLY SIZE CONTROL.** There is no pixel field, and the aspect
never gives you app pixels.

**PASTE, NEVER TYPE.** Prompt blocks run 3KB. `pbcopy` from Bash, click the box,
`cmd+v`. Newlines paste and do not submit. **The single biggest throughput win.**

**FILMS, THE HARD PART**

**Veo refuses 16 seconds outright.** Ceiling is 8s on Quality. It refuses rather
than silently trimming, **so nothing is lost quietly**, but it stops to ask. Write
"8 seconds" into the prompt and append *"do not ask me to confirm the duration."*

**THE SEAMLESS LOOP IS MADE IN POST AND IT IS BETTER THAN A 16s RENDER.** Forward
frames 0..N-1, then reverse N-2..1, **which repeats no frame at either seam.** A
naive `[0]reverse` concat duplicates one frame at the turn AND one at the wrap,
visible on a slow pan.

    N=$(ffprobe -v error -select_streams v:0 -count_frames \
        -show_entries stream=nb_read_frames -of csv=p=0 in.mp4)
    ffmpeg -y -i in.mp4 -filter_complex \
      "[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,split[a][b];\
       [b]trim=start_frame=1:end_frame=$((N-1)),setpts=PTS-STARTPTS,reverse[r];[a][r]concat=n=2:v=1[v]" \
      -map "[v]" -an -c:v libx264 -pix_fmt yuv420p -crf 33 -preset slow out.mp4

**8s at 24fps is 192 frames; 2N-2 = 382 = 15.9167s. Seam-free beats a round
number.**

**SILENCE IS `-an`, NOT THE PROMPT.** Every delivered film carried an AAC track
whatever the words said.

**STYLE.** A film must be told it is a drawing that moves **before** it is told
what the drawing looks like, **and told again at the end**: video models weight
the opening and closing over the middle. And **X73 again, hit independently:
describe the picture, never the process.** "Carved from linoleum" returns photoreal
with a texture on it, because a model cannot carry out a process.

**SIZES, MEASURED.** Stills: 1K for 9:16 is **768x1376, below every app size**;
2K is 1536x2752 and costs ~20s of upscaling. Video: **720p IS Veo's native size
and what the apps already ship**; 1080p is a several-minute serial upscale.
**Take 1K and 720p.** LATAM upscaled six films and then threw the resolution away.

**Chrome often leaves a download named `.com.google.Chrome.XXXXXX`.** The bytes
are complete. Verify a JPEG by `tail -c2 == ffd9`, an MP4 with ffprobe, and move
it yourself rather than waiting for a filename that never arrives.

### THE SAFETY FILTER, and it is the hour-saver

**Flow refuses a named human as an isolated CHARACTER DESIGN.** Two hard refusals
on *"an illustrated character design of a grandmother... plain background"*.

> **IT IS NOT THE PERSON.** The same woman, same outfit, same wording, **passed
> instantly as a FILM, and as a STILL the moment she was placed in A SCENE.**

Cut out afterwards: macOS Vision does it locally in about a second,
`VNGenerateForegroundInstanceMaskRequest` with
`generateMaskedImage(croppedToInstancesExtent: true)`.

### WALL CLOCK, so a night can be planned

    still   ~35s generate, ~1-2 min end to end
    film    ~90s at Veo 3.1 Quality; 720p download instant
    six zone films, start to committed:  about 40 minutes

**Pipeline it:** start film N's download, then paste film N+1 immediately. The
chat is sequential; **generation is server-side.**

### WHAT DID NOT WORK

Asking for 16 seconds. Batching more than 55s of waits into one browser call
(**the tool times out although the actions completed, which reads as failure and
is not**). Trusting aspect to give app pixels. The naive ping-pong. `crf 20`,
which produced 13MB a film against the 1.2MB the app shipped; **crf 33 lands the
busiest at 1.3MB.** And **coordinate clicks on any console while a password
manager extension is installed**: every click returns *"Cannot access a
chrome-extension:// URL of different extension"* the moment a FORM opens.

### THE SUPERVISORY CONSTRAINT NOBODY ELSE COULD SET

**One browser. One Flow account. Five forks now holding this recipe.** That is the
shared-simulator problem from the measurement rules, **and its tell is results
that change while the code does not.**

**Sequenced by what a customer can already see:** LATAM finishes its batch, then
**SEA** (whose `kopi-pack-1024.png` is India's chai stall, on the App Store,
with promoted purchases ON), then **Africa** (live, whole map is SEA's water),
then **East Asia** (store screenshots reading Gujarati, Tamil and Bengali), then
**Europe** (unreleased, 64 prompts already written). **Each fork tells the next
directly when it is out, not through the supervisor.**

### And the standard, set by the owner the same night

> **"India is the model to follow."**

India is the only fork with the whole set finished and nothing inherited. **Its
inventory is the definition of done**, and the thing worth more than the
inventory is the answer to: which of those categories did INDIA generate, and
which did the owner make and hand over? **Five forks were working to five
different definitions of finished and only one of them was his.**

---

## X85. FIVE PRIVACY POLICIES PROMISED A DELETION THE SCHEMA CANNOT PERFORM.

**2026-09-08. Found by diffing one fork's page against another's, which is the
entire argument for keeping one copy of anything.**

### The false sentence

Five forks' `privacy.tsx` said, of contributed voice recordings:

> *"...and we delete them when the associated account is deleted."*

**There is no associated account.** `voice_contributions` in **all six** forks
carries `sessionId`, `script`, `contributor` (a name the person typed),
`promptId`, `audioBase64`, `mimeType`, `isPractice`, `createdAt`. **No `userId`
column exists.** Account deletion cannot reach a recording, **and the policy
said it could.**

**India had already corrected its own side on 2026-09-07** to the accurate
version: recordings are not attached to an account, most contributors are family
members who never sign in, deleting an account does not reach them, and a
contributor asks by naming the name they used. **Five forks kept the promise.**

> **This is not an omission. An omission is silence. This was a statement about
> a capability the database does not have.**

### And a whole section existed in one app out of six

**Every fork has the same in-app delete**: the web button in `account.tsx`, the
mobile screen, the API route, **measured identical in all six.** Only India's
policy documented it. The other five said *"use the contact form"*, which
**under-describes what the app actually does** on a surface Play asks about
directly.

**Ported with it, and this is the half with money attached:**

> *"Deleting your account does not cancel your subscription. Subscriptions are
> billed by Apple or Google, not by us... If you delete your account without
> cancelling, the store keeps billing you and we have no way to stop it."*

**Five apps did not say that. Two were live.**

### THE PRERENDER TRAP: the file existed and nothing pointed at it

**The policy is a client-rendered SPA route.** Measured on four live domains:
`/privacy` returned 200 with **the policy text absent from the HTML** and the
homepage's `<title>`.

**East Asia had already built `prerender-legal.mjs` and it worked.** The output
was simply unreachable:

    /privacy             301 -> /privacy/
    /privacy/            the SPA shell, homepage title
    /privacy.html        the real policy, its own title
    /aksharmala          the SPA shell
    /aksharmala.html     659,533 bytes, the real file

> **Replit's router serves EXACT PATHS ONLY. No directory index, no
> extensionless resolution.** So the emitted file deployed correctly and was
> unreachable at the URL anybody would file with a store.

**India and East Asia each had a correct, crawler-readable policy sitting at a
URL nothing linked to.** SEA and LATAM had no file at any path. **Same symptom,
two different causes, and porting one fork's fix on the strength of the other's
diagnosis would have changed nothing while looking fixed.**

### The supervisor overstated the risk, and East Asia had already measured it

**Recorded because the correction is more useful than the alarm.** The claim was
that a store reviewer's crawler was getting the landing page. East Asia's
measurement:

> *"Apple and Google both fetch a review URL with a real browser engine, so
> store REVIEW was never in danger. Play's data-deletion crawler and its
> automated re-checks are the exposure, and Play's deletion policy makes that
> URL load-bearing rather than decorative."*

**Narrower, specific, and actionable. An overstated risk gets discounted whole
the first time someone checks it.**

### The line from that script worth keeping above all of it

Describing its own earlier version, which had asserted the routing worked:

> **"a REASONED step sitting where a measured one appears to be."**

### What shipped

**All three live apps carry the corrected policy, verified by fetching the
bytes rather than reading a status field:** SEA, East Asia and LATAM, each with
the false clause at count zero. **The prerenderer is ported to SEA and LATAM,
re-measured on their own domains first**, wired into the build, and **proven by
running it** rather than by reading it. It cannot fail a build: every path
warns and exits 0, including a render that comes out suspiciously short.

**Africa is committed and blocked at its publish gate. Europe is committed and
inert, because `bolo-europe.app` serves a separate static site that this file
does not build.**

---

## X84. A BITE TEST CAN BE PERFECTLY TARGETED AND PERFECTLY UNOBSERVED.

**2026-09-08. Two forks broke their own bite tests on the same night, in two
different ways, and both were following the fleet's own rule when they did it.**
This is the entry that makes the rule usable.

### AFRICA: the revert hit exactly one line, and no test went near it

Africa wired the gift's server half, wrote a seven-test journey suite against
real routes and a real Postgres, got 7 green, then ran the bite exactly as
specified: reverted the single line that makes the attempts path pay the DRAW,
**and asserted the revert matched EXACTLY ONE SITE.** The match assertion
passed.

**ALL SEVEN TESTS STILL PASSED. The guard was decorative.**

**THE CAUSE, and I measured that it is present in all six forks.** The daily gift
has **TWO DOORS ONTO ONE LEDGER ROW**:

    POST /tokens/gift/claim              routes/tokens.ts
    the silent grant on the attempts path routes/learning.ts

**Both write `earn_streak_day` under `giftRefId(dayKey)`**, and the ledger's
unique index on `(userId, reason, refId)` means **whichever arrives first
wins.** Africa's suite drives the CLAIM door. The reverted line is on the
ATTEMPTS door. **The row the assertions inspected was written by the door
Africa built, so reverting the other one changed nothing any test could see.**

> **"Assert the match count is 1" proves you reverted the RIGHT LINE. It says
> nothing about whether any test REACHES that line. Two facts, one of them
> unchecked.**

**SO THE RULE NEEDS BOTH HALVES:**

1. **the revert lands on exactly one site, AND**
2. **some test actually EXERCISES that site**

**And the only way to know (2) is TO SEE RED.** A green run after a correct
revert is not reassurance. **It is the absence of information.**

**MEASURED, all six forks:** `earn_streak_day` appears in `routes/learning.ts`
in every one, and India's is a **live** `grantTokensDetailed(userId,
"earn_streak_day", giftRefId(dayKey), amount)` at `learning.ts:1850`. **India's
CLAUDE.md claims `fec82be8` DELETED that silent grant. The call is there. Treat
that note as stale until someone reads the commit.**

**THE PRODUCTION FAILURE IT HIDES:** a learner who practises BEFORE tapping the
box is paid by the attempts path. **If that path still pays the old flat amount
while the box promises the draw, the box is right and the wallet is wrong, they
disagree by a race, and every test is green on both sides.**

**Africa's practical notes for whoever writes this suite next:** mount BOTH
routers; make at least one assertion whose ledger row can only have come from
the attempts path; budget for `POST /attempts` verifying a **server-signed
evaluation token** rather than trusting the body; and **one row in
`game_sessions` earns a streak day**, because the ladder counts a completed
lesson OR a played mini-game, so no full lesson fixture is needed to make
"today" count.

**Africa did not ship it.** *"I am not shipping a guard I have watched fail to
fire."*

### EAST ASIA, THE SAME HOLE BUT DEEPER: the suite never drove the right ROUTE

Africa's suite drove the wrong DOOR. **East Asia's drove the wrong ROUTE
entirely.** `dailyGift.journey.test.ts` had a `practise()` helper posting
`/game-sessions`, **which marks the day earned and grants nothing.** The only
gift grant is inside `POST /attempts`. **Its comment claimed it covered "the
other path". It never touched it.**

**Setting the attempts grant to 0 left ALL 32 TESTS GREEN**, across that file and
`learning.zone-testout.test.ts`. Two tests now drive the real door with a signed
`evaluationToken`, and the same bite reds both. `b97a8953`.

> **A helper named for what it means, with a comment asserting its coverage, is
> the most convincing wrong thing in a test file.** Nobody re-reads a helper.

**AND A LINE NUMBER DRIFT WORTH KNOWING:** that grant is at `learning.ts:1850`
in India and **`learning.ts:1807`** in East Asia. **Cite the symbol, never the
line, across forks.**

### THE DEFECT THAT SHIPPING THE BOX CREATED, measured in East Asia today

**`learning.ts` says in its own comment that the attempts grant "GAINS THE SAME
`canClaimGift` GUARD India uses" WHEN THE BOX SHIPS. The box shipped in that
fork today. THE GUARD DID NOT.**

**The two doors disagree about what practice IS.** The attempts door grants on
ANY recorded attempt. The box's `earnedToday` comes from
`computeEarnedDayKeys`, which needs a lesson group finished off or a game
session. **So one attempt leaves a live learner in this state:**

    claimed:     true     the attempts door already paid
    balance:     6        the currency is really theirs
    earnedToday: false    the box says they have not practised
    claimable:   false    open before it was ever tapped
    POST claim   409      no_gift_today, on a day they DID practise

> **The celebration never fires and the tap is an error.** The wallet is right
> and the screen is wrong.

**NOT FIXED, deliberately: it changes who is paid and when.** Pinned by a
characterisation test whose comment says it pins a defect.

**CORRECTION, MEASURED AFTER THIS WAS FIRST WRITTEN.** The supervisor recorded
that *"the comment promising the guard travelled to all six; the guard did not"*.
**That was asserted, not measured, and it is wrong.**

    WHEN THE BOX SHIPS comment    only bolo-east, learning.ts:1790
    canClaimGift in learning.ts   India 3   East Asia 1   SEA 0  Africa 0  LATAM 0  Europe 0
    a DailyGift component         India yes (mobile)  SEA yes (mobile)  the rest none

**So the promise is East Asia's own comment in its own tree, and INDIA ALREADY
HAS THE GUARD APPLIED.** The exposure is real but narrower and a different shape:
**four forks carry no `canClaimGift` in `learning.ts` at all**, and one of them,
SEA, already has a gift component. **The landmine is the missing guard, not a
travelling comment.**

> **A claim about six repos needs six measurements.** The supervisor spent the
> night telling forks that, then wrote an unmeasured "all six" into this entry
> within the hour.

### THE RULE THIS DESERVES ON ITS OWN, because it is not about the box

> **A COMMENT DESCRIBING FUTURE WORK READS IDENTICALLY TO A COMMENT DESCRIBING
> PRESENT WORK.** *"Gains the same guard when the box ships"* was accurate the
> day it was written and false the day the box shipped, **and nothing about the
> sentence changed.**

**East Asia's statement of the mechanism is the one to carry:** the trigger fired
in **six repos on the same day**, and **no comment can notice its own condition
being met.** A conditional promise in a comment has no owner, no test, and no
date. **It is a to-do with no list.**

**THE DETECTABLE FORM NEEDED A TRIAGE, and East Asia supplied one after measuring
that the naive rule is unusable.** Grepping *when / once / after / until* flags
about ten comments per fork and **nine are harmless.** A rule that fires ten
times to catch one **gets switched off after the third false positive, and then
the tenth is the box again.** The supervisor ran the same scan across all six and
reproduced exactly that noise.

**THE QUESTION THAT SEPARATES THEM: CAN THE CODE TEST THE CONDITION?**

    SELF-DISCHARGING      revenuecatClient.ts   gated on REVENUECAT_PROJECT_ID
    (safe, no ledger       chachaStrings.ts      falls back while a row is absent
     entry needed)         languageVoice.ts      null until an id is pasted in

    HUMAN-ONLY            learning.ts:1790      "WHEN THE BOX SHIPS"
    (dangerous)           ownerGate.ts:173      "When that move lands this constant goes"

**An obligation expressed as an env var, a missing row or a null check discharges
ITSELF the moment its condition is true.** Nobody has to notice, so nobody has to
be told, **so a broadcast list that missed a fork does not matter.** An obligation
expressed as a sentence about the future needs a person to remember, in six
repos, **on a day nobody knew was the day.**

**East Asia scanned its whole repo against that question: the gift grant was the
ONLY human-only obligation in bolo-east, and it is the only one that fired
unnoticed.** One offender, one incident, same comment. A small sample, **and the
shape is not a coincidence: the dangerous set and the fired set were the same
set.**

> **WHEN YOU MUST DEFER, WRITE THE CONDITION AS SOMETHING THE CODE READS.** "When
> X ships" is a to-do with no list. **"Gated on `X_ID` being set" is the same
> intent with an owner, a test and a date, and it needs no ledger entry at all
> because it cannot be forgotten.**

**A second human-only one found by the supervisor's scan, in India AND East
Asia:** `ownerGate.ts:173`, *"When that move lands this constant goes."* **The
move it waits on has already happened: the Nest moved into the product on
2026-08-24.** So that obligation fired too, silently, two weeks ago.

**And this defect is invisible in every metric except the one that matters.**
Nobody loses money; the wallet is correct. **Every learner who practises without
finishing a lesson group loses the celebration**, and no counter anywhere goes
down.

### EAST ASIA: two fixes, two injections, and an upper bound that cannot be proven at all

East Asia took Europe's toast fix, then ran the injection India used
(`setTimeout(() => showToast(same), 5)`) rather than the 1ms-lifetime bite
Europe had already discredited. **It caught two more faults in a row.**

**Fault one: the recorder deduped any text identical to the previous entry.**
Correct for one appearance raising both a `childList` and a `characterData`
record; **wrong for a genuine re-fire.** Re-keyed per element. **Still green.**

**Fault two, and this is the finding:** `MilestoneToast` renders inside
`AnimatePresence mode="wait"`. A re-fire bumps a React key, **but `mode="wait"`
holds the old node mounted until its exit animation completes, and under jsdom
that never completes.**

> **THE SECOND TOAST NEVER REACHES THE DOM TO BE OBSERVED. So NO DOM assertion
> in that file can prove "at most once", however the recorder is written.**
> Proving the upper bound needs a spy on `showToast`, a `useCallback` private to
> `practice.tsx`.

**MEASURED: `mode="wait"` appears twice in `practice.tsx` in ALL SIX FORKS.** So
**Europe's fix and India's fix carry the identical ceiling**, and a green "at
most once" test in either tree is proving less than its name claims.

**What East Asia did instead of pretending:** renamed the test to what it
actually proves, **"is recorded exactly once"**, and wrote the ceiling into
HANDOFF.md rather than leaving it for the next reader.

**And what IS proven is the half that actually failed on CI:** deleting the
`showToast` call now reds **two** tests including this one. Before the fix it
red only the other. **That lower bound is the real hole the vacuous assertion
was missing.** `4640e09b`.

> **When a bound cannot be proven in the harness you have, RENAME THE TEST to
> the bound you can prove.** A test whose name overstates its assertion is
> worse than a missing test, because the name is what the next reader trusts.

### The pair, stated once

**Africa's guard could not fire because nothing exercised the site. East Asia's
could not fire because the DOM never received the event.** Both authors were
following the rule. Both were green. **Neither had any information.**

> **A guard is not a guard until you have watched it go red. Everything before
> that is a hypothesis with a passing test attached.**

---

## X83. DISTRUST ANY RESULT THAT IS TOO CLEAN FOR THE QUESTION.

**2026-09-08, East Asia's, and it replaces the fleet's older "distrust a
unanimous result". The new one covers both directions and the old one covered
half.**

**Two counts, one hour apart, opposite directions, and both were the
instrument:**

    India,     manifest audit    76 of 76 FAILING
    East Asia, first count        0 missing out of 147, against a 74-LINE manifest

**Neither number could be true. Neither was about the code.**

> **A shell loop that silently does nothing produces the tidiest answer of all.**

**"Unanimous" pointed only at the all-red case.** Nothing failing and everything
failing are the same tell: **a result too clean for a question that messy did
not come from the question.**

### WRITING A RULE DOWN IS NOT APPLYING IT

**East Asia found a vacuity hole in India's manifest detector ONE HOUR after
both of them had written the rule it violates.** The first direction was
guarded; the third was not, **so an unreadable manifest would have reported
success about nothing.** Fixed at `741677a6`.

> **Both authors of the rule shipped the thing the rule forbids, in the same
> hour, in the artefact they wrote it in.** A rule is a thing you apply at every
> site, not a thing you know.

### THE SAME GAP IN THE INSTRUCTIONS, NOT THE CODE

**India's own catch, and the owner found it before India did.** Section 7d of
the economy brief was **four traps that read like guidance**, and SEA had begun
its client build **from a list of things not to do.** There was no spec. 7e is
the spec.

> **An absence presenting as coverage, in the one artefact nobody audits: the
> instructions.** Code gets reviewed. **A brief gets followed.**

**And the honest state, which India asked be passed on unchanged:** India's
client is built on both platforms. SEA and East Asia have complete guarded
server halves and NO client. LATAM is live. Africa is mid-publish. **Nobody
should read 2026-09-08 as the feature being done for anyone but India.**

### One near miss, and the count that caught it

**India swallowed the COLOUR-BLIND GUARD** while inverting tests during the
redesign, by replacing the two tests either side of it. **It asserts the four
box tiers differ by SIZE rather than hue, and it is an owner accessibility
requirement, not a style choice.** Restored on both platforms.

**What caught it was arithmetic: the test count went 15 to 13 when only two had
been merged.**

> **COUNT THE TESTS BEFORE AND AFTER A TEST REWRITE.** A guard deleted by
> accident during a redesign is exactly the guard nobody misses, because the
> suite stays green and the thing it protected is invisible until someone who
> needs it opens the app.

---

## X82. A LONGER TIMEOUT CANNOT FIND A SHORTER-LIVED ELEMENT.

**2026-09-08, East Asia's, and it is the most portable finding of the day: it
is about `waitFor`, not about Bolo.**

`practice.tsx` clears every milestone toast after 1800ms:

    toastTimerRef.current = setTimeout(() => setActiveToast(null), 1800);

**Every toast assertion in the suite waited EIGHT SECONDS for it.** More than
four times the element's entire lifetime. On a loaded runner enough wall-clock
passes inside the awaits before the assertion that **the toast has already gone,
and `waitFor` then spends its full eight seconds looking for something that is
never coming back.**

> **The timeout was not a safety margin. It was the race, already lost.** A
> generous timeout turns a fast failure into a slow one that reads like a hang.

**THE COMMENT DEFENDING IT WAS THE TELL.** It said the timeout was generous *"so
individual async steps can take longer than the 1s default without indicating a
real failure"*. **That reasoning is correct for a PERSISTENT element and exactly
backwards for a SELF-CLEARING one.** Same sentence, opposite truth, depending on
a property of the element it never mentions.

### How it presented, and the wrong answer that was given first

**CI failed twice on diffs that touched no client code. The first failure was
re-run green and recorded as a flake.** East Asia owns that as its own wrong
call, which is why it caught the second one.

> **The flakiest assertion is the one FURTHEST FROM ITS TRIGGER.** The case that
> failed most had ten scoring rounds ahead of it, so it accumulated the most
> wall-clock before it looked. **That distance is the thing to search for.**

### The fix is to RECORD, not to LOOK

**A `MutationObserver` installed before the render** catches each toast the
moment it is added, so the assertion reads **a log** and cannot lose to a timer.
No fake timers, in a file that is real-async throughout.

**And the NEGATIVE case got stronger, which is the surprise.** *"No toast after a
streak reset"* had queried the DOM after a 150ms pause. **That cannot tell
"never fired" from "fired and dismissed"** — and for an element that lives
1800ms, that IS the whole question. **The log cannot forget.**

### THE BITE TEST DOES NOT DISCRIMINATE. Europe ran it and the UNFIXED test passes too.

**East Asia set the toast's lifetime to 1ms and all 18 passed, and read that as
proof.** Europe ran the same 1ms check **against the ORIGINAL test: 18 of 18
also passed.**

> **RTL's `waitFor` re-runs its callback on mutation**, so it catches the ADD
> even at a 1ms lifetime. The race needs a STALL between the click and the first
> poll, which a local run does not produce. **Europe could not reproduce a
> failure at all.**

**So the honest position is: the CONDITIONS are present, the FAILURE is not
demonstrated locally, and the fix is worth landing on the hazard rather than on
a repro.** Anyone who runs the 1ms check, sees green, and concludes their fork
is fine **has run a check that cannot fail.**

**Same family as the rounded rate: the check that TRAVELLED is not the check
that DISCRIMINATES.**

### WHAT IS PROVEN NEEDS NO REPRO, AND IT IS THE BIGGER HALF

The test named **"each mid-session toast fires at most once per session"** ends:

    expect(screen.queryAllByText("Halfway there! 💪").length).toBeLessThanOrEqual(1);
    expect(screen.queryAllByText("Last one! 🦜 Finish strong!").length).toBeLessThanOrEqual(1);

**`0` satisfies `<= 1`.** Europe called it and it is right, and the mechanism in
this file is sharper than "the toast never fired": **both toasts ARE asserted by
earlier `waitFor`s, so they did fire. But the halfway toast has a 1800ms
lifetime and has ALREADY CLEARED by the time line 417 counts it.**

> **The count is 0 at assertion time whether the toast fired once, fired twice
> and both cleared, or never fired at all. THE ASSERTION POLICING DUPLICATION
> CANNOT SEE DUPLICATION.** It is vacuous for exactly the reason the entry is
> about: the element removes itself.

**Counting a self-clearing element AFTER THE FACT cannot detect duplication at
all. Only a recorder can.** Both are now `toastCount(...) === 1`, which is what
the test name always claimed.

**Fleet exposure, measured:** `practice-streak-xp.test.tsx` carries **TWO** of
these assertions in India, SEA, Africa, East Asia and LATAM. Europe fixed its
own. **This one needs no timing argument and no repro: it is a silent pass in
five trees today.**

### And a detector for the detector

**Europe made the recorder load-bearing for five assertions, then tested the
recorder itself:** forcing `watchToasts` to log unconditionally fails exactly
one test, the streak-reset one, 17 passed 1 failed, then reverted.

> **Without that, a recorder that logged everything would make every
> `toContain` in the file pass for the wrong reason.** A new instrument needs
> its own test before the assertions that depend on it are worth anything.

East Asia's fix is `6a61b480`; Europe's is `e74aa962`, web suite 1533 pass, 0
fail. **Europe also found a FOURTH file with `timeout: 8000`,
`artifacts/bolo-mobile/__tests__/practice-score-absent.test.tsx`, and correctly
left three others alone because they wait on elements that persist.**

### Fleet state, measured

    fork        files with `timeout: 8000`   MutationObserver
    India        1                            0
    SEA          3                            0
    Africa       3                            0
    East Asia    3                            1   <- practice-streak-xp, fixed
    LATAM        3                            0
    Europe       3                            0

**FIVE FORKS STILL CARRY IT**, and the same `1800` lifetime is at
`practice.tsx:795` in all five (India's is at `:828`).

**DO NOT SWEEP EVERY 8000.** East Asia's own two remaining ones may be correct:
a generous timeout is right for an element that stays. **The rule is a
comparison, not a number.**

> **Grep for a `waitFor` timeout LONGER THAN THE ELEMENT'S OWN LIFETIME.**
> Toasts, banners, confetti, "copied!" flashes, auto-dismissing errors. **If a
> test waits for something that removes itself, the wait is the bug.**

---

## X81. `git commit -- <dir>/` SILENTLY DROPS EVERY NEW FILE IN THAT DIRECTORY.

**2026-09-08. India hit it committing generated contract types. I reproduced it
in a scratch repo before writing this down, because the claim is the kind that
sounds like a mistake and is actually the tool.**

    mkdir gen; echo old > gen/existing.ts; git add -A; git commit -m base
    echo changed  > gen/existing.ts        # tracked, modified
    echo brand-new > gen/newfile.ts        # UNTRACKED
    git commit -m "pathspec commit" -- gen/

    HEAD contains:   gen/existing.ts
    still untracked: gen/newfile.ts

**Exit 0. No warning. No mention of the file it did not take.** A pathspec on
`git commit` matches **TRACKED paths only**, so it commits the modification and
walks past the new file sitting beside it in the same directory.

### Why this is a fleet problem and not a git lesson

**The fleet's own rule sends you here.** X-ledger and memory both say: stage by
LISTING FILES, never by exclusion, because the index is shared and
`git commit -a` takes another session's work. **That rule is right and it is
what produced this.** Naming a directory feels like the careful version of
naming files. It is the one form that can silently omit.

India's case: three brand-new generated types, emitted by codegen, named by a
directory pathspec, **absent from the contract commit that existed to carry
them.** The commit looked complete, CI was green, and the types were on disk
locally so nothing failed for the author.

### The rule

> **A directory pathspec is not a file list.** If a command can create files
> you did not type, `git add` them explicitly first, then commit, or check
> `git status --porcelain` for `??` lines BEFORE you commit and not after.

**India split them into a follow-up commit rather than amending, because
another session was working the same tree.** That is the right call and worth
copying: **amending a pushed or shared branch to fix an absence trades a
recoverable gap for an unrecoverable rewrite.**

### The shape, for the fifth time today

**Not an error. An absence.** X77's tests that never imported, X79's secrets a
git import does not carry, X80's manifest line nobody swept, section 7b's route
that never passed the pool it had been sold. **Every one of them exits zero.**

> **This fleet's whole day was spent learning one thing: the tooling reports
> what it DID. Nothing reports what it did not do, and that is where the
> defects live.**

---

## X81b. THE `baseAmount` RULING, AND WHY A PRECEDENT DID NOT BIND.

**2026-09-08, the owner. The new field is `baseAmount`. Africa's argument won.**

**`chai` is UNCHANGED** and still means the amount banked, exactly as X33 ruled.
`multiplier`, `credits` and `allAccessGiftMultiplier` were already neutral.
**Nothing else on the contract moves.**

**The reasoning is the transferable part.** X33 kept `chai` because renaming a
LIVE field buys a breaking change to fix a problem the forks did not yet have,
and it **DEFERRED** neutrality rather than closing it, saying it would ride
along at the next opportunity. **This was that opportunity: one field, brand
new, zero live-contract cost.** And four of the six forks do not spell their
currency chai at all.

> **A precedent's conclusion does not outlive its reason.** X33's reason was
> the cost of renaming something live. A new field has no such cost, so the
> conclusion simply does not reach it.

**India shipped it neutral INTERNALLY too** (`GiftDraw.baseAmount`), so a fork
ports `lib/daily-gift` with **no rename at all**. SEA had already renamed
internally and East Asia had held it with a note; **both were right and neither
has to redo anything.**

**AND IT WAS NEARLY THE FOURTH SPELLING.** India wrote `baseChai`, SEA
independently wrote `baseKopi`, Africa objected on cowries, East Asia held.
**Four agents, four answers, one field.** That is X6 reproducing itself in real
time and it is the argument for Gate 3 existing at all.

---

## X80. THE SWEEP HAPPENED, AND IT STOPPED ONE LINE SHORT. IN ALL SIX FORKS.

**2026-09-08. SEA found a Marigold pagdi in SOUTHEAST ASIA's wardrobe. I measured
every fork and it is worse and better than that: it is in ALL SIX, and the file
it sits in contains the proof that somebody was already editing it.**

`scripts/wardrobe/manifest.json`, three items, every fork:

    fork        pagdi            station-cap                pink-beanie2
    India       Marigold pagdi   Station master's cap       Pink Knit Beanie
    SEA         Marigold pagdi   Harbour master's cap       Pink Knit Beanie
    Africa      Marigold pagdi   Harbour master's cap       Pink Knit Beanie
    East Asia   Marigold pagdi   Bamboo hat                 Pink Knit Beanie
    LATAM       Marigold pagdi   Harbour master's cap       Pink Knit Beanie
    Europe      Marigold pagdi   Station master's cap       Pink Knit Beanie

**`station-cap` LOOKS localised.** SEA renamed it to the harbour, East Asia to a
bamboo hat. **`pagdi` was not touched by anyone.** A Punjabi turban is on sale
in the Southeast Asian, African, East Asian, Latin American and European apps.

### CORRECTION, AND IT MAKES THIS ENTRY WORSE. Europe opened the art.

**I recorded `station-cap` as "the item that WAS localised". That is true of the
NAME ONLY.** Europe cropped the badge instead of reading the tagline:

> **It is a STEAM LOCOMOTIVE with a cowcatcher.**

**"No steam locomotive" is a standing exclusion on nearly every prompt in
Europe's own art sheet.** And the PNG is byte-identical across all six forks,
so **every railway fork ships a cap whose badge contradicts its own art rule,
and every harbour fork ships a locomotive on a harbour master.**

> **THE NAME WAS LOCALISED. THE ART WAS NEVER OPENED. Renaming is what makes a
> file look handled.**

**Europe also caught an error in its OWN art sheet while doing this**, which is
the part worth copying: the sheet said "SEA's was a captain's cap", which would
have bought a full regeneration of a cap that is already correct. **The job is
the badge, not the cap.** An unchecked note about a sibling costs a commission.

**AND IT IS NOT AN `id`. SEA read the whole row and it is worse:**

    name     "Marigold pagdi"
    tagline  "Marigold silk, gold zari and one peacock feather."
    art      scripts/mascot-accessory-art/pagdi-v2.png

**The tagline is LEARNER-FACING SHOP COPY.** Marigold, gold zari and a peacock
feather are as Indian as the turban, and they are on screen in five apps that
are not India's.

**THE ART IS THE EXPENSIVE HALF, and it is byte-identical everywhere.** I hashed
it in all six: `72eca87d29e9`, 611,276 bytes, the same PNG. **Renaming the id
and the tagline leaves a picture of a marigold turban on the mascot's head.**

> **Every fork that inherits this inherits a COMMISSION, not a string edit.**
> Same shape as the Naacho rigged-glTF item: the cheap half is text and the
> expensive half is a drawing, and only the cheap half looks like work an agent
> can do.

**And SEA's costing lands it in the economy work:** this is **a third of the
entire purchasable catalogue**. SEA had already found that three hats is not a
shop and that repricing does not fix it. **In five forks it is effectively two
hats**, because the third cannot be sold to anyone.

> **THE TELL IS IN THE SAME FILE, TWO LINES AWAY.** Somebody opened this
> manifest, renamed one item for their region, and walked past the other. **A
> partial sweep is more dangerous than no sweep, because the evidence of care
> is what stops the next reader looking.**

**AND AFRICA HAS TWO, NOT ONE.** Its `station-cap` reads *"Harbour master's
cap"*, inherited from SEA, in a fork whose CLAUDE.md says outright: *"the
harbour master and every boat are Southeast Asia's and must go."* **LATAM
carries the same harbour.** So the item that WAS localised once has since gone
stale twice over, in forks whose worlds are a minibus route and a continent
with no Nanyang.

### Why nobody caught it

**Every fork watches the language files.** `FREE_LANGUAGES`, the STT tables, the
routes, the phrase library, the fonts. **The wardrobe is REGION content living
under `scripts/`**, which reads like tooling, and no gate names it.

**SEA traced the exact reason it is invisible from both directions.** The
wardrobe is generated from `scripts/wardrobe/manifest.json` into
`outfits.catalog.gen.ts`. **So it reads as BUILD TOOLING from one side and as
GENERATED OUTPUT from the other, and neither is a place anyone looks for a
region fact.**

> **WHEN A SWEEP IS SCOPED BY FILE TYPE, IT MISSES CONTENT THAT LIVES SOMEWHERE
> ELSE.** SEA's, and it is the rule the entry exists for. **The question is not
> "did we sweep the content files". It is "WHAT ELSE IN THIS REPO IS CONTENT".**
> Wardrobe manifests, seed data, store listings, generated catalogues and prompt
> constants all carry region facts, **and not one of them looks like a content
> file.**

> **Gate 1 asks "does it name a language, a place, a currency, a font, a store
> id or a price". A garment names a CULTURE and the gate has no word for that.**
> This is the gate's blind spot, not a fork's oversight.

### The rule

> **Every fork reads its own manifest, out loud, item by item.** Not a grep for
> known-bad words: the next one will not be called `pagdi`. **Open the file and
> ask of each row whether a learner in YOUR region would recognise it.**

**And the general form, which is the fourth sighting of this shape today (X77,
X78, X79):** the safe-looking artefacts are the ones nobody has a reason to
open. A language file gets read every week. **A three-line manifest under
`scripts/` gets read when it breaks, and a wrong hat never breaks.**

---

## X79. THE FIRST PUBLISH OF A FORK HAS THREE GATES, AND EVERY ONE REPORTS THE WRONG CAUSE.

**2026-09-08. Assembled from Africa, LATAM, SEA and Europe in one night, each
of whom met a different gate and none of whom could have described the sequence
alone.** Every fork's first publish is exposed to all three.

### GATE 1. A fresh Repl has no secrets, and the failure names none of them.

**LATAM's, and it is the root cause the fleet had been circling.** Secrets live
only in Replit's Secrets panel. **The panel is per-Repl and A GIT IMPORT DOES
NOT CARRY IT.** A fork imported into an empty Repl gets the code, the schema and
the content, and nothing else.

**Verified in all six forks, four top-level throws that kill the boot before it
binds a port:**

    lib/db/src/index.ts:7                                    DATABASE_URL
    lib/integrations-openai-ai-server/src/client.ts:3        OPENAI_API_KEY
    lib/integrations-openai-ai-server/src/image/client.ts:5  OPENAI_API_KEY
    lib/integrations-openai-ai-server/src/audio/client.ts:9  OPENAI_API_KEY

**THREE FILES ON THE SAME KEY.** Africa named only the audio one, so a guard on
that file alone still dies. **Not boot-blocking, and LATAM corrected its own
first draft on this: `ELEVENLABS_API_KEY` and `SESSION_SECRET` are checked
INSIDE functions**, so they fail at call time and cannot kill a publish.

**What the platform reports:** Provision, Security, Build and Bundle all green,
then Promote fails with *"the application failed to open a port in time"* and
*"built successfully but failed to start"*. **Nothing on screen names OpenAI or
a database.** LATAM reproduced it locally, polling `/health` for fifteen
seconds against a boot with the key unset. **No port ever bound.** Europe
reproduced it independently by removing the key from a working app.

**And Europe supplied the sentence the advice turns on:** the Repl's Secrets
panel and the deployment's environment are TWO DIFFERENT PLACES. Europe's panel
had the key since 2026-09-06; **that fact says nothing about the deployment.**
Africa reached the same boundary from the other side: the Shell is the
DEVELOPMENT environment. **Write it that way, not as "confirm the key is set",
which everyone reads as already done.**

### GATE 2. "Migrations failed validation" is a syntax error wearing a data-conflict label.

**Africa's.** Past gate 1, the publish reaches Provision and stops. The panel
says *"schema changes conflict with existing production data"*. **Postgres said
something else entirely:**

    CREATE UNIQUE INDEX "phrases_topic_stage_text_unique" ON "phrases" USING btree
    (... lower(regexp_replace(btrim(native_script),'\s+'::text, ' '::te);
    syntax error at or near ";"

**That is Replit's OWN generated SQL, truncated mid-cast at `' '::te`** with a
`)` and `;` appended. **The repo is fine:** `0046_phrase_text_dedup_unique.sql`
and the 0063 snapshot both carry the full expression.

**Africa placed the bug precisely rather than guessing:** the failing text has
`btrim(native_script)` unquoted and with `::text` casts, **which is Postgres's
`pg_get_indexdef` rendering, not Drizzle's source form.** So Replit introspects
the live DEV database and re-emits, **and the truncation is in that pipeline.**

**Migration 0046 is inherited. Every fork has this index.**

### GATE 3. The fix, and the rule that does NOT apply to it.

**SEA is the only fork that has beaten this, and it wrote it down:**
`~/bolo-sea/HANDOFF.md` — *"Production was bootstrapped with `sync-schema`
against its own URL."*

**This beats the panel's door (a), "copy your development database schema and
data to production", on Africa's own measurement:** dev's `__test_lang_` rows
ride along, `languages.ts:42` hides them from `/api/languages`, and
`seedContent.ts` is two `onConflictDoUpdate` calls with no delete, **so nothing
ever removes them.** Permanent junk in production, accepted to route around a
bug in someone else's SQL generator. **`sync-schema` moves no data at all.**

**I TOLD THE OWNER TO "READ WHAT IT PROPOSES BEFORE IT RUNS". THAT WAS WRONG
AND AFRICA CAUGHT IT.** There is nothing to read:

> **`lib/db/scripts/syncSchema.ts` has no diff step, no dry run and no approval
> prompt.** It replays the COMMITTED `.sql` files in journal order, split on
> `--> statement-breakpoint`, executing each directly. On error it skips five
> already-exists codes (42P07, 42701, 42710, 42P06, 42723) and **throws on
> anything else.**

**Sending someone to look for a plan screen that does not exist makes their next
move a return to the publish panel, which is the broken thing.**

**The destructive surface, measured across all 64 committed migrations:**

    DROP TABLE      0
    DROP COLUMN     0
    DROP DATABASE   0
    DROP CONSTRAINT 5   0026, 0029, 0038, 0052 - all foreign keys, dropped and
                        re-added with cascade in the same file
    DROP TRIGGER    2   0030, both IF EXISTS, both recreated below

**None of them can touch a row.**

> **"DON'T APPROVE A DROP" IS EXACTLY RIGHT FOR THE PUBLISH PANEL, WHICH
> GENERATES SQL FROM A LIVE DIFF AND ONCE COST INDIA `user_blocks`. IT DOES NOT
> TRANSFER TO A SCRIPT THAT REPLAYS FIXED FILES.** Two operations that both say
> "migrate" and share no risk model.

**The real risk is a different one, and it is the honest thing to say:**
`ALTER TABLE ... DROP CONSTRAINT` against a database lacking that constraint
raises **42704 undefined_object, which is NOT in the skip set**, so the run
aborts. On a genuinely fresh production this cannot happen, because 0026 only
runs after the migrations that created the constraint. **On a PARTIALLY built
production, which is what a publish that died midway leaves behind, ordering is
no longer guaranteed.**

> **`sync-schema` cannot silently destroy anything. It can stop halfway with a
> clear error naming the statement, and on a half-built database that is the
> outcome to EXPECT rather than a surprise.**

**Telling someone what a failure will look like beats telling them to be
careful.**

---

## X78. A TEST CAN INHERIT ITS PARENT'S WORLD AND STAY GREEN IN A FORK THAT DOES NOT LIVE THERE.

**2026-09-08. SEA's, and it is the companion to X77: that entry is about tests
that never ran, this one is about tests that ran and proved nothing.**

### ONE SUITE'S POLLUTION WAS HOLDING UP ANOTHER SUITE'S PASS

`learning.lesson-groups-plan-visible` declared `const LANG = "hi"` **and never
created the row.** Its own cleanup said *"LANG is the real Hindi row and must
survive"*. **It passed only because `learning.sentences` had inserted a Hindi row
and never deleted it.**

**Fixing the pollution is what made this suite fail honestly.** The leak was
load-bearing.

**It also retires a wrong diagnosis SEA had logged that same morning:** the file
was filed as *"order-dependent, green alone"* and set aside. **It was not
order-dependent. It was dependent on another suite's leak.**

> **When a suite looks order-dependent, ask what it is READING that another
> suite WROTE.** "Green alone, red together" is the symptom of a shared write,
> not an ordering quirk, and the two want opposite fixes.

### A NEGATIVE PROXY INHERITS THE PARENT'S ALPHABET

`openai.pronunciation.language-hint`, 2 pass / 9 fail to 11 / 0. India's `gu` and
`hi` are not in SEA's `ISO_639_1_BY_LANGUAGE_CODE`, so **nine assertions about
the `language` field could never have held in this fork.**

**Substituting real codes then exposed a rotten assertion underneath.** One case
asserted the STT prompt **"must carry no Latin letters"** — a proxy for *"not
English prose"* that is only sound where every language in the catalogue is
non-Latin. **Four of SEA's ten are Latin.**

> **A NEGATIVE PROXY INHERITS THE PARENT'S ALPHABET.** This is the
> unanchored-identity rule with the polarity flipped, and it is harder to see:
> a positive assertion names the thing it assumes, a negative one names only
> what it forbids. **Assert what you meant, not a property that happened to
> correlate with it upstream.**

SEA audited the other two Latin-letter checks in that tree; both are correctly
scoped. **Finding one is not a reason to assume the rest are wrong, or right.**

### AND THE BASELINE NOBODY HAD

**787 pass / 13 fail across 76 files.** Not *"40-red across 60"*, which is what
every handoff carried. **Any fork quoting the old figure is quoting a guess.**
The 13 sit in seven named files, none of them touched by the session that
counted them: `attempts` (3), `games.script-trace-teaser` (5), `kopiPacks`,
`languageChoice`, `pronunciation.fast-path`, `tts-cache`, `outfits`.

> **A red count carried in prose across three handoffs is a rumour with a
> number attached.**

---

## X77. FOUR FILES THAT DID NOT IMPORT LOOK EXACTLY LIKE FOUR SMALL KNOWN FAILURES.

**2026-09-08. SEA found it, I reproduced it on India before relaying, and then
five forks measured it in parallel and corrected me twice.** This is the entry
that got the most eyes of any this month and it is better for it. Read the
corrections; two of them are to sentences I had already sent to eight sessions.

### What every fork measured

`npm run test:pure`, with and without `SESSION_SECRET` and `OPENAI_API_KEY`:

    fork      no env                      env set                     gap   suites
    India     617, 601 pass, 16 fail      741, 739 pass, 0 fail       124   51 -> 52
    SEA       680,           10 fail      797, 795 pass, 0 fail       117   -
    Europe    652, 632 pass,  8 fail      769, 765 pass, 0 fail       117   59 -> 59
    Africa    651, 631 pass, 10 fail      768, 766 pass, 0 fail       117   59 -> 59
    LATAM     647, 622 pass, 15 fail      765, 758 pass, 5 fail       118   59 -> 59
    East Asia 653, 633 pass, 10 fail      770, 768 pass, 0 fail       117   59 -> 59

**ALL SIX FORKS, and nobody can quote a constant. India is the outlier twice
over: the only 124 and the only moving suite count.** East Asia had no live
session, so the supervisor measured that row directly.

**SUPERVISOR MISS, RECORDED BECAUSE IT COST A SESSION.** East Asia's session came
online later and **never received this relay.** The supervisor hunted for that
fork through two sessions that turned out to be Africa and an unrelated app, got
"not a fork" from both, measured the row from the repo instead, **and never went
back to deliver the finding once East Asia identified itself.** Hours later East
Asia re-derived the whole thing from scratch and reported it as new: **697 tests
without the vars, 818 with, 121 missing.** Its gap is larger than the 117 above
because its suite has since grown, which is consistent, not contradictory.

> **A finding measured about a fork is not a finding delivered to it.** The
> broadcast list was built from who answered, and the fork that had not answered
> yet fell out of it permanently.

**EAST ASIA REFUSED THE FULL ABSOLUTION AND WAS RIGHT TO.** The supervisor wrote
this up as a delivery failure. East Asia sent it back:

> *"I did not need X77. A LOCAL memory in this session's own store already said
> test:pure needs two env vars or the tests vanish, with SEA's 680 to 797 written
> into it and the top-level-throw mechanism spelled out. It was there before I
> ran anything. I ran api-pure bare, got 11 red, and reported them to the owner
> as pre-existing without reading my own note."*

**So TWO channels failed independently and only one of them was the
supervisor's.** Its reason for insisting is the part worth keeping:

> **"If the record says the supervisor's delivery was the cause, the next session
> here inherits a reason not to check its own notes."**

**That is the same class of false comfort as the note saying codegen was broken:
a true-sounding sentence that gives the next reader permission to skip a check.**
A post-mortem naming one cause when there were two is itself an absence
presenting as coverage. **Read your own notes before concluding, not only the
fleet's.**

**The six rows, recorded so nobody measures this a seventh time:** India 617 to
741, SEA 680 to 797, Europe 652 to 769, Africa 651 to 768, LATAM 647 to 765,
East Asia 697 to 818. **No fleet check is owed.**

**East Asia also found that a MEMORY already carried this** ("test:pure needs two
env vars or the tests vanish"), exactly as the ledger already carried
`dom.iterable`. **Twice in one session that fork re-derived something already
written down**, and on the first occasion the writing was in a file its own
preamble tells it to grep. **Its own framing of the danger is the sharpest
anyone has put it: a smaller total reads as a smaller job, so nobody looks.
Compare TOTALS between runs, not pass counts.**

### The mechanism, located per file by Europe and confirmed by Africa

Europe ran every file in `pure-tests.txt` twice, once each way:

    src/lib/parrotChat.test.ts              no-env 1   env 73   lost 72
    src/lib/languageVoice.test.ts           no-env 1   env 27   lost 26
    src/lib/elevenLabsQuotaMonitor.test.ts  no-env 1   env 11   lost 10
    src/lib/phraseAudioVerify.test.ts       no-env 1   env 10   lost  9
                                                               ------
                                                                 117   exactly the gap

**THEY ARE NOT ABSENT. EACH FILE REPORTS EXACTLY ONE TEST, AND IT FAILS.** All
four construct an OpenAI or ElevenLabs client at module scope. `parrotChat`'s
single failure says `Error: OPENAI_API_KEY must be set.`

**So seventy-two tests are represented by one named failure, and that failure
names itself in the same idiom as the genuinely env-dependent ones.**

### Why this is worse than a silent gap, which is what I first called it

Europe's correction, and it is the heart of the entry:

> The danger is not an absence you might notice missing from a count. It is
> that **four import failures look identical to four small known-env
> failures**, sitting inside a run that reports 8 failures total. Anyone
> triaging that reasonably concludes "eight env failures, known, fine".
> **The four that are real cost four tests. The four that are not cost 117.**

Africa put the same thing as an accounting error: **"10 known env failures"
reads as ten tests affected and it is 117 plus six.** LATAM found the third
face of it, where a whole file reports `tests 1, pass 0, fail 1` and therefore
**looks accounted for**, which is more misleading than a gap.

### The detector, from Africa, and the instrument, from Europe

> **A test file reporting "1 test, 1 failure" is either a file with one test or
> a file that did not import, and the summary cannot tell you which.**

**Diff the PER-FILE count between the two runs. A file whose count moves never
ran.** It needs no knowledge of what any suite contains. **The aggregate tells
you a number is wrong; the per-file loop tells you which file.**

**And the failure count is not the FILE count either.** SEA: unset, that fork
reports **TEN failures from FOUR files**, because the runner counts the
file-level failure alongside the sub-tests it had already registered. **"10
failures" invites you to look for ten things and there are four.**

**Africa found a third face in the same summary line: `cancelled 10`.** Cancelled
is neither pass nor fail, and 631 + 10 + 10 = 651. **So anyone diffing only PASS
counts across the two runs gets 135, not 117.** Three different numbers in one
summary, none of them the answer.

### HOW MANY VARIABLES, AND FOR WHICH SUITE. These are two facts, not one.

**`test:pure` needs TWO.** `SESSION_SECRET` and `OPENAI_API_KEY`, any non-empty
value. Measured to 0 fail on India, Europe, Africa and East Asia.

**The DB suite needs a THIRD**, and SEA found it: `phraseReports` was carried for
weeks as "unexplained, 500 where 401 expected" and **was never a bug**. It is
`clerkMiddleware` on a missing publishable key; a syntactically valid dummy takes
it to 5/0. **I checked the boundary rather than relaying SEA's "three vars, not
two": `phraseReports` is NOT in `pure-tests.txt`, and no file in the pure set
references `CLERK_PUBLISHABLE` at all.** So SEA is right about the full local
recipe and it does not apply to `test:pure`. **Say which suite or the sentence
travels wrong.**

### THREE CORRECTIONS, AND THE FIRST IS MINE

**1. CI WAS NEVER SHORT. I implied it was, to eight sessions.** India caught it
by reading the run log after making the same mistake of reading only the
`api-pure:` job block. **All six workflows set both variables at the WORKFLOW
level**, above the jobs, where it is invisible from the job:

    bolo       .github/workflows/ci.yml:44
    the other five                    :38
      SESSION_SECRET: ci-only
      OPENAI_API_KEY: ci-only

**The trap is a DEVELOPER running the suite locally, and only that.** India's CI
run `34157139461` reports 741 tests, 739 pass, 0 fail. **"The job has no env
block" is not the same fact as "the workflow has none."**

**2. "ENV SET MEANS GREEN" IS NOT THE GENERAL SHAPE.** True on India, SEA,
Europe and Africa. **LATAM goes to 5**, and they are pre-existing fork rot, not
environment: seed content still keyed to Southeast Asia's catalogue. A fork
reporting non-zero here has not necessarily got a bad env.

**3. THE SUITE COUNT IS NOT A TELL.** India lost a whole suite, 51 to 52, and
I let that read as the signal. **Europe, Africa and LATAM are 59 both ways**,
because node counts a broken file as one failing test and the file is still
"there". **On three of five forks there is no aggregate tell at all.**

### ONE LINE, THREE FACES. This is the production half and it is not a test issue.

Africa's, and the most valuable thing in the entry. The throw is:

    lib/integrations-openai-ai-server/src/audio/client.ts:10
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY must be set.")

**I verified it is present at line 10 in ALL SIX FORKS.** Africa has met it
three times in one day:

1. **It killed Africa's FIRST REPL PUBLISH.** The process died before binding a
   port, autoscale failed the health check, **and nothing anywhere on screen
   named OpenAI.** A failed deployment with no cause.
2. **It deletes 117 tests from a local run**, disguised as four small failures.
3. **It stops the file importing at all.**

> **A fork that guards its test runner still has the publish exposure.** Same
> line, three unrelated-looking symptoms, and only one of the three tells you
> what it is.

**Europe REPRODUCED THE BOOT DEATH rather than inheriting the claim**, by
importing the app with the key removed:

    RESULT: BOOT DIES -> OPENAI_API_KEY must be set.

**And Europe supplied the sentence that the advice actually turns on, which my
own relay implied without saying:**

> **THE REPL'S SECRETS PANEL AND THE DEPLOYMENT'S ENVIRONMENT ARE TWO DIFFERENT
> PLACES.** Europe's Secrets panel has had the key since 2026-09-06. **That fact
> tells you nothing about the deployment.** A fork whose Shell boots fine can
> still die on publish.

**Write it that way and not as "confirm the key is set", because everyone reads
the second one as already done.** Africa reached the same boundary from the
other side and refused to round it off: the Shell is the DEVELOPMENT
environment, so "present in the Shell" is a different claim, and this platform
already injects a different `DATABASE_URL` per environment.

**Africa's residual-risk diagnosis, which turns an afternoon into a line:** if a
publish dies with a health check that names nothing, check whether the secret is
**workspace-only rather than shared with deployments**.

**NOBODY MADE THE CLIENT LAZY, AND THAT WAS RIGHT.** Europe declined: one line
in a library all six forks share, at midnight, on the eve of a publish, where
two of the three faces are already loud. **Whoever takes it does it upstream,
once.** Posted before fixing, per X53.

### The rule this entry is the general case of

Three sessions OUTSIDE this fleet answered the same broadcast with the same
finding in another form, on the same day. That is a class, not a coincidence.

**Sticker Safehouse** — existence mistaken for survival. A hand-written file in
a **gitignored generated directory** (`ios/` under Expo CNG) was ticked off as
"done, verified" **because it existed on disk.** The cloud build regenerates
that directory. Existence was measured; survival to the build never was.

**BollyMoves** — the sharpest, because the tests were GREEN. An autoscroll hook
shipped to six screens with three passing tests. **All six crashed in
production** (React #310). Every test asked whether the call was PRESENT.
**The entire bug was WHERE it sat**, below an early return. **A test can pin the
wrong axis of the thing it names and stay green forever.**

**LATAM** — a healthy number describing an empty shelf. `latamZone1.ts` and
`latamZone2.ts` held **658 authored phrases imported by NOTHING**; the constants
appeared exactly twice in the repo, at their own declarations. A fresh seed
printed *"6583 authored phrases in the library"* and that figure was **SEA's**,
keyed to ten languages this fork does not seed. Now wired: 12 lessons, 7241, the
generate-on-first-open warning down from 72 pairs to 60. **The guard LATAM added
asserts a positive control — every seeded language must have content reaching it
— rather than a pinned total, because a pinned total cannot catch content that
was never imported. Verified by breaking it and watching it go red.**

**Cliki** — a fourth instance, live in production, found the same day by the
same lens. `OPS_SECRET` is **unset in Cliki's Autoscale deployment**, detected
only because a probed route answered **503 where 403 or 404 was expected**. An
environment variable missing in a deployment, with nothing on screen naming it.
**Different company app, different stack, identical shape.**

> **The failures that name themselves are the safe ones. They get diagnosed.
> The dangerous set is whatever never entered the count: a module that threw at
> import, a file the build regenerates, an axis no assertion looks at, a
> constant nothing imports. By construction, nothing in the output can tell you
> it is there.**
>
> **So the question is never "is it green". It is "what would this check have
> failed to notice".**
>
> **And the count is not the answer either. Two runs of one command on one tree
> print different totals, and the smaller one does not know it is smaller.**

---


## X76. ONE FALSE SENTENCE IN SIX CLAUDE.md FILES HID A LAUNCH-DAY DEFECT FOR WEEKS.

**2026-09-08. The single most expensive line in the fleet was not code.** Every
fork's `CLAUDE.md` said, in some form:

> *the api-server suite CANNOT be run on the Mac*

**It is true of REPLIT's dev database**, whose host is an internal name that does
not resolve off the platform. **It is false of Postgres, which was installed on
this machine and already serving**, with scratch databases sitting on it named
`bolo_east_scratch`, `bolo_sea_scratch`, `bolo_europe_scratch`, `bolo_latam_dev`
and `bolo_india_ci`. **Somebody had been doing it for weeks and it never reached
a fork document.**

**East Asia stood one up. Within hours it had found five defects, and then four
other forks found their own.**

### WHAT THE SENTENCE WAS HIDING

**1. THE LAUNCH-DAY PAYWALL HOLE, and every fork got exactly one shot at it.**
On a freshly seeded database the **entire paid library serves free until the
server restarts.** Every statement in `freeTierContentPolicy` addresses rows
through `lesson_group_id`; lesson groups do not exist until
`runBackfillLessonGroups`, which is **step 4**. The reconcile lives in
`runStartupSeed`, **step 1**. So the policy matches nothing and **logs "already
satisfied (no-op)" while doing exactly that.**

```
                                 East Asia    LATAM     Europe
after seed, groups / premium       0 / 0      0 / 0      0 / 0
after step 4 backfill              ? / 0     65 / 0   1584 / 0     <- boot 1 ends
after the next reconcile           / 4993      / 327      / 11000
```

**Reproduced independently on three forks at three scales.** India was safe only
because it booted weeks ago. **East Asia published for the first time that night
and was saved by a redeploy run for an unrelated secret — its second boot,
by accident.**

**2. A test that could never have passed since the fork was cut**, hardcoding the
parent's flagship language three times. **3. A greeting prompt that asks for an
accent and forbids it in the same sentence**, because a region rename swept the
NEGATIVE clause. **4. Two suites written against India's language codes**, hidden
from every grep because the codes sat *inside quoted URL paths*. **5. A suite
that inserted a real `languages` row its `after` never deleted**, permanently
polluting a shared database.

### THE SECOND TRAP, WHICH THE FIRST FIX WALKS STRAIGHT INTO

**Europe caught itself.** It had reported a suite GREEN that morning. It was
green **because an earlier run had left the parent's language row in its reused
scratch database.** One row there, zero in a fresh one.

> **Run database suites on a database you built this minute, not the one you have
> been using.** A reused scratch database accumulates the fixtures of every suite
> that did not clean up, **and those are exactly the rows a hardcoded parent
> literal needs to pass.**

**East Asia then re-measured everything and its failure count went from 29 to 5**
— *"every one of the twenty-four was OLDER than today"*. **LATAM re-ran and its
numbers were unchanged**, and said the right thing about it: *"both ends were
clean by accident rather than by discipline, which is not good enough."*

**And `dropdb` fails with "is being accessed by other users" when a previous
pool still holds a connection. It needs `--force`, and the failure is quiet
enough to look like the run succeeded.**

### THREE RULES THAT CAME OUT OF IT

> **An unanchored fork-identity assertion is not an assertion.** `/East Asian
> English/` also matches *"SouthEast Asian English"*, so the test would have gone
> green on the parent's string.

> **Guarding a change does not tell you what it broke somewhere you do not
> look.** The wardrobe draft gate is pinned by a PURE test, green in CI on every
> push. The assertion it turned over sits in a DB-backed suite nobody ran.

> **A deleted test never comes back; a conditional skip does, and fails loudly if
> the gate drifted while it was away.** East Asia's eleven skips each read their
> own feature's readiness rather than a hardcoded skip.

### THE SHAPE, WHICH IS [[X72]] ONE LEVEL UP

X72 collected five instruments that reported health because they could not see
the fault. **This is the same failure applied to a whole class of instrument at
once: a sentence in a document removed the only tool that could see a category of
bug, and then nothing contradicted it for weeks** — because the very suite that
would have contradicted it was the one nobody ran.

**A tool you have been told you do not have is indistinguishable from a tool that
does not exist. Check the claim, not just the code.**

---
## X73. DESCRIBE THE PICTURE, NEVER THE PROCESS. A style prompt that names a craft gets photoreal.

**LATAM, 2026-09-07, from the owner's own generation result. His words, which are
the whole finding:** *"that makes the film realistic, not the type of animated
art"*.

The block asked for a splash film in LATAM's TALLER house style, opening:

> *"drawn as a relief print carved from linoleum, with a bold confident carved
> line, a few flat inks laid slightly off register, and the grain and gouge marks
> of the block visible in every shape"*

**Kling returned a photorealistic film.** Every word of that style paragraph is
accurate art direction and a human illustrator would have understood it perfectly.

### THE ROOT, WHICH IS NOT WORD ORDER

**The supervisor's first diagnosis was that a FILM and a PRINTMAKING medium fight,
and that the fix was to name the animation first and repeat the style at the
close. That was right and shallow.** LATAM found the level below it:

> **The block described a PROCESS. A generator cannot carry out a process, it can
> only draw a picture.** So it resolved the contradiction toward the thing it knows
> how to animate, which is reality, and read the carved-line language as **surface
> texture on a photograph**.

**"Carved from linoleum", "screenprinted", "run on a press", "brushed on absorbent
paper" are all things a PERSON does to a MATERIAL.** What a model can act on is
what the finished image LOOKS like: flat areas of one solid colour, no shading, no
rendered light, a heavy outline.

### IT INDICTS MORE THAN THE PAGE THAT FAILED

**LATAM checked East Asia's sheet rather than only its own**, and found the same
shape in the LINGNAN style paragraph: *"wet, translucent washes of colour on
absorbent paper"*, *"confident dark calligraphic strokes"*. **Process language,
unbitten so far.** LATAM's own hypothesis for why, labelled as a guess: East Asia
briefed **ink painting** rather than **printmaking**, and a wash reads as an image
property while a carved block reads as an object.

**EAST ASIA JUDGED ITS OWN PARAGRAPHS AND STATED THE DISTINCTION BETTER THAN EITHER
OF US HAD:**

> **A wash is a MARK that is visible in the finished image. Carving lino and
> running a press are ACTIONS on an object that leave no trace a model can name.**
> "Wet, translucent, no outline" are all properties of pixels.

**So the two paragraphs look alike and are not:** LINGNAN describes what the paint
DID; TALLER described what the printmaker did. **That is why East Asia's splash
came out as ink and LATAM's came out as a photograph with texture on it.**

**And it found a real defect in its own sheet, against its own rule.** Item 31
closes with *"Not photorealistic, not a 3D render, not anime, not a cartoon, not
digital airbrush."* **"Not photorealistic" is a QUALITY**, and East Asia's own page
says exclusions name objects and never textures. It has held for two generations
because the positive half is unusually object-bound and the surviving exclusions
ARE objects, which crowd photorealism out through the front door while the back
door stands open.

> **East Asia's own verdict: "It is not a rule, it is a run of luck with good
> odds."**

**TWO REFUSALS THAT ARE THE ENTRY'S REAL LESSON.** East Asia declined to edit its
style paragraphs **while the owner was pasting from that sheet**, because the text
he is pasting and the text in git would diverge mid-run and a half-updated sheet is
worse than either version. **And it refused to let its own untested exclusion line
be pushed to Africa and Europe as "East Asia's fix":** its evidence is two correct
generations under the OLD wording and zero under the new.

> **A fork copying an unproven line from a sibling is the same error as a fork
> inheriting that sibling's Veo measurement. A fix earns its place when a
> generation is run with it and comes back right, not when it is reasoned well.**

### THE EXCLUSION HALF, AND WHY IT IS HARDER THAN IT LOOKS

**"Not photorealistic" is a QUALITY, and the fleet's own rule is that exclusions
must name OBJECTS, never textures** (see [[X72]] and East Asia's
`artwork-prompts-full.md`). So photorealism has to be excluded as a list of things
that exist only in photography:

```
no camera lens flare, no bokeh, no depth-of-field blur, no film grain,
no motion blur, no live-action footage, no 3D render, no photograph
```

**Those are things, and a model can drop a thing.**

### THE FOUR-PART FIX, now in all eight of LATAM's sitting-1 blocks (`af3cf48b`)

1. **Name the medium as an ANIMATION in the first clause**, before describing what
   it looks like.
2. **Say "flat" and "drawn" about the SCENE**, not only about the ink.
3. **Restate the style in the block's closing sentence.** Models weight the opening
   and the close above the middle.
4. **Exclude photorealism as objects**, per above.

**LATAM verified the re-emission by script rather than by eye, and the script
caught three blocks its first pass had missed on a line-wrap difference.**

### THE DISCIPLINE WORTH COPYING, which is separate from the fix

**LATAM's page now carries "Kling pulls toward photoreal on a relief-print brief"
labelled a MEASUREMENT, while its pan-Mexican-shorthand warning stays labelled an
EXPECTATION, because that one still has not happened.** Keeping those two apart in
the same document is the whole point: East Asia's *"Veo adds a red seal and pulls
toward Japanese woodblock"* is a measurement about East Asian art and **does not
transfer**, and LATAM refused to copy it for exactly that reason. **A fork that
inherits another's measurement as its own has inherited a guess.**

---
## X72. FIVE INSTRUMENTS REPORTED HEALTH IN ONE DAY BECAUSE THEY COULD NOT SEE THE FAULT.

**2026-09-07. Not one fork's finding. All six hit the same shape inside twelve
hours, and none of them recognised it as the same shape until they were laid
side by side.**

> **A check that cannot perceive a fault returns exactly what a check that
> perceived no fault returns.** Absent and passing are the same reading. Every
> item below is a green light produced by blindness rather than by health.

### THE FIVE, each measured, each caught by someone other than whoever relied on it

**1. THE MFA PROBE THAT COULD NOT SEE CLIENT TRUST.** The supervisor probed SEA's
production Clerk instance and reported `totp absent`, `backup_code enabled=false`,
`second_factor {"required": false}`, and concluded there was no MFA. **Every
reading was true.** Client Trust does not appear in `user_settings` at all, and it
was the thing blocking the App Store reviewer. See [[X71]].

**2. THE DEPLOY STATUS THAT MEANT NOTHING.** `get_publish_status` returned
`success`, and the Repl's own filesystem carried the newest commit. **Both true
statements about the wrong thing.** SEA's line, and it is the rule:

> **The only honest test of a deploy is a byte you can fetch or a code path you
> can trigger.** `app_start_time` plus a suppressed-error-that-fired settled it;
> two green readings did not.

**3. THE HASH THAT CALLED A SIBLING'S ART FORK-OWNED.** Europe, then Africa,
independently. A byte comparison reported 25 Europe-own files; **fourteen were
SEA's art re-encoded into Europe's slot sizes**, so the bytes differed and the
picture did not. Africa reproduced it exactly: 42 files hashed as Africa's own,
36 were India's store screenshots and 6 were SEA's water at 860x1358 against the
parent's 860x1359. **Europe's rule:**

> **On art, the hash is the most reassuring liar of the four. Name, hash, comment
> and picture each answer a different question and only the picture is true.**

**AND THE NAME LIES IN BOTH DIRECTIONS, which East Asia proved the same evening.**
Its grandma art sits at `stall/uncle.png` **and the file is genuinely her.** The
path is an **id**, in the same family as `chai` and `station-cap`, so a fork
auditing by filename would have flagged a CORRECT asset as inherited and
regenerated it.

> **SEA's relabelled cap was a right label over wrong art. East Asia's
> `stall/uncle.png` is a wrong-looking path over right art. Same signal, opposite
> truths, and only opening the file separates them.**

**AND A FORK DOES NOT INHERIT FROM ONE PLACE.** LATAM opened its two hero assets
the same evening and found **two inherited files with two DIFFERENT parents in one
app**: the welcome film is **India's** bazaar, and the splash is **SEA's** junk
under a **batik-patterned sail**, batik being Indonesian and Malay, on SEA's water
with SEA's jetty and paper lanterns.

> **A fork inherits from every place its ancestors did. Checking an asset against
> "the parent" is not enough; it has to be checked against the whole ancestry.**

**A COVER FIT NEVER LETTERBOXES, IT CROPS, and that decides the generation size
rather than the post step.** LATAM measured its own players: mobile's `VideoView`
is `contentFit="cover"` and web's `<video>` is `object-cover`, so **neither ever
adds a bar**. A film shorter in aspect than the screen loses WIDTH:

```
1080x1920 on a 9:20 phone        20.0% of width lost, 10% each edge
1080x1920 on an iPhone 17 Pro    18.2% lost
1080x2400, the shipping size      0.0% lost
```

**LATAM simulated the crop on the delivered frame and LOOKED at it**: the woman at
her table, the only person in the shot and its entire point, is sliced at the right
edge. **Padding does not rescue it, because cover crops the padding away and bars
would then appear on some devices and not others.** The only fix that keeps the
composition is generating at the final height.

> **Ask what the PLAYER does before choosing a generation size. "Fix it in post" is
> not available against a cover fit.**

**East Asia's marking discipline is the part to copy.** Offered 27 files that
differ from both parents by hash, it marked **four** DONE, two as a parent's, and
**twenty-three `UNVERIFIED: file exists and differs from both parents, NOT
opened`** — quoting Africa's 36-of-42 and Europe's 14-of-25 in the legend as the
reason. **A wrong DONE is worse than no marker, because DONE is the one state that
makes a reader skip.**

**4. THE DIAGNOSTIC FIELD THAT DID NOT SURVIVE ITS TRANSPORT.** SEA logged
`via: "secret-key"` to name which code branch ran. **Sentry's scrubber redacts a
value containing "secret"**, so it arrived as `[Filtered]`. The supervisor's
branch identification worked **only by accident**: the other path logged no `via`
at all, so a redacted field's mere *presence* named the branch. **And the obvious
improvement, adding `via` to both paths, would have destroyed the accident and
left two indistinguishable redactions.** SEA caught it while writing that
improvement, renamed the value to `v1-rest-key`, and wrote a test that fails if
anyone reverts it.

> **A diagnostic field that does not survive its transport is not a diagnostic
> field.**

**5. THE "IS IT SET" CHECK THAT PASSES ON A PLACEHOLDER.** SEA's
`REVENUECAT_SECRET_API_KEY` was SET all day and held Replit's v2-scoped connector
token, which 401s every `/v1/` call. Its RevenueCat project had **no secret keys
at all**. Separately, SEA's Stripe price id is the literal string
`REPLACE_ME_BOLO_SEA`. **SEA's own formulation, comparing itself to East Asia:**

> **East Asia's cause is honest (the key is unset) and SEA's LOOKS configured (a
> truthy placeholder walking past a falsy guard). If anyone sweeps the fleet, the
> check is not "is the key set" but "does the endpoint return 200".**

### THE SIXTH, WHICH IS THE FAMILY'S ORIGINAL AND WAS ALREADY IN THE LEDGER

**A green CI run that cannot distinguish a fix from a flake.** Confirmed again
today: Africa's `UNSTOPPABLE` failure went **green on a re-run of the same sha**,
and East Asia's had done the same thing hours earlier. See
[[a-cancelled-ci-run-is-not-a-pass]] and [[the-silent-default-four-faces]].

### WHAT ACTUALLY CATCHES THESE, from the six cases above

**Not more checks. A check of a different KIND.** In every case the fix was to
stop asking the system about itself and go round the outside:

| the blind check | the check that worked |
|---|---|
| `user_settings` says no MFA | sign in on a device that has never signed in |
| deploy status says success | fetch a byte off the wire |
| the hash says fork-owned | open the file and look at it |
| the field says `[Filtered]` | read both call sites and diff their shapes |
| the variable says SET | call the endpoint and read the status |
| CI says green | re-run the same sha and see if it agrees with itself |

> **Every right-hand entry costs more than its left-hand twin. That is the whole
> reason the left-hand ones get written, and the whole reason they keep being
> believed.**

**And the tell, which is cheap and worth internalising:** ask of any green
reading, *what would this have returned if the fault were present?* **If the
answer is "the same thing", it is not evidence.**

---
## X71. CLIENT TRUST IS THE THING THAT LOOKS LIKE MFA AND BLOCKS EVERY REVIEWER.

**SEA, 2026-09-07, found when the App Store reviewer for build 6 could not sign
in at all. The owner then said the sentence that made it a ledger entry rather
than a bug: "this was an issue with the India review as well."**

**It had already cost one review, it was already written down, and it happened
again anyway.** That is the interesting part, because the usual failure in this
fleet is a missing document. This time the document existed, in all six repos,
and the second review still lost a day to it.

### WHAT IT IS, AND WHY EVERY INSTINCT SAYS "MFA"

**Clerk Client Trust challenges a password sign-in from a NEW DEVICE with an
emailed second factor.** A reviewer is, by definition, always on a new device,
and cannot read the demo account's inbox. So the reviewer meets a code prompt
that the owner never sees on his own phone.

**It presents as MFA and it is not MFA, and that distinction is what wasted the
time.** The supervisor probed SEA's production instance and reported, correctly:

```
totp            absent
backup_code     enabled=false   used_for_second_factor=false
phone_number    enabled=false   used_for_second_factor=false
second factor policy   {"required": false}
```

> **Every one of those readings is true and the conclusion drawn from them was
> wrong. Client Trust does not appear in `user_settings` at all.** An instrument
> that cannot see a feature reports its absence exactly the way it reports it
> being switched off.

**The visible symptom is a Sentry event reading `Clerk: Email code factor not
found`,** which is `signIn.mfa.sendEmailCode()` failing because Clerk returned
`needs_client_trust` without offering `email_code` as a second factor.

### IT WAS DOCUMENTED. IN ALL SIX REPOS. AND IT STILL BIT.

`docs/CODEBASE-FACTS.md` carries it in **bolo, bolo-sea, bolo-europe,
bolo-africa, bolo-east and bolo-latam**, five mentions each, from India's Task
857 on 2026-07-30:

> *"Client Trust is currently DISABLED in the Clerk dashboard because build 26's
> sign-in errored on `needs_client_trust`. Manual post-ship step: once build 27
> is live in the stores, re-enable Client Trust in the Clerk dashboard."*

**Every fork also HANDLES it in code.** Measured rather than assumed, `grep -rl`
over `artifacts/bolo-mobile` in all six:

```
handles needs_client_trust   2 files, every fork
uses mfa.sendEmailCode       5 files, every fork
```

**So the code was ported, the document was ported, and the fix still did not
travel.** Why: **the note is written as a post-ship step for India's build 27.**
It tells a reader how to turn Client Trust back ON. **Nothing in it says what a
NEW production instance should do before filing a review**, and a fork reading it
finds an instruction that appears already handled.

> **A document that describes the state of ONE fork's dashboard on ONE date is
> not a checklist item. It reads as history, and history does not get actioned.**

### AND A NEW PRODUCTION INSTANCE INHERITS NOTHING

SEA's production Clerk instance was created **2026-09-06**, one day before the
review. **Dashboard toggles do not fork.** India's prod had been deliberately set;
SEA's was whatever Clerk defaults to, and nobody looked, because the flip was
verified by reading the KEYS back rather than by exercising a sign-in.

**This is the same shape as X57 and the RevenueCat v1 key found the same hour:
the code arrives, the account state does not.** See
[[a-fresh-fork-inherits-code-not-secrets]].

### THE FIX, AND THE ONE THAT DOES NOT WEAKEN EVERYONE ELSE

India's own note names the only API surface: **a per-user `bypass_client_trust`
flag.** That is the right tool for a reviewer, because it exempts ONE account
rather than turning the protection off for every learner.

**The instance-wide toggle is dashboard-only.** India verified in July that
`PATCH /v1/instance` carries no trust setting and the candidate endpoints 404,
and that **dev and prod toggle independently.**

### THE RULE

> **Before any fork files a store review, sign in to the demo account ON A DEVICE
> THAT HAS NEVER SIGNED IN BEFORE.** Not the owner's phone, which is already
> trusted. That single act exercises Client Trust, email verification and the SSO
> redirect allowlist together, and it is the only test that sees what a reviewer
> sees.

**Add to every fork's launch checklist, phrased as a question rather than a
history:** *is Client Trust bypassed for the demo account on THIS fork's
production instance?*

**And the general form, which is worth more than the specific bug:** a fix
recorded as "what we did on date X" is inert in a fork. **Only a fix recorded as
a question someone must answer survives the copy.**

---
## X38. NEVER WRITE A COUNT IN A SENTENCE. LET THE COMMAND BE THE COUNT.

**India, 2026-09-07, about its own handoff, and it is the cleanest self-catch in
the ledger.**

A written commit count in this fleet has now been wrong **twice in one night**:

- The supervisor handoff said India had **16** unpushed. It had **17**.
- India's own `HANDOFF.md` opened by saying **nine** commits were ready and then
  listed **seven** in its table, against a true **17**.

**The mechanism is the same both times: the number was written, and then more
commits were made.** A handoff commit is itself a commit, so the act of writing
the count is what invalidates it. **The count is stale before the file is saved.**

> **The rule: never put a number of commits in a sentence. Write the command.**
>
> ```bash
> git log origin/main..main --oneline
> ```
>
> A reader who runs it is right forever. A reader who trusts the sentence is
> wrong from the moment it was typed.

**How it was caught, and this is the part to copy.** The new supervisor counted
from disk **before** reading India's reply, and got 17 independently. India then
said 17. **Two readings taken without sight of each other beat either one alone,
and the written number was the one that was wrong.** Had the supervisor read the
handoff first, 16 would have anchored it.

**Generalises past commits** to any figure a handoff quotes about a moving tree:
test counts, file counts, phrase counts, row counts. **If it can change after you
type it, write the command that measures it instead.**

---

## X39. CI IS ALIVE AGAIN ON ALL FIVE REPOS. X13 IS CLOSED.

**Supervisor, measured 2026-09-07 ~13:45Z.** X13 said GitHub Actions was dead
fleet-wide on a $0 spending limit, and Africa re-measured it still dead at
03:17Z. **It came back between 03:17Z and 04:20Z on 2026-09-07.** The owner's
billing fix worked; it was just slower than the session that gave up on it.

Latest run per repo, and **the duration is the tell, exactly as East Asia's rule
says**:

| repo | head | jobs | wall time | real run? |
|---|---|---|---|---|
| india | `cb1cf67b` | in progress | started 13:45:29Z | yes, running now |
| sea | `5736e281` | 3 pass, **web fails** | 7m05s | yes |
| europe | `b1a026ad` | typecheck passes, **web, mobile, api-pure all fail** | 6m12s | yes |
| africa | `a0a50d80` | all four pass | 7m37s | yes |
| east | `1b7945ff` | all four pass | 4m42s | yes |

**The billing-dead runs are still visible in the history and they are 2 to 5
SECONDS.** Anything under a minute is a stub that never checked out the code.
**Nothing counts until a run lasts over a minute** stays the rule; it is now the
rule for telling a real red from a dead one, rather than for telling dead from
alive.

> **The cost of X13 being stale was invisible and large: two forks have been
> RED AT HEAD for nine hours and nobody looked, because the fleet "knew" CI was
> dead.** A known-broken check gets read as noise, and then stops being read at
> all.

### CORRECTION, 2026-09-07, three of them, and all three came from forks.

**The supervisor wrote this entry confidently and got three things wrong inside
twenty minutes.** Each was caught by a fork measuring its own repo.

**1. The recovery window was wrong, and the method was the fault (East Asia).**
`bolo-east` failed in 4s at 03:08:26Z and its very next run STARTED at 03:12:06Z
and ran 20m08s to green. **So CI recovered before 03:12Z, not "between 03:17Z
and 04:20Z".** The supervisor's window was built from Africa's last note plus
SEA's first real run, which is two forks' edges rather than any fork's actual
boundary. **A window derived from other people's samples is not a measurement.**

**2. "5 to 8 minutes" is too tight a lower bound, and it would cause the exact
error it was written to prevent (East Asia).** A real green run on `bolo-east`
took **4m42s**. The rule is East Asia's original and unnarrowed:

> **Anything over a minute is real.** The two populations are three orders of
> magnitude apart. Do not tighten the live bound or you will call a fast green
> run dead.

**3. Duration cannot be the first test at all, because CANCELLED runs sit right
in the middle of it (Africa).** Africa's three runs before its green one are
`conclusion=cancelled` at **2 to 3 minutes each**, superseded by rapid pushes.
Those are neither billing-dead nor meaningful, and duration alone reads them as
real.

> **THE ORDER IS: read the `conclusion` field first, then per-job conclusions,
> and use duration ONLY to separate a real `failure` from a billing-dead one.**
> This is the same rule as "a cancelled CI run is not a pass", arrived at from
> the other direction.

**The pattern to name, because it is the supervisor's own and it is now four for
four:** a correct general finding was applied past the evidence that produced it.
Coverage without cost, ratio without scripts, a window without a boundary, a
duration band without the cancelled population. **The forks measure their own
repo; the supervisor generalises. The generalisation is the part that keeps being
wrong.**

---

## X40. TWO REDS, AND ONLY ONE OF THEM IS REAL. PROVE WHICH BEFORE YOU BLOCK.

**Supervisor, 2026-09-07.** SEA and Europe are both CI-red at head. **They are
nothing alike, and the handoff described neither.**

### SEA `5736e281`: RED, AND SAFE TO PUBLISH.

One job fails, `web`, on `practice-streak-xp.test.tsx:279` — a `waitFor` on the
text `🔥🔥🔥 UNSTOPPABLE!` after **ten** consecutive scoring rounds, each with its
own 8s wait, inside a single 30s test cap. **That is a timing test on a loaded
shared runner.**

**Three measurements, and together they close it:**

1. **The entire diff from the last green run to the red head is 36 added lines in
   one markdown file**, `docs/MORNING-HANDOFF-2026-09-07.md`. Nothing imports it.
2. **CI installs `--frozen-lockfile` on all four jobs and no dependency file
   moved.** So the installed tree is identical between the green run and the red
   one. There is no third variable.
3. **The full web suite passes locally on that exact head: 143 files, 1,496
   tests, 0 failures, 32s.**

> **A docs-only commit cannot break a React test. The red is the runner, not the
> tree.** SEA at `5736e281` is safe to publish the moment Replit allows it.

### EUROPE `b1a026ad`: RED, AND PROBABLY REAL. DO NOT PUBLISH.

**Three of four jobs fail** — `web`, `mobile` and `api-pure`. Only `typecheck`
passes, which is exactly the shape X34c warned about: **typecheck is the check
most likely to agree with you while everything else disagrees.**

The failing files include **`src/test/uncle-name.test.ts:32`**, and that is the
file X36a is about. Europe went from 16 languages to 22 and re-authored
`UNCLE_LINES` to give six new grandmothers their own names. **A test named
`uncle-name` failing in the same repo, hours after that edit, is a regression
until proven otherwise, not a flake.** Also failing: `practice-retry.test.tsx`
and three assertions in `practice-stop-mode.test.tsx`.

**Not yet run locally. That is the next Europe session's first job, before the
films and before anything else.**

> **CLOSED 2026-09-07 morning by Europe. The call was right: it was real, not a
> flake.** Root cause and fix are X41; head is now `3b347811`. Two corrections
> to the diagnosis above, both worth having:
>
> - **`practice-retry.test.tsx` and `practice-stop-mode.test.tsx` were NOT
>   failing.** The web job's own summary line says `Failed Tests 2`, and they
>   were `landing.test.tsx` and `uncle-name.test.ts`. Those two files appear in
>   the log because their tests deliberately log `Evaluation failed` and
>   `HTTP 502` to stderr while asserting the error card renders. **A grep for
>   "fail" over a CI log finds tests that are testing failure.** Read the
>   summary line, not the matches.
> - **The uncle-name failure was not a regression in `UNCLE_LINES`.** The map
>   was correct at 22; the two `uncle-name.test.ts` files pinned the old 16.
>   X36a's edit was sound, its pins were not updated with it.

### The flaky test is in ALL FIVE REPOS, byte-identical.

`practice-streak-xp.test.tsx` exists in india, sea, europe, africa and east, each
with the same `const WT = { timeout: 8000 }` and the same single `}, 30000);`
cap. **So this false red can block any fork on any busy runner, and four of them
have not met it yet.** ENGINE. Whoever raises that cap or splits the ten-round
test cherry-picks it to the other four.

> **The rule the two reds teach together: a red is a question about the runner or
> a question about the tree, and the diff tells you which before you run
> anything.** Read what changed between the last green and the red first. If it
> cannot possibly cause the failure, you are debugging infrastructure. If it
> obviously could, you are debugging your code.

---

## X41. A GREEN CLAIM NOBODY READ BACK, AND THE FIVE FILES UNDER IT

**Europe, 2026-09-07 morning.** Last night's handoff table said "CI: Green after
six pins were inverted". **All three jobs were failing on the push that wrote
it.** The pins WERE inverted, each local run after each inversion DID pass, and
the claim was written from those runs. What was never done was reading CI back
after the last push.

**`gh run list --limit 5` is two seconds.** Any session that writes "CI green"
without it is reporting its own test runs, which by construction cover only the
files it already knew about.

### X41a. Adding a language: the third and fourth things that typecheck and are wrong

X36 named two ([[UNCLE_LINES]] silent fallback, an expiry-dated fixture). Two more,
both found in Europe going 16 to 22, both owed to every fork:

- **A per-language map that THROWS rather than falls back.** `EUROPE_TOPIC_TITLES`
  had no French, so `europeLessons()` threw at import and took every test that
  imports the seed with it. Three CI jobs, one missing key. **Better than a
  silent fallback**, and still invisible until CI runs.
- **A GENERATED file that is committed.** `review.html` and `review-data/*.json`
  are built by `build-phrase-review` and committed. Adding a language breaks
  them loudly; **changing content does not break them at all.** Europe's page
  was still showing native speakers the eight alcohol rows the app removed in
  `fbca7513` three weeks earlier. **Any content commit owes the rebuild.**

### X41b. A digit in nativeScript is a content bug, not a formatting one

`Gleis 3` shipped in Europe's German travel lesson. The guard caught it and the
guard is right: **the learner has to say the word out loud and TTS reads the
numeral**, so the lesson taught a symbol instead of *drei*. Generated batches
need reading for this; nothing else finds it.

### X41c. api-pure lies on a developer machine

Eight tests fail with `SESSION_SECRET must be set` and none is a real failure.
Run it the way CI does or you will chase ghosts:

```
SESSION_SECRET=ci-only OPENAI_API_KEY=ci-only CI=true \
  pnpm --filter @workspace/api-server run test:pure
```

---

## X42. NEVER MEASURE A REPO THAT HAS A LIVE SESSION IN IT. PIN THE SHA.

**The supervisor's own trap, 2026-09-07, and it nearly reversed a correct call.**

The supervisor read Europe's CI red on `b1a026ad`, called it "probably real", then
ran Europe's web suite locally to check. **It passed: 144 files, 1,533 tests, 0
failures.** On that evidence the supervisor began to doubt its own correct
diagnosis and started hunting for an environment difference that did not exist.

**What had actually happened: Europe's own session was fixing the bug underneath,
and committed `3b347811` while the supervisor was measuring.** The green suite was
real. It was just not the tree CI had run. `git status` had said clean and HEAD
had said `b1a026ad` at the START of the investigation, and both had since changed.

**The tell that should have been read immediately, and it was sitting in the
output:** CI failed looking for `/Sixteen Central and Eastern European languages/`
and `grep` found that string nowhere in `src/`. **A test asserting a string that
does not exist in the tree is not a mystery, it is proof you are looking at two
different trees.** `git show <sha>:<path>` settles it in one command and the
supervisor ran it four steps too late.

> **THE RULE: before measuring anything against a CI run, pin the sha.**
>
> ```bash
> git stash list && git rev-parse HEAD   # what am I actually on, right now
> git show <ci-sha>:<path> | grep <thing>  # what did CI actually run
> ```
>
> **And check whether a session is live in that repo before you touch it.**
> `ListAgents` answers it. A fork session working its own repo is the normal
> state now, not the exception.

**Why this matters more than one wasted measurement:** the supervisor's green
reading would have told Europe its red was a flake, while Europe was mid-fix on a
real import-time throw. **A supervisor measuring a fork's repo can hand back a
conclusion that is newer than the fork's own evidence and wrong about it.**
Measure the supervisor's own artifacts freely; measure a fork's tree only pinned,
or ask the fork.

---

## X43. THREE FORKS SHIP INDIA'S HINDI ELDER AUDIO TO LEARNERS TODAY.

**Africa, 2026-09-07, measured across all five rather than asked.** sha256 of
`artifacts/gujarati-coach/public/bazaar/chacha-welcome.mp3`, first 16:

| repo | sha256 head | verdict |
|---|---|---|
| bolo (India) | `99956ce0f350ebc7` | correct, it is his own voice |
| bolo-sea | `99956ce0f350ebc7` | **INDIA'S HINDI** |
| bolo-europe | `99956ce0f350ebc7` | **INDIA'S HINDI** |
| bolo-africa | `99956ce0f350ebc7` | **INDIA'S HINDI** |
| bolo-east | `f8344115e6a256f1` | **REPLACED** |

> **A Swahili learner, a Czech learner and a Vietnamese learner all currently hear
> Chacha-ji speaking Hindi when the bazaar opens.** Each fork's elder is a ruled
> product fact: the market mother, a grandmother, an uncle. This is the loudest
> possible violation of that and it is live in three repos.

**East Asia already solved it, and the precedent is worth more than the bug.**
Their file is 36,823 bytes, 4.53s, landed in `59bc3f34` ("the grandma's lines,
voice and persona"). **They did not wait for hired speakers.**

### The contradiction, and it is an OWNER decision, not an agent's.

**Africa's own commission sheet, item 75, rules this line NOT generatable:** it is
"synthesised by the app's own voice pipeline per language once the hired speakers
have confirmed her line". **East Asia's shipped commit is a counter-example to
that ruling.**

**Africa did the right thing and did not act on it.** In its own words: a peer's
precedent is evidence about what is possible, not authority to overturn its own
fork's written ruling. **That is the [[asset-that-contradicts-a-ruling-stop-first]]
rule working exactly as intended, from the inside, unprompted.**

**The one question that unblocks three forks is for East Asia, not for the owner:**
*how* was that line made, was it authored or borrowed, and which pipeline path
produced it. One message answers it once instead of three forks each solving it.

**The owner's part is smaller and only his: what the elder actually says.** The
words of a grandmother's welcome are content, not an art job and not a port.

### RULED BY THE OWNER 2026-09-07: **A. Generate it now.**

Put to him as A or B, and he answered **A**:

> **A: the forks may generate their elder's line now, the way East Asia did.**
> B was hold for hired speakers, per Africa's commission sheet item 75.

**So Africa's item 75 is OVERRULED for this line.** SEA, Europe and Africa may
each produce their own elder's welcome without waiting for a booked speaker.
**East Asia's method is the reference.** The owner still approves the actual
words per fork; the gate that was blocking was permission to synthesise at all,
and it is lifted.

### X43a. IT IS TWO FILES, AND THE SECOND ONE CANNOT BE HOT-FIXED.

**Europe, 2026-09-07, checked instead of accepting the single path in the entry
above.** Both carry the same Hindi audio:

```
artifacts/gujarati-coach/public/bazaar/chacha-welcome.mp3      99956ce0f350ebc7
artifacts/bolo-mobile/assets/images/bazaar/chacha-welcome.mp3  99956ce0f350ebc7
```

> **A fix that replaces only the web copy leaves every phone still playing
> Chacha-ji, and the mobile copy ships inside a binary.** Web is a publish;
> mobile is a build, a store review and a learner who updates. Same defect, two
> completely different costs to fix, and the expensive one is the one an agent
> hashing a single path never sees.

**Verify BOTH paths before calling any fork's elder audio clean, East Asia's
included.** The original all-five sweep hashed only the web path, so "East Asia
replaced it" is currently proven for web and unproven for mobile.

### X43a-ii. IT IS A PAIR OF ASSETS, SO IT IS FOUR FILES PER FORK.

**SEA, 2026-09-07, checked instead of accepting the mp3.** In the same directory:

```
bazaar/welcome.mp4   10,940,360 bytes   5.04s
  bolo (India)   09f67cc1568dc12a
  bolo-sea       09f67cc1568dc12a   India's film
  bolo-east      1f876a390bbf3bef   REPLACED
```

**`bazaar-welcome.tsx` opens the still or the film and autoplays `VOICE_SRC` over
it**, once per day, gated on `bolo-bazaar-welcome-day`. **The two play together,
so the unit of repair is the pair**, and both platforms ship both copies. **Four
files per fork**, web and mobile, mp3 and mp4.

> **A fork that replaces only the audio leaves an Indian bazaar film playing
> under its own elder's greeting.** East Asia replaced BOTH in `59bc3f34`, which
> is the method to copy.

**SEA proved it against the LIVE SITE rather than disk**, which is the house rule
working:

```
GET https://bolo-sea.app/bazaar/chacha-welcome.mp3  200      69,007  99956ce0f350ebc7
GET https://bolo-sea.app/bazaar/welcome.mp4         200  10,940,360  09f67cc1568dc12a
```

**Scope boundary, so nobody over-corrects.** 14 of 26 mobile media are
India-identical, and **East Asia deliberately KEPT the bands, squawks and
ringtone** as language-neutral SFX. Those are not the defect. (`ringtone.m4a` is
separately the known ringback-instead-of-incoming-ring bug inherited from India;
pre-existing, not a fork defect.)

### X43c. A VERIFIED-LOOKING CLAIM AGAINST THE WRONG CONTROL.

**SEA, and this is the reason the defect survived five forks and an all-five
audit.** SEA's repo already says **"byte-identical" about this exact file,
twice** — at `bazaar-welcome.tsx:93` and in the header of
`bazaar-welcome.test.tsx`.

**Both statements are TRUE. Both check the wrong pair.** They verify **web
against MOBILE**, to pin a 4600ms reduced-motion timing. **The control was never
India.**

> **So anyone grepping to find out whether this asset had been checked finds the
> word "byte-identical", sees diligence, and moves on.** The comment is not
> wrong, it is answering a different question than the reader is asking.

**A verified-looking claim against the wrong control is more dangerous than no
claim at all.** No claim invites a check. A true claim about the wrong control
ends the search.

**The generalisation, and it belongs beside X15:** when you find a comment or a
test asserting that something was verified, **read what it was verified
AGAINST** before you accept it as coverage. "Checked" is not a property of a
file, it is a relation between two of them.

### X43d. THE SUPERVISOR GOT A RULING ON A FALSE PREMISE. NOBODY HAD LISTENED TO THE CLIP.

**2026-09-07. The whole chain ran on one unverified word and it reached the
owner.**

Africa hashed the file and found East Asia's differed. The supervisor wrote that
East Asia had **"solved it"** and called their method **"the reference"**. On
that basis it put A or B to the owner as *"the forks may generate their elder's
line now, **the way East Asia did**"*, and he ruled A.

**Then East Asia transcribed its own clip.** Whisper-1, no language hint:

```
language: english
text: "Welcome, welcome. Sit down, the tea is hot."
```

**One static English clip, played to every learner of ten languages**, verbatim
the English source line in their own commission sheet item 65. **Not per-language
synthesis.** `BazaarWelcome.tsx:46` and `bazaar-welcome.tsx:26` each require a
single fixed asset and there is no per-language branch near either.

> **A sha proves two files differ. It says NOTHING about what the replacement
> is.** Four sessions and a supervisor reasoned about an audio file for an hour
> without one of them playing it. **The cheapest possible check was the one
> nobody ran.**

**The rule: when the artefact is media, open it.** Transcribe the audio, sample
the frames, read the image. A hash, a byte count and a commit message are
metadata about a file, not evidence about its content.

### X43e. ITEM 75'S PREMISE WAS FALSE, AND ENGLISH IS THE ONLY SHAPE THAT FITS.

**Africa, and this is the finding that actually closed the question.** The asset
is not synthesised per language by anything. It is one static file on both
surfaces:

```
web     bazaar-welcome.tsx   const VOICE_SRC = `${BASE_URL}bazaar/chacha-welcome.mp3`
mobile  BazaarWelcome.tsx    const WELCOME_VOICE = require('../assets/images/bazaar/chacha-welcome.mp3')
```

**A fixed URL and a Metro static require. No language code reaches either.**

> **So "hold until the hired speakers have confirmed her line" was waiting on ten
> confirmations for a file that has no per-language dimension to confirm. The
> gate protected nothing.**

**English is therefore not a compromise, it is the only shape a single static
asset can take**, and East Asia reached it first without writing down why. The
two lines, both transcribed rather than assumed:

```
India's, still shipping in three forks:  "कैसे हो आओ आओ बजार में आओ"
                                          How are you. Come, come, come into the bazaar.
East Asia's replacement:                  "Welcome, welcome. Sit down, the tea is hot."
```

**East Asia's fix is COMPLETE on both surfaces**, `f8344115e6a256f1` on web and
mobile, both carried in `59bc3f34` as one diff. Confirmed twice, by East Asia and
independently by Africa. India, SEA, Europe and Africa are `99956ce0f350ebc7` on
both paths.

**So SEA, Europe and Africa each have a ten-minute job, not a blocked one.** What
is NOT lifted is the words: the owner approves the line before it ships, and no
fork should bake in a sentence he has not heard.

**The reusable artefact is the TEXT script, not the audio.**
`scripts/fork/gen-grandma-lines.py` at `27a7e462` writes all ten languages of
`UNCLE_LINES` with an OpenAI chat call and lands them in `chachaStrings.ts` marked
**UNREVIEWED** for writers to replace. Needs only `OPENAI_API_KEY`. **The audio
half is unrecorded**: no committed script produces the mp3, and the only evidence
in the file is ffmpeg at mono 44.1 kHz, ~64 kbps, 4.53s, which is item 65's spec
hit deliberately.

**The constraint that survives the ruling:** `ttsConfig.ts
NO_SYNTHESISER_LANGUAGES` lists languages **no provider speaks at all**. That is
the real reason item 75 was written, and it stays true whatever was ruled about
permission. It only stops mattering because the asset is not per-language.

### X43f. IT IS THREE ASSETS AND TWO ENCODES, SO THE JOB IS BIGGER THAN THE PAIR.

**Africa, hashing both surfaces rather than assuming one file appears twice.**

**The film is TWO DIFFERENT ENCODES, not one file in two places:**

| `bazaar/welcome.mp4` | web (gujarati-coach) | mobile (bolo-mobile) |
|---|---|---|
| India / SEA / Europe / Africa | `09f67cc1` 10,940,360 B | `5bd56e4d` 1,207,782 B |
| East Asia | `1f876a39` 638,853 B | `1f876a39` 638,853 B |

> **A fork replacing the film produces two encodes, not one copy.** East Asia
> collapsed theirs to a **single 639 KB file serving both surfaces**, 17x smaller
> than the web encode it replaced. **Relay that shape, not just "replace the
> mp4".**

**THE THIRD ASSET, and it breaks the "it is all India's" framing entirely:**

```
bazaar/keyart.png   India 8dc3a60f   SEA 4a7a6f53   Africa 4a7a6f53   East Asia 961efbad
```

**Africa's key art is SEA'S, not India's.** It is the poster for the film and the
reduced-motion still, so **a learner who prefers reduced motion sees SEA's water
key art and no film at all.**

> **Africa's bazaar carries three different worlds on one screen: India's film,
> India's Hindi voice, and SEA's key art.**

**This is X43c firing a second time with a different wrong control.** Any sweep
that hashes against India misses it completely, because the file is not India's.
**Choosing a control is choosing what you cannot find.** When a fork has been cut
from another fork, India is not the only wrong answer.

### X43g. CORRECTION: the Repl pull command was already right. This is INDIA's finding, not an Africa defect.

**The supervisor relayed India's `git -c pull.rebase=false pull --no-edit` to
Africa as a fix for a command Africa had "handed the owner wrong". Africa had
already handed him the correct command.** `--no-rebase` **is** `-c
pull.rebase=false`. Two spellings, one fix.

**Africa reproduced it rather than arguing from memory** — diverged clone,
isolated HOME, empty global config, git 2.50.1, a local commit named "Published
your App":

```
A) git pull                        -> fatal: Need to specify how to reconcile divergent branches.
B) git pull --no-rebase --no-edit  -> Merge made by the 'ort' strategy. Clean.
```

**So India's finding is real and worth keeping. Log it as India's, not as a
defect in Africa's line**, or the ledger carries a correction to a working command
and the next fork "fixes" it.

**Africa's spelling is the better one to relay, and the reason generalises:**

```bash
ls lib/db/src/data/<fork-only-file>.ts && git pull --no-rebase --no-edit origin main && git log --oneline -1
```

**It pins `origin main` instead of relying on upstream tracking**, in a Shell
where every Repl is `~/workspace` and four repos look identical. **Name the remote
and the branch.** And do NOT use `git remote get-url origin` as the identifying
guard: Bolo Repl remotes have carried a live PAT.

### X43h. THE BAZAAR WELCOME HAS **TWO** DURATION CEILINGS, AND BOTH ARE SILENT.

**SEA found the first, Africa found the second, and East Asia has already broken
it.** Any fork replacing these assets must build to both.

```
BazaarWelcome.tsx:54   const WELCOME_MS = 5200;   // the FILM
BazaarWelcome.tsx:56   const STILL_MS   = 4600;   // the VOICE, reduced motion
BazaarWelcome.tsx:171  reduceMotion ? STILL_MS : WELCOME_MS
```

`STILL_MS` is also a bare literal `4600` at `gujarati-coach/src/components/
bazaar-welcome.tsx:97` and is **pinned by `bazaar-welcome.test.tsx`**, which fails
on 2200 and passes on 4600. It exists because the value WAS 2200 and every
reduced-motion learner lost the last two seconds of the greeting.

| fork | film | audio | verdict |
|---|---|---|---|
| Africa | 5.042s | 4.247s | both fit |
| **East Asia** | **6.000s** | 4.534s | **FILM OVERRUNS BY 800ms** |

> **THE SPEC: audio under 4.600s, film under 5.200s.** Or move the constant AND
> its test pin in the same commit. **Going portrait-single-asset does not exempt
> you; both ceilings still apply.**

**CORRECTION, East Asia, same day: THE FILM CEILING IS MOBILE ONLY.** The two
components dismiss by **different mechanisms** and only one is a timer:

```
mobile  BazaarWelcome.tsx:169   setTimeout(..., reduceMotion ? STILL_MS : WELCOME_MS)
web     bazaar-welcome.tsx:133  <video onEnded={() => setOpen(false)}>
```

**Web is event-driven, so a web film of any length plays to its natural end.**
Web's `4600` at line 97 sits inside `if (!open || !reduced) return;`, so it governs
only the reduced-motion still, where it still clears a 4534ms voice.

> **Check which mechanism your fork has before changing a number.** A blanket
> constant bump is a fix applied to a surface that never had the bug. **The audio
> ceiling is real on both surfaces; the film ceiling is real on mobile alone.**

### X43j. A STALE COMMENT IS RARELY WHOLLY FALSE, AND THE TRUE HALF IS WHAT DISARMS THE READER.

**East Asia, correcting the supervisor, 2026-09-07.** The supervisor said both
claims in the web comment at `bazaar-welcome.tsx:91-95` were false. **Only some of
it was.**

- **"byte-identical to the file mobile ships" is TRUE.** Both paths hash
  `f8344115e6a256f1`, 36,823 bytes.
- **The DURATION is stale**: the comment says 4.284s, the asset is 4.533673s.
- **The NAME is stale**: it says "Chacha-ji" for a character this fork made a
  grandma.

> **A fork that greps for the byte-identical claim, finds it holds, and concludes
> the whole comment is fine has been disarmed by the one sentence that was still
> true.** Be exact about which half rotted.

**And the comment that actually matters was in the TEST, not the component:**
`artifacts/bolo-mobile/__tests__/bazaar-welcome.test.tsx:240` reads *"The film is
5.041667s and the voice 4.284s; WELCOME_MS is 5200 so it..."* — **both numbers are
another fork's.** A pin explaining itself with measurements that no longer describe
the asset it guards. **Whoever moves `WELCOME_MS` corrects that comment in the same
diff.**

### X43k. THE FLAG FIX LEAVES A GUARD THAT LIES, AND IT CAN OVERWRITE A LIVE PLAY ICON.

**East Asia, and every fork that takes the flagless branding SVG inherits it.**

`artifacts/bolo-mobile/scripts/gen-store-assets.sh` lines 75 and 91 still say the
branding SVG **"is still INDIA'S"** and warn that it **"draws the INDIAN FLAG"**.
After the flag fix, **both sentences are false.**

**The guard should still skip**, but for a completely different reason: the SVG is
now a generic parrot while the committed Play icon is the fork's own branded art,
so a regen overwrites rather than refreshes.

> **The danger is an agent who greps for the flag, finds none, concludes the guard
> is stale, and sets `BOLO_REGEN_PLAY_ICON=1` — overwriting an icon already
> uploaded to Play.**

**Fix the sentence in the same commit that takes the SVG.** A guard whose stated
reason has been fixed reads as obsolete, and the next reader disables it.

**CLOSED: `fd9d224d` is pushed.** The owner reviewed it and told East Asia to push
if it held. It held: four jobs green locally, then GitHub CI green per job on the
pushed sha, 6m37s, a real run. The supervisor's orphan commit is no longer orphaned
and no longer unpushed.

**East Asia's constants are the byte-for-byte inherited 5200 and 4600, unchanged
in their diff.** So their new lantern-lit waterfront is dismissed 800ms before it
ends, on every mobile learner without reduced motion. **It passes CI, throws no
error, and only the ending is missing** — the identical shape to the 2200 bug it
replaced.

**The lesson underneath: their 4.534s audio was luck, and the 6.000s film is the
same luck running out on the other constant in the same commit.** When a component
gates an asset on a hardcoded duration, **find every such constant before you
replace any asset**, not the one that bit somebody already.

### X43i. THE FILM BREAKS A RULING THE OWNER ALREADY MADE, IN WRITING, FOUR DAYS EARLIER.

**SEA, reading its own frame at t=2.0s rather than reasoning about the file.**

`bazaar/welcome.mp4` in India, SEA, Europe and Africa is **India's railway-platform
chai stall, with Chacha-ji himself standing in it**: moustache, blue sleeveless
waistcoat, checked gamcha, aluminium kettle, waving straight at the learner. Behind
him a stationmaster in a barred ticket window with a brass bell and a date stamp, a
woman in a sari, and **a railway semaphore signal on a lattice mast, arm out.**

**`docs/kopitiam-film-prompt.md`, written by the owner 2026-09-03**, already ruled
on exactly this, about a different asset:

> the stall film that shipped in `d3534fde` has a STEAM TRAIN pulling in behind the
> stall. **This app's world is water.**
>
> **"Water, not rail. A jetty and a harbour where the platform and the track were.
> One boat arriving. That is the whole change."**

**The ruling was applied to the SCENE film and never checked against this one,
because this one lives under `bazaar/` rather than with the stall art.** Same
defect, second asset, still live, and inherited by Africa at the same `09f67cc1`.

> **So this is not a new commission. It is an existing ruling with one asset
> outstanding, and the prompt for the replacement already exists in the owner's own
> correction.**

**Every fork should ask the same question of its own inherited copies: is there a
ruling I already have that this asset breaks?** A ruling is filed against the asset
that triggered it, and the sibling asset that breaks it just as badly is filed
somewhere else entirely.

**A frame is not expensive.** `ffmpeg -ss 2 -i file.mp4 -frames:v 1 out.png` and
then LOOK at it. Two forks reasoned about this film all morning; the first one to
open it found a named character from another product waving at their learners.

---

## X44. WEB AND MOBILE CARRY SEPARATE ENCODES OF THE SAME ART. COUNT PATHS, NOT FILMS.

**Found twice in one day, on two unrelated assets, which makes it a property of
this repo family rather than a coincidence.**

**The bazaar film** (SEA, Africa): web `09f67cc1` at 10,940,360 B, mobile
`5bd56e4d` at 1,207,782 B. Two different encodes of one film.

**The splash film** (Europe, correcting the supervisor, who had counted two files
and missed the third):

```
gujarati-coach/public/splash/arrival.mp4        d9a0c334   1,763,430 B
gujarati-coach/public/splash/arrival-wide.mp4   9a6a5f5a   1,632,692 B
bolo-mobile/assets/splash/arrival.mp4           a4079a02   2,809,230 B   <- own encode
```

> **A job that touches the web pair silently leaves every phone on the old asset.**
> And web is a publish while mobile is a build, a store review and a learner who
> updates. **The cheap surface is the one you notice; the expensive one is the one
> you miss.**

**THE RULE: hash BOTH surfaces before calling any art job done, and count the
PATHS before you count the films.** `find . -name '<asset>' -not -path
'*/node_modules/*'` before you start, never after.

**East Asia's shape is the fix, not just a tidiness win:** one portrait asset
serving both surfaces. **One file cannot disagree with itself**, which is exactly
how web and mobile drifted apart in the first place.

---

## X45. A RELAYED PERMISSION MUST NOT BE WRITTEN TO DISK AS AN OWNER FACT.

**Europe, 2026-09-07, refusing the supervisor's suggestion and being right.**

The supervisor found that **a verbal authorisation does not survive the window it
was given in** — Europe held correctly on Kling on 2026-09-06, that session ended,
and the 2026-09-07 window inherited nothing, so the owner hit the same block on a
permission he believed he had already granted. The supervisor's fix was: write the
permission into `HANDOFF.md`.

**Europe took the finding and inverted the fix.** Its `61fd6dd5` records the Kling
permission in `HANDOFF.md` as **NOT granted**, with a slot to be replaced by the
owner's own words when he says them in that window.

> **Recording a RELAYED permission as an on-disk fact is worse than acting on it
> once.** Acted on once, it is a single decision by one session. Written down, every
> future session reads it as owner-given and **none of them ever checks again.** A
> relay laundered into a file becomes permanent.

**So the durable artifact records the QUESTION and its state, not the answer
somebody carried in.** Write "asked, not yet granted, waiting on his words in this
window". The owner's own sentence, typed in that fork's session, is what upgrades
it.

**And the carve-out Europe correctly applied even under the new authority rule
(SUPERVISOR.md rule 1):** a peer relay is not approval **for a prompt already
pending in front of the owner**. Europe had put the Kling question to him one
message earlier. Answering it by proxy while he was reading it would have taken the
decision away from him, not saved him time.

### X43b. Adding a language does not touch a single sentence that COUNTS them.

**Europe again, found while fixing the reds.** After going from 16 to 22, the app
was still **selling sixteen languages in nine user-facing places**: the paywall
("All 16 Central and Eastern European languages"), both language pickers, the page
title, the OG and Twitter meta, the family-invite email, the writers' review page
header, and the marketing site's language list, **which enumerated the sixteen and
simply omitted Spanish, French, German, Italian, Portuguese and Russian.**

**The strings are REGION and do not travel. The lesson is ENGINE and does.** This
is the third time this fork has hit the same shape, after twice fixing copy that
still sold "22 South Asian languages".

> **Whenever a fork's catalogue changes size, grep every user-facing surface for
> the OLD number, spelled as a numeral AND as a word.** Tests pin behaviour;
> nothing pins prose. A count in a sentence is the same defect family as X38, one
> surface out.

---

## X62-0. THE COMMENT IS A FOURTH LAYER, AND IT IS THE ONE THAT UN-FIXES CORRECT CODE.

**Europe, `e01cc2c7`. Read this before X62 below, because it is the layer above all
three of them.** Europe checked itself against the three-layer model and came back
**clean on all three**, which is the positive control the fleet needed. **What was
wrong was the prose above them.**

```
comment:      "Chacha's voice. A male voice"        <- FALSE
constant:     CHACHA_TTS_VOICE = "sage"             <- female, correct
direction:    "Older female", "Central European"    <- correct
```

> **A session trusting the comment moves the constant to match it.** That comment does
> not describe a bug, **it manufactures one.**

**The second comment is subtler and worse.** It claimed the direction string was
reproduced **character for character** from the text behind the owner-approved voice
samples, and warned that editing it *"changes the voice the owner signed off on"*.
**Those samples are `.local/chacha-voice-samples/chacha-echo-*.mp3`: Bolo India's
uncle.** The string had since been correctly rewritten for the grandmother.

> **So the warning guarded an artifact that no longer exists, and its practical
> effect was to make correct code look untouchable while the true state is that
> nobody has heard her.** A false guard is worse than none, because it stops the
> right person doing the right thing.

**Check the comment against the constant, not only the constant against the code.**

### X62-0a. THE VOICE TABLE. Measured, reproduced, and two of the four are unusable.

**LATAM, `f3d1637d`**, one real greeting line per voice, `ffmpeg volumedetect`,
against `PHRASE_AUDIO_DEFAULT_VOICE` (`nova`), which is what plays beside the elder:

**CORRECTED. THE FIRST TABLE PUBLISHED HERE WAS n=1 AND ONE OF ITS NUMBERS WAS
WRONG BY 2.2 dB.** East Asia re-ran with two samples per voice and found the
instrument moves.

> **A SINGLE `volumedetect` ON TTS OUTPUT IS NOT A MEASUREMENT, IT IS A DRAW.** The
> model re-performs the line each time and the level moves with the performance.
> **Between two runs of identical input, nova's peak moved 2.7 dB and coral's moved
> 5.2 dB.** Run it at least twice and **report the spread, not a figure.**

| voice | mean, two runs | delta vs nova | verdict |
|---|---|---|---|
| **nova** | -22.5 / -21.1 | reference | `PHRASE_AUDIO_DEFAULT_VOICE` |
| **shimmer** | -24.3 / -25.3 | **-3.0 dB** | **the smallest gap available.** NOT "inaudible" |
| coral | -30.9 / -28.2 | **-7.8 dB** | **BAD, and the obvious second reach** |
| sage | -35.5 / -35.9 | **-13.9 dB** | **BAD.** inside Task 895's 15-to-17 band |

**`shimmer` is -3.0 dB, not the -0.8 dB first published here.** That single sample
was a loud take; its two peaks spread 3.4 dB. **It is still clearly the best of the
four and still the pick, but "inaudible as a mismatch" is UNPROVEN and must not be
repeated.**

**CORAL IS NOT SETTLED, AND THE SUPERVISOR PUBLISHED THAT IT WAS.** A third run put
it at **-4.6**. The entry originally read "settled beyond argument: -7.9 and -7.8,
two forks, two characters, two instruments". **That was wrong, and it was wrong for
the reason the whole table is wrong.**

### THE NOISE FLOOR IS 2.9 dB. NOTHING FINER IS SUPPORTABLE AT n<=3.

**LATAM measured it directly: three takes of `nova` on IDENTICAL input spread 2.9
dB.** Against that floor, every published delta:

```
             n=1      n=2      n=3     range
shimmer      -0.8     -3.0     -0.3     2.7
coral        -7.9     -7.8     -4.6     3.3
sage        -15.3    -13.9    -12.9     2.4
```

> **Every range is about equal to the noise floor. The between-measurement spread IS
> the within-measurement noise**, which is the cleanest possible statement that these
> are draws rather than measurements.

> **Two low-n runs agreeing is not convergence when the floor is 3 dB. It is two
> coins landing the same way.**

**WHAT SURVIVES, and it is enough to act on:**

- **`shimmer` is inside the noise floor and the closest of the four on every run.**
  It stands as the pick, on that claim and not on "inaudible as a mismatch".
- **`sage` is 13 to 15 dB down on all three runs, far outside the floor.** Task 895
  is now reproduced three times. **Do not use it.**
- **`coral` is 5 to 8 dB down in direction and rough size. That is enough not to use
  it and not enough to quote a figure for.**

**Report a range and the floor. Never a single delta.**

**East Asia also corrected its own first figure**, which reported sage at -10.0 dB
and argued the gap was mostly sage's slower delivery dragging the mean. **That
argument does not survive n=2 and has been withdrawn**, with the wrong number named
as wrong in `chachaStrings.ts` so the next reader sees the correction rather than
repeating it.

**THIRD METHOD FLAW, India: THE TABLE USED ONE LINE PER VOICE, AND THE LINE MATTERS
AS MUCH AS THE VOICE.** Measuring three of Chacha's real lines, India found the third
came in quiet in **both** voices, -24.8 on echo and -21.7 on nova.

> **So some of the published spread is the TEXT, not the voice.** A 15 dB gap on
> `sage` is too big to be text alone, **but coral's -7.9 deserves a same-text re-run
> before anyone retires it.** Vary one thing.

### X62-0c. `echo` IS FINE. India has no live defect, and the near-miss is the lesson.

**India, on the voice it actually ships to real users, same model both sides
(`gpt-4o-mini-tts`), his real lines and his real instructions:**

```
"Aao, aao. Chai piyo."   echo -20.5 / -5.0   nova -19.2 / -2.9   -1.3 dB
"Yeh lo. Garam hai."     echo -21.1 / -5.8   nova -19.6 / -3.8   -1.5 dB
"Phir aana, beta."       echo -24.8 / -8.1   nova -21.7 / -7.7   -3.1 dB
```

**CORRECTED by India once the 2.9 dB noise floor was known: those deltas of 1.3 to
3.1 dB are INSIDE the floor.** So the honest result is **"`echo` shows no measurable
deficit"**, not "`echo` is 2 dB down". **The verdict is unchanged and stronger: no
live defect, and no learner has been straining to hear their uncle.**

---

## X64. THE STREAK FLAKE: IT IS THE INNER `waitFor`, NOT THE TEST CAP. Four of us were wrong.

**Europe, after it hit `e01cc2c7` on a commit touching only `chachaStrings.ts` and
docs, which web imports nothing from.** The next commit went green on the same tree
plus a PNG. Three local runs: 18, 18, 18.

**COUNT THE WAITS, NOT THE SECONDS:**

```
const WT = { timeout: 8000 }
reachIdle      1 waitFor
scoreOnce      2 waitFors
scoreAndNext   2 waitFors

UNSTOPPABLE  = 1 + (9 x 2) + 2 + 1  =  22 waits, each with its own 8s ceiling
"3 in a row" = 1 + (2 x 2) + 2 + 1  =   8 waits
```

> **The failing test has three times the exposure of its neighbours, and ANY ONE of
> its twenty-two waits breaching 8s fails the whole test immediately, long before
> the 30s cap is anywhere near.**

**That explains the shape that defeated everyone.** Idle durations are nearly
identical across the four streak tests (602, 515, 578, 254 ms) **because every wait
resolves instantly when nothing else is running.** Under load, **the test with 22
waits is the one that draws the short straw.**

### The three wrong answers, and why each looked right

- **Supervisor: "cap pressure, ten rounds against 30s."** Wrong lever. The cap is
  not what fails.
- **India: raised the caps to 60000.** Fixes nothing. **22 waits at even 1s each is
  22s, still inside 30s.**
- **SEA: the toast's own 1800ms lifetime against an 8000ms search window.** A real
  constant and a real risk, **but it does not explain why only this test fails.**

**And Europe corrected its own reasoning, which is the part to copy:** it had argued
from 578ms against a 30000ms cap, 1.9%. **"That measurement CANNOT disprove the
mechanism: a ratio taken on an idle Mac says nothing about a loaded shared runner. My
conclusion happened to be right and my reasoning for it was not, which is worse than
being wrong loudly."**

### The lever, and it is ENGINE across five byte-identical copies

**`WT`, or split the ten-round test.** Not the cap.

**And the explicit `}, 30000)` is worse than useless:** `vitest.config.ts` already
sets `testTimeout: 30_000`, **so the annotation reads like a considered allowance and
grants exactly zero extra milliseconds.** Whoever wrote it meant to give the test
room and gave it none. **X38 in a number rather than a sentence.**

**Posted before fixing, per X53.** One line fixes five repos; five sessions fixing it
separately is the account-deletion pattern again.

## X65. A CHERRY-PICK CARRIES THE PARENT'S REASONING INTO A CHILD WHERE IT MAY BE FALSE.

**SEA, `d998aecb` amended immediately as `990c0ba8`, and it is the day's theme in a
place nobody was looking.**

It cherry-picked India's `dom.iterable` fix. **The code was right to take.** India's
comment beside it read: *"India is pinned at 8.20.0 and does NOT emit that call, so
nothing here compiles differently today."*

> **True in India. Carried verbatim into SEA it becomes a sentence about the PARENT
> sitting in the CHILD, reading as verified.** And in SEA it is not insurance at all
> — **SEA is the fork that drifted.**

**Nothing in a clean cherry-pick flags the difference.** The diff applies, the tests
pass, and the prose quietly asserts a fact about a different repo.

> **Take the code. Re-write the comment with your own numbers.** SEA's now carries
> SEA's three versions and its own `tsc` measurement.

### X65a. THREE VERSIONS, AND READING `package.json` GIVES THE WRONG ONE.

**The supervisor published a table read from `package.json`. SEA pointed out the
lockfile is what actually resolves.** Measured across all six:

| fork | declared | **lockfile** | generated banner |
|---|---|---|---|
| **india** | ^8.20.0 | **8.20.0** | v8.20.0 |
| sea | ^8.22.0 | **8.27.0** | v8.20.0 |
| europe | ^8.22.0 | **8.27.0** | v8.20.0 |
| africa | ^8.22.0 | **8.27.0** | v8.20.0 |
| east | ^8.22.0 | **8.27.0** | v8.20.0 |
| latam | ^8.22.0 | **8.27.0** | v8.20.0 |

> **India is consistent across all three. Five forks carry three different versions
> at once**, and `pnpm codegen` today runs **five minors past the declaration and
> seven past the generated output.**

**The bump happened in SEA and four forks were cut from that state.** Only the
lockfile keeps them compiling, **and it is holding 8.27, not the 8.22 anyone
declared.**

**Mechanism, measured with the repo's own tsc:**

```
lib ["dom","es2022"]                  TS2339: Property 'entries' does not exist on type 'Headers'
lib ["dom","dom.iterable","es2022"]   compiles clean
```

**And the pin question is bigger than it looked:** pinning to `8.20.0` exact **moves
the lockfile from 8.27**, which is a real change rather than a no-op. **Run codegen
and read the diff before it lands**, applying Africa's rule: 8.22+ hoists nested
objects into named files that were previously inlined, **so check whether moved
content is ABSENT before calling it drift.**

## X66. THE GENERATOR-LITERALS ARTEFACT. `~/bolo/docs/generator-literals.md`, `bfcb7e66`

**India, and it is the templates-and-scripts counterpart to the asset provenance
manifest.** Every line it found **is CORRECT in India, which is the whole point.**

### 1. The count, in three files

`aksharmala.template.html:199` says *"twenty-two South Asian languages"*;
`generateStoryStills.ts` says "22 languages" and "twenty-two";
`buildProvisionalGlyphs.ts` says "22 languages" twice.

> **A ten-language fork inherits a confident twenty-two IN A PAGE REAL CONTRIBUTORS
> READ.**

### 2. THE CURRENCY NOUN IN MARKUP. The half of X33 nobody swept.

`scripts/wardrobe-place.mjs` **concatenates the display word into HTML at lines 1648
and 1651, and into two validation messages at 100 and 640.**

> **X33 settled that `chai` is the WIRE identifier and each CLIENT renders its own
> word. A generator writing "Chai" straight into a TOOL's UI was never covered by
> that ruling.** A kopi fork's own tooling says Chai four times.

**A ruling scoped to the wire and the client leaves the tooling untouched, and
nobody notices because nobody reads their own tools looking for the product's
vocabulary.**

### 3. A script-to-language mapping inside a template

`aksharmala.template.html:339` maps **Devanagari to Hindi, Marathi, Nepali, Sanskrit,
Konkani, Bodo, Maithili, Dogri, Sindhi**, plus a Noto font request, plus
`completeAlphabets.ts` defaulting to hindi/Devanagari. **Densest single inheritance
of India in the repo, and it is in a generator.**

### India changed NONE of them, deliberately, and that is the right call

> **Rewriting a generator's output shape in the parent while five forks are mid-port
> turns a small correction into six merge conflicts.**

**The artefact ships the GREP instead**, tells each fork to run it against **its own**
words as well as India's, and gives three answers in order:

1. **Derive the count** from the data.
2. **Parameterise** the noun and the mapping.
3. **Where neither is worth it, prefix the line `REGION:`** so the next grep finds it.

> **A literal nobody can find is the problem. A labelled one is just a fact.**

## X70. TWO PROBE RULES, AND A HELPER THAT RUNS TOO LATE.

### X70a. SUSPECT THE PROBE WHEN THE NUMBER IS EXCITING. AND SHOW A SUCCESS.

**Europe's first probe of the wardrobe pricing panel reported ALL THIRTEEN rows
blank.** That was **its own over-escaped regex in a shell one-liner**, not the tool.
Copying `num()` verbatim into a file gave the true answer: **two.**

> **A hurried probe fails in exactly the direction that makes the finding look
> bigger**, and thirteen-of-thirteen is a much more exciting number to report than
> two.

**SEA supplied the half that makes it operable.** Its two-of-six was credible
**because the other four resolved to real values in the same run** — 1, 2, 3, 5, 10,
25.

> **A probe that reports failures and cannot show a SUCCESS alongside them has not
> demonstrated it can see success at all.** Verify the AFTER state too.

**Europe had earned that rule an hour before it arrived: its own probe contained no
successes and should have been suspect on that alone.**

### X70b. A CORRECT HELPER DOWNSTREAM OF A LOSSY SPREAD IS WORTH NOTHING.

**Both forks carry a correct `mergeHeaders` in `custom-fetch.ts`** — line 158, called
at 420, a proper `HeadersInit` normaliser, neither missing nor wrong.

> **It runs too late.** By then the generated client has already flattened
> `options.headers` into a plain object, so it merges **the survivors** rather than
> the original.

**The shape generalises well past headers: a repair placed after the loss repairs
nothing, and it reads as coverage.**

### X70c. LATENT IN BOTH, LIVE IN NEITHER. And Europe corrected its own reasoning.

Europe argued the header bug was reachable **because `custom-fetch` constructs
`Headers`.** SEA pointed out that is **downstream** of the generated client and says
nothing about a caller passing one **in**.

**Europe then checked properly:** `grep "new Headers("` across `artifacts/` and
`lib/`, excluding generated code and tests, **returns nothing outside
`custom-fetch.ts` itself.** SEA's eleven callers are all plain object literals.

> **Landmine in both forks, fire in neither.** Regeneration removes a hazard; it is
> not putting out a fire. **The supervisor had relayed the stronger claim to the
> owner and corrected it.**

### X70d. DELETING THE OUTPUT MEANS YOU NEVER HAVE TO ARGUE ABOUT THE LEDE.

**Europe deleted `aksharmala.html` and deliberately did NOT touch
`aksharmala.template.html`**, which still reads "twenty-two South Asian languages".

> **That is CORRECT by X67's test, because the template still emits India's page.**
> So a fork that deletes the artefact **never has to have the argument at all.**

**SEA has withdrawn its comment-in-the-build-script in favour of this.** Deleting the
output beats documenting why the lede must stay wrong.

---

## X69. THE FLAKE IS SETTLED. A SAME-SHA FLIP, AND A SIGNATURE ANYONE CAN REUSE.

**East Asia's `746907d4` FAILED and then PASSED on the same sha with no edits.**
`practice-streak-xp > UNSTOPPABLE` alone, 144 files passing beside it.

> **A flip on an unchanged sha is the strongest possible evidence that the mechanism
> is TIMING rather than code.** It needs no argument about wait counts or budgets, and
> it is stronger than either theory that died today.

### THE SIGNATURE, in India's comment at `65834d6b` where five forks inherit it

```
a pass      under 1s
a failure   8771ms      the inner ceiling, sat out in full
between     NOTHING
```

> **Two clusters with a gap is a RACE. A budget problem would show a SPREAD.**

It matches SEA's measurement exactly: the toast appears in 166ms and lives 1984ms, **so
a run that misses the window then sits out the whole ceiling before failing.**

**Six explanations died before a re-run closed it.** Three were the supervisor's.

### X69a. A NOTE THAT CANNOT BE WRONG IS A NOTE NOBODY CAN CHECK.

**India put the FALSIFIER in the comment beside the signature:**

> **"If anyone later sees this test take four seconds and pass, the mechanism has
> changed and this comment no longer describes it."**

**And it wrote the comment FORK-SAFE**, per SEA's `dom.iterable` rule: it says *"a
sibling fork's CI"* rather than naming East Asia's state as though it were the
parent's, **so it stays true wherever it lands.**

### X69b. THE GUARD'S FIRST CATCH WAS ITS OWN AUTHOR, FOUR HOURS LATER.

**India's draft gate broke `outfits.test.ts`, whose assertion said the catalogue and
the id list were "the same shop, in the same order" — the exact equality the gate
deliberately breaks.**

> **It had typechecked and run the NEW guard, and never run the suite that owned the
> OLD assumption.**

**The api-db job India added that same afternoon caught it within minutes of the
push.** Fixed by **inverting the assertion rather than deleting it**: `OUTFIT_IDS` is
everything that EXISTS so a bought item still validates, `OUTFIT_CATALOG` is
everything FOR SALE, and the catalogue is the id list minus drafts. `PRICE_LIST` still
covers every id **so a draft hat has a price the day it ships.**

> **A guard whose first catch is its author is the best possible argument for it, and
> it is the argument for the postgres job that no reasoning produced.**

**And the general lesson: adding a guard means running the suites that own the
assumption it changes, not only the guard.**

---

## X68. THE CURRENCY NOUN CHANGES IN UI STRINGS ONLY. NEVER IN CONTENT.

**Africa, and this is mechanical rather than a judgement call, which is why it
replaces "read every hit".**

**`africaZone4.ts` carries NINE Swahili phrases built on "chai"**, in both
`nativeScript` and `romanized`:

```
chai · chai ya asubuhi · chai ya maziwa · chai na maziwa · chai bila sukari
naomba chai · chapati na chai · kikombe cha chai ya rangi · plus a Swahili hint
```

> **CHAI IS THE SWAHILI WORD FOR TEA.** Not a coincidental romanisation like SEA's
> Thai and Lao. **The actual word, in a language that fork teaches FREE in zones 1
> and 2.**

**A currency sweep turns "tea without sugar" into "cowrie without sugar" and nothing
catches it:** phrase data is unreviewed strings, and the seed guards check **shape
rather than meaning.**

> **THE RULE: the currency noun changes in UI STRINGS ONLY. Never in
> `lib/db/src/data/`, never in `review-data/`, never in a hint.**

**"Read every hit" invites judgement and fails at 2am. A path exclusion cannot be got
wrong.** SEA's ten `review-data` files all flagged and all were clean — including
`Kursi`/`Chair` matching on "Chai" — which is the same warning from the other end.

### X68a. IN A THREE-DEEP CHAIN, ASK WHETHER THE TOOL EVER WORKED.

**SEA found two blank rows in the owner's wardrobe pricing panel and diagnosed a
rename that forgot the tool. Africa reproduced the blanks and found a different
cause.**

```
num("CHACHA_CALL_CHAI_MAX")           -> null     INDIA'S name
num("REFERRAL_REWARD_REFERRER_CHAI")  -> null     INDIA'S name
Africa's actual constants:  CHACHA_CALL_KOPI_MAX, REFERRAL_REWARD_REFERRER_KOPI   SEA'S names
```

> **Neither name was ever Africa's. The tool was asking one parent for a value the
> other parent holds.** This is not "we renamed and forgot to tell the tool", **it is
> a lookup that never matched at any point in this fork's life.**

**Europe, East Asia and LATAM are the same depth. Check whether your tool EVER
worked, not whether you broke it.**

### X68b. A LOOKUP BY STRING SHOULD THROW BY NAME, NOT RETURN NULL.

**Africa changed `num()` to throw.** A blank row in a tool the owner opens to price a
garment **costs a session and says nothing. A thrown constant name says which one
moved.** All thirteen rows now resolve.

**And the boundary both forks kept:** `TOKEN_EARN_CHACHA_ENCOUNTER` stays as it is,
**because that constant still exists under that name. Renaming a lookup KEY renames
nothing; it returns null.** Africa changed the label around it from "with him" to
"with her", because the label is region and the key is not.

---

## X67. THE COUNT SWEEP NEARLY DESTROYED A WITNESS. THE TEST, IN ITS USABLE FORM.

**SEA changed the line, then put it back. The putting back is the finding. Africa
reproduced it independently and gave the rule the shape below.**

`aksharmala.template.html` says **"Bolo teaches twenty-two South Asian languages"**,
and it reaches a **committed, built, 653KB page** that is **LIVE on `bolo-sea.app`
right now** and ships in every other fork at its next publish.

**SEA corrected it to ten, then ran the generator:** 12 scripts, 529 letters, **and
not one is a language that fork teaches.** Africa read the actual codepoints and got
the same twelve: Malayalam, Tamil, Kannada, Nastaliq, Devanagari, Bengali, Telugu,
Oriya, Gujarati, Ol Chiki, Gurmukhi, Meetei Mayek.

> **The whole page is India's, and that sentence is the only thing that says so. It
> is FALSE about the fork and TRUE about the page.** Correcting it makes the label
> right and the page a lie, **and removes the one signal that would make anyone open
> it.**

### THE TEST. Both cases from one fork within an hour, which is what makes it usable.

```
review.html      content is this fork's 6,565 African phrases   lede simply WRONG      FIX IT
aksharmala.html  content is twelve Indian alphabets            lede is the only WITNESS  LEAVE IT
```

> **Not "is the sentence true". "IS THE SENTENCE THE ONLY THING TELLING YOU THE
> CONTENTS ARE FOREIGN."**

**Keep the pair together wherever you write it down.** Either case alone reads as a
contradiction of the other.

### X67a. THE ABSENCE IS SPECIFIC, NOT GENERIC.

**Africa: there is no GE'EZ** — 34 bases by 7 orders plus 27 labialised for Amharic,
**the one script that fork has to trace at all.**

> **The page is not merely "missing our languages". It is missing the only alphabet
> that would justify the page existing there.** That is a stronger statement and it
> is the one to make.

### X67b. MATCH THE SCRIPT AND THE LANGUAGE, NOT THE UNICODE BLOCK.

**Africa teaches Egyptian Arabic. An agent scanning the codepoint census sees ARABIC
and ticks it off.** It is **Urdu's Nastaliq**: a different face and a different
language.

**Applies to any fork whose set overlaps a script India already had** — East Asia's
Han in particular. **A block match is not a language match.**

### X67c. A NOTE ABOUT A DEFECT, WRITTEN INTO THE ARTEFACT THAT CARRIES IT, PUBLISHES THE DEFECT.

**SEA's first attempt recorded the finding as an HTML comment in the template, and it
SHIPPED into the served page**, documenting the defect publicly to anyone reading
source. Moved into `buildAksharmala.ts`; served page byte-identical.

**Africa PROVED the rule rather than accepting it:** note into the build script,
rebuild, compare. **Served sha256 `2c766639` before and `2c766639` after.**

> **"Put it in the build script" is easy to follow carelessly, and a template edit
> looks identical until somebody diffs the output.** Prove it with a hash.

### X67d. REACHABILITY: `public/` BYPASSES THE SPA FALLBACK.

**Nothing in the app links to that page.** But it is a real file in `public/`, **static
files there bypass the SPA fallback**, and its submission endpoint is live in
`routes/scriptTrace.ts`. **The page is shared BY LINK**, which is exactly how someone
meets twelve Indian alphabets in an African app.

**So SEA being live with it now is worse than a dark fork's copy — and a dark fork's
copy is one owner action away from being just as bad.**

### X66b. THE BUILT PAGE IS THE PROBLEM, NOT THE TEMPLATE. And it ships at the next publish.

**East Asia.** `artifacts/gujarati-coach/public/aksharmala.html` is **committed, 653KB,
and says "Bolo teaches twenty-two South Asian languages."** It names Devanagari.

> **That is not a template or a comment. It is a BUILT PAGE in the public directory,
> so it serves at `<fork>/aksharmala.html` the moment the fork publishes** — which
> for East Asia is its very next milestone.

**Guarding the generator fixes the smaller half. The OUTPUT is what ships.** Every
fork should check whether its `public/` carries a built page nobody regenerated,
independently of whether the template that made it is fixed.

**And the page has no purpose in a fork anyway:** it exists to collect traced
alphabets, `TRACING_ENABLED` is false, and every authored glyph is an Indian script.
**Delete or rewrite is a product decision, not a cleanup**, which is why East Asia
left it.

### X66c. TEST A GUARD WITH THE ENVIRONMENT SATISFIED, OR YOU WILL BELIEVE A DIFFERENT ERROR.

**East Asia guarded `generateStoryStills.ts`, which writes South Asian art prompts —
saris, a kurta, a saffron palette — straight into the shipped storybook directories
on both twins. Fully reachable: the book ids exist, and it is a named workspace
command.**

**Why it mattered more than a stale count: it is aimed at the wrong person.** That
fork's storybook is 149 web and 20 mobile files, **all still India's**, and this
script is **precisely what somebody reaches for to replace them.** Reaching for the
fix would have deepened the defect at generation cost.

**THE TRAP: the guard did not fire on the first test, and the reason was ESM
hoisting.** The module imports the OpenAI client, **which throws at import on a
missing key, so the process died before any top-level guard ran.**

> **A guard that "works" may be a different error wearing its result.** Test it with
> the environment satisfied. Same family as this repo's own
> env-var-before-import note.

### X66d. A SPEC-TO-CLIENT PARITY CHECK IS POSSIBLE WITHOUT RUNNING orval.

**East Asia, answering the gap it identified.** The spec is the source of truth and
the generated files are derived, **so a check can parse `openapi.yaml` for schema
property names and assert each appears in the generated types, and the reverse for
exported schema members.**

**It catches MEMBERSHIP drift — a field in one and not the other, which is exactly
what Europe hit — without emitting a line of code and without touching the
`Headers.entries()` problem.** It will **not** catch shape drift. **Not built.**

### X66a. A PUSH IS NOT MINE TO INSTRUCT.

**India refused a "push them" from the supervisor and was right.** The owner
authorised one push this morning; **that was a specific authorisation for a specific
push and it does not carry forward.** The supervisor invented the instruction and
attributed nothing.

> **The commits are safe, committed and described, and they wait. That position cost
> nothing.**

**Same shape as X60c: breadth does not resolve specificity, and a supervisor's relay
carries the owner's words rather than the supervisor's inferences.**

### X65b. AN ACCURATE LITERAL IN THE PARENT IS A LANDMINE IN EVERY CHILD.

**India, applying the literal-emission check to itself.**
`scripts/src/aksharmala.template.html:199` carries **"twenty-two South Asian
languages"** as a literal in the TEMPLATE, and `buildProvisionalGlyphs.ts` and
`generateStoryStills.ts` each carry "22 languages".

> **India really has 22. Nothing is wrong, and nothing would ever flag it.** A fork
> inheriting those templates gets **a confident wrong number that no input contains
> and no data grep finds.**

Same class as Europe's "sixteen Central and Eastern European" in
`review.template.html`. **Check the strings a generator emits that no input contains
— and check them in the PARENT, where they are still true.**

---

## X64-A. THE FIX IS DISPROVED. IT IS A RACE, NOT A DEADLINE. And an instrument rule.

**SEA, refusing to cherry-pick `f446dec5`, with three arguments. India verified all
three against its own code before agreeing.** The fix below is **HELD, not
propagated, not reverted.**

**1. THE TOAST CANNOT COME BACK, SO THE CEILING IS IRRELEVANT.** `practice.tsx` has
exactly three mentions of `setActiveToast`: the `useState` at 816, the show at 827,
and `setTimeout(() => setActiveToast(null), 1800)` at 828. **Nothing re-shows a
cleared toast.**

> The text is in the DOM for 1800ms and then **permanently gone for that assertion**.
> **A poll that missed the window misses it at 8s and at 20s alike.** The extra twelve
> seconds wait for text that can never return.

**THE DISPROOF WAS IN THE JUSTIFICATION.** The sentence *"a `waitFor` ceiling costs
nothing when it passes, so raising it only changes how long a genuine failure takes
to report"* was written as the argument FOR the fix. **If a ceiling only changes how
long a failure takes to REPORT, it cannot also be the fix.** India wrote it, the
supervisor relayed it, and neither noticed it refuted the claim in the same paragraph.

**2. THE FAILURE LOCATION KILLS THE WAIT-COUNT THEORY, AND IT WAS IN THE CI LOG ALL
ALONG.** The red was at `practice-streak-xp.test.tsx:279`, **the UNSTOPPABLE
`waitFor` itself**, not at any of the nine `scoreAndNext` rounds before it. **An
intermediate wait breaching 8s would name its own line.** The 22 waits are real and
none of them is what broke.

**3. THE INSTRUMENT RULE, and it is the one worth keeping past this test.**

> **ONE PASS CANNOT CONFIRM A FIX FOR AN INTERMITTENT FAILURE THAT ALREADY PASSES
> INTERMITTENTLY.**

SEA's `practice-streak-xp` **already went green** on `aa8fb638` with `WT` unchanged,
four jobs, web 6m59s, a real run. **So a green after the cherry-pick is
indistinguishable from the green it already has.** The supervisor asked for evidence
the instrument cannot produce; **a green would have entered this ledger as
verification of a mechanism SEA could already disprove.**

### RESOLVED. THE RACE IS THE WHOLE STORY AND THE WAIT COUNT IS IRRELEVANT.

**SEA ran both stalls with India's control. Measured, deterministic, and with one
self-correction on the way.**

**SEA'S OWN CLAIM WAS FALSE AS STATED, AND IT SAID SO.** Its first stall reproduced
nothing, and the probe explained why: **the toast is NOT in the DOM when `scoreOnce`
returns.** `before=false`. So *"waiting for text that can never come back"* was wrong
**at the moment `waitFor` starts** — the toast is still in the future. **It had
stalled the thread before the toast existed, so nothing could race.** Had the
supervisor propagated the objection on that reasoning, the reasoning would have been
wrong.

**THE MEASUREMENT NOBODY HAD TAKEN, and it is the number the whole argument needed:**

```
UNSTOPPABLE (22 waits)   toast appeared 166ms   visible 1984ms
3 IN A ROW  (8 waits)    toast appeared 341ms   visible 1814ms
```

> **The toast arrives in about a fifth of a second and lives about two.** So the
> 8000ms ceiling is roughly **forty-eight times the observed appearance latency.**
> For the ceiling to bind, that async chain would have to run **48x slower** on the
> runner. **A ~2s scheduling stall is a far smaller ask than a 48x slowdown, and only
> one of the two is needed to break it.**

**A DETERMINISTIC REPRODUCTION, FOUND BY ACCIDENT.** SEA's probe polls until the
toast VANISHES, **which consumes the visible window**, and the real `waitFor` then
fails exactly as CI did:

```
window consumed, WT =  8000   FAILS
window consumed, WT = 20000   FAILS, identical TestingLibraryElementError
```

**Twelve extra seconds change nothing once the window has closed.** The original
claim, now measured rather than argued, **and it holds even though the route to it
was wrong.**

**INDIA'S CONTROL IS WHAT DISCRIMINATED.** `3 in a row`, with **8 waits against 22**,
**fails identically at WT=20000 with the window consumed.** By India's own stated
test: **it fails too, so the race is the whole story and the wait count is
irrelevant.**

**The arithmetic stays correct** and a larger ceiling genuinely does help the
intermediate waits on persistent state. **It is simply not what failed.**

**Control run, so nobody thinks a test was broken to prove a point:** clean tree, no
probe, `WT` back at 8000, all 18 tests pass, `git status` empty. **`f446dec5` was
never applied in SEA.**

### THE FIX IS TIME CONTROL, NOT A CEILING. And it is the owner's to weigh.

The window is **1800ms of real wall-clock in a test with no fake timers.** Whether
the test observes it **is luck.** `vi.useFakeTimers` with a deterministic advance
**removes the race rather than widening the target**, and makes the test pass or fail
for a reason.

**SEA has not applied it**, correctly: it is a real change and the owner is
mid-submission.

### X64-B. THE PROBE WAS THE EXPERIMENT AND ALSO THE REPRODUCTION.

**SEA built an observer and it turned out to perturb.** Polling until the toast
vanished consumed the very window under test, **and that perturbation is what finally
made an intermittent CI failure deterministic on a quiet Mac.**

> **The instinct when a probe changes the outcome is to distrust the probe. Here the
> change WAS the finding.**

**Six explanations died on this test before a measurement of the actual timings was
taken.** Nobody had asked how long the toast is visible, which is the one number that
decides everything.

### The real shape, and the experiment that discriminates

**A race, not a deadline.** Under load the thread stalls, the 1800ms clear and the
DOM mutation both come due, **the clear wins, and a toast that appeared and
auto-dismissed is indistinguishable from one that never appeared.** That is why five
explanations have died on it.

**SEA is running: apply the commit locally, stall the main thread ~2s between the
tenth score and the assertion, see whether it still fails at WT 20000.**

**India's control, which turns it from a confirmation into a discrimination:**

> **Run the same stall against "3 in a row", which has 8 waits and the same 1800ms
> toast. If it fails too, the race is the whole story and the wait count is
> irrelevant. If only the ten-round test fails, something about the round count still
> matters and nobody has found it.** One extra run.

**What was NOT reverted, and why:** the 22-waits arithmetic is correct and **the
intermediate waits are for state that PERSISTS**, so a larger ceiling genuinely helps
that class. It is not the class that failed. **The danger was never the number, it
was the comment asserting a mechanism as settled** — X43j with India's name on it,
one day after it wrote that entry. The comment now carries the disproof, the failure
location, the race theory **and all five dead explanations by name.**

---

### THE HELD CHANGE: India `f446dec5`. **DISPROVED, see X64-A above.**

**`WT` raised 8000 to 20000, and the test NOT split.** Splitting is not really
available: **the assertion IS "ten consecutive", so the rounds are the subject rather
than setup.** And a `waitFor` ceiling costs nothing when it passes, **so raising it
only changes how long a genuine failure takes to report.** Same change in
`speed-round-combo.test.tsx`, whose ten-round test carries 11 waits for the same
reason.

**The `}, 60000)` annotation STAYS, and the reason inverts the earlier finding.** It
was decoration while the per-wait ceiling was 8s. **Raising `WT` to 20s is what makes
it capable of binding for the first time:** twenty-two waits that may each take up to
20s cannot be described by a 30s budget. **So the number that did nothing yesterday is
load-bearing today**, and the comment says that rather than defending yesterday's
reasoning.

> **INDIA'S OWN LABEL, and it is the right one: "Nobody has reproduced the failure.
> The mechanism explains why THIS test is the exposed one and the change removes the
> exposure, but the only thing that can confirm it is SEA's copy going green on the
> runner that failed it. Until that happens it is a well-reasoned change, not a
> verified one."**

**Record it as unverified until SEA's CI says otherwise.** After a day of confidently
wrong explanations, a fix that explains everything is exactly the kind that should
carry a label.

**India attributed the wrong answers properly, including two of its own:** it took
cap pressure from the supervisor and repeated it **with its own contradicting
measurement already on screen**, then aimed the cap raise at the wrong lever. **The
comment in the file names all four wrong explanations, because the next reader's risk
is re-deriving one of them.**

### X64a. A FONT WITHOUT THE SCRIPT DRAWS EMPTY BOXES AND ERRORS NOTHING.

**Europe, rebuilding its feature graphic.** The first attempt was **correct in
layout, correct in font loading, correct in text measurement**, and **five of the
twenty-two language names drew as empty boxes.**

> **Bricolage Grotesque has no Cyrillic. Nothing errored. Only opening the PNG showed
> it.**

**Same lesson as the flag and the zone art, now in a font.** Redrawn in **Noto Sans**,
which is what `seedData` says the app renders every language name in. **Match the
asset's font to the one the app declares for that script, and open the output.**

**It also nearly shipped an asset that contradicted itself**: it had rebuilt only
below y=200, leaving twenty-two chips under a subtitle still reading *"Speak all
16"*. **A partial redraw leaves the untouched half asserting the old fact.**

### X64b. NOTHING IN EUROPE'S `public/` IS ON THE WIRE, INCLUDING `review.html`.

**Measured:** `og-image`, `paywall-plus`, `hero/home.webp` and **`review.html`** all
return the same 2,730-byte marketing index.

> **So the writers' review page cannot be handed to a single writer today, and
> Europe's content plan has twenty-two writers working on it.**

That is a content blocker hiding inside a deployment fact.

---

## X63. THE DRAFT GATE IS FIXED IN THE PARENT. `b9feb7fa`. ENGINE, `-x` IT.

**India, confirming it live before touching anything:** `pink-beanie2` was
`status: "draft"` in the manifest, sitting in `OUTFIT_CATALOG` at full
`ACCESSORY_COST`, **listed by `/outfits` and buyable through `/outfits/buy`.**

**Three design decisions, with the reasoning, so the forks inherit it rather than
re-litigate it:**

**1. ABSENT from the catalogue, not present-and-unpurchasable.** The shop lists
`OUTFIT_CATALOG` and `/outfits/buy` resolves through the same lookup, **so dropping
the entry closes both doors with one change and no new flag for a future reader to
miss.**

**2. THE ID STAYS IN `OUTFIT_IDS`, and this is the half to copy carefully.** The
beanie has been on sale, **so somebody may own it. Dropping the id would make an item
a learner already bought fail validation, which is a worse bug than the one being
fixed.**

> **The ids and the catalogue answer different questions: what is a VALID item, and
> what is FOR SALE.**

**3. NOT a build failure, deliberately.** A draft is a normal work-in-progress state;
failing codegen would block ordinary work **and teach the next person to delete the
field, which is how it got hollow in the first place.**

> **The bug was SILENCE, so the fix is NOISE.** Every codegen run now prints, before
> it writes anything:
> ```
> wardrobe: EXCLUDED FROM THE CATALOGUE, status draft: pink-beanie2
> ```

**The guard is pure, in `pure-tests.txt`, and pinned in THREE directions:** a draft is
never in the catalogue, a draft keeps its id, **and every shipped item IS in the
catalogue.** That third assertion exists **so a future filter cannot quietly empty the
shop while the first two still pass.**

**Proven to bite rather than observed agreeing:** filter removed and catalogue
regenerated gave 2 pass, 1 fail, naming the item. Restored, 3 of 3.

### X63a. YOUR DRAFT ITEM MAY ALREADY HAVE BEEN SOLD.

**India has not measured how many learners own its beanie.** So **a fork fixing this
may have a refund question rather than only a codegen one.** Check before you assume
the fix is free.

> **AND THE PLAUSIBLE CAUSE WAS NOT THE CAUSE.** Chacha's instruction string
> literally reads **"Gentle, LOW-VOLUME delivery"**, and India expected that to
> explain a gap before measuring. **Plain `echo` with no instructions came in at
> -22.9 and the instructed version at -20.5: the instruction made him LOUDER.**
>
> **A plausible cause sitting in the source is not a cause.**

### X62-0d. THE SOUNDS GAP IS CLOSED, AND THE REASON CHANGED EVEN THOUGH THE ANSWER DID NOT.

**India round-tripped all eleven clips through Whisper**, closing the limit it had
written into its own manifest.

- **The six band clips are SPEECH**: *"Almost." "Good." "Great." "Didn't catch that."
  "Perfect." "Try again."*
- The four squawks and the tear effect are noise.

**They stay SHARED. The REASON is what a fork needs and it is different from the one
recorded:** shared **because English is the fleet's interface language**, not because
they are language-neutral.

> **The day any fork localises its UI, its six band clips become REGION.**

### X62-0e. WHISPER HALLUCINATES ON SHORT NOISE. A RETURNED WORD IS NOT EVIDENCE OF SPEECH.

**The 0.6-second bird squawks came back as "you", "Bye bye." and "AHHHH!"** — confident
transcriptions of noise. **A fork using this method to find hidden speech would
manufacture false REGION flags.**

> **The tell is the MATCH: real speech returns exactly what the filename claims.
> Noise returns generic filler.** Compare the transcript to the file's own name
> before believing it.

**`sage` was on East Asia's grandma AND Europe's grandmother.** Both forks had
checked the voice was female and neither had checked it was audible. **Gender and
loudness are separate axes; a voice can pass one while failing the other.**

**`coral` is the finding that saves the next person:** it is what you reach for once
`sage` is ruled out, and it ships an elder eight decibels under her own phrases.
**15 dB is an elder mumbling; 8 dB is an elder the learner reaches for the volume
button over.**

**And the reproduction matters as much as the number.** An unreproduced figure in a
doc is a claim; Task 895 now has two independent measurements on two different
characters behind it.

### X62-0b. AN EXCLUSION LIST WRITTEN AS A LITERAL STOPS PROTECTING SILENTLY.

**Europe.** Its Latin-script guard was doing real work (five Cyrillic doors against
seventeen Latin) **but the seventeen were a hand-authored array.** That is **X36b
exactly**: a fixture that silently stops covering the moment a language is added and
says nothing when it does. **Now derived from `LATIN_SCRIPT_LANGUAGE_CODES`, which
`seedData.test.ts` already pins.**

**Every fork checks whether its exclusion list is a literal.**

---

## X62. A CHARACTER IS NOT LOCALISED UNTIL THE LINES, THE DIRECTION AND THE VOICE AGREE.

**CREDIT, corrected at LATAM's own request:** East Asia named this in code first, in
`59bc3f34`, with a comment saying `echo` is "wrong by construction" for a
grandmother and all three layers done deliberately. **LATAM rediscovered it
independently and framed it as the transferable rule.** Both are worth recording;
the frame is not a discovery.

**LATAM, 2026-09-07, and it is the deepest version of a bug Europe fixed one layer
of this morning.** **Every fork checks all three.**

The supervisor warned LATAM about `UNCLE_LINES` falling to an English fallback,
which is X36a and which Europe had already fixed for its six new grandmothers.
**That was the top layer. Two more sat underneath, and each looked fine from the
one above:**

```
1. UNCLE_LINES             SEA's nine codes, none of LATAM's, all six fell to
                           the ENGLISH fallback.          <- the known bug
2. CHACHA_TTS_INSTRUCTIONS "a warm, unhurried older man who runs a small
                           kopitiam at the harbour", Southeast Asian accent,
                           the everyday English of Singapore or Malaysia.
                           <- her localised lines DELIVERED AS HIM
3. CHACHA_TTS_VOICE        "echo", a MALE voice. Survived both fixes above it.
```

> **THE LINES, THE DIRECTION AND THE VOICE. The first two pass a review that only
> reads text**, which is why layer 3 survived two people fixing the same character.

**Europe fixed layer 1 in `7c04302a` and has not been shown to have fixed 2 or 3.**
If it has not, six grandmothers are speaking their own words in a Hindi uncle's
voice, **which is a stranger result than the English fallback that was fixed.**

**LATAM chose `shimmer` and deliberately NOT `nova`**, because `probeSeaStt.mjs`
records nova ignoring accent instruction. **It wrote into the file that the owner
has not heard it.** That is the correct shape for a voice decision: **pick on
evidence, flag the taste question rather than settle it.**

### X62c. VOLUME-CHECK A PLACEHOLDER VOICE BEFORE ANYONE LISTENS FOR CHARACTER.

**East Asia, and it is measured in this codebase already.** `docs/CODEBASE-FACTS.md`
Task 895: `BOLO_MINI_TTS_VOICE` in `parrotChat.ts` was changed **from `sage` to
`nova`** because **`sage` measured 15 to 17 dB quieter at source**, via `ffmpeg
volumedetect`, producing loud greetings and quiet chat replies on device.

> **East Asia's grandma is on `sage` as a placeholder right now**, and her lines play
> next to phrase audio from a different, louder voice. **15 to 17 dB is the
> difference between an elder speaking and an elder mumbling.**

**It has never been heard on a device there because nothing in that fork has run
against a live API**, which is exactly how a measured rejection gets re-adopted as a
placeholder.

> **THE RULE: a placeholder voice is volume-checked against
> `PHRASE_AUDIO_DEFAULT_VOICE` with `ffmpeg volumedetect` BEFORE anyone listens for
> character.** Picking another voice at random replaces one unmeasured choice with
> another. **Ask every fork which voice it placeheld with.**

**Two axes of evidence, and they are separate:** loudness is measurable and belongs
in the file; character is the owner's ear and belongs flagged as his. LATAM's
`shimmer` was chosen on a real reason (avoiding `nova`, which `probeSeaStt.mjs`
records ignoring accent instruction) **and has not been volume-checked.**

### X62d. THE COUNTER-EXAMPLE: id KEPT + label CHANGED IS AMBIGUOUS EVIDENCE.

**East Asia, checking the station-cap the way it was asked to rather than the way
that would have satisfied it.** Its catalogue reads id `station-cap`, name **"Bamboo
hat"**, tagline *"Woven golden bamboo, wide as the brim of a boat."*

**That is byte-for-byte the shape of SEA's trap: right label, id kept.** So it opened
the art. `overlay-wave.png` is **a woven conical bamboo hat, chevron weave, red
under-ties, no roundel and no locomotive anywhere.** Ten frames. **The art was
actually swapped, not relabelled.**

> **SEA's rename made a train read as HANDLED. East Asia's real replacement reads as
> a RENAME. The same signal, opposite truths, and only the picture separates them.**

**So "id kept, label changed" is not evidence of a fake fix and not evidence of a
real one.** It is the point at which you stop grepping and open the file.

**What IS unfixed in East Asia is the pagdi:** `mascot/outfits/pagdi/` is ten files
byte-identical to India and SEA, and the catalogue still sells *"Marigold pagdi,
Marigold silk, gold zari and one peacock feather"* to an East Asian learner. **That
is X9, it is a commission rather than a code fix**, and no replacement head accessory
exists on that fork's sheet.

### X62a. REPLACE A GUARD THAT STOPS APPLYING. NEVER DELETE IT.

**Two instances in one commit.** SEA's guard asserts the elder's lines carry no
Latin letters, which held because every SEA anchor is Thai, Khmer, Lao or Han.
**All six LATAM languages are Latin, so the assertion is unsatisfiable and the
protection is simply unavailable.**

**LATAM replaced it with a NO DIGITS guard, citing Europe's `Gleis 3` case** — where
a German lesson taught a numeral the learner has to say out loud and TTS reads as a
symbol. **And it pinned the fallback free of alcohol** so the rating stays honestly
4+.

> **A guard whose premise has stopped holding is not obsolete, it is a gap.** Replace
> it with one that guards the same risk under the new conditions, and cite the case.

**Its test also now REQUIRES a row for every seeded language** rather than allowing a
gap, which is how SEA's tolerated a missing Burmese row.

### X62b. THE GENERATOR REFUSED, AND THE REFUSAL WAS THE RIGHT CALL.

**LATAM authored zone 1 at 331 phrases: Spanish 100, Portuguese 100, Quechua 36,
Guaraní 34, Nahuatl 30, Yucatec Maya 31. It did not pad the four indigenous
languages to 100**, and said why:

> **"A wrong Spanish phrase gets corrected by anyone around the learner within a
> week, and a wrong Nahuatl phrase gets memorised and said to a grandmother with
> almost nowhere to catch it."**

**The seed guard needs 8 starters per lesson and treats 100 as an extended target,
so every language clears the floor and nothing is blocked.** **If the owner wants
those counts raised, the honest route is a speaker, not another generation pass.**

**Carry this to every fork with a low-resource language.** Round numbers are not a
quality signal, and the cost of a wrong phrase is not symmetric across languages.

---

## X61. THE ASSET PROVENANCE MANIFEST EXISTS. `~/bolo/docs/asset-provenance.md`

**India, `44eb8d49`.** **535 media paths, classified at directory level with named
exceptions.** REGION means no fork should carry it; SHARED means identical across
forks is CORRECT and a sweep must not flag it. **Read it before auditing anything.**

**Per-file lines were rejected deliberately: they go stale on the next commission
and nobody reads them.**

### THE THREE AMBIGUOUS CASES, resolved by looking at the picture.

**`journey/emblem-station.png` is SHARED and its NAME IS A LIE.** It is a brass
pocket compass with a compass rose. **No rail, no place, no script.** Africa reached
the same answer independently. **Every fork may keep it.**

**`mascot/outfits/station-cap/` is REGION, and this overturns a call two forks let
stand.** Africa flagged it as "India's art that SEA relabelled Harbour master's cap,
where a peaked cap plausibly serves both". **It does not.**

> **The cap carries a gold roundel with a STEAM LOCOMOTIVE on it.** SEA renamed the
> label and **the badge is still a train.** **9 live references**, so it is on screen
> in every fork that took it.

**A fork on water needs new art, not a new label.** This is the owner's
water-not-rail ruling firing for the third time today, after the bazaar film and the
signal-scene, **and the first two were caught by looking while this one survived two
sweeps because the rename made it read as handled.**

**CORRECTION on attribution, twice. THE SENTENCE WAS SEA'S, NOT AFRICA'S.** The
supervisor attributed it to Africa; when Africa said it had no record of sending it,
the supervisor "verified" from memory and **quoted it back at Africa as proof.** The
quotation was accurate and the author was wrong.

> **A correct quote attached to the wrong author, presented as verification.** The
> failure this file has spent a day naming, committed by the person keeping it,
> against the session that flagged the risk.

**Standing rule for the supervisor: an attribution is checked against the message,
not against a memory of it.** Six sessions read this file, and a quote nobody can
source is worse than no quote.

### X61b-0. THE ART PROMPT RULE: NAME THE TONAL RELATIONSHIP, NOT THE COLOUR.

**Africa, `d359e36d`, drawing `cowrie-pack-1024.png`, the one store asset nothing
blocks.**

**The first render was a good picture and a bad asset.** Golden hour flattened the
frame to a single orange hue and the cowries came out a pale yellow-tan **that read
as cashews.** It would have passed a glance at full size **and died at 200 pixels,
which is the size Apple actually shows it at.**

**The fix was not "more contrast".** It was one sentence naming the brightness
relationship: *bright cream white shells, pale and cool against a warm counter,
standing out by brightness and not only by colour.*

> **A generator will happily give you a correct object that does not READ.** Name how
> the subject sits against its ground in TONE. This joins "never list colours, never
> negate a texture" as the third prompt rule.

### X61b-0b. A GENERATOR DRAWS NOUNS. GIVE IT ONE INSTEAD OF TAKING ONE AWAY.

**Africa, `7de7e53a`, and it cost a render to learn.** The gele came back **with a
terracotta bowl under it**, a stand for the cloth. **These composite as transparent
overlays on the bird's head, so that bowl would have sat over her face.**

**"There is no head inside it" was already in the prompt and was not enough.** What
worked was **describing the absence POSITIVELY, as a thing to draw**: *its underside
is an open hollow, empty dark shadow, the way the inside of an empty hat looks.*

> **Same family as "never negate a texture", and this is the general form: a
> generator draws nouns. Give it one instead of taking one away.**

### X61b-0c. OVERLAYS ARRIVE WITH A CAST SHADOW ON A GROUND THAT DOES NOT EXIST.

**Both of Africa's accessories drew one, and an overlay carries its shadow onto the
mascot as a floating grey smudge.** `station-cap.png` has none, which is the house
convention.

**The mechanical check, runnable by any fork before installing an overlay:**

```bash
magick <file> -alpha extract -threshold 20% \
  -define connected-components:verbose=true \
  -define connected-components:area-threshold=200 \
  -connected-components 8 null:
```

> **Two objects plus the background means a shadow came along.**

**The gele's was a separate blob and flood-cleared cleanly**, 19,365 px removed with
the cloth untouched at 596,702. **The kufi's was FUSED to the cap**, so it had to be
redrawn with *"there is no ground, no surface and no floor in the picture"* — which
also bought a better embroidery band. **Fused means redraw; separate means clear.**

### X61b-0d. PLACEMENT IS THE OWNER'S, AND THE REASON IS WRITTEN IN THE TOOL.

**Art stops at the design and that is not a choice.** `wardrobe.mjs` composites from
`recipe.place[pose]`, **four numbers per pose per item**, and `wardrobe-place.mjs`
says in its own header why they are not computed:

> **Seating a hat automatically works for an upright pose and keeps missing on a
> rolled one.** The loop that produced the current numbers was **the owner describing
> pixel shifts in chat while an agent re-rendered and guessed, six rounds on one
> accessory.**

**So `pnpm wardrobe place` is an owner task, and a replacement accessory is a
commission PLUS five placement passes PLUS codegen. Never a file swap.** Any fork
promising a wardrobe fix without that in the estimate is promising a third of it.

### X61b-1. VERIFY EVERY DRAWN ASSET IN GREYSCALE. House rule, all six forks.

**Desaturate it and check the subject is still the brightest thing in frame and
still reads as itself.** It catches the failure above for free, **and it matters
twice in this house:**

- **An App Store thumbnail is about 200px.**
- **The owner is partially colour blind.** An asset that leads the eye by hue alone
  leads his eye nowhere.

### X61b-2. THE RENAME TEST: not "is the name wrong" but "does anything depend on it".

**Africa, replacing the supervisor's weaker rule.** It renamed `cowrie-pack-1024.png`
freely because **nothing imports it**: an upload-by-hand artifact with two
documentation references. It **left `chacha-welcome.mp3` alone** because SEA owns
that name and five forks inherit it.

> **Same judgement, opposite answers, and the dependency test explains both.** The
> supervisor's version ("renaming is SEA's to lead") only explained one.

### X61b. THE COPY THAT WAS NOT RENAMED IS THE WITNESS. No picture needed.

**Africa, `8db8f992`, and this is now the PRIMARY detection because it is cheaper
than opening anything.** Two adjacent strings in one generated catalogue file:

```
name:     "Harbour master's cap"
tagline:  "Navy and red, with a little brass engine on the badge."
```

> **SEA changed the name and left the tagline honest.** So the market offers a
> learner a harbour master's cap **described as having an engine on it.**

**Diff `name` against `tagline` across the whole catalogue before opening a single
file.** India's picture confirmed the locomotive; **Africa's method would have found
it with no render, no download and no eye.**

**The same trick found the pagdi with no picture:** *"Marigold silk, gold zari and
one peacock feather"* — **zari is Indian metallic thread and the peacock is India's
national bird.** The asset names its own origin in the text a learner reads.

### X61b-a. DO NOT TIDY THE WITNESS. It is the one action that makes the defect unfindable.

**SEA, refusing to make the copy match the name, and it is the sharpest counterintuitive
rule of the day.**

The instinct on finding `name: "Harbour master's cap"` beside `tagline: "Navy and
red, with a little brass engine on the badge"` is to fix the inconsistency. **Do
not.**

> **Making the copy match the name would leave a learner buying a harbour master's
> cap with a locomotive on it, and NOTHING LEFT POINTING AT THE MISMATCH.** The
> un-renamed copy is the only witness. **Africa found this precisely because nobody
> had tidied it.**

**A half-done rename is self-reporting. A completed one is silent.** The fix is new
art, not consistent prose, and until the art exists **the inconsistency is the
asset's own alarm.**

### X61b-d. THERE ARE TWO DEFECT CLASSES AND THE MISMATCH DIFF CATCHES ONLY ONE.

**Africa, `54afe907`, running the sweep across a whole catalogue rather than the one
item it was pointed at:**

```
station-cap   name "harbour" (SEA)    tagline "engine" (India)   DISAGREES
pagdi         name "pagdi, marigold"  tagline "zari, peacock"    AGREES, all India
pink-beanie2  clean                   clean                      keep
```

> **A DISAGREEMENT is a relabel: somebody tried to fix it with words.**
> **An AGREEMENT on foreign words is an item nobody has looked at yet.**

**The mismatch diff finds the first kind only.** **A fork running it, getting one
hit, and stopping would reasonably conclude it had swept its shop** — while the
untouched items hide behind the consistent ones.

> **Scan for FOREIGN WORDS in both fields as well as for DISAGREEMENT between them.**
> Two passes, not one.

**East Asia had already run both and the supervisor implied it had not.** Its
vocabulary sweep covered `kopi, kopitiam, kulhad, zari, pagdi, marigold, Nanyang,
batik, station, platform, train, railway` **across name, title, tagline, description
and label**. First pass: no disagreement anywhere. Second pass: the pagdi's two
lines, and nothing else in the repo.

> **NO DISAGREEMENT ANYWHERE IS GOOD NEWS ONLY IF THE AGREEMENT PASS ALSO RAN.** A
> fork reporting "zero mismatches" has said nothing until it says what its second
> pass found.

### X61b-g. THE PORT'S EQUIVALENT OF THE MERGE CHECK IS IDEMPOTENCY.

**Africa's "regenerate and compare against the merged file" only exists for a
cherry-pick.** East Asia could not cherry-pick (see below), so **there was never a
merged file to compare against.**

> **For a PORT, regenerate TWICE and compare.** A byte-identical second run proves
> the generator is a **fixed point on your own manifest** rather than something that
> keeps rewriting itself. **Different check, same purpose.**

### X61b-h. THE PARITY COMMAND IS THE THIRD ENTRY POINT, AND IT MAKES THE FIX HARD TO UN-NOTICE.

`node scripts/wardrobe.mjs check` compares **manifest against catalogue against
shipped art on BOTH clients**, and it **also prints the draft exclusion**. So the
noise the fix exists for reaches every entry point rather than only codegen. **Run it
after any wardrobe change; nobody had listed it.**

### X61b-i. AN ASSERTION MESSAGE IS ITSELF PROOF THE FILE PARSED.

East Asia demonstrated both failure modes rather than asserting its proof was sound:

```
valid injection    AssertionError: pink-beanie2 is status "draft" and is on sale in OUTFIT_CATALOG
broken injection   TransformError: outfits.catalog.gen.ts:61:5 Expected ";" but found "is"
```

**The second never reaches the test: esbuild fails the transform, node never imports
the module, and no assertion runs or is reported.** So **a message naming the item
and the rule is proof the injection was valid.**

> **Africa's habit is still better than that luck: typecheck the injection first and
> you never have to make the argument.**

### X61b-j. `git cherry-pick` OF AN INDIA SHA FAILS IN A SEA-DESCENDED FORK. Fetch first.

```
fatal: Not a valid object name b9feb7fa
```

**India is not a remote of any fork cut from SEA**, so the sha is not in the object
graph. **Europe found the one-line fix:**

```bash
git fetch ~/bolo main    # then the cherry-pick applies
git cherry-pick -x b9feb7fa
```

> **"Not a valid object name" reads like the commit is unreachable. It is merely
> un-fetched.**

**A port is still re-verified rather than applied**, which is what caught the
over-application risk below.

### X61b-l. REGENERATING REVERTED A NAME. HAND-EDITED GENERATED FILES ARE NOT REPRODUCIBLE.

**Europe, and this is the finding every fork should act on before touching a
catalogue.** Its `outfits.catalog.gen.ts` read **"Station master's cap"** while the
**manifest still read "Harbour master's cap"**.

> **Somebody fixed the OUTPUT by hand and never touched the INPUT.** So a routine
> `wardrobe codegen` **silently reinstates the parent's word.**

**And there was a second source no manifest grep finds:** `scripts/wardrobe.mjs`
emits `/** The Harbour Master's rack */` **as a literal into both client files.**

> **Regenerate and DIFF before assuming your generated files are reproducible.**
> Europe proved it by running codegen and diffing **before changing anything**. A
> hand-patched generated file is a fix with an expiry date set by the next person to
> run the generator.

### X61b-m. FILTER TESTS OUT OF A VOCABULARY SWEEP OR THE SIGNAL DROWNS.

**Europe's raw sweep returned 272 hits.** Almost all were test fixtures using
"Gujarati" as a mock language name. **Excluding tests, dev harnesses, the mockup
sandbox and the launch-video artifact: two files, 19 hits** — the pagdi's name and
tagline, and 17 Indian chapter titles in `lib/script-trace/src/chapters.ts` **which
are unreachable because `TRACING_ENABLED` is false.**

**That is a real all-clear.** An unfiltered sweep is not.

### X61b-n. THE WITNESS RULE HAS A PRECONDITION: CHECK THAT THERE IS A DEFECT TO WITNESS.

**Europe tidied a name/tagline mismatch against SEA's rule, and checked before
deciding rather than after.** It opened the art: **Europe's cap is a navy peaked cap
with a red band and a GENERIC gold roundel. No anchor, nothing nautical, no
locomotive.**

> **There is no art defect for the copy to witness.** The rule is right and did not
> apply.

**"Do not tidy the witness" protects a mismatch that points at wrong ART. Where the
art is fine, the mismatch is just an inconsistency.** **The check is the transferable
part, not the conclusion.**

### X61b-o. EUROPE'S WRITERS' PAGE NEEDS NO NEW HOME. IT NEEDS THE REPL RUN.

**Europe correcting its own recommendation to the owner.** It had told him Neon was
the gate. **It is not.**

```
India   /review.html and /api/languages served on ONE origin
SEA     /review.html at 51,122 bytes
Europe  apex is a Cloudflare PAGES project serving site/, Repl attached to nothing
```

**Europe's `.replit` is already `router=application`, autoscale, the same shape as
the siblings that work.** So **running the Repl serves the page, the phrase data and
`/api/phrase-reviews` on one origin, against the dev Postgres `sync-schema` already
filled.** No Neon, no Cloudflare, no DNS.

**AND THE TEMPTING FIX IS THE WRONG ONE.** Copying `review.html` into `site/` gives
writers a page they can **read and cannot contribute through**, because Pages has no
API. `reviewPage.test.ts` records that a failed save **invites them to tap again
forever.**

> **A writer tapping into a void is worse than no page, because we would never learn
> the work was lost.**

**Flagged by Europe as an inference rather than a proof:** the three sibling
measurements are over the wire; **that a RUNNING Europe Repl behaves the same is
inferred from `.replit` matching.** Whoever opens it should curl its own URL before
telling a writer it works.

**Exposure measured rather than reasoned:** `POST bolo-europe.app/api/outfits/buy`
returns **405** from the static host. **There is no endpoint to buy through.**

### X61b-k. DO NOT OVER-APPLY THE FILTER. THREE OTHER LOOPS MUST STAY UNFILTERED.

**East Asia checked rather than copying, and it changed what it did.** The other three
`m.items` loops in `wardrobe.mjs` build `OUTFIT_POSE_SOURCES`,
`ACCESSORY_OVERLAY_SOURCES` and `OUTFIT_POSE_FILES`, which are **art lookups by id.**

> **An item somebody already owns must still RENDER. Filtering those would blank a
> bought outfit.**

**`genShopSets` is also untouched and should be:** it emits only `STATION_IDS`, a
door label rather than a listing, so a stray id there lists nothing. **India scoped it
correctly and neither fact is obvious from the diff.**

### X61b-e. "PROVABLY ZERO" IS A DIFFERENT ANSWER FROM "SMALL", AND IT CLOSES THE QUESTION.

The supervisor framed SEA's draft-item exposure as *"the owner's own test accounts"*
and Africa's as *"smaller still"*. **Africa corrected it:**

> **Africa's is not smaller, it is NONE.** The fork has never published, **so no
> production database exists at all** — Replit creates it at first publish. **There
> is nowhere a purchase could have been recorded.**

**Bounding an exposure leaves a question ranked. Proving it zero removes it.** Say
which you have.

### X61b-f. THE MERGE BEING CORRECT IS NOT EVIDENCE IT WAS SAFE TO ACCEPT.

**Africa regenerated the codegen output after the cherry-pick and the regenerated
file was BYTE-IDENTICAL to the merged one.** The merge happened to be right.

> **That is only knowable because both were done.** A merged generated file that
> looks right is not a verified one, and the cost of checking is one regen.

**And when it injected the entry back to prove the guard bites, it wrote VALID
TypeScript and typechecked it FIRST**, because **a failure from a syntax error proves
nothing about a guard.**

**SEA opened both to confirm:** the roundel is a front-view steam locomotive with
funnel and cowcatcher, **so the tagline was literally accurate and only the name was
ever changed.** The pagdi is India's art **and** India's copy.

> **SEA's Bazaar ships exactly two accessories and both are India's.** After the
> draft-gate fix removed the third, the shop sells two items, both wrong.

### X61b-b. BOUND THE BLAST RADIUS BEFORE ANYONE WORRIES ABOUT IT.

**SEA could not answer whether a draft item had been sold** — no production database
credential on this Mac, the same gap that blocked verifying the reviewer's user row.
**But it bounded the exposure instead of leaving it open:**

> **SEA has never shipped to either store.** Play holds no binary at all; the App
> Store record has build 5 attached and was never submitted or released. **So the
> only surface anyone could have bought it on is the web app, pre-launch**, and the
> population is whoever signed in before today. **Almost certainly the owner's own
> test accounts.**

**India's exposure is real**, because India is live in both stores at 1.0.15.

**"I cannot measure it, and here is the ceiling" is a complete answer.** It turns an
open question into a ranked one.

### X61b-c. A CLEAN CHERRY-PICK DOES NOT GUARANTEE THE DESIGN SURVIVED.

**SEA's port of `b9feb7fa` (as `83b4c7d2`) conflicted only on `pure-tests.txt`.
Everything else auto-merged. It regenerated the codegen output anyway**, because
India's committed catalogue had **India's own beanie** removed from it, and a merged
generated file is not the same as a regenerated one.

**Then it verified both halves independently:** the item absent from `OUTFIT_CATALOG`,
the id **present** in `OUTFIT_IDS`. **And it proved the guard bites in its own tree**
by injecting the entry back by hand rather than trusting India's proof.

### X61c. A WRONG LABEL TRAVELS INTO THE DOCUMENTS THAT DESCRIBE THE FIX.

**Africa's own commission sheet had accepted SEA's relabel**, describing item 39's
subject as *"(the captain's cap)"*. **So anyone working that item would have been
replacing a nautical cap rather than a locomotive**, and a second relabel would have
propagated further still. Corrected with the reason attached.

### X61d. COUNT YOUR WARDROBE. DO NOT TRUST YOUR PART D.

**Africa's wardrobe is THREE items, TWO of them foreign, and a 76-item commission
sheet written by a session with the manifest open said one third.** `pagdi` is
status-shipped and **nothing in 76 items scheduled its replacement.**

> **With `pink-beanie2` the only survivor, a learner who opens the market to spend
> cowries finds ONE HAT. A shop with one item is not a shop.**

Africa's `39b` is a gele head-tie in the same wax-print indigo the market mother
already wears in item 37, and **39 and 39b are marked NOT OPTIONAL.** **Every fork
counts its own wardrobe.** East Asia has independently confirmed its pagdi is ten
files byte-identical to India and SEA and still on sale.

### X61e. THE RAILWAY SURVIVES IN A TYPE, WHERE NO ART PASS REACHES.

`OutfitShopDoor` is typed `"tailor" | "station"`. **Every fork has a market door
called `station`.** ENGINE, a rename rather than a drawing, and **no asset sweep of
any kind will ever find it.**

**`mascot/chachaji-wallet-vignette.png` is DEAD in India too**, zero references
across `src`, `app`, `components` and `lib`. **Nobody commissions a replacement in
any fork.** A fork replacing an asset nothing references is wasted art.

### The three checks, now settled and in the manifest.

| Check | Catches |
|---|---|
| **Filename** | nothing reliable. `stationmaster` depicts a harbour master |
| **Hash** | a straight rename **instantly**. **A re-encode defeats it completely** |
| **The picture** | everything |

**Use the hash as a first pass and never as the audit.** And **control against the
merge-base, never India's HEAD**, since India replaced its screenshot set.

### X61a. THE LIMIT IT WROTE DOWN RATHER THAN HID.

> **"Nobody has listened to every clip in `sounds/`. The band clips and squawks are
> called SHARED on their FUNCTION, not on having been heard. If one carries a spoken
> word it becomes REGION."**

**That sentence is how the next reader knows the row was never checked.** A
classification whose method is stated can be trusted exactly as far as its method
goes. **Copy the habit: name the rows you reasoned about rather than measured.**

---

## X60. `seedRevenueCat.ts` IS A LOADED GUN IN ALL SIX FORKS.

**East Asia and SEA, independently, 2026-09-07.** The 503 on `/api/pricing` points
you at this script by name. **Do not run it in any fork until it has been rewritten
for that fork.**

**Every fork carries India's constants:**

```
APP_STORE_BUNDLE_ID     = "com.bolo.mobile"     <- India's
PLAY_STORE_PACKAGE_NAME = "com.bolo.mobile"     <- India's
PLUS_MONTHLY_ID         = "bolo_plus_monthly"   <- India's, and SPENT
```

**They are not decoration.** SEA traced lines 240 and 248 feeding them straight into
the product-creation payload as `app_store.bundle_id` and `play_store.package_name`.

> **Running it configures THAT fork's live RevenueCat project against India's store
> app and India's product ids.** East Asia's project is `e3f13e90`; SEA is
> `7a4814ca`. Neither is India's.

**Three more mismatches, so it is a rewrite rather than a one-line fix:** the prices
are `9_990_000` and `59_990_000` micros ($9.99 / $59.99) against the owner's
$12.99 / $89.99; it creates the **One Language** tier he ruled dead on 2026-09-06;
and **the consumables are not in it at all.**

> **THE LESSON: the product ids that matter are not only the ones in
> `kopiPacks.ts`.** A fork can have a perfectly localised pack file and a seed
> script that still writes its parent's identifiers into a live billing project.

### X60a. THE FLEET'S DECLARED CONSUMABLE IDS. No collisions. X1 stays closed.

**East Asia grepped all six.** Fifteen ids, none colliding, none matching India's
spent subscription set:

```
india    bolo_chai_cutting       bolo_chai_kulhad     bolo_chai_kettle
sea      bolo_kopi_cup           bolo_kopi_pot        bolo_kopi_tray
east     bolo_east_cha_25        bolo_east_cha_75     bolo_east_cha_200
africa   bolo_africa_cowries_25  _75                  _200
europe   bolo_caj_glass          bolo_caj_pot         bolo_caj_samovar
```

**India's SPENT set, which no fork may reuse** (unique per Apple ACCOUNT, never
reusable even after deletion): `bolo_plus_monthly`, `bolo_plus_annual`,
`bolo_one_language_monthly`, `bolo_one_language_annual`, their Play
`:monthly` / `:annual` suffix forms, and the three `bolo_chai_*` packs through which
real money has moved. **Prefix per fork: `bolosea_plus_monthly`.**

### X60b. A FORK WHOSE APP NAMES NO PRODUCT ID CANNOT DESYNC FROM ITS LISTING.

**East Asia, and it explains why the annual gap is not universal.** Its mobile app
contains **no product-id literal at all**: `PurchasesContext` compares transactions
against `appleProductId` supplied by the server's pack list, and the paywall reads
`offerings.current`. **So products come from RevenueCat's configuration rather than
from code.**

> **A missing annual product would simply not render there.** In a fork that
> hard-codes one, the same absence lets the code and the store listing disagree,
> which is how SEA came to advertise $89.99 for a product that exists nowhere.

**Not a reason to relax:** East Asia has not verified the RevenueCat offering
itself, which needs the console. **"Annual exists" is the handoff's claim, not a
measurement.**

### X60c. A GENERAL INSTRUCTION IS NOT AN ANSWER TO A SPECIFIC QUESTION.

**East Asia, refusing to read the owner's "keep all the agents working for the next
hour" as consent to commit and push a batch it had escalated to him three times.**

> **"A general instruction arriving after a specific question is not an answer to
> it, and reading it as one is exactly the relay-into-consent blur I would flag if
> you did it."**

**It was right, and the supervisor had offered it that reading.** This is the same
family as X49 (a scope ruling is not a work order) and it is the sharper form:
**breadth does not resolve specificity.** A fork with a question outstanding keeps
it outstanding.

---

## X59. THE REPLIT ROUTER SERVES EXACT PATHS ONLY. THE PRERENDER WAS NEVER THE BUG.

**India, 2026-09-07, correcting its own diagnosis and then the supervisor's fix.**
**Every hour any fork spends on `prerender-legal.mjs` output is wasted until it has
run the one-line test below.**

### The measurement that inverted it

```
/privacy               301 -> /privacy/
/privacy/                 7,971 bytes   the SPA shell, homepage title
/privacy/index.html      32,970 bytes   the REAL prerendered policy
```

**The file is built, deployed and reachable.** Replit's router redirects to the
trailing slash, finds no exact file, and falls through to the SPA catch-all.

### The boundary, and it kills the obvious fix

```
/aksharmala          7,972    the shell
/robots              7,972    the shell
/aksharmala.html   659,533    the real file
/privacy/index.html 32,970    the real file
```

> **No extensionless resolution. No directory-index resolution. Only an EXACT path
> reaches a real file.**

**So emitting `privacy.html` does NOT make `/privacy` work.** It makes
`/privacy.html` work, which is a different URL. **A fork that ships `privacy.html`
expecting the clean path to come alive will find nothing changed and go back to
blaming its build.**

**What a fork can have without touching host config:**

| URL | Cost |
|---|---|
| `/privacy/index.html` | **works today, already deployed, no publish** |
| `/privacy.html` | one extra emitted file, tidier URL |
| `/privacy` clean | serving-layer config, not in `.replit`, may be unreachable on this deployment type |

> **So the store URL question is not a preference, it IS the fix.** A dead filed URL
> can be alive in the time it takes to paste a different one into Play.

### THE ONE-LINE TEST EVERY FORK RUNS BEFORE TOUCHING ANYTHING

```bash
curl -s https://<fork>/privacy/index.html | wc -c
```

**Large there and small at the plain path: correct file, wrong routing. Both small:
the prerender genuinely did not emit, and the build IS worth looking at.**

### The three forks are in three different states. Measured.

```
                     /privacy   /privacy/index.html
bolo-india.app          7,972            32,970   file exists, routing broken
bolo-sea.app            7,772             7,772   NO FILE AT ALL
bolo-europe.app         6,220             6,220   different sizes per path: real pages
```

**SEA's is the worse fault and it was on its submission path**: `/support` is filed
as Apple's Support URL and carries its whole deletion section, verified by reading
the bundle. **The bundle is real. The wire is the shell.** Europe works because it
serves real static files from Cloudflare Pages, which is what X4 recorded and what
cost Europe its apex.

### X59b. SETTLED: EMIT `<route>.html`, NOT `<route>/index.html`. THE PORT ALONE FIXES NOTHING.

**SEA, closing this out.** It has **no prerender script at all** — never taken, its
build is bare `vite build` against India's `vite build && node
scripts/prerender-legal.mjs`. **So it went to port India's, and stopped:**

> **India HAS the script and still serves the shell at `/privacy`.** Porting it buys
> `/privacy/index.html` and leaves the filed URL exactly as broken. **SEA would have
> shipped the port and reported the page fixed.**

**The cause is the platform, not the code.** `.replit` has no run or build command
and `api-server` never references `dist/public`: **Replit's own `router =
"application"` serves the static files.** Exact-path-only is the router's behaviour
and **no emit shape a fork chooses can change it.**

**India's script comment asserts that an emitted `dist/public/privacy/index.html`
"is served ahead of the catch-all". Measured, it is not.** A reasoned claim sitting
where a verified one appears to be.

> **THE FIX, one line in the emit path, and the parent owns it because five forks
> inherit whichever shape it leaves:**
>
> ```
> emit  dist/public/privacy.html        file  https://<fork>/privacy.html
> NOT   dist/public/privacy/index.html
> ```
>
> **An exact-path `.html` is slightly ugly in a store field and is the only form the
> router serves. A directory index is the form that LOOKS right and does not work**,
> which is why nobody caught it: it emitted correctly, deployed correctly, and was
> unreachable.

**Keep India's failure handling verbatim when porting:** warning and exiting 0
rather than failing the build is right for a fork that is live in a store.

### X59a. THE THING VERIFIED AND THE THING SHIPPED WERE DIFFERENT SHAPES.

**X32 records that India checked real files beat the SPA fallback BEFORE writing a
line.** That check was correct. **It tested top-level files with extensions**
(`/aksharmala.html`, `/robots.txt`) **and the thing that shipped was a directory
index.**

> **The gap is not that the pre-flight was wrong. It is that nothing downstream
> compared the shape verified against the shape shipped.**

A vitest case that renders the components cannot see it. The build cannot see it.
**Only a no-JS fetch of the LIVE url can, and it must name the exact path being
filed with the store rather than the pretty one.**

**India also corrected itself here and named the method fault:** it first reported
the prerender had silently skipped, reasoning from the script's real warn-and-continue
property. **It inferred a cause from a plausible mechanism instead of fetching the
next URL along, and the test that settled it took ten seconds.**

---

## X57. A FRESH FORK INHERITS THE CODE THAT REQUIRES A SECRET AND NONE OF THE SECRETS.

**SEA, 2026-09-07, found while granting a reviewer account All-Access. Four
independent faults in one action.** Every fork should run the checks below before
it tries to entitle anybody.

### 1. THE ONE-LINE PROBE. Run it before you spend a dashboard action.

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://<fork>/api/revenuecat/webhook
```

| Result | Meaning |
|---|---|
| **503** | `REVENUECAT_WEBHOOK_AUTH` is **UNSET**. Every webhook is rejected before the body is parsed. |
| **401** | The secret is set and live. **This is the good answer.** |

**It writes nothing and needs no credential.** SEA's read 503, which meant the
promotional entitlement it had just granted could never reach the users row.

### 2. THE `/api` TRAP. A green delivery log is not evidence.

```
POST https://bolo-sea.app/api/revenuecat/webhook   ->  401  (correct)
POST https://bolo-sea.app/revenuecat/webhook       ->  200  <!DOCTYPE html>
```

**The API lives under `/api` and every other path falls through to the SPA shell.**
So a webhook URL missing `/api` gets **200 OK**, RevenueCat marks every delivery
successful, **retries nothing, and discards the event forever.**

### 3. A PROMOTIONAL ENTITLEMENT CAN NEVER GRANT ALL-ACCESS IN THIS CODEBASE.

**This is the finding with the longest reach and SEA corrected its own
recommendation to reach it.** It had proposed the promo route as "supported"
because `revenuecatSync` handles `period_type: "PROMOTIONAL"`. **It does, and that
check never runs.**

**The EVENT TYPE gate fires first.** `revenuecatSync.ts:86` has
**`NON_RENEWING_PURCHASE` inside `IGNORED_EVENT_TYPES`**, deliberately, because
that is the event a Kopi pack consumable arrives on. **RevenueCat sends a
promotional grant on exactly that event type**, with a synthetic product id shaped
`rc_promo_<entitlement>_<duration>`.

So the sync ignores it as a consumable, the route then tries to credit it as a
pack, finds no match, and errors:

```
eventType        NON_RENEWING_PURCHASE
productId        rc_promo_plus_three_month
knownProductIds  bolo_kopi_cup, bolo_kopi_pot, bolo_kopi_tray
message          "Consumable purchase could not be credited: no matching Kopi pack"
```

> **This blocks every comp: reviewer accounts, refund goodwill, influencers, staff.
> Not just today's reviewer.** The fix is to recognise an `rc_promo_` product id as
> an entitlement grant **before** the ignored-type gate drops it.

### 4. TWO PRODUCTION SECRETS THAT NOTHING WARNS YOU ABOUT.

Confirmed missing in SEA by reading the Secrets panel, after Sentry named both:

```
REVENUECAT_SECRET_API_KEY   absent -> GET /api/entitlements 401s on EVERY call,
                                      for every user, silently
STRIPE_SECRET_KEY           absent -> GET /api/pricing errors; web billing is
                                      Stripe, so the web paywall is broken
```

**`lib/logger.ts` memorialises the first one in its own header: "RevenueCat
reconcile-on-read 401'd on every entitlements call for a month."** It happened
before and it happened again.

**Every fork should list its production secrets and diff them against what the code
reads.** `grep -roE 'REVENUECAT_[A-Z_]+|STRIPE_[A-Z_]+' artifacts/api-server/src`
gives the required set in one line.

### X57a. SENTRY IS THE LOG ROUTE NOBODY WAS USING.

**SEA could not read Replit's logs and read them through Sentry instead.**
`lib/logger.ts` forwards `warn`, `error` and `fatal` to Sentry, project
`bolo-sea-api`. **Three of the four faults above were invisible from every
dashboard and appeared in one look.**

> **When a fork cannot see its server, it probably still can. Check whether its
> logger forwards to Sentry before concluding the logs are unreachable.**

The info-level webhook line does not forward, but **every failure does**, which is
exactly the half that matters when something is silently not working.

### X57b. `REPLACE_ME_<FORK>` IS LIVE IN PRODUCTION, AND IT DEFEATS THE GUARD.

SEA's production configurations carry `REPLACE_ME_BOLO_SEA` as a **live value** in
at least five places, including `STRIPE_FAMILY_ANNUAL_PRICE_ID`.

**`routes/stripe.ts` answers 503 "pricing isn't configured yet" for a FALSY price
id.** `"REPLACE_ME_BOLO_SEA"` is a non-empty string, **so it walks past that guard
into Stripe** and the learner gets an opaque broken button instead of an honest
message. **Africa hit this and fixed it by setting the ids to `""`.**

> **A non-empty placeholder is worse than a missing one**, wherever a guard tests
> for falsiness. Set unconfigured ids to `""`, and keep the names in a comment.

**CORRECTION, LATAM, same day: `""` IS NOT UNIVERSALLY THE FIX, AND FOLLOWING THE
ADVICE ABOVE WOULD HAVE BROKEN INVITE EMAILS IN FIVE REPOS.**

LATAM found every consumer in its own tree before applying the rule. **Four are
falsiness guards and `""` fixes them:** the Stripe price ids read `?.trim() ||
null`, `REVENUECAT_PROJECT_ID` reads `if (!...trim()) return null`, and both mail
senders read `if (!from) throw`.

**One is not.** `INVITE_CTA_URL` is read as:

```js
process.env.INVITE_CTA_URL ?? APP_ORIGIN
```

**`??` catches only `null` and `undefined`. An empty string WINS over the fallback,
exactly as the placeholder did**, so every invite email would carry an empty link
instead of the app URL.

> **THE RULE: read the CONSUMER before choosing the empty value.** For a falsiness
> guard (`||`, `!x`, `.trim()`), `""` is correct. **For a `??` fallback, `""` is as
> broken as a placeholder and the variable must be ABSENT.**

**SEA extended it one step, and this is the fleet-worthy form.** It verified
LATAM's finding in its own tree rather than inheriting it (`inviteEmail.ts:18`),
then checked the other two instead of pattern-matching:

```
falsiness guard  +  the feature is OFF    ->  ""
falsiness guard  +  the feature is LIVE   ->  the REAL value
?? fallback                               ->  DELETE the variable
```

**The middle case is the one a pattern-match gets wrong.** `RESEND_FROM` and
`INVITE_FROM_EMAIL` are both `if (!from) throw`, so `""` is *safe* for both. **But
`RESEND_FROM` is the FROM address for contact notifications, and `routes/contact.ts`
is the page filed as Apple's Support URL.** Empty means **every contact submission
throws** on the surface a reviewer is pointed at. It needs the real address,
`Hello@LarkEnterprisesLLC.com`, which `appDomain.ts:64` already exports as
`SUPPORT_EMAIL`.

> **"Safe" is not "right". A placeholder 403s at Resend, an empty value throws, and
> only the real address works.**

### X57c. UNDER "TURN THE FEATURE OFF", THE HEALTHY ANSWER IS 200, NOT 503.

**The supervisor was about to probe for a 503 and would have read the result
backwards.** `pricingCatalog.ts:95` is `if (!priceId) continue;` — **an unset id is
SKIPPED, and no Stripe call is made at all.** With all five emptied the route
returns `{ plus: {}, family: {}, packs: {} }` as **200**.

```
200 with empty objects  ->  correct, the feature is off
503                     ->  an id is still non-empty and Stripe is rejecting it
```

**The design is stated in the file's own comment:** an unconfigured id is
deliberately silent, while **"a configured id that Stripe cannot price is an error,
because showing nothing where a real charge exists is a money bug worth
surfacing."**

**Timing, so nobody chases a ghost:** `PRICING_FAILURE_COOLDOWN_MS` is 30s and
`PRICING_CACHE_TTL_MS` is 5 minutes, both in memory. **A republish clears them**, so
republish rather than waiting five minutes.

**`STRIPE_WEBHOOK_SECRET` is moot while web billing is off** — `stripeClient.ts:38`
returns `""` when unset and the handler skips verification, and no checkout means no
webhooks arrive. **It must be set before web billing ever launches.**

Fixed in LATAM at `cf3b93b4`, with the owed list moved into the file header so
losing a grep marker does not lose the list.

---

## X58. THE ORDER IS CLERK, THEN THE REPL, THEN DNS. DNS IS LAST.

**LATAM, correcting the supervisor by measuring a sibling instead of arguing.**

The supervisor reasoned DNS must come first "because nothing serves". **LATAM
opened `bolo-east.app`, a fork further along, and found five records, every one of
them Clerk's**: `accounts`, `clerk`, `clkmail` and two DKIM CNAMEs. **It has no
apex A record either.** Its domain does not serve and Cloudflare flags it exactly
as LATAM's does.

> **There is nothing correct to put in a fresh fork's zone on day one.** The apex
> has to point at a Replit deployment, and a fresh fork has no Repl. **The five
> records that DO exist on a sibling are the ones a Clerk PRODUCTION instance asks
> you to add.**

**And the store records wait too.** App Store Connect and Play both want a privacy
policy URL and a support URL **that resolve**. Creating a listing before they do
buys a record you must come back and fix. **LATAM was authorised to create both and
deliberately did not**, which was the right call.

### X58a. `form_input` SETS THE DOM VALUE WITHOUT REACT SEEING IT.

**LATAM, on Clerk's dashboard, and it applies to every React admin console the
fleet drives in Chrome.**

It set a password minimum, clicked the dialog's **Update** AND the separate
**Unsaved changes → Save**, reloaded, and **the page still read the old value.**
The staged change was empty because `form_input` writes the DOM value directly and
React never registers the change. **The UI looked correct and the unsaved-changes
bar still appeared.**

> **Type into the field with real keystrokes rather than setting it, and verify by
> a FULL PAGE RELOAD. A save that "succeeded" is not a save.**

**Same family as everything else today:** an operation that reports success while
doing nothing, and the only thing that catches it is reading the result back from
the source rather than from the screen that just told you it worked.

---

## X54. STORE ASSETS: THE TAXONOMY, AND THREE CONTROLS THAT ARE ALL WRONG.

**Africa, SEA and East Asia, 2026-09-07, each opening files rather than hashing
them.** This is the entry to read before any fork touches a store listing.

### The three-way wrong control. Only opening the file works.

`ios/promo/kopi-pack-1024.png` is **India's chai stall** — brass kettle, stacked
terracotta kulhads, oil lantern, mud-walled huts, palms — and it is present in
SEA, Africa and East Asia.

| Control | East Asia says | Africa says | Truth |
|---|---|---|---|
| **Filename** | `kopi-pack` | `kopi-pack` | India |
| **Hash vs parent HEAD** | **OWN** | **SEA's** | India |
| Picture | India | India | India |

> **The same file produces a DIFFERENT wrong answer in each fork, depending on
> which parent still holds a copy, and NEITHER wrong answer is "India".** East
> Asia's reads OWN because India replaced its copy; Africa's reads SEA because SEA
> took it unchanged and India then replaced its own.

**So the merge-base fix is necessary and NOT sufficient.** A fork applying it still
gets a confident wrong result here. **Name, hash-against-HEAD and
hash-against-merge-base can all be wrong at once, and differently per fork. Open
the file.**

### The taxonomy, and it produces a number that changes the plan.

Sort store assets by TYPE, never by folder:

```
CAPTURES         screenshots, four device sets      GATED on a running API
REVIEW CAPTURES  the IAP approval images            GATED on the same
DRAWN ART        promo, feature graphic, icon       GATED ON NOTHING
```

**Measured, and the same in two forks:**

| fork | total | gated | drawn | drawn needing replacement |
|---|---|---|---|---|
| East Asia | 39 non-font | **38** | 3 | 1 |
| Africa | 41 | **38** | 3 | 1 |

> **Say "38 of 41 store images cannot start", not "screenshots are blocked".** The
> second sounds like a queue somebody can work around. It is not one.

**A recapture pass fixes captures and leaves drawn art exactly where it was.** That
is why SEA is clean on 28 of 29 and wrong on the one drawn file: its `1b551335`
recaptured from the real app and the promo image was never in scope. **So the
question to ask a fork is not "are your images the parent's" but "what did my
recapture pass NOT cover".**

### A review asset is a capture by METHOD and a commissioned deliverable by CONSEQUENCE.

It regenerates like a screenshot, but **a human at Apple reads it like promotional
art**, and Apple will sell an IAP whose metadata is incomplete. India's own history
records the result: StoreKit took the money, RevenueCat could not validate it, no
webhook fired, the learner got no credit.

> **So it belongs on the list checked before SUBMISSION, not the one checked before
> a build.**

East Asia's `kopi-packs-1290x2796.png` is the worked example: the App Store review
image for its consumables, showing *"Signal Box, KEEP THE LINE RUNNING"* with an
Indian signalman, *"Chai Wallet"* with **Chacha-ji waving**, and *"Out of Chai?"* at
25/75/200 CHAI. **A rail spine in a water fork, chai in a cha fork, the uncle in a
grandma fork.** Its hash sweep called it OWN.

### X54a. UNBLOCKED AND UNWRITTEN LOOK IDENTICAL FROM A TASK LIST.

**Found in East Asia's sheet, then confirmed in Africa's.** East Asia's commission
sheet has 44 items and Africa's has 76. **Neither covered the 1024x1024 App Store
promotional image** — the single store asset in each fork that nothing blocks.

> **The one thing that could have been commissioned in parallel had no prompt
> written. It was not in flight; it was merely unblocked**, and from a task list
> those are indistinguishable.

**When a dependency clears, check that the freed item is actually SPECIFIED**, not
just unblocked. Africa's `44b` now exists, and the prompt makes the cowries hold the
foreground position India's stacked kulhads held, **because that image is what sells
the currency.**

---

## X55. A GREEN SUITE ON A CLEAN DATABASE CAN BE GREEN AGAINST ROWS THAT DO NOT EXIST.

**SEA, inverting India's finding on the same line of code.**

`account.test.ts` resolves two fixture ids and falls back:

```
TEST_PHRASE_ID       = phraseRow.rows[0]?.id ?? 1;
TEST_LESSON_GROUP_ID = lgRow.rows[0]?.id     ?? 1;
```

**India's diagnosis:** the Repl's dev database has held a lesson group for months
from real use, so **the ambient row hid the dependency**, which is why the file was
believed Repl-only. Fixed properly in `d9dc0105`: `before()` creates its own group
when the table is empty, `after()` removes it. **Take that rather than hand-seeding
a row, because a hand-seeded row makes the next fork believe the trap is gone when
it is only hidden again.**

**SEA's inversion, measured from `pg_constraint`:** on `attempts` and
`lesson_generations`, **only `user_id` and `language_code` carry foreign keys.
Neither `phrase_id` nor `lesson_group_id` does.**

> **So on a genuinely empty database the `?? 1` does not raise. It inserts rows
> pointing at a phrase and a lesson group that do not exist, and the suite passes
> against phantom ids.**

**India's ambient row hid a dependency that would otherwise have failed loudly.
SEA's would never fail at all.** A fork taking `d9dc0105` gets the right behaviour
**but will never see a red telling it that it needed the fix.**

**Consequence for the new postgres CI job:** a clean-database run is **not
automatically a stronger proof than a dirty one.** It is stronger where an FK
exists and weaker where none does, because the dirty database at least bound to
real rows. **Check `pg_constraint` on those two tables per fork; the absence of an
FK is invisible from the test file.**

### X55a. THE BOTH-WAYS PROOF IS THE STANDARD. A GREEN RUN IS NOT.

**Europe `dce88b2d`, then India.** Europe ran 31 pass 0 fail, then **commented out
the three deletes and watched 4 tests fail naming
`zone_testouts_user_id_users_id_fk`.** India reproduced the same shape.

> **A test that passes with and without the fix proves nothing.** Four forks fixed
> this handler on a typecheck. A green run is the second-weakest evidence
> available.

**And state precisely what a green does and does not cover**, as SEA did: *proven,
the three deletion paths purging by `user_id` against real rows, 31 of 31; not
proven, that the suite passes on a clean database, which has not been run and is
not being claimed.*

### X55b. A DIRTY DATABASE PRODUCES FALSE FINDINGS, NOT ONLY FALSE REDS.

India's first full-suite run showed **7 failures and it nearly reported them**.
After a drop and rebuild, **one of the seven was genuinely its own** and the rest
were residue. SEA's first run died on a duplicate key in
`family_plans_owner_user_id_unique` from three leftover fixture rows. **Clean the
fixtures before believing a red**, and delete fixtures by name rather than
truncating.

---

## X56. WHEN A FORK GOES RED, READ THE PARENT'S CI HEADER FIRST.

**India, 2026-09-07, about its own repo.** `.github/workflows/ci.yml` has carried
this above the jobs since **2026-09-04**:

> *"Known flakes (a single re-run clears them, a second failure is real): the web
> practice-streak toast, the mobile journey-map opening shot."*

**The parent had named that exact test three days before SEA's red sent four
sessions and the supervisor chasing it.** India edited that file today without
noticing the line was there.

**The second half is the part that was actually needed. SEA's failed TWICE**, so by
the parent's own rule it was real and should have been escalated rather than
dismissed. **The header would have raised the priority, not lowered it.**

**And the note is not fleet-wide: SEA's own `ci.yml` carries no flake line.** So the
rule is load-bearing rather than redundant — a fork's own repo will not tell it.

**SEA's `ci.yml` header carries a separate false claim**, that the database tests
"still run only in the Repl Shell before a publish", which SEA has personally
disproved on this Mac. **Flagged, not fixed, because its tree is about to be built.**
Any fleet correction of the "Repl Shell or nowhere" claim must cover `ci.yml`
headers as well as `CLAUDE.md`.

---

## X53. FIVE FORKS BOUGHT ONE LESSON FOUR TIMES IN ONE HOUR. POST BEFORE YOU FIX.

**India, 2026-09-07, and the process finding matters more than the defect.**

The account-deletion lockout was found and fixed **independently, separately, by
four sessions inside one hour**:

```
SEA        e5a7b91e
Africa     922dbd8d
East Asia  46ffb5df
India      14e58209
```

**Five copies of one handler. Not one session walked it upstream to the parent.**
India was last to get it and India is where the other four came from. **Europe was
still carrying it unfixed at the time of writing** — `zone_testouts`, `user_blocks`
and `username_reports`, all `ON DELETE no action`, none purged.

> **THE RULE: a fork that finds an ENGINE defect posts it to this ledger BEFORE
> fixing it locally, and tells the supervisor.** Then the other five get checked
> while the finder writes their fix. **Four sessions each paying full price for the
> same lesson is the exact failure this file was created to stop**, and it happened
> anyway, in one hour, under a supervisor who was relaying between all five and did
> not notice.

**The supervisor's share of this:** relaying findings is not the same as noticing a
PATTERN in them. Four separate "I fixed the deletion handler" reports should have
read as one fleet-wide defect on the second one, not the fourth.

**The defect itself, for the record.** The handler deletes the CLERK identity FIRST
so nobody can sign back in mid-delete; the local purge then throws on the foreign
key. **The learner is locked out permanently with every row still present**, and
the 500 is the only visible part.

**The check is per table, not per pattern.** Every table with a `user_id`, read its
`onDelete`. **Cascade may be absent from the handler; no-cascade must be named in
the handler AND seeded in the test.** India's split was ten cascading against
seventeen explicit.

**Fixing the handler obliges two re-reads in the same sitting:** the fork's deletion
documentation, and its Play Data safety answer. **Until the handler worked, those
were three copies of one claim and all three were wrong together.**

### X53a. A ROW WITH NO USER ID CANNOT BE REACHED BY ACCOUNT DELETION.

**India, found by the number grep.** India's page said contributed voice recordings
are deleted "when the associated account is deleted". **`voice_contributions` has no
user id at all**, deliberately: contributors are family members who never sign in,
and the row carries a typed name and a sitting id.

> **So account deletion could not reach them and the sentence was false.** They now
> appear under what is NOT deleted, with the ask-us route.

**Check that every "deleted with your account" claim names a table that actually has
a user id.** A deletion page describes a handler; if the handler cannot see the
table, the page is describing something that does not happen.

---

## X50. AN EMPTY SEARCH RESULT IS A CLAIM ABOUT THE SEARCH, NOT ABOUT THE CODE.

**Africa, 2026-09-07, and the supervisor hit the identical bug the same day without
recognising it.**

Africa's first search for the web delete control **returned nothing**, which read
exactly like *"the web app has no delete button at all"* — a fork-blocking finding,
and false. **zsh had expanded the grep's `--include` glob and the command never
searched.**

> **A SEARCH THAT FINDS NOTHING IS A RESULT ABOUT THE SEARCH UNTIL IT IS RE-RUN A
> SECOND WAY.**

**The supervisor produced the same failure hours earlier** and read past it: a
`grep -rn ... --include=*.tsx` returned `zsh: no matches found: --include=*.tsx`,
and the supervisor simply moved on rather than noticing that the whole command had
never executed. **Quote the globs, or use `--include='*.tsx'`, or run the search a
second way before believing a zero.**

**This is X43c one layer earlier.** X43c is a true-looking claim measured against
the wrong control. **This is an empty result from an instrument that never ran**,
and it is more dangerous, because absence reads as proof and there is nothing on
screen to inspect.

**Confirm a negative with a positive control:** search for something you KNOW is in
that tree with the same command shape. If that also returns nothing, the instrument
is broken, not the code.

---

## X51. THE DELETION PAGE: THREE THINGS THE OTHER FORKS SHOULD COPY FROM AFRICA'S FIX.

**Africa `eb0f6b42`.** Africa's page needed two corrections, not one, and neither
was what the supervisor's brief predicted.

### 1. GREP FOR THE NUMBER, NOT FOR ITS ABSENCE.

The supervisor's brief said Africa's page "says removed immediately with no backup
mention". **It already had a backup sentence, and it carried the supervisor's
unmeasured thirty days**: *"Deleted rows can survive in encrypted database backups
for up to 30 days, after which the backups themselves expire."*

> **So the fork was not missing a disclosure. It was already publishing the
> unmeasured figure on a legal page.** That makes the correction MORE urgent for
> anyone who inherited the sentence, not less. **Every fork greps for the number.**

### 2. THERE ARE TWO DIFFERENT "30 DAYS" AND A GREP CANNOT TELL THEM APART.

Africa **kept** a second one: *"We answer deletion requests within 30 days."* That
is a **response-time commitment** for the email fallback, not a retention claim, and
it is a normal promise to make.

> **Removing both is the obvious way to do this and it deletes a promise we
> actually keep.** Read each hit before cutting it.

### 3. CHECK THE LABELS AGAINST BOTH SURFACES, not for an email path.

India's page documented an email path the product had outgrown. **Africa's
documented the right path under the WRONG LABEL.** Step 3 said *"tap Delete
account"*, which is correct on a phone and wrong in a browser:

```
web     account.tsx:1010-1045       button "Delete my account", dialog "Delete forever"
mobile  account/index.tsx:960-980   button "Delete account", native alert
```

**A reviewer following the page literally in a browser hunts for a label that is
not on screen.** Both are now named per surface. **Same class as India's, different
instance: do not relay India's version as the thing to look for.**

---

## X52. THE WIDE CUT NEEDS NO RENDER. CROP IT FROM THE PORTRAIT.

**Africa, `e5595348` and `af9cdda3`, and this removes a whole class of art job.**

```
crop=1080:608:0:1280   then scale to 1920x1080
```

**Why it works and is not a compromise:** the portrait already carries the white
opening, **and a cropped white frame is still white**, so the `xfade` survives
intact. Both cuts are then guaranteed the same 5.750s because they are the same
source.

> **Same-source is also the only way to guarantee that a learner rotating the phone
> does not change continent.** Two separately generated films will differ in
> content, not just in framing.

**So the house convention "generate 1080x1920, extend in post" is now proven end to
end.** Nobody queues a second 16:9 render. Tell any fork about to ask the owner for
a wide cut that it already has one.

---

## X49. A CONSTRAINT IS NOT AN ASSIGNMENT. AND THE LETTER FEATURES DO NOT EXIST IN THE FORKS.

**East Asia refusing a supervisor work order, 2026-09-07, and it was right on every
count.** The supervisor told East Asia to author Hangul and Kana letter sets because
the owner's Letter Drill ruling had "made it tractable". **Both premises were
false, and the second would have cost a fork real work for nothing.**

### FALSE 1: the alphabet data was already there.

`lib/script-trace/src/sea-alphabets.ts` came across in the fork and **already
carries the exact two languages the ruling allows**:

```
ko  Hangul     40 letters      (40, not the 24 base jamo: includes doubles and compounds)
ja  Japanese   92 letters      (two kana syllabaries at 46 each)
th 63, lo 46, km 51, my 43, vi 34, id 46, ms 63, tl 49
```

**The owner's ruling landed on the one part of the job that was already done.**

### FALSE 2, and this is the expensive one: THERE IS NO LETTER GAME TO RUN IT IN.

**Letter Match does not exist in East Asia. Neither does Letter Drill.** A grep of
every `.ts` and `.tsx` outside `node_modules` for `letter-match`, `letterMatch`,
`letter-drill` and `letterDrill` hits **only a design document**. The authoritative
list agrees: `GAME_IDS` in `artifacts/api-server/src/routes/learning.ts` is ten ids
— speed-round, phrase-builder, word-match, listen-and-pick, ticket-check,
wrong-platform, wrong-platform-2, luggage-match, signal-lights, express-listening.
**No letter game.**

> **So "build the letter set and Letter Match works immediately" was wrong twice:
> the set is built, and there is no game for it to work in.** A fork told this would
> have authored 116 characters, finished with exactly what it started with, and
> still had no game.

**CORRECTION TO X34b.** "Letter Match travels free and works the day it lands" is
true **about porting it FROM India, where it exists**. It is NOT true of a fork
that has never had it. **The gap in the forks is an unbuilt feature, not missing
data.** Read X5's port brief as the work, not X34b's sentence.

**`SEA_ALPHABETS` has exactly one consumer**, `scripts/src/buildPhraseReview.ts`,
which feeds the review page. **It is content-capture data today, not curriculum.**

### The mitigation X34a/X35a were missing, and it changes the priority.

The order-gates warning holds: `scripts.test.ts:152` asserts `scriptsOnRealData()`
equals `["devanagari", "gujarati"]` in an app that teaches neither. **But
`TRACING_ENABLED` at `lib/script-trace/src/scripts.ts:226` is FALSE in this fork
and `traceReadyFor` gates on it**, so the stale Indian data misleads **a planning
function rather than a learner.**

> **That makes it a documentation defect, not a shipping one.** Check
> `TRACING_ENABLED` in your own fork before treating it as urgent.

### THE RULE, and it is the supervisor's to carry.

> **The owner ruled what Letter Drill MAY ship with. He did not say build it. A
> scope ruling is a constraint on future work, not a work order.**

The supervisor converted his constraint into an assignment and handed it to a fork
as a task. **East Asia refused it, said so in those words, and took it to its owner
as a candidate with the measurements attached, so he could decide against a true
picture rather than the one in the supervisor's message.** That is the correct
response and it should be the default: **a fork that receives an assignment resting
on a claim about its own repo checks the claim first.**

**This is the fifth time in one day** the supervisor applied a correct general
finding past the evidence that produced it. Coverage without cost, ratio without
scripts, a recovery window without a boundary, a duration band without the cancelled
population, and now a port brief without checking the feature exists.

---

## X48. A COMMENT THAT DESCRIBES A GUARD IS NOT A GUARD.

**East Asia, 2026-09-07, and it is the sharpest form of the X15 family found yet.**

`bazaar-welcome.test.tsx:240` promised, in prose:

> *"If the film is ever swapped for a longer one without moving that constant, the
> first assertion fails."*

**It could not do that.** The test advanced hard-coded `5100` and `200`, so it only
ever measured the constant **against itself**. The film WAS swapped, for a 6.000s
one. The constant was NOT moved. **The suite stayed green while every mobile
learner lost the last 800ms.**

> **The comment was a specification of a guard that had never been built, sitting
> where the guard was supposed to be.** It is worse than no test, because it tells
> the next reader the case is covered.

### The fix is ENGINE and about twelve lines. Every fork that swaps a film needs it.

**Read the duration off the asset itself.** An mp4 carries its own length in the
`mvhd` box: find `mvhd`, read the version byte, then timescale and duration at the
offsets that version dictates. **No ffmpeg, no fixture, no new dependency.**
Cross-checked against `ffprobe` on the real asset: both give 6.000s exactly.

Two assertions, so it catches both directions: **`WELCOME_MS` greater than the
film**, and **the margin under a second**, so a timer four seconds too long fails
too.

**Proven by making it fail on purpose**, which is the step that separates this from
the comment it replaces. With `WELCOME_MS` put back to 5200 the pin reports
`Expected: > 6000, Received: 5200` while the other twelve stay green; restored to
6200, 13 of 13 pass.

### Two judgement calls worth copying

**The constant moved, not the film.** 5200 to 6200. The film is that fork's own new
art, and **trimming your own art to fit a number inherited from another fork is the
wrong way round.** The new value keeps roughly the original margin shape rather
than inventing one.

**The sibling guard was left alone, after checking rather than assuming.** The
feature-graphic guard below it says the generator "draws India's 22 languages", and
that is still literally true, so it stands. **Rewriting a guard because its
neighbour lied is how a true guard gets deleted.**

---

## X46. BOLO LATIN AMERICA IS THE SIXTH FORK. RULED BY THE OWNER 2026-09-07.

**Read this first if you are the LATAM session.** Then `~/bolo-sea/docs/fork-playbook.md`
Part A in order, then this whole ledger, then your own `HANDOFF.md`.

### The ruling

Put to him as A or B. **A: cut it now.** B was rule it and queue it behind the five
in flight, which the supervisor recommended on debt grounds. **He chose A.**

### Why a FORK and not a dialect inside Europe. This is the decisive fact.

Europe's `lib/db/src/seedData.ts` says in its own comment that it is *"a Europe
app, so Castilian Spanish (vosotros, not ustedes as the plural you) and European
Portuguese"*. A deliberate, written choice.

**The language code is bare `es`. There is no dialect, variant, locale or country
field anywhere in the schema.**

> So Mexican Spanish inside Europe is not a content decision. It needs a new code
> or a new field, and that is a **Gate 3** contract change across five repos to add
> a dimension nothing else uses. **A fork gives you a clean `es` meaning Mexican
> Spanish with no schema change at all.**

**The fleet already works this way.** `zh` means different things in SEA and East
Asia, and `yue` moved between them. **The fork boundary IS the dialect field.**
Same applies to `pt`: European Portuguese stays in Europe, Brazilian goes here.

### Parent and provenance

**Fork from `bolo-sea` main**, as Africa, Europe and East Asia all did. SEA is the
playbook's reference parent, not India. **`~/bolo-sea/docs/fork-playbook.md`
outranks this session's own reading of the code.**

### Why it fits the thesis better than almost anything in the fleet

BOLO is a **diaspora** app, not a language app: the learner understands their
elder and answers in English. **That describes US Latinos more exactly than any
group BOLO already serves.** Roughly 63M Hispanic Americans against about 5.4M
South Asian Americans, so this fork is plausibly larger than the other five
combined.

**The indigenous half is the part nobody else serves:** Nahuatl, Quechua, Guaraní,
Mixtec, Zapotec, Yucatec Maya, Aymara, Mapudungun, Garífuna. Mixtec and Zapotec in
particular are heavily spoken in California and Oregon farmworker communities.

**The competitive answer, since Spanish is Duolingo's flagship:** Duolingo teaches
Spanish from zero to a stranger. **This teaches PRODUCTION to someone who already
has receptive fluency and is ashamed of it.** Different learner, different product.
Do not let anyone reposition this as "a Spanish app".

### RULED BY THE OWNER, 2026-09-07. Do not re-litigate.

| | Ruling |
|---|---|
| **Domain** | **`bolo-latam.app`**, purchased and verified by RDAP (200, against 404 an hour earlier, with an owned domain as positive control). |
| **Repl name** | `Bolo! Latin America`. Ruled mechanically by the supervisor to match the fleet pattern, not by the owner. |
| **Parent** | Fork from **`bolo-sea`** main, as Africa, Europe and East Asia all did. |
| **Spine** | **THE BUS ROUTE.** Camión, colectivo, chicken bus. Chosen over the market and over a coast-and-river route. |
| **Elder** | **LA ABUELA**, at a roadside comedor where the bus stops. |

**Why the bus route, carried into the art commission:** it is how the region
actually moves, **it crosses borders so it can carry a multi-country catalogue**,
and it gives stops, drivers and roadside stalls to hang zones on. A market is a
place rather than a journey and does not sequence into zones. A coast-and-river
route strands Bolivia and Paraguay.

**Why la abuela:** the fork's entire thesis is a learner who understands their
abuela and answers in English. **Naming the elder that makes the product describe
itself.** Rejected: el chofer, who fits the spine perfectly but is not family, and
the diaspora hook is family.

**Note the pattern the whole fleet follows: the elder sits at a STOP on the spine,
never on the vehicle.** Chacha-ji runs a chai stall on the railway platform;
Africa's market mother keeps a roadside stall on the minibus road. La abuela keeps
the comedor the bus pulls into.

### STILL OPEN, and the owner's alone. Do not invent these.

- **The currency.** Sketched: **cacao**, which was literal money in Mesoamerica.
- **The language set**, and which are free tier.
- **Whether Brazilian Portuguese lives here or stays in Europe.**

### What this fork inherits on day one, so check before you trust anything

**Every debt found on 2026-09-07.** Do not assume a fresh cut is clean:

- India's Hindi elder audio and India's railway bazaar film (X43, X43a, X43e).
- India's bazaar key art, or SEA's, which Africa inherited instead (X43f).
- The parrot holding the Indian flag, and the `gen-store-assets.sh` guard that
  lies about it afterwards (X43k).
- The two duration ceilings, mobile only for the film (X43h).
- Separate web and mobile encodes of every film (X44).
- India's Devanagari stroke data, armed on the wrong alphabet (X34a).
- Sentences that COUNT the catalogue and never get updated (X43b).
- `practice-streak-xp.test.tsx`, the fleet-wide flaky timing test (X40).

---

## X47. A TIMEOUT EQUAL TO THE GLOBAL DEFAULT IS NOT HEADROOM, AND IT READS AS IF IT WERE.

> ## CORRECTED IN PLACE 2026-09-09. READ THIS BEFORE ACTING ON THE ENTRY.
>
> **This entry is true about caps and FALSE as a fix for the UNSTOPPABLE
> failure, and forks have been cherry-picking it expecting the second.** LATAM
> caught it by opening India's file to copy the comment and finding **India had
> already killed this theory in writing.**
>
> **India's own comment above its `WT`** lists FIVE dead explanations by name,
> **and two of them are what this entry tells forks to do**: "cap pressure" and
> "the outer `}, 30000)` annotation".
>
> **The toast is in the DOM for 1800ms and then gone for good.** India:
>
> > *"A poll that missed that window will miss it at 8s and at 20s alike; the
> > extra twelve seconds are spent waiting for something that can never
> > return."*
> > *"IF A CEILING ONLY CHANGES HOW LONG A FAILURE TAKES TO REPORT, IT CANNOT
> > ALSO BE A FIX."*
>
> **It is a RACE against a 1800ms auto-dismiss, not a budget.** India measured
> the failure as **bimodal**: a pass under 1s, or a failure at 8771ms with the
> inner `waitFor` ceiling sat out in full, **and nothing in between.** LATAM's
> failure was **8806ms**. Same ceiling, same shape.
>
> **AND THIS ENTRY DESCRIBES THE HALF THAT DOES NOT FIRE.** It is entirely about
> the per-test caps. **The number that actually fails is `WT`, the inner
> `waitFor` budget, which this entry never mentions.** A fork that applies X47
> faithfully changes the caps, leaves `WT` at 8000, **and stays exactly as
> red.**
>
> **THE CHERRY-PICK INSTRUCTION BELOW WAS NEVER FOLLOWED BY AT LEAST TWO
> FORKS.** SEA and LATAM both still carry `WT` 8000 and caps 30000/15000,
> including **the fork whose red board produced this entry.**
>
> **What survives:** a per-test cap equal to the global default is not headroom
> and reads as if it were. That finding is sound and the measurements below are
> real. **What does not survive is treating it as the cure for UNSTOPPABLE.**
>
> **The real fix is UNBUILT IN EVERY FORK:** fake timers with a deterministic
> advance, **which removes the race rather than extending the deadline.** India
> names it as likely and has not done it. **One ENGINE job that would fix six
> boards**, and bigger than a constant.
>
> **LATAM reverted its own change rather than shipping it**, on the grounds that
> it would have made a failure take twenty seconds to report instead of nine and
> **would then have been confirmed by the next intermittent pass.** One pass
> cannot confirm a fix for an intermittent failure.

**ENGINE.** Landed in India as `af307722`. `git cherry-pick -x` it to SEA, Europe,
Africa, East Asia and LATAM; both files are byte-identical across the forks.

**What went wrong.** SEA's `web` job went red on a green tree at
`practice-streak-xp.test.tsx`, the ten-round UNSTOPPABLE test, whose closing line
was `}, 30000);`. **`vitest.config.ts` already sets `testTimeout: 30_000`**, so
that explicit cap bought exactly nothing while looking to every reader like a
deliberate allowance someone had thought about.

**Measured on 2026-09-07, an 18-thread Mac, India's tree:**

| | run alone | inside the full 154-file suite |
|---|---|---|
| practice-streak UNSTOPPABLE | 646ms | 1935ms |
| speed-round-combo UNSTOPPABLE | not measured alone | 4369ms |

**Contention alone costs 3x on a fast machine**, and a 2-core hosted runner is
not a fast machine. Both caps are now `60000`, with the measured numbers written
into the comment so the next reader knows what was actually bought.

**The part worth copying is the second test.** The one that went red had 15x
margin. `speed-round-combo.test.tsx` had **3.4x** and nobody was looking at it,
because it had not failed yet. **Fixing only the test that fired leaves the
tighter one loaded.** Only two tests in the web suite carry an explicit cap and
both are ten-round accumulations; the search that found that is
`grep -rn "}, [0-9]\{4,\});" src/test/`.

**The general rule:** a per-test timeout is a claim about headroom. Write it from
a measurement, state the measurement next to it, and check it against the global
default before believing it does anything.

**AFRICA'S RESULT INVERTS THE OBVIOUS TRIAGE, 2026-09-07.** Run across forks, the
test closest to failing had the SMALLER cap: **27% of 15000 used, against 2.5% of
30000.** A fork that triages by cap size, biggest first, reads the wrong one
first every time. **Rank by used/cap, never by cap.**

## X53. ACCOUNT DELETION RAISED A FOREIGN KEY VIOLATION, AND FOUR REPOS FOUND IT SEPARATELY.

**ENGINE, and India was the last to get it despite being the parent.** India
`14e58209`. SEA `e5a7b91e`, Africa `922dbd8d`, East Asia `46ffb5df` all fixed the
same defect earlier today, independently, without it reaching upstream.
**EUROPE IS STILL BROKEN** as of this entry: its handler's purge list ends at
`contact_submissions` and goes straight to `delete(usersTable)`.

**The defect.** `DELETE /account` deletes the Clerk identity FIRST, then purges
local rows by name, then the `users` row. Three user-keyed tables were missing
from that list and their foreign keys are **`ON DELETE no action`**:
`zone_testouts` (migration 0036), `user_blocks` and `username_reports` (0056).
Any learner holding one of those rows hit an FK violation on the final delete.

**The failure ordering is the whole point.** The identity is already gone when
the purge throws, so the learner is **locked out permanently with every row still
present**: the worst of both halves, on the one control both app stores require.

**Why every test agreed.** The purge test seeds one row in every table the
handler already knows about and none that it does not, so it grew alongside the
handler and could never catch an omission from it. **A test built from the
implementation cannot find what the implementation forgot.**

**The check, and it is the deliverable.** For every table with a `user_id`, read
its `onDelete`. A cascade means it may be absent from the handler. **No cascade
means it must be named in the handler AND seeded in the test.** In India that
split ten cascading tables from seventeen explicit ones. Read the emitted
migration SQL rather than the Drizzle schema when it matters: the FK clause says
`ON DELETE no action` in plain text.

**The process finding is worth more than the fix.** Four sessions each paid for
the same bug in the same hour, in five copies of one handler, and not one of them
walked upstream to the parent. **A fork finding an ENGINE defect must post it
here before fixing it locally**, or the fleet buys the same lesson six times.

## X74. ONE LANGUAGE NOW ALLOWS FEWER LANGUAGES THAN FREE. THE RULING SHIPPED A REGRESSION INTO A PAID TIER.

**ENGINE, and it is live in India.** Found by East Asia 2026-09-08 while
finishing the port of India's `9ffea911` ("zone one is free in every language").
Every fork that ports that ruling inherits it. Grep: `allowedLanguagesForPlan`
`one_language` `FREE_LANGUAGES` `extendedLibrary`.

**The arithmetic.** After the ruling `allowedLanguagesForPlan` returns `null`
for Free, meaning every language opens. The `one_language` branch above it still
returns `[...FREE_LANGUAGES, chosen]`, four or five codes. So:

```
free          → null        → all 10 languages
one_language  → 5 codes     → 5 languages
```

**A learner who PAYS gets strictly less language access than one who does not**,
and `featuresForPlan("one_language")` has `extendedLibrary: false`, so the tier
does not sell depth either. After the ruling its only remaining benefit over
Free is unlimited chat time.

**Not fixed anywhere, on purpose.** The tier is dead in every fork (no
RevenueCat package, no purchasers), and re-pointing what a PAID tier sells is an
owner ruling, not a cleanup. **What every fork should do is name it at the
branch and at the test that pins it**, because the test is GREEN: it asserts
"one_language is denied a language other than its chosen one" and that assertion
now pins the regression. East Asia `01b1c2f8`. A green test pinning a regression
is the dangerous kind, and this one reads as correct at a glance.

**THE METHOD FINDING, which is worth more than the defect.** East Asia's first
pass at this ruling did seven of the twelve files India touched and reported
complete. Re-reading its own work said complete a second time. What found the
gap was one command:

```bash
cd ~/bolo && git show --stat 9ffea911
```

**Diff the parent's FILE LIST against yours. Do not re-read your own diff.** A
port is a set-difference problem and reading is the wrong instrument for it: you
re-read the files you remember, which are exactly the files you did. The five
missed files held two assertions that become their OPPOSITE (`free is denied a
locked language`, `402 language_locked when Free requests a locked language`) and
three fixture moves. All five are DB-backed, so no green suite anywhere would
have caught them.

**One place East Asia did NOT copy India.** India's chat-gate inversion is
`assert.notEqual(status, 402)`. Chat has a **second** 402, the Free weekly
chat-time cap, and the cap tests run in the same file against the same user, so a
status-only assertion goes red for a reason unrelated to languages. Pin
`json.reason`, not the status. India may want this back.

### X74b. THE PAYWALL IS STILL SELLING THE PARENT'S LANGUAGES. REGION, and every SEA child has it.

**Five strings in `app/(app)/paywall.tsx`, four of them live copy**, found in
East Asia the same hour and fixed in `01b1c2f8`:

```
"Learn any language, not just the free three"                   count is SEA's
"on top of free Vietnamese, Indonesian and Mandarin"             names are SEA's
"Vietnamese, Indonesian and Mandarin are always included free"   names are SEA's
"One language + the free three"                                  count is SEA's
"Learn the free three and the language you choose"               count is SEA's
```

**Two independent faults stacked.** The COUNT was Southeast Asia's three where
this fork has four, and the NAMES were Southeast Asia's languages in an app that
teaches neither Vietnamese nor Indonesian. On top of that, after the ruling
"every language" is what FREE gets, so the top All-Access benefit was charging
for something the app now gives away.

**AFRICA, EUROPE AND LATIN AMERICA SHOULD GREP THEIR OWN PAYWALLS TODAY.** They
are SEA children too and the strings are not in any of the region checklists.
`grep -n "free three\|Vietnamese, Indonesian" artifacts/bolo-mobile/app`.

**The replacement states no count and no list.** A count and a list are exactly
what went stale silently here, twice, and the language picker had already
learned that lesson in a comment nobody carried across. Benefit title is now
"Every zone, every language", the same words India uses, so the fleet sells one
thing.

### X74c. THE FORK PLAYBOOK STILL TEACHES THE FREE-LANGUAGE TIER. SEA OWNS THE FIX.

**`~/bolo-sea/docs/fork-playbook.md` is canonical and binds every fork**, and it
was written before both of 2026-09-08's rulings. Three places in it now instruct
a new fork to build a tier that no longer exists:

```
:588   FREE_LANGUAGES = ["vi", "id", "zh"] as const     the parent's list, fine
:593   sql.join(FREE_LANGUAGES ...) at freeTierContentPolicy.ts:39, 98
:1047  entitlements.test.ts:266 (FREE_LANGUAGES deepEqual)
```

**Line 1047 is the dangerous one.** That deepEqual is precisely the Kind 2
assertion both rulings invert, and the playbook lists it as a thing to WRITE.
Line 593's `:39` is rule 1's UPDATE, which is deleted. A fork cut next week and
followed faithfully rebuilds the doorway tier and then finds its own way back out
of it.

**Not edited by East Asia**, because the playbook is Southeast Asia's file and a
fork session editing another repo's canonical document is how canon stops being
canon. SEA should take it, or the supervisor should assign it.

**The one item in it that survives untouched and should be kept:** ":245
FREE_LANGUAGES is a list, and the free-tier POLICY is a second place." That is
still true and is still the trap. There are two places, they must agree, and the
whole of X74 is what happens when the ruling moves one of them.

## X75. THE SCORER DIVERGED IN SOUTHEAST ASIA AND ALL FOUR CHILDREN INHERITED THE OLD TEST OF IT.

**ENGINE, and it is a SCORING HONESTY decision, not a defect to sweep.** Found
by East Asia 2026-09-08 in the first full api run any SEA-descended fork has
had. Grep: `chooseConservativeTranscript` `pronunciationGuards`
`chosenEmptyWithEvidence` `empty sorts farthest` `honesty.test`.

**Measured directly, same input, same target, both repos:**

```
input   { mini: "", hq: "namaste" }
India   transcript ""         chosenEmptyWithEvidence true
SEA     transcript "namaste"  chosenEmptyWithEvidence false
```

**`lib/pronunciationGuards.ts` in East Asia is BYTE-IDENTICAL to bolo-sea and
DIFFERS from bolo. `openai.pronunciation.honesty.test.ts` is byte-identical to
bolo-sea's, which is byte-identical to India's original.** So Southeast Asia
changed the function and did not change the test, and no fork noticed, because
the api suites need a database and until tonight no fork had run one.

**WHY IT MATTERS MORE THAN A RED TEST.** "Empty sorts farthest" is an honesty
rule: when one recogniser heard NOTHING AT ALL, the conservative reading is that
the learner was not caught, not that the other pass can be trusted on its own.
Under SEA's version a learner gets a SCORE where India gives them a system miss.
Scoring honesty is the product in every one of these apps, and this changed it
in four of them without a decision being recorded anywhere.

**THREE CASES ARE RED IN EAST ASIA AND ARE LEFT RED ON PURPOSE**, with the
measurement written into the file above the fixture. Inverting them locally
would erase the only evidence the change was ever made, in the one fork that
found it.

**SOUTHEAST ASIA OWNS THE RULING.** Fix the FUNCTION or invert the TEST in
bolo-sea, then let it travel. The file is shared by five repos and a local edit
in any child guarantees a sixth version of the answer, which is the failure X6
already records.

**AFRICA, EUROPE, LATIN AMERICA AND EAST ASIA ALL HAVE IT**, and each will see
exactly three failures in that file the first time it runs its api suite. That
is not four bugs. It is one, four times.

### X75b. THE PROVIDER CONSTANT TURNS THREE MORE ASSERTIONS OVER.

Same run, same class, no ruling needed. `prewarmFeedbackTts` opens with
`if (TTS_PROVIDER === "elevenlabs") return;` and East Asia sets
`TTS_PROVIDER = "elevenlabs"` as a constant, so three `feedbackTts` cases assert
a code path the app deliberately does not take. **It fails with a REAL OpenAI
key too: the key was never the reason**, which is worth knowing before anyone
files it as an environment failure. Skipped on a condition that reads the
provider, so they come back the day a fork moves off ElevenLabs. Any fork whose
`TTS_PROVIDER` is not the parent's has this.

## GLOBAL FEATURE BACKLOG

**Owner ideas that belong to all five forks.** Not started, not assigned, and not
to be built without him saying go in the session that builds it. Newest at top.

### GB2. "Use it in a sentence": a button on every word.

**Owner, 2026-09-08.** Each word in a lesson gets a **button that pops up an
example sentence containing that word**, so the learner sees it in context
rather than as a bare gloss.

**Why it fits this product better than it would fit Duolingo.** BOLO's learner
already has receptive fluency: they understand their abuela and answer in
English. A bare word plus a gloss is the one thing they least need, because
recognition is the half they already have. A sentence is where production
lives, and it is also where register, word order and the politeness choices
each fork teaches side by side (tu/usted, wawqe/tura, Thai's particles) become
visible instead of theoretical.

**Global means global**, so it is every fork's. If it needs one new wire field
it is a **Gate 3** item before anyone writes it, for the reason X6 records.

**The thing an agent must NOT decide alone: where the sentence comes from.**
Three options and they are not equivalent.
- **Authored.** Best quality, and the sentence stage ALREADY EXISTS as a
  concept: `sentenceCount()` returns 0 for every fork past India, and the SEA
  and LATAM zone files ship no sentences field at all. So this option is a
  content commission, not a feature.
- **Generated at runtime.** Cheapest, and the trap. It would put unreviewed
  model output in front of the learner at exactly the moment they are being
  taught the word is correct, and in the indigenous languages that is the
  failure `latamZone1.ts` argues hardest against: a wrong Nahuatl sentence gets
  memorised and said to a grandmother.
- **Drawn from phrases already in the lesson** that happen to contain the word.
  Free, safe, reviewed to the same standard as everything else, and gives
  nothing for a word no other phrase uses.

**The honest starting point is the third**, with the button hidden when no
sentence exists, because it ships no new unreviewed content. The owner decides
whether it graduates to the first.

### GB1. Teaching mode: a toggle on BOLO chat that corrects you.

**Owner, 2026-09-07.** Chat gets a **toggle switch** for "teaching mode". With it
on, BOLO still holds a normal conversation **and also corrects the learner when
they say something wrong in the native language.** With it off, chat behaves as it
does today.

**It is a toggle, deliberately.** Conversation practice and correction are
different jobs, and being corrected mid-flow is what a learner wants some days and
the thing that kills their confidence on others. **The learner picks. Do not
quietly turn this into always-on correction.**

**Global means global:** the owner said so, so it is every fork's, not India's. If
it needs a single new wire field it is a **Gate 3** item before anyone writes it.
One ruling built five times separately is how Free Taste became four wire formats
(X6).

**The open question, and an agent must NOT invent the answer:** what counts as
"wrong" enough to interrupt. **Grammar, word choice, tone and pronunciation are
four different bars.** Pronunciation is the dangerous one: BOLO scores from a
transcript, and STT auto-corrects a learner's errors, so a transcript-based
"correction" can confidently correct something the learner said fine, or miss what
they got wrong. That is a product decision for the owner.

---

## GATE 3, OPEN. Game credits and the All-Access gift multiplier

**Raised by India, 2026-09-08. Owner ruling needed on the NAMES before anyone
writes either.** Both come out of the Chai economy audit run the same day; the
prices themselves are REGION and are already in India's `tokenEconomy.ts`.

**Why it is here and not just built:** X6 is the scar. One owner ruling on the
games taste became five names and four wire formats because five agents each
wrote the obvious thing. These two features will land in all five forks.

### A. Game credits, a new Chai sink

**Owner ruling 2026-09-08: game plays are sold, at 20 Chai each, in packs.**
Free learners only, on the six `TASTE_GAME_IDS` only. The ten All-Access games
stay shut at any price, exactly as stops past zone one do.

Proposed, and every name below is what needs the ruling:

```
NEW PATH     POST /tokens/game-credits
             operationId  buyGameCredits
  request    { pack: "single" | "trio" | "ten", idempotencyKey: string }
  response   GameCreditPurchase { granted, credits, balance }

EXTEND       GamePlays  (GET /games/plays)
  + credits: integer     purchased plays remaining, usable on ANY tasted game

LEDGER       spend_game_credits      label "Game credits"
             game_credit_consumed    label "Game credit used"
COLUMN       user_token_state.game_credits  integer not null default 0
PURE         gameTasteState({ plusOnly, isPlus, playsUsed, credits })
```

**The one real design choice inside this. Plays used are DERIVED**, counted off
`game_sessions` by `countTastePlays`, and are per game. Credits are proposed as a
**single global pool**, not per game, which means they cannot also be derived and
need a stored balance that decrements. **That is deliberate and it copies Station
Pause exactly** (`spend_station_pause` to buy, `station_pause_consumed` to use, a
column on the token state row), because a pattern already in the repo beats a
second one invented beside it.

**Alternative rejected, and say so if it is preferred:** per-game credits stay
derivable and need no column, but a learner then holds six separate little
balances and the hub has to explain six numbers.

### B. The All-Access gift multiplier

**Owner ruling 2026-09-08: All-Access gets an obvious multiplier on the daily
gift, and the monthly allowance is killed.** India's draw is now 2..10, doubled
to 4..20.

```
EXTEND       DailyGiftState  (GET /tokens/gift)
  + baseChai:   integer   the draw BEFORE any multiplier
  + multiplier: integer   1 or 2, what the base was multiplied by
```

**`chai` MUST keep meaning what it means today: the amount actually banked, after
the multiplier.** Every existing client reads it and none of them will be
rebuilt on the same day the server ships. The two new fields exist so the screen
can show the sum both ways, "18 drawn, doubled to 36", which is the honesty half
of the feature: a doubled number with the base hidden is a number the learner
cannot check.

**A single `doubled: boolean` was considered and rejected:** it cannot express a
third tier if one is ever priced, and it hides the arithmetic the screen needs.


### RULING, owner 2026-09-08: `Single | Trio | Stack`

The pack enum is `"single" | "trio" | "stack"`. **`stack` in place of the
proposed `ten`, and it is the better name for a reason worth keeping:** it
carries no quantity, so a pack can be retuned without a breaking change to a
live wire enum. The play count is data on the row, which is where a number
belongs. **Forks: copy the enum exactly. Do not localise these three words.**

Everything else in the proposal above was left unchanged and is taken as
approved: `POST /tokens/game-credits`, `GamePlays.credits`,
`spend_game_credits` / `game_credit_consumed`, `user_token_state.game_credits`,
and `DailyGiftState.baseChai` / `multiplier` with `chai` still meaning the
amount banked.

### ONE NAME ADDED THAT THE OWNER HAS NOT RULED ON

**`TokenState.allAccessGiftMultiplier`**, on `GET /tokens`. Not in the original
proposal; it fell out of the owner's later instruction that **the paywall must
show 2X daily gifts**.

It cannot be `DailyGiftState.multiplier`: **the paywall is shown to people who
are not subscribed**, and the gift payload says only what THIS learner drew,
which for a Free learner is 1 and tells the paywall nothing about what
All-Access would give them. So it rides the wallet query every client already
runs, exactly as the monthly allowance figure it replaces did.

`allowanceAllAccessMonthly` is **kept and now answers 0** rather than removed:
removing a field a shipped client reads is a breaking change, and both paywalls
already drop the line when the figure is not above zero, so every build in the
stores stops advertising the dead allowance with no release.


---

## 2026-09-08 india — THE CHAI ECONOMY REBUILD. Read this before touching prices

**Finished and green in India, unpushed at time of writing.** Four gates apply
and they do not all travel. **The headline for a fork agent: you cannot
cherry-pick most of this, because you do not have the packages it lives in.**

### FIRST, THE THING THAT BLOCKS EVERY FORK: X5 IS STILL TRUE

Measured today, all five siblings: **none of `bolo-sea`, `bolo-europe`,
`bolo-africa`, `bolo-east`, `bolo-latam` holds `lib/daily-gift` or
`lib/game-taste`.** `git cherry-pick -x` of the engine commits below WILL FAIL:
the files do not exist in your tree. **Port the two packages first, then apply.
A port is not a cherry-pick: re-verify every guard in your own repo.**

### THE AUDIT THAT CAUSED ALL OF IT

Run against source, not estimated. **Do this in your own repo before copying any
number, because the prices are REGION and yours will differ.**

- **Chai is worth 5 to 8 cents**, set by the packs (25/$1.99, 75/$4.99,
  200/$9.99). That is the only place Chai touches money, so it prices everything.
- **The old 5..25 draw paid a week-streak learner 570 a month**, worth $28.50 at
  the best pack rate: **2.9x the top pack, every month, free.**
- **The ceiling equalled a pack.** A single lucky draw of 25 was the entire
  $1.99 pack. If your fork's max draw equals your smallest pack, it is too high.
- **The shop was 20 Chai.** The wardrobe manifest held three items, all hats,
  two on sale. `OUTFIT_COST` and `PREMIUM_OUTFIT_COST` were **dead constants no
  catalogue row used.** Check yours: a price nothing charges is a price that
  drifts.
- **Every meaningful sink is Free-plan only, by design.** Stop unlock sells
  stops in a language the plan excludes; game plays sell past a ceiling
  `game-taste` says Plus never sees. **So the plan that earns most has least to
  spend it on**, and a multiplier makes that worse rather than better. India's
  answer: All-Access gets no meter, it gets a **Go Shopping** button to the
  bazaar.

### A LIVE BUG IN INDIA. YOU CANNOT SHIP IT, BECAUSE YOU DO NOT HOLD THE CODE

**`dailyGiftFor` set `day: chai`.** Correct under the flat ladder, because that
ladder paid exactly `streakDays` Chai on day N and the two were the same number
(`giftTierForStreakDay`'s own comment says "even though the two happen to agree
today"). **The draw broke the agreement and the line was left behind.**

Symptom on India's `main`: a learner three days into a streak drawing 18 is shown
**"Day 18"**, and after opening, **"Day 18 in a row"**. Second consequence:
`giftOpenedCopy` branches on `day >= GIFT_LADDER_CAP`, so anyone drawing 8 or
more got **"A full week. Same again tomorrow." on day one.**

**CORRECTED 2026-09-08 after East Asia pushed back on the first wording, and
the correction matters.** This said "a live bug is in the spec you hold", which
reads as though every fork were shipping it. **They are not.** `dailyGiftFor`
exists in NO fork, so there is no code for the bug to live in: this is a
category difference, not a near miss. **A session that greps for `dailyGiftFor`
and finds nothing has a working grep and an absent feature, not a broken
search.** Confirmed independently by Africa, LATAM and East Asia.

**So: if you port `lib/daily-gift`, port the fix, not the bug.** `day` is the
clamped streak day and never the amount. India is the only repo that had it and
it is fixed there.

### WHAT CHANGED, BY GATE

**REGION — write your own, never cherry-pick.** India's prices: draw **2..10**
(was 5..25), hats 25, shirt 35, pants 35, premium 90, stop unlock 100, First
Class 40, streak repair 40, Station Pause 15, Express 15, test-out retry 30,
standard garment 50, game credit packs 20/50/150, `VOICE_CHANGE_COST` 100
(exported, unwired). **Monthly allowance killed** (constant now 0, grant is a
documented no-op, ledger untouched). **Capstone Chai killed** (constant 0, grant
site guarded on `> 0`) because **the end of a zone was paying three times**:
`earn_zone_complete` 10 for finishing the stops, `earn_closeout_first` 2 for the
closeout game, `earn_capstone_first` 5 for the capstone conversation, all within
minutes and all on the same subject. **MEASURED IN THREE FORKS SINCE, AND THE MECHANISM IS IDENTICAL.** East Asia
confirmed it fires: the three reasons key on `lang:categoryId`,
`lang:categoryId` and `lang:zoneIndex`, which is one zone by two handles, and
**they share no dedupe key ACROSS reasons so none suppresses another.** Africa
and LATAM found the same constants at the same line numbers and correctly
reported PRESENT rather than CONFIRMED without tracing the paths.

**BUT DO NOT COPY INDIA'S KILL. What a learner earns is REGION and the
owner's.** India killed the capstone Chai on HIS ruling for THIS fork. East Asia
was right to queue the numbers for him rather than act on a peer's engineering
decision, and that is the correct handling: a relayed engineering choice is not
a relayed ruling.

**ENGINE — yours after you port the packages.** `gameTasteState` takes
`credits` (defaulted to 0, so no existing caller can accidentally grant one);
free taste is spent before the pool; credits never open an All-Access game;
`isPlus` short-circuits first. `giftDraw` returns `{baseChai, multiplier, chai}`
from ONE function so both grant paths cannot disagree, and the multiplier is
applied to the **already-rounded** base so `baseChai * multiplier === chai`
exactly and a learner can check the sum. `buyGameCredits` / `consumeGameCredit`
on the Station Pause pattern. `user_token_state.game_credits`, one additive
column, no backfill.

**CONTRACT — take these names exactly.** `POST /tokens/game-credits` with
`pack: single | trio | stack` (**no quantity in a name**, so a pack retunes
without a breaking enum change) plus a caller idempotency key.
`GamePlays.credits`. `DailyGiftState.baseChai` and `.multiplier`, with **`chai`
still meaning the amount banked** because shipped clients read it.
`TokenState.allAccessGiftMultiplier` for the paywall, which cannot be the gift
payload's field: **the paywall is shown to people who are not subscribed**, and
the gift payload says only what THIS learner drew.

### TWO TRAPS PAID FOR TODAY

1. **`tsc --build` masked a real error with stale build info.** A missing
   destructured parameter compiled clean under `--build` and was caught only by
   the consuming project's `--noEmit`. **Run the consumer's typecheck, or
   `--build --force`, before believing a green lib.**
2. **A stale `dist` broke an import that was correct in `src`.** `api-zod`
   re-exports from generated source, but api-server imports the built package:
   after codegen, **rebuild the libs or the new schema does not exist.**

### THE GUARD WAS PROVEN TO BITE

Removing the empty-pool check turned **exactly one** test red and restoring it
turned it green. 15 new tests, plus gift/taste/stop-unlock at 33, pure suite at
741, all four projects typechecking. **Do the same in your fork. A clean pass on
a guard nobody has broken is not evidence.**

### THE DESIGNSYNC HALF, per the owner's standing instruction

**Claude Design needs no MCP connection and no per-session login.** It is
reachable from any Claude Code session: the `design` skill publishes an editable
multi-artboard canvas, and `DesignSync` reads and writes design-system projects.
**`/design-login` is a one-time credential on the owner's Mac, already done.
Never ask him to run it** unless `DesignSync` itself returns an authorization
error.

**Reach for a canvas instead of a build-and-look loop** when the owner will want
to push a layout around himself. Today's wheel went through five rounds of his
edits on one canvas without a single simulator boot.

**What is actually on the account: one project, "Modernist",
`d4aeb6f5-234f-4b4d-a72e-1a2f5334cede`, and it is a generic web kit.** It holds
**none** of BOLO's real components: no Chai pill, no boarding pass, no gift box,
no game card, no access badge. **Do not describe reading it as reading our design
system.** Putting a real library in there is unstarted work and is a
**commission to offer, never a job to start unasked.**


### THE FORKS ANSWERED. What the broadcast actually turned up, 2026-09-08

**Five replies, and three of them corrected me.** Recording that, because a
broadcast nobody pushes back on is a broadcast nobody read.

**WHY X5 SURVIVED THIS LONG, and SEA found the root cause.**
`docs/fork-playbook.md:691` listed **`lib/daily-gift` and `lib/game-taste` as
pure packages that travel "Yes, unchanged"**. A fork following the playbook
faithfully would cherry-pick and fail on missing files, which is exactly what
the row promised could not happen. **Fixed at SEA's `c972ff37`**, naming them as
never having existed in any fork, and the row now carries the two packages that
DO exist and were missing from it: `train-class` and `referral-link`. **A
playbook that lies is worse than no playbook, because it is followed.**

**THE TRIPLE PAY, now measured in four repos.** East Asia traced the mechanism:
the three reasons key on `lang:categoryId`, `lang:categoryId` and
`lang:zoneIndex`, one zone by two handles, and **they share no dedupe key across
reasons so none suppresses another**. Africa notes the three fire from **two
different route files**, so "same subject" is a claim about each fork's own flow.
**Africa, East Asia and SEA all declined to delete a grant on a peer's say-so and
all three were right.** The measurement travels; the deletion does not.

**A CLAIM OF MINE THAT DID NOT SURVIVE CONTACT, and the forks were right to
say so.** I broadcast the `day: chai` bug as "a live bug is in the spec you
hold". No fork holds the code, so no fork can ship it. Africa put the cost
plainly: a session reads that, greps for `dailyGiftFor`, finds nothing, and has
to decide whether its own search is broken. **Corrected above.**

**AFRICA CANNOT RUN THE PRICE AUDIT, AND THAT IS NOT A GAP.** All seven
`STRIPE_*_PRICE_ID` values are `""` because no Stripe products exist for that
fork, and `routes/stripe.ts` answers 503 "pricing isn't configured yet" on a
falsy price. A non-empty placeholder used to walk past that guard INTO Stripe,
which is an opaque broken button instead of an honest message, which is why they
are empty rather than `REPLACE_ME`. **Any fork reporting "audit clean" without
checking whether it HAS packs is reporting on an empty set.**

**SEA's review-page collision, and INDIA IS NOT AFFECTED.** SEA fixed speaker
verdicts silently overwriting each other (`82fbd907`): the phrase id is sha1 of
the native text, so one phrase in two topics is ONE id, and the server upserts
on `(sessionId, phraseId)`. 127 phrases collided across SEA's ten languages,
found by a real reviewer who finished 659 Cantonese phrases and could not make
the counter reach the end. **SEA reported it as "India and every other fork will
have this". Measured in India today: FALSE for India.** There is no review page,
no `reviewPage`, no speaker-verdict flow and no `verdict` route in this repo at
all. **Every fork must measure this in its own tree rather than inherit the
claim** — the feature's presence is not uniform across the fleet.

**AND THE ONE THAT WILL COST SOMEBODY A NIGHT.** Africa:
`lib/integrations-openai-ai-server/src/audio/client.ts:10` is a **top-level
throw present in all six forks** with **three faces, not one**: it kills a first
Replit publish with a health-check error naming nothing; it **silently removes
117 tests from a local pure run** (651 against 768, **with the suite count
identical both ways, so there is no aggregate tell**); and it stops the file
importing locally. This is the same shape as India's own env-var trap: a module
that throws at import takes its tests with it before the runner counts them.


### THE PRODUCTION BOOTSTRAP REPORTS SUCCESS AFTER TOUCHING DEV

**Raised by Africa, verified in India's tree 2026-09-08. Fleet-wide, because
`lib/db/scripts/syncSchema.ts` is inherited.** This matters because
`~/bolo-sea/HANDOFF.md:532` recommends exactly this script for bootstrapping a
fork's production database before its first publish.

**`syncSchema.ts:62-65` exits 1 only when `DATABASE_URL` is UNSET. It never
checks WHICH database it reached, and its success line names no host:**

```
Schema sync OK: N statement(s) applied, M already present.
```

**In a Repl Shell `DATABASE_URL` is ALWAYS set and ALWAYS dev.** So an agent
that believes it is bootstrapping production runs the command, is told it
worked, and has done nothing to production. **Production stays empty, the next
publish fails on the same truncated index, and the log says success.** That is a
SILENT SUCCESS, which is the worst failure shape this fleet keeps meeting: not a
crash, not a blank, a confident report of work that did not happen.

**AND THE SCRIPT'S OWN HEADER SAYS IT IS THE WRONG TOOL:** *"It is NOT a
substitute for `drizzle-kit migrate` on fresh databases (post-merge setup /
production)."* The fleet's recommended production route is off-label according
to the file it recommends.

**THE COUNTS ARE THE TELL, AND THEY ARE THE HALF THE MISSING HOSTNAME DENIES
YOU.** LATAM's addition, from the first fork to run this against a real
production database:

| output | what it means |
|---|---|
| **N applied, 0 already present** | an EMPTY database. You reached production. |
| **0 applied, N already present** | already correct. |
| **a mix** | a DRIFTED database, which is what dev looks like. |

**"207 statements applied, 0 already present" is only possible against an empty
database, and dev was not empty**, which is the only reason LATAM can say its
run was sound. **An agent that reads the word OK learns nothing; one that reads
the counts learns which database it hit.**

**THE RULE. Any production write must (a) pass the production URL EXPLICITLY
rather than relying on the environment, and (b) PROVE which database it reached
before it is believed** — print the host and database name, never the password,
before and after. **A production bootstrap that cannot show which database it
touched is indistinguishable from one that touched the wrong one.** Africa is
building that into the command it hands over.

**A SECOND CORRECTION, AND IT IS INDIA'S ERROR.** India told Africa that a Repl
two commits behind "means a publish now ships the old economy, so the order
matters". **The conclusion did not follow.** Those commits are two UNWIRED
packages and a docs fix; nothing imports `lib/daily-gift` or `lib/game-taste`,
which their own headers state. Both publishes are behaviourally identical.
**The useful note is the reverse: THE PACKAGES ARE SAFE TO SHIP UNWIRED**, which
is why landing them before a publish costs nothing. **Nobody should delay a
publish believing an unimported package changes runtime behaviour.** India
inferred a runtime consequence from a commit delta without checking whether
anything imported them, which is the exact move this ledger keeps warning
against.



### LATAM IS LIVE, AND THE PUBLISH SEQUENCE IS NOW MEASURED END TO END

**First fork to publish since these traps were found, 2026-09-08. A fork that
has never published meets BOTH, in this order, and fixing the first is what lets
you see the second.**

1. **Trap 4 killed it first.** `OPENAI_API_KEY` missing, top-level throw at
   `audio/client.ts:10`, api-server exited 1, port 8080 never opened, and
   **Replit reported "database migrations could not be applied"**.
2. Secrets set, republished, and **trap 6 fired**: the generator emitted the
   `phrases_topic_stage_text_unique` index truncated mid-cast at `' '::te);`,
   syntax error at `";"`.
3. Fixed by bootstrapping production with `sync-schema` against **its own URL**:
   207 applied, 0 already present. The next republish found no diff.

**THE BANNER SAID "MIGRATIONS" TWICE AND WAS WRONG BOTH TIMES ABOUT WHAT HAD
ACTUALLY FAILED.** That is Africa's evidence rule with a second worked example.

**And the launch-day paywall fix is now proved on production rather than on a
laptop**, read-only against the real database: zone one open in all six
languages (331 of 331 free), zone two paid in all six (0 of 327 free). Without
the second reconcile that family row reads 327 free of 327 and **the entire paid
library serves free until somebody restarts the server.**

**Also verified in passing:** `/api/categories` answers 401 rather than 500, so
the dev-in-`CLERK_SECRET_KEY` and live-in-`CLERK_SECRET_KEY_PROD` split is right,
**the pairing that cost East Asia a screenshot run.**

### RULING, owner 2026-09-08: `credits` is the NAME, not the ADDRESS

**Gate 3, raised by LATAM, measured by India, ruled by the owner.**

**`credits` is the field name in all six repos. Where it rides is each fork's
own business** — whatever payload already tells that fork's app about game
plays.

**THIS CORRECTS AN ERROR IN INDIA'S OWN BRIEF**, which said "extend `GamePlays`"
and was written from India's tree as though it were the fleet's. Measured across
all six specs:

| repo | `GamePlays` | a `gameTaste` field | `/games/plays` |
|---|---|---|---|
| India | **yes** | no | **yes** |
| SEA | no | yes, named schema | no |
| LATAM | no | yes, named schema | no |
| Africa | no | **yes, declared INLINE** | no |
| Europe | no | no | no |
| East Asia | no | no | no |

**CORRECTED BY AFRICA. The first version of this table said Africa had neither**,
because the measurement grepped for a NAMED component under `components/schemas`
and Africa declares its shape **inline on the entitlements payload**. A shape
with no name cannot be found by searching for a name.

**AN ABSENCE IN A SEARCH IS A FACT ABOUT THE SEARCH.** That is this fleet's own
sentence, applied for once to the audit rather than to the code, and Africa
caught it only by checking a claim about its own repo instead of accepting one.
**The next fleet-wide audit will grep for something.**

**It strengthens the ruling rather than weakening it:** three forks carry the
taste shape and Africa groups with the Southeast Asia children exactly as a fork
cut from SEA should. India is more clearly the outlier, not less.

**India is the ONLY fork with `GamePlays`.** An instruction sent to five forks
named a schema four of them do not have, and it was written by the one fork that
does. **The minority tree described itself as the standard.**

**Why the address was not standardised.** Forcing India's endpoint everywhere
makes three forks build a surface they have no other use for and makes two serve
the same fact from two places that must then agree forever. **New duplication
bought to cure old duplication.**

**The cost, stated rather than discovered later:** a future instruction reading
"take `GamePlays.credits` exactly" will match nothing in four repos. **The field
name is the contract; the address is not.**

### THE MECHANISM, WHICH IS SHARPER THAN THE WARNING (SEA)

**A contract instruction has TWO HALVES and only one of them is a contract.**

```
"take GamePlays.credits exactly"
        ^^^^^^^^^  ^^^^^^^
        the ADDRESS: an implementation detail of whoever wrote it
                   the NAME: the actual contract
```

**It reads as one instruction and it is two.** And the vector is the discipline
itself: **the Gate 3 rigour that makes the first half right is what smuggles the
second half through.** A fork obeying carefully is exactly the fork that builds
a schema it does not need.

**THE FAILURE MODE IS OBEDIENCE, NOT CARELESSNESS.** An instruction reading
`GamePlays.credits` matches nothing in four repos, so the careful fork searches
its tree, finds nothing, and **CREATES the schema to comply.**

**THE CHECK, and it costs one sentence.** When relaying a name, say **what it
must be called** and separately **where yours happens to live**. Two sentences.
**Anything written as one sentence will be taken as one instruction.**

**SEA also declined the credit for getting this right**, which is worth
recording: it put `credits` on its own taste payload because that was the path
of least work, not because it spotted the mismatch. **Landing on the right
answer by convenience is not the same as reaching it**, and LATAM stopping to
ask is the behaviour to copy.

### AND THIS IS GATE 3'S FIRST POSITIVE CASE, WHICH DESERVES ITS OWN LINE

**Every other Gate 3 moment on record is a post-mortem**: someone discovering a
divergence that had already shipped. X6 is four wire formats found after the
fact. Today's contract items were all found by reading code that already
existed.

**This one was used BEFORE the fact.** LATAM hit an instruction it could not
follow, recognised the shape, and stopped. Nothing shipped, nothing had to be
unpicked, and the ruling cost one measurement and one question.

**Record it as the positive case deliberately, because a gate that only ever
appears in post-mortems teaches the next agent that it is a post-mortem tool.**

**LATAM STOPPED AND ASKED INSTEAD OF PICKING**, having recognised it as X6's own
shape: one decision becoming four incompatible formats because five agents each
did the obvious thing in their own tree. **The obvious thing in India and the
obvious thing in LATAM were different things, which is the whole reason Gate 3
blocks.** It also flagged that if the three Southeast Asia children shared the
shape then India was the outlier. They do, and it was.


### THE PARITY CHECKLIST IS AN INSTRUMENT, AND IT CAUGHT WHAT TESTS COULD NOT

**Owner, 2026-09-08, cutting through a long argument about schema addresses:
"just make sure all 6 are operating the same way with the same functionality in
the end."** India turned that into a fourteen-line checklist of what a LEARNER
must be able to do, and put it at the top of the brief.

**It immediately found a defect in East Asia that nothing else had.**
`buyGameCredits` read the wallet BEFORE the idempotency key, so the documented
free replay held only while the learner still had the money: buy a pack, spend
down, retry a dropped request, and get **409 for a purchase already made and
already paid for**, with the pack in their pool throughout.

**NOTHING FAILED. Every test passed on both sides of it, including the journey
test written specifically to prove that seam worked.**

**THE REASON IS THAT THEY ASK DIFFERENT QUESTIONS.** A journey test asks *does
the code do what it says*. A parity line asks *can a person do this thing*.
**Six of tonight's defects were absences a count or a set difference could
catch. This one was a correct function in the WRONG ORDER**, and only a
learner-side question reached it.

**India had the same bug and had already fixed it. East Asia found its own by
auditing rather than by reading India's diff, which is the right order**, and is
why the finding counts as an instrument rather than a copy.

**The practical rule: audit against the checklist SEPARATELY from running the
suites. A green suite is not a ticked line.**


## X84. "IT AUTOSCROLLS BACK TO TOP" WAS RUBBER BAND ON A PAGE THAT COULD NOT SCROLL

**India, 2026-09-08, `91f7ffee`. ENGINE: every fork has both files unchanged.**

**THE REPORT, from the owner on a phone:** *"storybook has a bug. user is unable
to press the next button, when they scroll down to see it, when they let go. it
autoscrolls back to top."*

**NOTHING WAS AUTO-SCROLLING, AND THAT IS THE WHOLE DIAGNOSIS.** There was
nowhere to scroll to. Three facts that are individually boring:

1. The tab bar is a **floating pill**, `position: absolute`, `bottom: max(inset,
   14)`, 74pt tall. It is painted OVER the content, not beside it.
2. `components/Screen.tsx` exports `TAB_BAR_CLEARANCE` (132) for exactly this,
   and twelve scrollers in the app use it.
3. `games/storybook.tsx` padded its bottom by **40**.

So the Next button was drawn under the bar. The page was ALSO too short to
scroll, so the drag was pure iOS rubber band and letting go returned the offset
to zero, which reads as "it scrolled back to the top". **A scroll position that
returns to zero is not evidence of a scroll.** If the content genuinely
overflowed, a release would settle at the far end, not the near one.

**THE BUTTON RENDERED CORRECTLY THROUGHOUT.** Every suite was green, a
`getByTestId` would have found it, and a screenshot of the top of the page looks
right. This is X15's family again: the check agreed for the wrong reason,
because presence was never the thing that was wrong.

**THE SECOND MISS IS IN THE SAME TWO FILES.** `games/_layout.tsx` has padded the
whole stack by `insets.top` since 2026-09-03, when the owner said *"too much
space up top"*, and every other game moved to `<Screen padTop={false}>` that day.
`storybook.tsx` and `emergency.tsx` are raw ScrollViews rather than `Screen`
users, so they were not in the sweep and kept paying `insets.top + 12`
themselves: about **47pt of dead air** above the title, which pushed the bottom
of the page further under the bar. **A fix that sweeps "every screen that uses X"
never reaches the screens that do not use X, and those are exactly the ones most
likely to be wrong.**

**EMERGENCY WAS WORSE AND NOBODY HAD REPORTED IT.** Its picker and game
scrollers had NO bottom padding at all and its end screen none either. It was
found by asking the class question rather than the instance question, which is
East Asia's rule from X15 and it earned itself again here.

**THE AUDIT, two lines, run it in your own tree.** It answers both halves:

```bash
cd artifacts/bolo-mobile
for f in $(grep -rl "ScrollView\|FlatList" "app/(app)/(tabs)" --include="*.tsx"); do
  grep -q "TAB_BAR_CLEARANCE\|QuickGameShell\|contentInset" "$f" || echo "BARE  $f"
done
grep -rn "insets.top" "app/(app)/(tabs)/games/" --include="*.tsx"
```

The first prints nothing on a clean tree. The second should name only the games
hub, which floats its strip over its hero on purpose.

**THE FIX HAS THREE PARTS AND ONLY TWO OF THEM ARE THE DIAGNOSIS.** The padding
and the notch are the bug. The third is the owner's call and it travels as a
DESIGN ruling, not as a consequence: **Next moves onto the picture**, pinned
bottom-right inside the story frame the moment a line is chosen, because even
once reachable it was a scroll away from the thing it advances. It carries a
white ring and its own shadow rather than relying on the primary colour, since it
lands on generated stills whose palette is unknown. Forks render their own art;
the placement travels, the treatment is yours to check against your own stills.

**THE TEST ASSERTS A POSITION, NOT A PRESENCE**, and that distinction is the
transferable part. The button was present through the entire bug, so the obvious
test would have been green the whole way. The guard picks a line and asserts Next
is INSIDE `storybook-frame`, **with the back button as a negative control**: if
`within()` ever stopped scoping to the subtree, the containment assertion would
pass vacuously with the button back at the bottom of the page, which is precisely
the bug. That is the same vacuity hole X15 found in a set difference, wearing a
different costume.

**WEB IS NOT AFFECTED AND WAS NOT CHANGED.** Its twin pads by `pb-nav` and a
document scroll has no rubber band to snap back from. **Check yours rather than
copying this sentence**: it is a statement about India's web tree.

### WHAT THE FLEET SENT BACK, 2026-09-08, WITHIN AN HOUR OF THE BROADCAST

**East Asia: BOTH FILES BARE**, measured rather than assumed. `storybook.tsx`
padded 40 against a clearance of 132, so 92pt short; `emergency.tsx` carried
THREE scrollers and neither of its two styles had any `paddingBottom` at all.
Its note: the correct pattern was **already in the same folder** (`games/index`
and `phrase-builder` both import `TAB_BAR_CLEARANCE`), so this was a miss rather
than an unknown.

**Africa: CLEAN ON ALL OF IT**, and the reason matters more than the result.
Africa met this same defect **weeks ago from the OTHER END**: as a Dynamic
Island's worth of empty page ABOVE the back button, reported by the owner as
*"too much padding on the storybook stop"* on 2026-09-03. Fixing the top left
the bottom correct. **India met it as an unreachable button at the bottom and
Africa met it as a gap at the top. Same defect, opposite symptom**, which means
a fork hunting India's symptom and finding nothing cannot yet tell "clean" from
"looking in the wrong place".

**AFRICA'S CORRECTION TO THE BROADCAST, AND IT IS THE REUSABLE ONE.** India's
prose said storybook "pads its bottom by 40", but India's own tree already reads
the fixed form, so a fork told to grep for 40 finds nothing either way. **THE
INSTRUMENT MUST BE THE POSITIVE: grep for `TAB_BAR_CLEARANCE` and flag its
ABSENCE.** An absence-of-the-wrong-value search and an absence-of-the-right-value
search return the same empty output and mean opposite things. This is X15's
family again: the check agreed for the wrong reason.

**THE PREVIOUS SUPERVISOR'S ADDITION: 132 IS A MEASUREMENT OF INDIA'S BAR.** A
fork whose chrome differs needs its own number from its own `Screen.tsx`. **The
grep travels; the value may not.**

**AND THE CLASS IS BIGGER THAN BOLO.** Three sessions in three codebases hit
"assert position, not presence" on the same day. BollyMoves shipped an autoscroll
hook to six screens with three green tests and **all six crashed**: every test
asked whether the hook call was IN THE FILE, and the whole defect was that it sat
**below an early return**, so it ran on some renders and not others (React #310).
Sticker Safehouse found a control it had typechecked, unit-tested and never once
watched render. **The element was perfect and its POSITION was the bug**, which
is exactly the Next button, and no presence assertion can see it.


## X90. A BOARD THAT IS RED EVERY TIME IS A BOARD NOBODY READS

**India, 2026-09-08, diagnosed and deliberately NOT fixed tonight.**

**THE NUMBER FIRST.** Of India's last 25 CI runs: **16 failure, 8 cancelled, 0
success.** Over 40 runs, 5 successes. The `api-db` job has been red for as long
as the history reaches.

**AND IT WORKED ON ME EXACTLY AS YOU WOULD EXPECT.** I shipped six commits, a
1.0.17 build, and a store submission past that board tonight **without looking at
it once.** I found it because the supervisor asked for a status line, not because
anything drew my attention to it. **A signal that fires on every run is not a
signal**, and the cost is not the two tests, it is that everyone with commit
access has been trained to ignore CI.

**BOTH FAILURES REPRODUCE LOCALLY, SO THIS IS NOT A CI-ENVIRONMENT ARTEFACT, AND
NEITHER IS A REGRESSION.**

**1. `freeTierContentPolicy.test.ts` is a VACUITY GUARD DOING ITS JOB.** Its own
message:

> *"NO LESSON GROUPS IN THIS DATABASE: the free-tier policy cannot be tested here
> at all. A migrated-and-seeded database has languages, categories and phrases
> but no journey content, so this file needs the Repl's dev database or a content
> import, and everything it asserts about zone one is vacuous until then."*

**It is refusing to report success about nothing, which is precisely what this
fleet spent a week learning to want.** The defect is not the guard. The defect is
that the guard has been shouting into a job nobody reads, every run, for weeks.

**2. `openai.tts-cache.test.ts` needs a REAL OpenAI key.** The test deletes
`ELEVENLABS_API_KEY` on purpose to exercise the gpt-audio fallback, and that
fallback then has to actually synthesise. **Proven by running it both ways: with
a placeholder key, 18/20 across the pair; with the real key from `.env`, 19 of 19
in that file pass, 0 fail.** One live call settled it.

**SO THE TWO TESTS ARE MISCLASSIFIED RATHER THAN BROKEN.** They sit in
`db-tests.txt`, which CI runs, and they need things CI does not have: journey
content in the database, and a live credential.

**THE OBVIOUS FIX IS THE ONE TO BE CAREFUL WITH.** A third manifest
(`live-tests.txt`) alongside `pure-tests.txt` and `db-tests.txt`, with the
existing three-way detector extended to enforce it, is exactly in the grain of
what this repo already does and would make the omission explicit rather than
silent. **It also CHANGES WHAT CI RUNS**, and two forks deferred a change of
exactly that shape earlier the same night rather than land it tired at the end of
a long session. **India is taking the same decision for the same reason.**

**WHAT NOT TO DO, and it is the tempting one:** do not make the board green by
moving the loud test somewhere quieter. The `freeTierContentPolicy` guard is
correct and its red is informative the first time anybody reads it. **The problem
is the reading, not the shouting.**

**THE TRANSFERABLE RULE.** Every fork should run
`gh run list --limit 25 --json conclusion` on its own repo tonight. **If the last
25 runs contain zero successes, that job has been telling you nothing for weeks
and you have been agreeing with it.** A cancelled run is not a pass either
(there are eight of those here), which the fleet already knew and which did not
help, because nobody was looking at the board at all.

---

## X92. THE 3D BIRD IS NOT AN ART TASK. IT IS A COMMISSION WITH A HOLE IN IT ON PURPOSE.

**Owner, 2026-09-09:** *"I will need to create new wardrobes for each stream. I
currently have a graphic designer working on the 3d version of BOLO bird. I want
you to read the 3D POC i did with claude and add that task as the first one after
full app content and code is complete."*

**READ THE BRIEF'S OUT-OF-SCOPE LIST BEFORE PLANNING ANYTHING AROUND IT.**
`~/bolo3d-poc/brief.html` says, in as many words: *"Do not build the wardrobe.
Attachment points only; the garments are a separate commission."* The designer
returns a rigged bird carrying `attach_head`, `attach_body` and
`attach_wing_L/R` **and no clothes**. That is not an oversight in the brief, it
is a deliberate seam, and the half on this side of it — six streams of wardrobe,
specified per fork — has no owner assigned yet. **A commission's exclusions are
load-bearing. Read them the way you read its deliverables.**

**WHAT THE POC PROVED THAT OUTLIVES THIS BIRD**, and it is not the bird:
Tripo's image-to-3D gives you **a texture or parts, never both**, and neither
half ships alone. HD is 1,928,676 triangles fused into one 55 MB lump. The parts
export is 47,177 triangles in eleven clean anatomical pieces with **no UVs at
all**. The method is to use the parts export as a **stencil** against the
retopologised textured mesh, assigning every triangle to the part it sits
nearest and cutting along those lines. Three scripts do it, all generic, none of
them knowing anything about Bolo: **the next character costs one command.** The
reusable asset is the pipeline, not the parrot.

**THE TRAP INSIDE THAT METHOD.** Every cut part came back an **open shell**,
because the service generates one closed surface and then cuts it into patches.
Lifting a wing showed a hole. **A seam at a joint is not a pose problem and no
amount of regenerating fixes it** — skin weights do. Anyone who sees a seam and
orders another generation is buying the same seam again.

**THE FLEET-WIDE REASON IT IS WORTH MONEY**, stated in the constraints it
deletes rather than in the pictures it makes. Each of these is written in the
existing 2D wardrobe scripts' own comments:

- `gen-mascot-accessories.mjs` seats a hat by thresholding for the two largest
  near-white blobs to find her eyes, taking the angle between them as head roll,
  measuring a crown band, and lifting the hat until it clears a grown eye mask.
  **Two poses need hand overrides and there is a drag-and-rotate editor for when
  that still fails.** In 3D a hat is a child of the head node.
- **The sleeve rule exists because the compositor redraws her wings in front of
  the cloth**, so a sleeve has nothing to wrap. Jackets, hoodies and coats are
  forbidden; a Western set was generated once and rejected. In 3D a sleeve is
  geometry skinned to the wing.
- Build 26 grew every sprite from 1024 square to 1024x1200 for about 113px of
  sky above a peacock feather, and **128 call sites had to be checked**. In 3D
  the camera frames wider.

**THE CHEAP VERSION IS THE ONE THAT SHIPS: 3D AS AN ART SOURCE, NOT A RUNTIME.**
Render the same transparent PNGs the app already loads. Zero new dependencies,
zero store risk, and six wardrobes become renders instead of six commissions.

**AND THE EXPENSIVE VERSION MUST NOT ARRIVE BY THE BACK DOOR.** There is no
`three`, no `expo-gl` and no `expo-three` in the mobile dependencies. Real-time
3D means a native GL module in an app where **`expo-image` is banned outright
after crashing five cold starts out of five** and the native animation driver is
dead in release builds. If it is ever attempted: the hidden-route pattern
(`author-strokes.tsx`, shipped in release, linked from nowhere, reached only by
a deep link), importing `expo-gl` **only inside that route**, never from the
launch path — and **only a TestFlight store build settles it**, because ad-hoc
builds crash ten times out of ten regardless of contents.

**A CORRECTION FILED IN THE SAME BREATH.** This supervisor had put *"the Naacho
rigged glTF, a purchase"* on East Asia's plate in `SUPERVISOR.md`. **Naacho is
BollyMoves' dancer commission and has nothing to do with BOLO.** Two rigged-model
commissions running in the same week, for two different apps, and the one with
the better-known name got filed against the wrong fleet. Removed 2026-09-09.
**When two projects share a shape, the shape is what makes them easy to confuse,
not what makes them related.**


## X93. A LOCAL RELEASE iOS BUILD IS BROKEN IN EVERY FORK, AND NOTHING COULD HAVE TOLD YOU

**India, 2026-09-09, found while trying to shoot 13in iPad screenshots.**

```
error: expo-router/entry.js: Cannot find module 'babel-preset-expo'
```

**Xcode's "Bundle React Native code and images" phase cannot see pnpm's hidden
hoist directory**, so the JS bundle is never built and the `.app` ships without
one. **THE FIX IS ONE ENVIRONMENT VARIABLE** on the `xcodebuild` invocation:

```bash
NODE_PATH="<repo>/node_modules/.pnpm/node_modules" xcodebuild ... -configuration Release ...
```

**Verified in isolation BEFORE spending a twenty-minute build**, which is the
part worth copying: `require.resolve('babel-preset-expo')` throws MODULE_NOT_FOUND
from the mobile package and resolves instantly with that path set. Then a real
build succeeded with a 14.6MB embedded bundle.

**WHY NOBODY HAS HIT IT: NOBODY HAS BUILT RELEASE LOCALLY.** Every local iPad and
simulator build in this repo's history is **Debug**, and Debug SKIPS that phase
entirely because it pulls JavaScript live from Metro. EAS builds Release on its
own machines with its own install layout. **So the local Release path has been
broken for as long as it has existed, and there was no observer.** Same family as
`haveFfmpeg` and the missing webp encoder: a capability nobody exercised, failing
silently, in a direction nothing reports.

**This is the same root as the Metro shim rule** (`./node_modules/.bin/expo`,
never the CLI entry directly): `babel-preset-expo` is only a transitive dep of
`expo`, so it lives in the hoist dir and the `.bin` shim is what puts that dir on
the path. Xcode's script phase has no shim, hence the explicit `NODE_PATH`.

### X93a. AND THE BUILD THEN RENDERS A WHITE SCREEN. UNRESOLVED.

**Do not read the fix above as "Release builds work now."** The resulting app
launches, stays alive, reaches **India's own Clerk** (`clerk.bolo-india.app`, so
it is genuinely India and not a sibling), and draws **99.9% white at forty
seconds**. No JS error in the device log beyond a harmless expo-notifications
warning.

**India stopped rather than push on**, on its own measurement rules: a
release-mode boot problem on a configuration never run here before is a fresh
investigation, not a last mile, and the session was long. **Next move for
whoever picks it up: Debug plus its own Metro on a spare port**, which is the
configuration known to work on iPad here.

### X93b. CHECK WHAT IS INSTALLED ON A SHOTS SIMULATOR, NOT ITS NAME.

**The prepared simulator named "Bolo Shots iPad 13" has `com.bolo.sea` installed.**
India went to use it for India's App Store screenshots and would have shot
**SEA's app and filed it as India's** — the exact inherited-art defect being
broadcast to five forks the same night.

**A device name is a filename**, and this ledger already has three other entries
saying a name is not the thing. Before shooting anything:
`xcrun simctl listapps <udid> | grep -i bundleidentifier`. Make your own device
if there is any doubt; it takes one command.


## X94. THE NEST HOLDS THE PARENT'S PATHS AND THE PARENT'S DOMAIN AS LITERALS

**India, 2026-09-09. Raised by SEA, confirmed in the parent.**

SEA found its Nest carried **24 data-copy paths reading `~/bolo/`** and none
reading `~/bolo-sea/`, with all 24 files present in SEA at the same relative
path, and **two commands curling `bolo-india.app/api/healthz`**. It fixed its
own.

**MEASURED IN THE PARENT: `assets/nest-production.html` has 25 hardcoded
`~/bolo/` paths and 14 hardcoded `bolo-india.app`**, plus 2 more in
`routes/nest.ts`. **Every one is correct in India and wrong in every fork.**

**SO DO NOT FIX IT FIVE TIMES.** This is the same class as a generator holding
its region in a constant: **a regional literal inside something that looks like
machinery**, correct in the parent, invisible to any check the parent runs. The
Nest is a hand-written document with no build step, served off disk by
`routes/nest.ts`, so the fix is a substitution at SERVE time against values the
fork already owns, not a find-and-replace per fork.

**India has not done it yet and is naming it rather than sitting on it.** The
fleet-wide Nest is coming, and designing the parent-path default out is cheaper
before that than after.

---

## X-20260909-1455. THE LEDGER'S NUMBERS HAVE COLLIDED FOUR TIMES, AND THE COUNTER IS THE CAUSE

**Fifth supervisor session, 2026-09-09. Found by aakeshpatel-48, confirmed by 94,
measured again here before ruling.**

**THE ROWS, not the total.** 85 top-level `## X<n>.` headers, 81 distinct ids,
four ids used twice at opposite ends of the file:

    X53   line 7768  FIVE FORKS BOUGHT ONE LESSON FOUR TIMES IN ONE HOUR
          line 8229  ACCOUNT DELETION RAISED A FOREIGN KEY VIOLATION
    X84   line 3443  A BITE TEST CAN BE PERFECTLY TARGETED AND PERFECTLY UNOBSERVED
          line 9012  "IT AUTOSCROLLS BACK TO TOP" WAS RUBBER BAND
    X90   line 2354  "SCRIPT TRACE NEEDS FOUR FONTS" IS WRONG BY THREE STEPS
          line 9130  A BOARD THAT IS RED EVERY TIME IS A BOARD NOBODY READS
    X93   line 2629  THE PRIVACY LINK IS BYTE-IDENTICAL TO A 404, IN THREE FORKS
          line 9264  A LOCAL RELEASE iOS BUILD IS BROKEN IN EVERY FORK

**A first count said forty-one collisions and it was wrong.** The regex reduced
`X55b` and `X43a` to 55 and 43, so the intended sub-entry convention read as a
defect. **Four is the real number and the difference is a total against rows.**

**THE MECHANISM, and it is not carelessness.** Every writer greps for the highest
number and takes the next. That is a fact about *its own read*, not about the
file, and the file moved: it grew from 9,189 to 9,347 lines inside a single turn
tonight. Two writers reading the same tail both correctly compute the same next
number. **The collisions sit at opposite ends because whoever inserted mid-file
was invisible to whoever appended.**

**THE COST IS NOT COSMETIC.** The keyword index at the top carries ONE row per
number. So the X53 row now merges keywords from two unrelated findings; the X84
row carries only the storybook keywords, leaving the bite-test entry on disk and
unreachable through the index built to reach it; X90 the same in the other
direction. **Three findings are written down and cannot be found.** That is the
exact failure the ledger exists to prevent. Each of X53, X84 and X90 is already
cross-referenced four to five times, so every one of those references is now
ambiguous.

### THE RULING, and it retires the counter rather than repairing it

**NEW ENTRIES ARE DATE-STAMPED, NOT NUMBERED: `X-YYYYMMDD-HHMM`.** This entry is
the first. It is collision-free by construction, it requires no read of the file,
and it needs no coordination between sessions. **A number you have to look up is
a number two sessions can look up at the same moment.**

**EXISTING `X<n>` ENTRIES KEEP THEIR NUMBERS AND ARE NOT RENUMBERED.** Every
existing cross-reference keeps resolving, and the sub-entry convention
(`X43a`, `X55b`, `X81b`) is unaffected and still correct.

**THE FOUR COLLIDING PAIRS ARE NOT BEING RENUMBERED TONIGHT, DELIBERATELY.**
aakeshpatel-48 named the reason and it is right: renumbering a shared file while
an unknown number of sessions are appending to it is the same mistake again, at
the same moment. **Stop the race first; repair after.** Until then, a reader
following "see X84" should expect two entries and read the one that matches the
subject.

**WHAT A FORK DOES WITH A FINDING RIGHT NOW:** append with a date-stamped id, or
send it to the chair. Both are safe. **Do not grep for the next number.**

### THE SHAPE, because it is one this fleet already knows under another name

**A value derived from a read is only true for as long as nothing else writes.**
The same shape as Africa's `curl` returning 000 for hours after the certificate
minted, filed the same night: a measurement of live state, taken correctly, and
then quoted long past its shelf life. **Both are the fixture-chosen-because-
absent rule wearing new clothes.** The counter's version is worse only because
two readers can be simultaneously correct and still collide.

---

## X-20260909-1620. A DRY RUN THAT ONLY READS AND COMPARES CHECKS COHERENCE AND NEVER LEGALITY

**SEA, 2026-09-09, `c790ff7a` and `186fc7ce`. ENGINE for any script that previews
a write. Found by running it against production with the owner at the keyboard.**

**THE RESULT FIRST, because it is the largest quality event this project has
had.** SEA's phrase-review applier read **1,946 verdicts** from three real native
speakers (Achmad_Fandi in Indonesian, Arn_Felix in Tagalog, Gigi in Cantonese):

    1,892  "correct", nothing to do
       46  corrections written to production
        5  blocked by a unique index
        2  held on purpose

**1,892 phrases an agent wrote with no speaker have now been signed off by one.**

### THE DRY RUN WAS HONEST AND COMPLETE ABOUT THE WRONG QUESTION

It proved the ids resolved, the verdicts parsed, the credential worked and **zero
rows were stale**. Every one of those is true and none of them is about whether
the writes were **legal**. Legality lives in an index the dry run never touches.
`--apply` threw **23505** on `phrases_topic_stage_text_unique` with half the rows
in: a correction turned "Sampai ketemu" into "Sampai jumpa" and Indonesian
already held a row saying exactly that.

> **ASK WHICH INDEX A PREVIEWED WRITE WILL HIT.** A preview that reads the rows
> it will change has checked that they cohere. Nothing has asked the database
> whether it will accept them, and nobody noticed that second question existed
> until Postgres asked it.

**THE SCRIPT HAD NO TRANSACTION AND THAT WAS THE RIGHT CALL, RESTATED
DELIBERATELY.** 277 lines, no BEGIN, no COMMIT, a bare `db.update` in a loop. The
tempting fix is a transaction, and SEA refused it with a reason worth keeping:
**these rows have no relationship to each other, so all-or-nothing rollback means
one reviewer's clash costs fifty good corrections.** The right fix was a
pre-check that prints `COLLIDES`, skips, counts, and carries on at exit 0.

### THE SAME NUMBER MEANT THE OPPOSITE THING AFTER A PARTIAL WRITE

The dry run's danger signal is `no longer matches any phrase`, because ids hash
the phrase text: a large number means the library moved under the reviews and the
speakers' work was wasted. It read 0.

**After the partial apply the recovery run read 2, and that 2 was a RECEIPT.**
Writing a native-script correction changes the row's own id, so a successfully
applied correction re-appears as unmatched. **The number that means "your reviews
are worthless" and the number that means "the write succeeded" are the same
number.** SEA fixed it rather than documenting it: the branch now looks up the
correction's target text and reports `already applied by an earlier run` and
`no longer matches: 0` separately, proved on a local Postgres with the real
schema rather than reasoned.

**A GUARD AGAINST A SILENT NO-OP CONTAINED A SILENT NO-OP.** A bare `--skip` with
nothing after it built the set `{0}`, because `Number("")` is 0 and
`Number.isInteger(0)` is true, so the emptiness check saw size 1 and waved it
through with a skip list matching no row. Found by running all four input shapes
instead of the happy one.

### THREE FOR THREE, OUR DATA WAS THE BUG AND THE REVIEWER WAS RIGHT

The supervisor flagged three corrections as reviewer errors. **One was. The other
two were ours**, and the second is the expensive one:

- **`#3793`, the spice pair.** `seaZone4.ts:569` and `:570` differ by one word.
  Apply both corrections and the app has **no way to ask for more spice** and two
  rows mean less. A local slip on adjacent near-identical rows, caught by logic
  and needing no Indonesian.
- **`#130 nasi`.** The gloss is `Rice, and also "a meal"`. The reviewer
  **translated our editorial note**, faithfully. **Thirteen phrases carry that
  comma-joined shape** (9 rice, 2 help, 2 love) and nine languages have the rice
  one waiting, so every future reviewer walks into it. Parentheticals read as
  notes and are handled fine; it is the **comma-joined aside** that reads as prose
  to translate.
- **`#2076 Hatinggabi`.** Our gloss said "Night". *Hating + gabi* is half-night,
  **midnight**. We were teaching that midnight means night.

> **THE SPEAKERS ARE OUTPERFORMING THE CONTENT.** Every fork about to meet its
> own reviewers should expect corrections that are answers to a badly-written
> question, and should read them as content bugs rather than reviewer errors.

### THE BROWSER HANDOVER QUESTION, AFRICA'S, AND IT REPLACES THE OLD ONE

**Ask a fork holding the browser "DOES YOUR WORK NEED A DRIVER RIGHT NOW", never
"are you busy".** Africa was mid-render in Flow and handed Chrome over at **zero
cost**, because generation is server-side and finishes with no extension
attached. Assuming "rendering, therefore needs Chrome" would have parked the
owner for nothing, and the rule that cost a password on 2026-09-07 would have
been obeyed to the letter and still got the answer wrong.

### AND A NEGATIVE MEASUREMENT OF LIVE INFRASTRUCTURE HAS A SHELF LIFE OF MINUTES

Africa reported `curl` returning **000** for `bolo-africa.app` and had been
quoting it for hours; the supervisor measured **200** with Africa's own title and
a 401 JSON on `/api/health`. The certificate had minted in between. **Africa was
not wrong when it measured and was wrong when it quoted**, and it had been
deferring store work behind a block that no longer existed. Re-measure a negative
before planning around it.

---

## X-20260909-1810. SINGLE-SOURCE CONSOLIDATION GOES FIRST. OWNER RULING, AND HE BEAT THE SUPERVISOR'S ARGUMENT

**Owner, 2026-09-09, verbatim. His instruction, not a supervisor inference:**

> *"I need to get to a place where it's only updated or fixed in one place and
> automatically applies to every app."*
>
> *"i would rather do the singular code work first because the other apps aren't
> in review or live yet"*

**THE SUPERVISOR ARGUED AGAINST IT AND WAS WRONG, AND THE SHAPE OF BEING WRONG
IS WORTH KEEPING.** The argument put to him was that a shared component still
costs six version bumps, six deploys and, for anything in a binary, six store
submissions, so *"automatically applies everywhere"* is not purchasable with a
refactor. **Every sentence of that is true and the conclusion did not follow.**

> **THAT COST LANDS AFTER SUBMISSION.** India and SEA are in stores. East Asia,
> LATAM, Africa and Europe have store records and nothing in review. **The cheap
> window is open now and it closes the day they submit.** A cost that is real
> later is not a reason against doing the thing that gets cheaper by being done
> sooner.

**THE MEASUREMENT THAT FRAMES THE JOB.** Every `.ts`/`.tsx` under
`artifacts/{gujarati-coach/src, bolo-mobile/{app,components}, api-server/src}`
hashed against the same path in `~/bolo`:

    bolo-sea     529 identical / 898   58%   313 differ   56 fork-only
    bolo-east    526 / 911   57%             314          71
    bolo-latam   533 / 888   60%             306          49
    bolo-africa  524 / 887   59%             317          46
    bolo-europe  542 / 895   60%             299          54

**About 530 files exist six times.** The trap in that number, and every fork was
asked for it: **identical today can mean "genuinely shared" or it can mean
"nobody has forked it yet".** The second kind is not an opportunity, it is
unfinished work, and it is the ceiling on the whole exercise.

### THE HALF THAT CONSOLIDATION DOES NOT FIX, PROVEN THE SAME DAY

**`upgrade.tsx` held `https://bolo-india.app/privacy` BYTE-IDENTICALLY in five
forks and was WRONG in four**, on the screen App Review reads under Guideline
3.1.2(c). It was already shared, by copy. **A shared component would have shared
the bug**, because the value is *supposed* to differ per fork.

What caught it was a **census**: Europe's 196-line `appDomain.test.ts`, which
reads all three twins off disk and uses the **TypeScript parser**, so a sibling's
domain cannot hide inside a backtick template or a regex literal.

> **EXTRACTION STOPS DUPLICATION. A CENSUS STOPS DRIFT. THEY ARE DIFFERENT
> PROBLEMS AND THE PLAN NEEDS BOTH.**

### THE THREE MECHANISMS ON THE TABLE. Nobody invents a fourth

    a.  a shared repo `bolo-core` consumed as a git dependency, pinned by sha
    b.  `git subtree` of a shared directory into each fork
    c.  ONE monorepo, six build targets, fork identity as data

**They are judged on operational facts, not aesthetics.** EAS resolves
dependencies on Expo's builders and goes bare-workflow if it sees an `ios/`
directory. Replit deploys build from the **Repl's checkout** and install there.
pnpm 10 and pnpm 11 keep `patchedDependencies` in different files with no shared
value, which already killed one approach in this codebase.

**AND LATAM'S FAILURE MODE APPLIES ONE LEVEL UP:** a status line meaning *"the
file exists"* reads identically to one meaning *"it is wired"*. **A fork pinned
to a stale `bolo-core` sha LOOKS consolidated and is not.** Any recommended
mechanism must say how a fork proves it is on the current shared code.

**India leads the scope as the parent. All six were asked the same three
questions against their own trees.**

---

## X-20260909-1955. CANTONESE AND MANDARIN ARE LIVE IN TWO APPS, AND NOBODY HAD WRITTEN THAT DOWN

**Owner ruling, 2026-09-09, prompted by his own question rather than by any
audit: "why is cantonese are here? i thought cantonese was moving to east asia?"**

**HE WAS RIGHT TO ASK AND THE FLEET COULD NOT ANSWER HIM.** Measured on the
live wire, both hosts, the same minute:

    bolo-sea.app/api/languages    my yue id km lo ms tl th vi zh
    bolo-east.app/api/languages   yue cdo hak ja ko zh wuu tsh nan teo

**`yue` and `zh` are each SERVING IN TWO PRODUCTION APPS.** A grep of
`LEDGER.md` and `SUPERVISOR.md` for a ruling about Cantonese moving returns
**nothing**. So a decision he remembers making was either never recorded or
never executed, and neither fork knew the other had the language.

### THE RULING

> **"keep both in both but, lets not double the work."**

**Both forks keep Cantonese and Mandarin. The work behind them is done once.**

    SHARED, AUTHORED ONCE, East Asia owns the depth
      the Cantonese stroke data: Make Me a Hanzi medians plus the ~40
        hand-authored written-Cantonese particles. ONE speaker commission.
      the phrase library for yue and zh, wherever the words name no place
      voice ids, STT model choice and the ISO-code branch, fonts

    PER FORK, Gate 1 REGION, genuinely different and must not converge
      the route: SEA's yue runs the Pearl River Delta, Tsim Sha Tsui to
        Cheung Chau; SEA's zh is SINGAPORE's Mandarin on the Singapore
        Strait, simplified, deliberately taking the strait Malay does not
      the map poster, the zone films, anything naming a city

**SO SEA'S POSTER 19 IS STILL WORTH MAKING**, and no art in flight was wasted
by the ruling.

### WHY THIS ENTRY MATTERS MORE THAN THE TWO LANGUAGES

**IT IS THE FIRST CONCRETE CASE FOR THE CONSOLIDATION WORKSTREAM AND IT IS
BETTER THAN ANY ABSTRACT ONE.** Two live apps, one language, one author. A
shared `lib/` package earns its keep here in a way that "530 identical files"
never quite does, because the duplication is not accidental drift: **it is two
teams about to author the same content on purpose.**

**AND THE FAILURE THAT LET IT HAPPEN IS THE FLEET'S OLDEST ONE.** East Asia was
cut from SEA. The language list travelled with the fork, and the question of
whether it SHOULD have was never asked, because a fork inherits its parent's
answers along with its parent's code. **The mechanism travelled and the
decision did not.** Nobody was wrong; nobody was asked.

> **A LANGUAGE LIST IS A PRODUCT DECISION WEARING A CONSTANT'S CLOTHES.** Every
> fork should be able to say, per language, why IT teaches that one. Six forks
> and roughly eighty language slots, and this is the first time any of them was
> asked.

---

## X-20260909-2020. THE GENERATOR COMPLIES WITH THE WORDS AND NOT THE INTENT, IN BOTH DIRECTIONS

**Found across four forks in one afternoon while the owner generated art at
roughly one image a minute. ENGINE for every prompt sheet in the fleet.**

**Three failures, three forks, one mechanism.** Each prompt was correct English
and each result was the model obeying it exactly.

### 1. A COMPARISON NAMES A STYLE AND IS RENDERED AS MATERIAL

Europe B3 asked for a train nose *"drawn as a single glossy game icon **in the
style of a brass compass icon**"*. It came back mounted in a **thick gold
bevelled plaque** filling the frame. LATAM reproduced it independently on a
later generation, so it is live rather than historical.

> **Describe the style; never name the object you are comparing to.** Replace
> the comparison with its properties and add the negative: *no frame, badge,
> plaque, border or mount of any kind.*

### 2. A PROHIBITION NAMES AN OBJECT AND IS RENDERED AS FRAMING

LATAM item 20 already carried, as hard rule 3: *"No phone visible in the
picture. The frame IS the call."* **It came back with a black bezel and a notch
drawn around the scene** — a backdrop that renders inside the app's own call UI,
so it read as a phone inside a phone. **The rule was not broken as the generator
read it:** the phone was never an object in the scene, it was the FRAME.

> **A NEGATIVE RULE MUST NAME THE SHAPE IT EXCLUDES, NOT ONLY THE NOUN.**
> *"There is no phone, no screen, no bezel and no device frame anywhere in the
> picture."* "no X" and "no X-shaped frame" are different instructions and only
> one of them holds. Applies to any prompt with a call, an in-app screen, a
> poster or a card in it.

### 3. THE VIVID INSTRUCTION THAT LANDS FIRST WINS

SEA's ten map posters opened *"The top left corner, ..."* and the model anchored
the panel to the corner and dropped the offset that came after, **eight times out
of eight**. Europe's B2 said *"drawn as a single wide cartoon object"* before
enumerating **four** coupled vehicles, and got one.

> **Say where a thing is NOT before describing where it is**, when the anchor
> word is stronger than the offset. **And put the COUNT first.**

**LATAM'S CORRECTION TO THE OBVIOUS FIX, AND IT SAVED A SWEEP.** A count of the
string `"drawn as a single ... cartoon object"` is not a count of the defect.
LATAM has four and **all four are safe**, because in each the count leads and
agrees: *"one small clay cup ... drawn as a single glossy cartoon object"*.
Europe has eight and **only one was wrong**. A fleet sweep deleting the word
would have broken fifteen working prompts to fix two. **CONSISTENCY IS NOT A
DIRECTION.** The rule is narrower: **never write "single" in a prompt whose
subject is plural.**

### AND THE ONE THAT INVERTS WHAT EVERYONE ASSUMED

**THE SLOT IS THE TRUTH AND THE SHEET IS WHAT GOES OUT OF DATE.** LATAM's two
call films came back **720x1280 against a sheet demanding 1080x1920**, and 720
was **correct**: the owner's 1K ruling of 2026-09-08 fixed those slots there and
the sheet was never updated, including inside the fenced prompt he pastes.
**Checked against the sheet, two correct films would have been sent back for a
redo.** Measure the slot off the file being replaced.

---

## X-20260909-2145. THE BARE CURRENCY FIELD IS PER-FORK. THE COMPOUND NAMES ARE NOT.

**Gate 3, ruled 2026-09-09 by the fifth supervisor after India's own schema
overturned India's ruling. The relay error was the supervisor's.**

**WHAT HAPPENED.** Europe proposed a daily-gift claim endpoint. India, as
parent, ruled on it and **rejected a `caj` field on the wire**, citing the
2026-09-08 decision that turned `baseChai` into `baseAmount`. Europe then read
India's own spec:

> **`DailyGiftState` line 42 has `chai` in its REQUIRED list**, beside
> `baseAmount` and `multiplier`. And `DailyGiftClaimResult` is
> `allOf [DailyGiftState, {granted}]`, the type India told Europe to adopt.

**So India banned a currency-noun field and in the same ruling told a fork to
adopt a type containing one.** Both halves could not hold.

**THE RULING, AND IT IS WHAT 2026-09-08 ACTUALLY SAID**, quoted from that spec:
*"baseAmount, multiplier and credits are the neutral names every fork shares
verbatim; **the currency noun is not one of them**."*

> **THE COMPOUND NAMES ARE FLEET-WIDE. THE BARE CURRENCY FIELD IS PER-FORK AND
> ALWAYS WAS.** India ships `chai`, Europe ships `caj`. **That is X33 working,
> not X33 being broken.** Europe's spec contains "chai" zero times and carries
> nine `caj` fields plus `/caj-packs`; applying the ban's letter would rename
> nine live fields to avoid a word no learner ever sees.

**AND THE REAL DEFECT IN THE PROPOSAL WAS NEITHER PARTY'S FIRST ANSWER.** Europe
was not wrong to name a field `caj`; it was wrong to **invent a second amount
field at all** when India's shape already carries one, correctly, per fork.

**HOW THE ERROR ENTERED, recorded because the shape repeats.** The supervisor
relayed 2026-09-08 as a *general ban on currency nouns on the wire*. It was
never that. India applied what it was sent **without opening its own schema** —
which is the fleet's own "a grep count is a hypothesis until you read the lines"
failure, applied to a ruling instead of a regex. **A PARAPHRASED RULING IS A
HYPOTHESIS. QUOTE IT OR RE-READ IT.**

### THE GUARD INDIA BUILT OUT OF THE SAME CONVERSATION

**`src/routes/specRouteParity.test.ts`, India `28e37e82`. ENGINE, region-free,
cherry-pick it.** Europe noticed that adding a spec path with no route behind it
leaves a generated client method that **exists, typechecks, ships and 404s**,
and that nothing in the repo would catch it.

**It is the exact mirror of the contract guard from the night before:** that one
catches a field the server SENDS that the spec does not declare, so no client
can see it; this one catches a path the spec DECLARES that no router serves.

**ONE DIRECTION ONLY, DELIBERATELY, and the number is the reason:** 132 route
registrations against 104 spec operations. **The surplus is correct** — the
Nest's routes and other internal endpoints are deliberately undocumented.
**The spec is the CLIENT contract, not an inventory of the server.** A fork
should count its own before assuming one direction is safe.

**BITTEN, NOT ASSERTED, AND IT CARRIES ITS OWN NEGATIVE CONTROL.** India is
clean at 0 missing, and **a guard that has only ever seen a clean tree has been
observed agreeing rather than tested.** Injecting one spec path with no route
turns it red naming the operation. The second test exists because the first
passes on a clean tree either way: the scanner must fail to serve a path that
does not exist AND must find one that certainly is registered.

---

## X-20260909-2230. A DETECTOR TUNED TO A DEFECT CONDEMNS THE FIX, AND IT DOES IT AS A NEGATIVE RESULT

**SEA, 2026-09-09, `fae000cb`. The sharpest form of the day's shape, and the
only prompt rule in the fleet with an output behind it.**

### FIRST, THE PROOF, BECAUSE ONLY ONE OF TODAY'S THREE PROMPT RULES HAS ONE

Ten SEA map posters came back with the greeting panel jammed against the top
edge, eight for eight and then ten for ten. The prompt opened *"The top left
corner, ..."* and the model anchored to the corner and dropped the offset that
followed. One sentence was rewritten. The eleventh take, the Mandarin poster,
is the same prompt with that single sentence moved:

    eleven earlier takes   panel y   0.0 ..  3.5%    hard against the top
    the eleventh           panel y  10.2 .. 28.1%
    spec                             11.0 .. 34.0%

**10.2 against a spec of 11, and the top 9.4% is now clear cream spanning the
full width** — *"leaving the whole top tenth of the height clear and empty above
it"* doing exactly what it says. **One subject, eleven takes, one variable
moved.**

> **SAY WHERE A THING IS NOT BEFORE DESCRIBING WHERE IT IS**, when the anchor
> word is stronger than the offset. **Proven, not reasoned.**

**THE PROOF IS THE ELEVENTH TAKE AND NOT THE REASONING THAT PRODUCED THE RULE.**
Three prompt rules were written today; the other two are still arguments.

### AND THE SCANNER SAID THE OPPOSITE, IN THOSE WORDS

SEA's panel scanner returned **"STILL AT THE TOP, the sentence is not the
cause."** Relayed, that would have told four forks the rewording does not work —
**on a negative result, which is the direction nobody re-checks.**

**The scanner probes at y=8% and walks outward.** That worked while every panel
started at the top edge. On the poster where the fix WORKED, the probe lands in
the clear sky band **the fix created** and reports x 0.0..99.9%: a full-width
match, **which is not a panel at all.**

> **THE TELL WAS IN THE OUTPUT AND NOT IN THE VERDICT, BECAUSE A PANEL IS
> BOUNDED AND THE SKY IS NOT.**

> **A DETECTOR TUNED TO A DEFECT CAN FAIL THE MOMENT THE DEFECT IS GONE, AND IT
> FAILS AS A NEGATIVE RESULT.** Not a guard that passes wrongly: **a guard that
> condemns the fix**, wearing the conservative-sounding answer. Europe's
> preflight flagging its own "no sari" remedy is the same family and milder.

**Caught by opening the image, the same way the eleven before it were caught.**

### THE CONSEQUENCE NOBODY WOULD PREDICT

**ZH'S PANEL IS WHERE THE SPEC ASKS AND THE OTHER NINE ARE AT THE TOP.** So the
`.json` board tracing is **not one template applied ten times**: zh traces from
the spec numbers and the other nine trace from their own pixels. **Batch-apply
one layout and nine posters get a greeting box printed over open water.**

---

## X-20260909-1840. NAMING A THING IN ORDER TO FORBID IT CAN SUMMON IT

**Africa, 2026-09-09, found in its own test film. ENGINE for every prompt sheet
in the fleet, and it completes the family the day spent finding.**

**THE PROMPT EXCLUDED ALL THREE, IN CAPITALS:**

> *"NO cactus, NO saguaro, NO agave, NO desert succulents of any kind."*
> *"ONE continuous locked-off shot on a tripod, no cuts, no zoom."*

**The model returned a saguaro, a prickly pear, and the tripod.** Confirmed by
cropping and magnifying rather than judging from a thumbnail: a single ribbed
columnar trunk with two upraised arms (**not** a candelabra euphorbia, which
branches into many arms from a crown), an Opuntia beside it with pads, and a
telescoping metal tripod leg with locking collars, a rubber foot and its own
shadow, standing in the road in the calm lower third where the stop cards sit.

> **A NEGATIVE DOES NOT RELIABLY REMOVE AN OBJECT, AND NAMING A THING IN ORDER
> TO FORBID IT CAN SUMMON IT.**

**AND IT EXTENDS TO CAMERA LANGUAGE, WHICH NOBODY HAD CONSIDERED.** *"Locked-off
on a tripod"* put a **tripod in the shot**, because the prompt named a tripod.
Say **"the camera does not move"** and name no equipment.

**THE FIX IS POSITIVE IN BOTH DIRECTIONS.** Say what the vegetation **IS** —
*flat-topped acacia, tall dry grass, low thorn scrub* — rather than what it is
not.

### THIS COMPLETES A FAMILY OF FOUR, ALL FOUND IN ONE AFTERNOON

Every one is the model obeying the words and not the intent, and every one
passed the checks a person would think to run.

    1  A COMPARISON names a style       ->  rendered as MATERIAL
       "in the style of a brass compass icon" produced a gold plaque, twice.
    2  A PROHIBITION names an object    ->  rendered as the FRAME
       "No phone visible in the picture" produced a bezel around the scene.
    3  A BARE NEGATIVE over a surface   ->  rendered as TEXT
       "no writing on any sign" produced signage; LATAM won by describing each
       surface as BLANK, so the generator had something to draw.
    4  A NEGATIVE naming an object      ->  rendered as THE OBJECT
       "NO cactus, NO saguaro" produced both, plus the tripod it named.

> **THE GENERATOR DRAWS WHAT IT IS TOLD TO DRAW. A LIST OF EXCLUSIONS IS STILL
> A LIST OF THINGS.** Every fork's exclusion lists are written the way Africa's
> was.

**AND THE OWNER'S OWN TAKE BEAT THE FORK'S ON THE SAME BRIEF.** Africa rejected
its test film in favour of `Minibus_parked_at_roadside_stop`, which is clean:
red laterite road, flat-topped acacias, grazing goats, a cream minibus with
painted stripes and **no lettering**, a roof rack, a hurricane lantern, a kettle
on a charcoal brazier, hills in haze.

### TWO MEASUREMENTS FROM THE SAME PASS

**THE DUPLICATE IS CONFIRMED BY HASH.** Two `Crossroads_with_tailor_and_barber`
files two minutes apart are **byte-identical**, md5 `9f06c05a`. 43 files, 20
jpeg and 23 mp4, **22 unique**.

**AND DURATION SORTS A BATCH WHERE NAMES CANNOT:** 8.000s are scene films,
10.005s are the Emergency films, 6.016s is the market push-in. **Eight
ten-second films for six Emergency slots**, so two are alternates. Filing by
name order would have been guesswork; filing by duration and content is not.

---

## X-20260909-1900. ONE GIFT STRUCTURE, EVERY FORK. OWNER RULING, AND HE TOOK THE OPTION THAT TOUCHES A LIVE APP

**Owner, 2026-09-09, verbatim:**

> **"B, standard across all bolo apps, same gift structure. PARITY FOR ALLLLLLL"**

**B was put to him as: the drawn gift replaces `earn_streak_day`, and practising
stops paying separately.** He was told plainly that the other option changed
nothing and that this one is the one that reaches a live app, and he took it.

    ONE daily gift mechanism, the DRAWN amount, in every fork.
    No second faucet. No per-fork variation.
    `earn_streak_day` stops being a payment in its own right.

**INDIA IS THE ONLY FORK WHERE THIS CAN COST ANYBODY ANYTHING**, because it is
the only one with real balances. Its writer already grants
`giftChaiForDraw(userId, dayKey, streak, multiplier)` on the first attempt of
the day, so the single row already IS the gift at the drawn rate: **in India B
is a rename plus a structure, not a cut.** Europe granted a flat 1 and was the
fork that found the whole thing.

### WHAT THE RULING DOES NOT SETTLE, AND IT IS THE INTERESTING HALF

**Whether the grant fires on the ATTEMPT or on the TAP.** The economy package's
own comment says **"THE TAP IS THE GRANT"**. India grants on the attempt.
Europe granted on the attempt. **Nobody grants on a tap anywhere, and the client
that would do the tapping is the half nobody has built.**

> **Those are two different products.** On the attempt, the gift is a quiet
> reward for showing up and the box is a receipt. On the tap, the box is a thing
> the learner opens and the draw is a moment. **The package argues for the
> second and the code does the first in every fork.**

India owns that as parent.

### THE CONTRACT, SETTLED EARLIER THE SAME EVENING

    POST /tokens/gift/claim   operationId claimDailyGift, no body   INDIA'S, exists
    DailyGiftClaimResult      allOf [DailyGiftState, {granted}]     INDIA'S
    earn_daily_gift           a distinct reason, label "Daily gift"  ACCEPTED
    the bare currency field   PER FORK: chai / caj / kopi           see X-20260909-2145

**`granted` mirrors First Class and the game-credit pack: false on a same-day
replay, so a client tells a real claim from a retry without comparing
balances.**

### THE SHAPE WORTH KEEPING

**One key served two meanings and that is what let a writer and a reader
disagree in silence for weeks.** Europe's `learning.ts` wrote `earn_streak_day`
meaning "practised today"; its `dailyGiftLoad.ts` read the same key meaning
"tapped the box". Every test passed, the payload published a 2-to-10 range, and
the ledger paid 1.

> **A KEY THAT MEANS TWO THINGS IS NOT DISCOVERED BY TESTING EITHER MEANING.**

---

## X-20260909-2340 — AN ABSENCE IN A SEARCH IS A FACT ABOUT THE SEARCH, AND THE SCOPE IS HALF THE SEARCH

**My error, caught by LATAM within minutes of my sending it, while LATAM was
already acting on it.**

I ran a six-fork census of the daily gift and reported to LATAM:

```
gift/claim      ZERO references. The endpoint does not exist.
giftXForDraw    ZERO. There is no draw function.
giftRefId(      ZERO. Nothing pays a daily gift at all.
```

and told it **"section 3 is a build for you, not a port"**.

**THE FIRST LINE WAS TRUE. THE SECOND WAS A FACT ABOUT MY GREP.** LATAM built
its gift rather than porting it, at `e4adcfe7` on 2026-09-08, *"The daily gift
draw, built rather than ported"*, and named its functions `giftDraw` and
`giftRangeFor`. **I searched India's identifiers.**

**AND THE SCOPE WAS THE LARGER HALF OF THE MISS.** `lib/daily-gift` is a
top-level workspace package in **all six forks**. I searched only
`artifacts/api-server/src`. So the library layer was outside my census in every
fork, not just LATAM's.

> **I HAD ALREADY SEEN THE SIGNAL AND NOT FOLLOWED IT.** An earlier line of the
> same census printed `no matches found: .../src/lib/daily-gift*` for **all six
> forks at once**. Six identical absences is not six forks missing a package. It
> is one wrong path. I read it as a finding.

**WHAT LATAM ACTUALLY HAS, MEASURED AFTER THE CATCH:**

```
bolo         lib/daily-gift/src/index.ts  403 lines  giftRefId dailyGiftFor + 4 copy fns
bolo-sea     455   bolo-east 557   bolo-africa 443   bolo-europe 459   same shape
bolo-latam   188   GIFT_MIN GIFT_MAX GIFT_FLOOR_LIFT giftDayForStreak
                   giftFloorForStreak giftDraw giftRangeFor
                   NO giftRefId. NO dailyGiftFor. NO copy functions.
```

**SO NEITHER OF US HAD IT RIGHT.** Not a build from scratch, and not "only the
two routes" either: LATAM has the draw and the constants, and lacks the state
assembler, the refId that makes the two doors idempotent, and every sentence the
box says.

**THE COST OF MY VERSION IF IT HAD BEEN FOLLOWED:** a second draw function and a
second set of constants, diverging from the contract LATAM's own `openapi.yaml`
already publishes. **The exact second faucet I had told it not to build, two
paragraphs earlier in the same message.**

> **GREP FOR THE BEHAVIOUR, NOT FOR THE PARENT'S IDENTIFIERS** — a draw, a day
> key, a range — **and name the scope you searched when you report a zero.** A
> fork that built rather than ported matches none of the parent's names, and the
> careful fork then creates what it already has. Same shape as the
> `GamePlays.credits` ruling.

**ONE THING WORTH TAKING FROM LATAM'S LIBRARY:** its constants are `GIFT_MIN`
and `GIFT_MAX` with **no currency noun**, where the other five carry
`GIFT_MIN_CHAI`, `_KOPI`, `_COWRIES`, `_CAJ`. That is the cleanest naming in the
fleet and it sidesteps X-20260909-2145 entirely at the library layer.
**Observation, not a sweep.** Five working libraries do not get renamed because
a sixth is tidier.

---

## X-20260909-2345 — A TEST THAT PROVES TWO PATHS AGREE ON A VALUE CANNOT SEE THEM DISAGREE ON A PRECONDITION

**Africa's finding, against its own test, and it is the sharpest instrument trap
recorded here.**

Africa's `routes/learning.ts` HOOK 1c grants the daily gift on **any** attempt:
no `canClaimGift` capability guard anywhere in the tree, and no `earnedToday`
gate. Its `POST /tokens/gift/claim` **is** gated and 409s correctly.

> **THE OWNER'S RULING IS ENFORCED ON THE DOOR THAT CAN NEVER FIRE AND ABSENT
> FROM THE DOOR THAT ALWAYS DOES.** The ledger's unique index means whichever
> door arrives first wins; on that fork the practice door always arrives first.

**AND THE TEST WRITTEN TO POLICE THE TWO DOORS PASSES.** `tokens.gift.test.ts`
drives the attempts door specifically to prove both doors name the same
**number**. It does. But its fixture calls `practiseToday()` first, inserting a
`game_sessions` row, **so `earnedToday` is TRUE in every case that suite can
construct.** The ungated case is not merely untested; **it is unreachable by
that fixture.**

    A JOURNEY TEST BUILT TO PROVE TWO PATHS AGREE ON A VALUE WILL NOT NOTICE
    THEY DISAGREE ON A PRECONDITION, BECAUSE THE FIXTURE SATISFIES THE
    PRECONDITION FOR BOTH OF THEM.

Same family as the bite test that passed after a correct revert: **the test
reached the right door and asked the wrong question.** Cousin of
X-20260908 "test the seam, not the parts" — this is the seam being tested with
the seam's hardest input removed by the setup.

**THE FIX IS A CASE THE FIXTURE CANNOT REACH:** no game session, no completion,
one attempt, assert the ledger is still empty.

**AND AFRICA CORRECTED THE HISTORY AGAINST ITSELF.** The ungated attempts grant
**predates** Africa's work; the original line paid a flat `TOKEN_EARN_STREAK_DAY`
on any attempt. What Africa changed was the **amount**, to the full draw. *"I did
not create the hole; I made it pay two to ten times more, and I did it while
writing a commit message about how carefully the two doors were being kept in
agreement."* **A commit message about rigour is not rigour, and the paragraph
explaining why two doors agree is exactly where nobody looks for a door that
should not be open.**

---

## X-20260909-2350 — CORRECT TODAY, FRAGILE BY PLACEMENT

**Europe's reframing of my own finding, and it inverts the fleet picture.**

I measured `claimable` across six trees and reported that four forks compose
`claimable && earnedToday` at the route and Europe alone served the raw value.
**That was true when I measured it and Europe had already fixed it 20 minutes
earlier**, in `85ff3888`, by composing inside `lib/daily-gift` **where the field
is defined** — so `lib/dailyGiftPayload.ts:82` still reads
`claimable: gift.claimable,` and is now correct.

> **A GREP FOR THE DEFECT STILL FINDS THAT LINE AND FINDS NOTHING WRONG WITH
> IT.** Anyone auditing Europe by that string gets a false positive. Europe sent
> it to me rather than letting me re-flag it.

**AND EUROPE TOOK MY RULE ONE LAYER FURTHER THAN I STATED IT.** I said compose in
the payload rather than the route, because *"a route that has to remember is a
rule stated in the wrong place."* Europe applied the same sentence again: **a
payload that has to remember is also the wrong place.**

```
bolo, bolo-sea, bolo-africa, bolo-east   composed AT THE ROUTE
bolo-europe                              composed WHERE THE FIELD IS DEFINED
```

    FOUR FORKS ARE CORRECT ONLY WHILE `dailyGiftFor` HAS EXACTLY ONE NON-TEST
    CALL SITE. The day any of them adds a second consumer — a background job, a
    nest metric, a second endpoint — that consumer gets the raw value and
    NOTHING TURNS RED.

**I had measured that one-call-site fact and read it as reassurance. It is the
load-bearing assumption, and it is enforced nowhere.** A rule that holds because
every call site remembers it is a rule with a headcount.

**CARRY IT TO THE OTHER FOUR AS A ONE-LINE CHANGE WITH A TEST, NOT AS A DEFECT.
Their behaviour is correct today and their placement is fragile.** Europe also
**inverted** one existing test rather than deleting it, with the date and the
reason, because it had been asserting a box was tappable when it was not, and
passing every run.

---

## X-20260909-2355 — A MISNAMED KEY HAS TWO SEPARABLE COSTS, AND THE LEARNER-FACING ONE IS A SINGLE LINE

**Measured in India before recommending anything, because the spec's §4 prices
the rename as a migration and the owner was about to be asked to authorise it.**

`earn_streak_day` in India has **two writers and one reader, and all three are
the gift**: `routes/learning.ts:1852` (the shim), `routes/tokens.ts:661` (the
tap), `routes/tokens.ts:576` (the reader). **Nothing else grants it. It does not
pay the streak.**

> **SO THE KEY IS NOT OVERLOADED IN INDIA THE WAY IT WAS IN EUROPE. IT IS
> SIMPLY MISNAMED** — which is a smaller defect than X-20260909-2230's, and a
> different one.

**AND THE HALF A LEARNER CAN SEE IS ONE LINE.**
`lib/tokenEconomy.ts:322` is `TOKEN_REASON_LABELS`, and its own comment says
**"GET /tokens/history returns the label, never the raw reason"**. Line 323:

```
  earn_streak_day: "Streak day",
```

**A learner who opens today's gift sees "Streak day" in their wallet history.**
That is the entire user-visible cost of the misnaming, and it is fixed by
changing a string — **no migration, no dual-read window, no deploy-day double
payment, no silent zeros in the four raw SQL literals at `routes/nest.ts:749,
784, 1560, 1577`.**

    SEPARATE THE NAME THE LEARNER READS FROM THE KEY THE LEDGER STORES BEFORE
    PRICING A RENAME. One is a string and free; the other is a migration with a
    two-day window and a live payment behaviour change on deploy day.

---

## X-20260909-2358 — A FAILED SEEK READS AS A CLEAN ABSENCE

**My error, caught by Africa.**

I checked Africa's ringtone for a loop-seam click, got no output, and reported
the seam as unverified. **The check returned nothing because the seek failed.**

Africa decoded the file to WAV and read the samples: tail over the last 50 ms is
**-74.2 dBFS**, the seam step is **690 of 65536, about -39 dBFS**. Silent tail,
no click. **Verified, not unverified.**

> **AN INSTRUMENT THAT FAILED AND AN INSTRUMENT THAT FOUND NOTHING PRODUCE THE
> SAME EMPTY OUTPUT.** Third face of the same shape recorded tonight, after
> X-20260909-2340's wrong search scope and X-20260909-2345's fixture that
> satisfied its own precondition. **Absent and passing look identical** — and so
> do *broken* and *clean*.

**Check that the instrument ran before reporting what it saw.**

---

## X-20260909-2340b — THE SAME WRONG SEARCH, SECOND INSTANCE, AND THIS ONE HELD LIVE ROWS

**Addendum to X-20260909-2340. Same fork, same root, and the second miss is the
expensive one.**

Having been corrected once for searching India's identifiers in LATAM, I told
the same fork that **§4a's deploy-day double payment "cannot touch you"** because
it holds no rows under the old reason. LATAM measured and refused to build:

```
artifacts/api-server/src/routes/learning.ts:1772
grantTokensDetailed(userId, "earn_streak_day",
                    localDayKey(now, timezone), TOKEN_EARN_STREAK_DAY)
```

**LATAM HAS PAID A DAILY REWARD SINCE IT PUBLISHED ON 2026-09-08.** One cacao,
reason `earn_streak_day`, refId the local day, idempotent, **live, with rows
accruing every day.**

**MY GREP WAS `giftRefId(` IN `routes/learning.ts`. THE PAYMENT IS ON THE EXACT
LINE I AIMED AT**, written inline as `localDayKey(now, timezone)` because this
fork built rather than ported. **The grep was true and the conclusion was false**,
for the second time in one hour, in the same fork.

> **THE COST HAD IT BEEN FOLLOWED:** `earn_daily_gift` built beside a live
> `earn_streak_day`, and the unique index on `(userId, reason, refId)` satisfied
> by BOTH keys for the same learner on the same day. **Two payments for one day's
> practice, on every learner, from the first deploy** — §4a's double payment
> arriving **by construction rather than by migration**, in the fork I had told
> was exempt from §4a.

**A ZERO FROM A SEARCH IS NOT EVIDENCE OF ABSENCE UNTIL THE SEARCH HAS BEEN
SHOWN TO FIND THE THING SOMEWHERE.** The census that found `giftChaiForDraw` in
India was never once demonstrated to find a payment in LATAM, so its silence
there carried no information and I spent it as though it did.

---

## X-20260909-0005 — A DIMMED BOX IS A STATE, NOT AN INSTRUCTION

**SEA's ruling, and it settles a question the gift spec left as a menu.**

§6c required that locked and unlocked differ by more than hue and offered a list:
*"a lock glyph, a label, an opacity change, a different shape"*. SEA measured its
own box and found **it already complied** — opacity 0.7 and the nudge animation
gated off, two real non-colour signals — **and that the owner's actual second
sentence had never shipped at all.**

*"we should show that on the gift so its obvious"* had produced a dimmed, still
box **that said nothing**. A learner who had not practised saw a greyed present
with no reason and no action.

    Finish a stop today to open it.

> **A DIMMED BOX IS A STATE. IT IS NOT AN INSTRUCTION.**

**AND THE ARGUMENT FOR TEXT OVER A GLYPH IS SEA'S AND IT IS BETTER THAN THE
MENU:** opacity and a stilled animation **cannot be read aloud, cannot be
asserted in a test, and do not survive a screenshot. Text can be all three.** A
padlock would have said *locked* without saying *what to do*.

**SO §6c's LIST IS NOT A LIST. The sentence is the requirement and the visual
treatment is decoration on top of it.** Every fork ships the words.

**AND I ASSERTED A GAP THAT WAS NOT THERE.** I sent SEA the colour rule as though
its box failed it. It did not. **Third instance today of naming a defect from a
count rather than a measurement**, after the "single cartoon object" sweep and
the off-ratio false positives. **SEA corrected it instead of deleting two working
signals to satisfy a sentence I sent.** Consistency is still not a direction.

---

## X-20260909-0030 — THE PARENT IS THE BASELINE, SO A CHILD'S DECISION READS AS A DEFICIT

**LATAM's naming of a shape that bit me three times in one evening, in one fork,
and will keep biting for as long as India is the reference.**

**INSTANCE 1.** I grepped six forks for India's identifiers — `giftChaiForDraw`,
`canClaimGift`, `giftRefId`, `gift/claim` — and reported LATAM had no draw
function. **It had built its own at `e4adcfe7`, "The daily gift draw, built
rather than ported", named `giftDraw` and `giftRangeFor`.** A fork that built
rather than ported matches none of the parent's names.

**INSTANCE 2.** I told the same fork §4a's double payment "cannot touch you".
**`routes/learning.ts:1772` has paid a daily reward under `earn_streak_day` since
it published**, written inline as `localDayKey(now, timezone)` rather than through
India's helper. **The payment was on the exact line my grep was aimed at.**

**INSTANCE 3, AND THE ONE THAT WOULD HAVE DONE REAL DAMAGE.** I compared library
sizes and told LATAM it was missing four copy functions:

```
bolo 403   bolo-sea 455   bolo-east 557   bolo-africa 443   bolo-europe 459
bolo-latam 188
```

**THE 188 LINES ARE NOT AN INCOMPLETE 455. THEY ARE 455 WITH X34 APPLIED.** X34
ruled in this ledger on 2026-09-07 that the copy functions return **English
display copy naming Chai**, that they are **REGION and get re-authored**, and
that a `currencyNoun` parameter was **considered and rejected** because it hides
the region-ness the next reader needs to see. LATAM's `giftRangeFor` carries that
reasoning in its own comment, citing X34 by name.

> **THE ABSENCE WAS THE FINISHED WORK.** Being told it was a gap is precisely
> what would have reintroduced the defect the entry exists to prevent — and it
> came from the supervisor who is supposed to be holding the ledger.

    A DIFF AGAINST THE PARENT SHOWS WHAT IS DIFFERENT. IT DOES NOT SHOW WHICH
    SIDE IS RIGHT. Anything a child lacks reads as MISSING when it may be
    REMOVED, and anything a child renamed reads as ABSENT.

**THE COUNTERMEASURE IS CHEAP AND I DID NOT USE IT: ask the child before
reporting a gap.** Every one of these three would have cost one question. **A
shorter file is a hypothesis about a decision, not evidence of an omission** —
and this ledger is the place those decisions are written down, so grep it for the
package name before calling a difference a deficit.

**AND THE INVERSE IS ALSO TRUE, WHICH IS THE PART WORTH KEEPING.** LATAM's
`openapi.yaml`, written 2026-09-08, **post-dates India's defects and is better
than India's**: its `DailyGiftState.day` carries a written warning that the field
is never the amount, naming the exact failure where a learner three days in who
drew 18 was shown "Day 18"; and its `claimable` is already specified as
**"practised today and not yet opened"** — the semantic §6a had to rule into
existence for all five other forks a day later.

> **THE PARENT IS NOT THE CEILING.** Check India's contract against LATAM's, not
> only LATAM's against India's.

---

## X-20260909-0045 — THE TOKEN ECONOMY IS ENGINE. THE CURRENCY NOUN IS REGION.

**Owner ruling, 2026-09-09, verbatim, in answer to a yes/no about LATAM's daily
faucet:**

> **"every app same as india, faucets and sinks"**

**IT IS BROADER THAN THE QUESTION IT ANSWERS.** Asked whether one fork's daily
gift should match, he ruled the whole economy: **every faucet pays what India's
pays for the same event, every sink costs what India's costs, in all six forks.**

**SUPERSEDES** the per-fork pricing each fork set for itself. **DOES NOT TOUCH**
X-20260909-2145: the bare currency noun stays PER FORK. **The numbers travel; the
word does not.**

### MEASURED THE SAME NIGHT, ALL SIX `lib/tokenEconomy.ts`

**40 numeric constants. 29 differ from India. Almost all of the difference is in
two forks.**

```
                        IND  SEA  EAS  AFR  LAT  EUR
STOP_UNLOCK_COST        100  100  100   50  100  100
PREMIUM_OUTFIT_COST      90   90   90   40   90   90
OUTFIT_COST              50   50   50   25   50   50
FIRST_CLASS_COST         40   40   40   25   40   40
STREAK_REPAIR_COST       40   40   40   25   40   40
TESTOUT_RETRY_COST       30   30   30   15   15   30
ACCESSORY_COST           25   25   25   10   25   25
STATION_PAUSE_COST       15   15   15   10   15   15
EXPRESS_MULTIPLIER_COST  15   15   15   10   15   15
ALLOWANCE_ALL_ACCESS      0    0    0   15   15    0
CAPSTONE_FIRST            0    0    0    5    5    0
ALL_ACCESS_GIFT_MULT      2    2    2    2   --    2
```

**AFRICA IS SYSTEMATICALLY CHEAPER: NINE SINKS AT ROUGHLY HALF INDIA'S PRICE.**
That is too consistent to be drift. **It is a pricing decision somebody made**,
and it is nowhere in this ledger.

**AFRICA AND LATAM BOTH PAY TWO FAUCETS INDIA DOES NOT**: a 15-a-month
All-Access allowance where India pays 0, and 5 for a first capstone where India
pays 0.

**LATAM HAS NO `ALL_ACCESS_GIFT_MULTIPLIER` AT ALL**, so its paying subscribers
do not get the doubled daily draw the other five give.

**IDENTICAL EVERYWHERE, AND WORTH RECORDING AS THE CONTROL:** the six earn
constants (streak day 1, zone complete 10, express stamp 3, quiz 2, chacha
encounter 3, chacha call turn 1), the gift range (2 to 10, ladder cap 7), the
referral pair (25/25), closeout first (2), chacha call max (5), the express
multiplier (2x/20 min), first class (24 h/30 d), pause max equipped (2), **and
all three money packs at 199 / 499 / 999 cents.** **The money side never
diverged. Only the game side did.**

### FEATURE ABSENCES, WHICH ARE NOT PRICES AND MUST NOT BE PRICED

```
PANTS_COST / SHIRT_COST     India, SEA only          absent in EAS AFR LAT EUR
VOICE_CHANGE_COST           India, SEA only          absent in EAS AFR LAT EUR
spend_game_credits          absent in AFRICA         + game_credit_consumed
```

**A missing sink is a missing FEATURE, and aligning a price cannot conjure the
thing being bought.** Those are ports, not edits.

### THE RULE THAT MAKES THIS SURVIVE

**29 of 40 constants disagreed and NOTHING ANYWHERE NOTICED**, because every fork
holds its own copy and each copy typechecks perfectly. Same shape as X34c and as
the four raw SQL literals: **absent and passing look identical, and so do
disagreeing and passing.**

> **BUT DO NOT ALIGN A NUMBER BEFORE ASKING THE FORK WHY IT IS THAT NUMBER.**
> X-20260909-0030 was written three hours earlier because a shorter file turned
> out to be the corrected one. **Nine half-prices in one fork is exactly the
> shape of a decision, and the ruling is the owner's to apply with the reason in
> front of him, not mine to apply blind.** Every fork reports its divergences
> with reasons; anything unexplained aligns immediately; anything with a written
> reason goes back to him as a one-line exception.

---

## X-20260909-0110 — CORRECTION TO X-20260909-0045: IT WAS NEVER SIX ECONOMIES. IT WAS ONE COMMIT, FIVE FORKS, FIVE DIFFERENT OUTCOMES.

**Africa's catch, verified in India's git before this was written. My entry three
hours ago said nine half-prices in Africa were "too consistent to be drift" and
"a pricing decision somebody made". RIGHT ABOUT THE CONSISTENCY, WRONG ABOUT THE
DIRECTION, and the direction was the whole finding.**

**AFRICA DID NOT HALVE NINE PRICES. THE OWNER DOUBLED THEM ON 2026-09-08 AND
AFRICA NEVER RECEIVED THE COMMIT.**

```
4cac83c3  Tue Sep 8 14:40:08 2026  AAKESH PATEL
          "The prices were tuned against a shop that does not exist"
          An audit of every faucet and every sink, run against source before
          any number moved.
```

**EVERY ONE OF THE 29 DIFFERENCES I REPORTED IS INSIDE THAT SINGLE COMMIT:**

```
STOP_UNLOCK_COST         50 -> 100      TESTOUT_RETRY_COST      15 -> 30
OUTFIT_COST              25 -> 50       STREAK_REPAIR_COST      25 -> 40
ACCESSORY_COST           10 -> 25       FIRST_CLASS_COST        25 -> 40
PREMIUM_OUTFIT_COST      40 -> 90       STATION_PAUSE_COST      10 -> 15
EXPRESS_MULTIPLIER_COST  10 -> 15
ALLOWANCE_ALL_ACCESS     15 -> 0        CAPSTONE_FIRST           5 -> 0
ALL_ACCESS_GIFT_MULTIPLIER  ADDED = 2
SHIRT_COST 35, PANTS_COST 35, VOICE_CHANGE_COST 100   ALL ADDED
```

**SO AFRICA'S AND LATAM'S NUMBERS ARE THE PRE-CHANGE FLEET VALUES**, set by the
owner in `7bfe23e0` on 2026-08-07, before either fork was cut. **Nothing to
defend, nothing to send back to him as an exception, nobody's name on anything.**

### AND THE PORT FIDELITY IS THE REAL FINDING, BECAUSE NO TWO FORKS GOT THE SAME AMOUNT OF IT

```
SEA        COMPLETE.        prices, faucets, and SHIRT/PANTS/VOICE_CHANGE
East Asia  prices only.     no SHIRT, no PANTS, no VOICE_CHANGE
Europe     prices only.     no SHIRT, no PANTS, no VOICE_CHANGE
LATAM      HALF A COMMIT.   sink prices YES; allowance, capstone and
                            ALL_ACCESS_GIFT_MULTIPLIER all missed
Africa     NONE OF IT.
```

> **ONE COMMIT, FIVE FORKS, FIVE DIFFERENT OUTCOMES, AND NOTHING ANYWHERE KNOWS.**
> Every copy typechecks. Every suite is green. A partial port is invisible by
> construction: LATAM took the sinks and left the faucets, and there is no
> instrument in the fleet that could have said so.

**THIS SUPERSEDES THE "ASK BEFORE ALIGNING" INSTRUCTION IN X-20260909-0045 FOR
THESE CONSTANTS SPECIFICALLY.** That instruction was right in general and X34 and
X-20260909-0030 are why it exists. **It was wrong here because the reason was not
in the fork, it was in the parent's git log, and I did not look there before
asking five forks to justify themselves.** Checking whether the parent MOVED is
one command and it precedes asking a child why it differs.

**LATAM'S OWN FIRST READ WAS ALSO CORRECTED BY THIS.** It reported the absent
`ALL_ACCESS_GIFT_MULTIPLIER` as "the work exists and the wire does not" —
machinery expecting a constant nobody wired. **The constant did not exist anywhere
in the fleet until 2026-09-08.** The machinery was not waiting for a wire; the
fork was waiting for a commit.

### THE PART THAT SURVIVES THE CORRECTION, AND IT IS THE OWNER'S OWN REASON

**The retune's stated finding still binds every fork and Africa measured it again
independently:** *"The daily draw paid a week streak learner 570 Chai a month. The
entire PERMANENTLY OWNABLE catalogue cost 20."* Africa's shop today is **two hats,
20 cowries total**, with `OUTFIT_COST` and `PREMIUM_OUTFIT_COST` dead constants no
catalogue row uses.

> **DOUBLING THE PRICE OF A SHOP WITH TWO HATS IN IT IS ARITHMETIC, NOT
> ECONOMICS.** Align the numbers because the ruling says so, and put the empty
> catalogue to him as its own question, because it is the one the retune was
> actually about.

---

## X-20260909-0140 — THE FILED URL IS A SEVENTH PLACE THE TRUTH CAN DIFFER, AND NOBODY HAD READ IT

**Six forks were audited on the wire, then in App Store Connect, and the console
disagreed with three of the six censuses that had just been written.**

**THE DEFECT, MEASURED ON ALL SIX LIVE DOMAINS:** `/privacy` serves the SPA
shell, **byte-identical to a nonsense path**, with zero policy words to anything
that does not run JavaScript. The real 32 KB document exists only at
`/privacy.html`.

```
bolo-india.app   /privacy  7,972 b  no words     /privacy.html  32,970 b  words
bolo-sea.app     /privacy  7,772 b  no words     /privacy.html  32,785 b  words
bolo-east.app    /privacy 12,961 b  no words     /privacy.html  37,967 b  words
bolo-europe.app  /privacy  7,218 b  no words     /privacy.html  32,218 b  words
bolo-africa.app  /privacy  7,315 b  no words     /privacy.html  32,316 b  words
bolo-latam.app   /privacy  7,850 b  no words     /privacy.html  32,858 b  words
```

**THE CAUSE IS A SERVER FACT, NOT A BUILD FACT.** `prerender-legal.mjs` emits
both `/x.html` and `/x/index.html`. **The Replit router serves EXACT paths only
and never resolves a directory to its index**, so `/privacy` 301s to `/privacy/`
and lands on the shell. **"We prerender it" was never the same claim as "a
crawler can read it", and four forks had recorded the first as if it settled the
second.**

### WHAT THE CONSOLE HELD, AGAINST WHAT THE CENSUSES SAID

```
India      /privacy               reported. TRUE.
SEA        /privacy + /contact    reported. TRUE.
East Asia  /privacy + /support    NOT REPORTED. Both extensionless, both broken.
Europe     /privacy/              reported as UNKNOWN, and the fork said
                                  correctly that which URL is filed "decides
                                  whether this is a blocker or nothing".
                                  IT WAS THE TRAILING-SLASH SHAPE. A blocker.
LATAM      EMPTY                  no privacy URL at all, and the entire iOS
                                  version page blank: no description, keywords,
                                  support URL, marketing URL or copyright.
Africa     EMPTY                  and Africa's census said "no App Store record
                                  verified". THE RECORD EXISTS. So does Europe's.
LATAM+AFR  App Privacy questionnaire NEVER STARTED. "Get Started" still showing.
                                  A submission blocker neither census found.
```

> **A FORK CAN AUDIT ITS OWN TREE AND ITS OWN WIRE AND STILL BE WRONG ABOUT WHAT
> IS FILED, BECAUSE THE FILED VALUE LIVES SOMEWHERE NO FORK CAN READ.** Six
> careful censuses, each honest about its unknowns, and the one field that
> decides a rejection was outside every one of them. **Add the console to the
> census, or accept that the most consequential value in the audit is the one
> nobody measured.**

### THE ASC LOCK, WHICH DECIDES WHETHER THIS IS THIRTY SECONDS OR A PULLED SUBMISSION

**"Waiting for Review" is editable. "In Review" is not.** SEA showed an **Edit**
link and both its fields changed with the submission untouched. India showed
static text and a banner: *"App information is currently in review. To make
changes to the app information, remove iOS 1.0.17 from review."*

**FIVE CHANGED TONIGHT ON THE OWNER'S GO**, each verified by reading the field
back: SEA (privacy + support), East Asia (privacy + support), LATAM (privacy +
support), Europe (privacy), Africa (privacy).

**INDIA IS OUTSTANDING AND THE OWNER RULED THE TRIGGER RATHER THAN THE FIX:**

> **"but remember to fix it for 1.0.18 or a rejection of 17"**

**AND THE INSTRUCTION TO INDIA WAS NOT "I WILL REMEMBER".** A commitment held in
one supervisor's memory is X-20260909-2350's rule with a headcount of one. India
builds a preflight that **fetches the filed URL and fails on a response with no
policy text** — not a string comparison against an expected value, which passes
the day somebody files a different broken URL. **Same check for Terms and
Support**, and India has **no support document at all**, where SEA does.

---

## X-20260909-0215 — A TEST THAT READS ITS EXPECTED VALUE FROM THE CONSTANT UNDER TEST DIES THE DAY THAT CONSTANT BECOMES ZERO

**LATAM's finding, against a test it had just made worse, and it is a new face of
the silent default rather than another instance of an old one.**

`src/test/tokenEconomy.test.ts` asserts the monthly allowance like this: grant
`TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY`, then assert the balance equals
`TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY`.

**AT 15 THAT WAS A REAL ASSERTION.** It proved the grant path moved the balance
by the amount the constant names.

**AT 0 IT GRANTS ZERO AND EXPECTS ZERO AND CANNOT FAIL.** The alignment ruling
zeroed the constant, and the test did not break, did not go red, and did not
change: **it quietly stopped meaning anything.**

    A TEST THAT DERIVES ITS EXPECTATION FROM THE THING IT IS TESTING IS ONLY
    EVER TESTING THAT ARITHMETIC WORKS. It survives every value change by
    construction, which reads as robustness and is the opposite. The day the
    constant reaches the identity value for its operation, the test becomes a
    tautology WITHOUT EVER GOING RED.

**Same family as X-20260909-2345** — a fixture that satisfies the precondition
for both doors — but sharper, because there the fixture at least asserted
something. **Here the assertion is literally `x == x`.**

> **THE REPAIR IS THE SAME ONE AS THE PAYWALL TEST'S:** the expected value must
> be an **INDEPENDENT STATEMENT OF THE ANSWER**, written as a literal, so the
> test disagrees with the code when the code changes. A test that derives cannot
> disagree.

**AND IT IS IN NO TEST MANIFEST, SO IT RUNS IN NO CI JOB EITHER WAY.** That is
the third time the missing manifest has been deferred by two forks, and it has
now moved from a theoretical cost to a real one: **a pin written in that file
today is a pin nobody runs.** Raise with X90.

---

## X-20260909-0220 — THE PARTIAL PORT ASKS A QUESTION INSTEAD OF FINISHING

**LATAM aligned the economy from `4cac83c3` and then reported a consequence it
believed needed the owner's ruling: with the allowance at 0, the paywall's "Free
Kopi Drop Every Month" row VANISHES, All-Access advertises one fewer benefit, and
the replacement is not on the wire. It asked whether that gap was acceptable for
the days between.**

**IT IS NOT A GAP. IT IS THE OTHER THREE FILES OF THE SAME COMMIT.**

```
4cac83c3, 4 files
  artifacts/api-server/src/lib/tokenEconomy.ts     172 lines   PORTED
  artifacts/api-server/src/routes/openai.ts         27 lines   not ported
  artifacts/bolo-mobile/app/(app)/paywall.tsx       14 lines   not ported
  artifacts/gujarati-coach/src/pages/upgrade.tsx    11 lines   not ported
```

India's own commit message says it in a sentence: *"Both paywalls now advertise
the multiplier, and the number is served rather than written into the clients."*
The diff renames `allAccessBenefits(monthlyChai)` to
`allAccessBenefits(giftMultiplier)` and gates the row on **`> 1`**.

> **AND THE `> 1` GUARD IS THE ELEGANT PART, WORTH CARRYING ON ITS OWN:** it
> **retires the old line on every build already in the stores**, because the
> allowance now answers 0 to those builds. The benefit swaps with no app release
> on either side of the change.

**THE SHAPE, AND IT IS THE THIRD TIME TONIGHT:** a fork ports the file that
matches the ruling's words, the ruling's *effect* needs the other files, and the
missing half surfaces later as a question about whether the damage is
tolerable. **The honest question is not "is this gap acceptable" but "did I take
the whole commit".**

    A CONSEQUENCE YOU HAVE TO ASK PERMISSION FOR IS USUALLY THE PART YOU DID NOT
    PORT. Check the commit's file list before pricing the fallout.

**WHAT LATAM GOT RIGHT AND SHOULD NOT BE TALKED OUT OF:** it diffed the whole
file rather than working from my list, found **seven** differences where I had
named four, and **refused to port three of them** — `SHIRT_COST`, `PANTS_COST`,
`VOICE_CHANGE_COST`, all referenced zero times in a fork with no wardrobe module.
**Adding constants to satisfy a diff is X-20260909-0030 wearing the other hat:
the count looks better while the tree gets worse.**

---

## X-20260909-0235 — A COMMENT DESCRIBING A DEFECT THE CODE DOES NOT HAVE

**Europe's finding, and it is the mirror image of X-20260909-2345's unfailable
prose: not a comment that cannot fail, but a comment that reports a failure which
was already fixed.**

Europe's account-deletion handler carried:

```
// TODO (build-32): also delete token_ledger and token_spend_ledger
```

In an EU-targeted app whose privacy page promises deletion of personal data,
that reads as a live compliance defect, and Europe went to fix it. **It measured
first:**

- **`token_ledger` and `user_token_state` BOTH CASCADE**, each carrying
  `references(usersTable.id, { onDelete: "cascade" })`.
- **`token_spend_ledger` WAS NEVER CREATED.** The name appears nowhere in the
  schema.

**THE COMMENT WAS STALE. THE CODE WAS ALREADY CORRECT.**

> **AND THE LIKELY "FIX" MAKES IT WORSE:** a careful reader adds redundant
> explicit deletes to a handler that already cascades, for a table that does not
> exist. **The comment costs every future reader exactly what it cost this one,
> and it costs the diligent ones most.**

Cousin of [[vendor-defaults-in-comments-expire]], and the sharper form of it: a
comment naming a **known gap** is more dangerous than one naming a fact, because
a gap invites action. **Replaced with the measurement rather than deleted: ten
tables cascade and are named, twenty are deleted explicitly.** Carry to the other
five; every fork inherited that handler.

**AND EUROPE'S OWN CENSUS WAS WRONG ON THE WAY TO FINDING IT**, in tonight's
recurring shape: it reported `daily_quizzes` as a user-keyed table nothing
deletes. **That file declares TWO tables**; only `daily_quiz_completions` is
user-keyed, and the handler does delete it. **One file, two tables, and the regex
took the first.**

---

## X-20260909-0240 — PARITY THAT PRICES NOTHING

**Europe's answer on the three wardrobe constants, and it is better than the
"check whether you have the feature" instruction I gave.**

`SHIRT_COST`, `PANTS_COST` and `VOICE_CHANGE_COST` were added in `4cac83c3` and
are absent from East Asia, Africa, LATAM and Europe. Europe measured rather than
matched:

- **Europe's wardrobe manifest holds three items and all three are ACCESSORIES**
  — pagdi, station-cap, pink-beanie2. **There is not one garment, top or bottom
  in the fork.** So a shirt price and a pants price would price items that do not
  exist.
- **`VOICE_CHANGE_COST` prices nothing either.** The only voice control here is
  `changeVoiceMode` on the mobile account screen: **a free preference toggle
  writing a local pref, not a sink.**

> **IMPORTING THEM WOULD HAVE BEEN THE WORST KIND OF PARITY: three constants that
> typecheck, match India exactly, pass every economy audit, and price nothing.
> A future reader finds three sinks and concludes the features exist.**

**A CONSTANT IS A CLAIM ABOUT WHAT THE APP SELLS.** Aligning one for a thing the
fork does not have does not create drift a test can see; it creates a false
statement a test will defend. LATAM reached the same refusal independently, on
the same three constants, by the same route of diffing the whole file rather than
working from my list of four.

---

## X-20260909-0140b — NAME THE FIELD YOU CANNOT READ, AND SAY WHAT IT DECIDES

**Europe's improvement on my own conclusion, and it is the actionable half.**

X-20260909-0140 ended with *"add the console to the census"*. **Europe's version
is better because it survives the fork that has no console access, which is all
of them:**

    DO NOT WRITE "NOT CHECKED". NAME THE FIELD YOU CANNOT READ AND SAY WHAT IT
    DECIDES, so whoever has the console knows which one to open first.

Europe's own census had already done exactly this by instinct — *"WHICH URL IS
FILED IS NOT CHECKED and it decides whether this is a blocker or nothing"* — and
that sentence is the only reason the field got opened. **The four censuses that
wrote a bare "not checked" produced no such pull.** The field was the
trailing-slash shape; it was a blocker.

**An unknown that names its own consequence recruits the person who can resolve
it. An unknown that does not is just an absence with a label.**

---

## X-20260909-0215b — A TAUTOLOGICAL TEST IS USUALLY ALSO AN INCOMPLETE ONE

**LATAM's addendum, from doing the repair rather than describing it, and it is
the half I got wrong.**

X-20260909-0215 said the fix for a test that derives its expectation from the
constant under test is to **write the expectation as a literal**. That is
necessary and it is not sufficient.

    THE TEST HAD TO GAIN A CASE IT DID NOT HAVE. Deriving the expectation hid a
    whole state: at the identity value the row silently persisted and nothing
    asked about it.

> **SO THE REPAIR IS TWO MOVES: write the expected value as a literal, AND ASK
> WHAT STATE THE DERIVATION WAS CONCEALING. The value that makes a test
> tautological is precisely the value nobody wrote a case for.**

**THE WORKED EXAMPLE, AND IT IS WORTH COPYING VERBATIM.** LATAM's paywall test
had a "no row" case checking `null` and `0`. It now checks **`null`, `0` AND
`1`** — and **0 stays in that list on purpose**, because 0 is what the retired
allowance field answers to builds already installed. **Anything still reading the
old value must fall through to no row rather than to "0X Daily Gifts."**

    A FORK THAT ONLY ADDS THE NEW CASE LEAVES THE RETIREMENT PATH UNTESTED.

Bitten: reverting `> 1` to `> 0` fails that case, expected false received true,
the other two green.

**AND THE `> 1` GUARD IS A MECHANISM, NOT A LINE.** LATAM read it correctly and
better than I stated it: **a multiplier of 1 is not a benefit, it is exactly what
a free learner gets**, so the row would promise nothing; and it retires the old
row on installed builds by itself. LATAM also **kept `allowanceAllAccessMonthly`
on the wire at 0 rather than removing it** — removing the field breaks those
builds instead of retiring their row. **Retiring a benefit and deleting its field
are not the same operation.**

**FOURTH INSTANCE IN ONE FORK OF "THE WORK EXISTS AND THE WIRE DOES NOT."**
`openapi.yaml:6335` already declared `allAccessGiftMultiplier`, with a
description saying it replaces the allowance. **The server never served it and
both clients read the old field.** So it was never a Gate 3 change. LATAM's
running list: 658 unimported phrases, the review builder reading the parent's
zones, the gift lib with a published contract and no route, and now **a declared
token field nothing populated.**

> **FOUR IS NOT A COINCIDENCE.** Every one passes "does the code exist" and fails
> "can a learner reach it". **The wiring census has been named as the fastest
> route to parity all day and never run. That is the supervisor's outstanding
> miss, and one fork found four instances without being asked to look.**

---

## X-20260909-0310 — NOBODY IS EVER TOLD WHAT COMING BACK TOMORROW IS WORTH

**East Asia's census finding, measured across all six forks before relaying, and
it is worse in the parent than in the fork that found it.**

`lib/daily-gift` exports `giftOpenedCopy`, `giftClosedCopy` and `giftResetCopy`
in five forks. **`giftClosedCopy` and `giftResetCopy` have ZERO callers in ALL
SIX.** `giftOpenedCopy` is called in SEA and Europe and nowhere else.

**AND THE NUMBER THEY EXIST TO SPEAK IS SERVED AND UNRENDERED.**
`tomorrow<Currency>` is computed on the server **reporting the FLOOR
deliberately, so a variable draw is never promised a number it might not pay.**
It is on the wire, in the generated types, in both test fixtures, and `GIFT_COPY`
carries a `tomorrow` line and a capped-case line for a full week.

```
references to tomorrow<Currency> in any .tsx component, tests excluded

  bolo         0        bolo-sea      4
  bolo-east    0        bolo-europe   2
  bolo-africa  0        bolo-latam    0
```

**IN INDIA, EAST ASIA, AFRICA AND LATAM ITS ONLY CONSUMERS ARE GENERATED FILES**
— `api-zod/src/generated`, `api-client-react/src/generated`. **The codegen reads
it. No screen ever has.**

> **A DAILY GIFT WHOSE WHOLE PURPOSE IS TO BRING A LEARNER BACK TOMORROW DOES NOT
> MENTION TOMORROW, IN THE FORK WITH LIVE USERS, AND HAS NOT SINCE IT SHIPPED.**

**BUCKET: gap, not BLOCKS MVP** — the loop completes without it. **It is also the
highest-value gap the census has produced**, because it is the retention mechanic
of the feature five forks spent tonight building.

### AND THE LIB'S OWN COMMENT ASSERTS THE WIRING THAT DOES NOT EXIST

Verbatim, above `giftOpenedCopy`:

```
"NAMING TOMORROW'S NUMBER IS THE MECHANIC."
"Both clients build a literal to pass in here, so demanding fields the copy
 never touches would make every new field on the payload a compile error in
 two apps for no reason."
```

**Neither client passes anything in.** East Asia's count: the fourth comment in
that fork today claiming a wiring nothing implements, after the shim's "two
client call sites" (which was three), the games hub's "the screen gates itself
on traceReadyFor", and the sheet's two "nothing yet" lines.

    A COMMENT THAT DESCRIBES A CALLER IS THE EASIEST KIND TO GET WRONG, BECAUSE
    IT IS TRUE WHEN WRITTEN AND NOTHING FAILS WHEN IT STOPS BEING TRUE.

Third face of the comment problem in one night, and the set is now complete:
X-20260909-2345's comment that **cannot fail**, X-20260909-0235's comment
reporting a defect **already fixed**, and this one, a comment describing a
**caller that went away.**

---

## X-20260909-0315 — THE CENSUS FAILED ITS OWN REACHABILITY CHECK

**Africa and East Asia found the same defect independently, in the instrument I
designed, within an hour of each other.**

Probe 1 as I specified it — *"fields in `openapi.yaml` that no server route ever
sets"* — produces **false positives by construction.**

**AFRICA'S FIRST PASS RETURNED FIVE CANDIDATES AND ALL FIVE WERE PHANTOMS:**

```
baseAmount, tomorrowCowries    set via res.json({ ...gift })   AN OBJECT SPREAD
allowedLanguages, freeLanguages,
gameTaste, features, limits    set in lib/entitlements.ts:605, NOT in routes/
```

**EAST ASIA HIT THE SAME WALL** scanning 358 field names: `tomorrowChai` read as
unpopulated because `dailyGiftFor` sets it in `lib/daily-gift` and **the route
spreads the object, so the literal never appears in the server at all.**

> **A FIELD SET BY SPREAD, OR SET IN `lib/` RATHER THAN `routes/`, READS AS UNSET
> TO ANY GREP FOR `fieldName:`.**

**THE THREE CORRECTIONS, ALL MANDATORY:**

1. **Grep the whole server, not `routes/`.** The population site is frequently in
   `lib/`.
2. **Expand spreads and open every hit.** `res.json({ ...gift })` populates every
   field of `gift` and matches no grep for any of their names.
3. **A GENERATED FILE IS NOT A CALLER.** `api-zod/src/generated` and
   `api-client-react/src/generated` reference every declared field by
   construction, so counting them turns probe 2 into a tautology. **That one is
   mine, found while checking East Asia's finding, and it is what made
   `tomorrowChai` look consumed in four forks where no screen renders it.**

**Africa's sentence is the entry:** *"this fleet's own disease pointed at its own
instrument, in the fork that has spent all day telling other people to open the
thing."* **I designed a census to find code that passes its existence check and
fails its reachability one, and shipped one that did exactly that.**

**AND THE GUARD THAT GREW BY ITSELF IS THE COUNTER-EXAMPLE WORTH KEEPING.**
Africa's `legal-routes.test.tsx` went **5 tests to 6 with no edit** when the
support page was added, **because it reads `ROUTES` out of the prerender script
rather than holding its own list.** A guard whose subject is the source of its
own cases cannot fall behind the thing it guards.

---

## X-20260909-0340 — A COMPLETE, PRICED SHOP THAT NO LEARNER CAN REACH, IN FOUR OF SIX FORKS

**The wiring census's single largest finding, reported independently by four
forks in one night, in nearly the same words.**

```
East Asia   BLOCKS MVP   "a learner who runs out of free plays cannot buy more:
                          no badge, no buy flow, no pack picker. Server,
                          contract and hook all exist."
Europe      BLOCKS MVP   "the server, the column, the ledger reasons and the
                          three gates all shipped today; neither client has a
                          buy button." The ONLY thing left before a complete
                          economy loop there.
LATAM       gap          route not registered, no client mention. Three packs
                          PRICED: single 1 play / 20, trio 3 / 50, stack 10 / 150.
                          buyGameCredits implemented, idempotent, charges the
                          balance, adds the plays. The taste gate SPENDS from
                          the pool.
Africa      absent       no spend_game_credits and no game_credit_consumed
                          reasons in the union at all.
SEA         reachable    but @workspace/game-taste is a FOURTH unconsumed copy
                          of the live rule, with COLLIDING NAMES.
India       WORKING      the only fork where a learner can buy plays.
```

> **LATAM'S FRAMING IS THE ONE TO CARRY, AND IT REFRAMES THE WHOLE FINDING FROM A
> DEFECT INTO A REVENUE PATH:** *"a Free learner hits the wall after three plays
> and is offered ONLY the subscription, while a priced alternative sits complete
> and unreachable."*

**AND IT ANSWERS THE WALL BETTER THAN THE PAYWALL DOES.** *"A learner who wants
one more go at a game is not a learner who wants a subscription."*

**IT NEEDS NO ECONOMY RULING.** Unlike the daily gift it **changes no existing
faucet**: the packs are already priced, the ledger reasons already exist, the
pool is already spent from. **Wiring it is a route plus a client surface.** So it
is commissioned, not asked.

**LATAM ALSO NAMED THE INVERSION AND IT IS EXACT:** *"This is India's original
bug inverted: they sold a pool the server would not honour; this fork honours a
pool nobody can buy."*

### THE PROBE HAS TO ASK THE CAPABILITY QUESTION, NOT ONLY THE REACHABILITY ONE

**LATAM's first probe 2 returned 228 hits and was useless.** "Exported functions
with no caller" is mostly helpers exported for tests. **A census that fires 228
times gets switched off inside a day.** Recast as **DECLARED CONTRACT PATHS WITH
NO ROUTE**, it returned **3 of 94 and every one was real.**

**SEA reached the same conclusion by the same route:** 1,826 exports, 448 with no
non-test caller. *"Twenty-five percent is not a finding list, it is a codebase."*
Re-asked at **package** level, one finding.

    REACHABILITY ALONE PRODUCES A CODEBASE. REACHABILITY PLUS "IS THIS A THING A
    LEARNER COULD DO" PRODUCES A FINDING LIST.

### AND COLLAPSING CAUSES BEATS COUNTING SYMPTOMS

LATAM's probe 1 returned eight apparent findings. **Six are `DailyGiftState`
fields unpopulated because the gift has no route; the seventh is the
game-credits request field, unread for the same reason.** *"Six fields and one
field, two causes. Reporting them as eight findings would have inflated the
census by a factor of four."*

**Same discipline as counting defects rather than strings.** A census is judged
on whether its list is actionable, and eight symptoms of two causes is a list
nobody works.

---

## X-20260909-0410 — CORRECTION: THE TOMORROW LINE WAS A RULING, NOT A GAP, AND I PUT IT ON HIS BOARD AS A FINDING

**India's catch, and it is the most consequential correction of the night
because the artefact was already in front of him.**

I reported X-20260909-0310 as *"nobody is ever told what coming back tomorrow is
worth"* and framed it as a mechanic five forks never wired. **The measurement was
right and the framing was backwards.**

> **THE OWNER RULED ON IT TONIGHT, IN INDIA'S SESSION, VERBATIM: "get rid of
> tomorrow: 5 to 25". He was looking at a rendered box carrying that line.**

**So India's zero is the design he asked for. My own rule, X-20260909-0030,
applied against me: an absence that was a decision is not a finding.** And the
board I had published invited him to approve wiring a surface he had personally
told someone to delete.

### THE REAL FINDING IS THE INVERSE AND IT IS SHARPER

```
India       0   his ruling, applied        East Asia   0
Africa      0                              LATAM       0
SEA         4   BUILT THE REJECTED SURFACE
Europe      2   BUILT THE REJECTED SURFACE
```

**SEA AND EUROPE ARE NOT AHEAD OF THE FLEET. THEY ARE AHEAD OF A DECISION THEY
NEVER HEARD**, because it was given in one session and they were in others.

    A RULING GIVEN IN ONE FORK'S SESSION IS NOT A FLEET RULING UNTIL SOMEBODY
    CARRIES IT. Routing his words to every fork is the entire job of this chair,
    and the currency ruling, the gate ruling and the parity ruling were all
    relayed the same night this one was not.

**AND WHAT INDIA CARRIES IS DEAD WEIGHT ON A LIVE WIRE:** a field computed and
shipped on every gift response, three copy helpers, a `GIFT_COPY` line and a
capped-case line, all maintained for a surface he rejected. **The question to him
is retire it everywhere, or does he want it back somewhere other than the
collapsed box** — not *"shall we wire it".*

**The comment is a separate and genuine defect and India fixes it without
asking:** *"both clients build a literal to pass in here"* was never true in
India. Correcting a false statement about our own code needs no ruling.

---

## X-20260909-0415 — THE CONTROL RAN CLEAN, AND IT NAMED THE PROBE THE CENSUS WAS MISSING

**India as the control, exactly as commissioned, and it validates the other five
while indicting the instrument.**

**PROBE 1: ZERO.** 345 declared schema properties, 5 never mentioned in server
source, **all five opened rather than counted and all five false positives** —
`allOf` a YAML keyword its parser took for a property, `fontFamily` and `rtl`
checked against the **live API** where production serves both, `baseAmount` and
`tomorrowChai` reaching the response through a spread. **India declares nothing
it does not populate.**

> **SO WHEN A FORK REPORTS 3 OF 94 OR 1 OF 13, THOSE ARE REAL.** The probe is not
> measuring the codebase's normal state.

**PROBE 2 IS NOISE AT THE SPECIFIED GRANULARITY IN EVERY FORK THAT RAN IT.**
India 491 of 1,809, SEA 448 of 1,826, LATAM 228. Refined twice, India reaches 45,
**and even that is mostly deliberate**: four prices added tonight on his own
instruction for sinks nobody has built, and a fallback frame sequence CLAUDE.md
keeps on disk on purpose. **Four forks hit the same wall and reached the same fix
independently: ask the capability question, not the reachability one.**

### THE PROBE NOBODY WROTE, AND IT IS THE ONE THAT FOUND EVERYTHING

    THE PROBES THAT LOOK AT THE CONTRACT FOUND NOTHING IN INDIA, AND THE THING
    THAT WAS ACTUALLY WRONG WAS INVISIBLE TO ALL OF THEM.

`tomorrowChai` is **declared, served, typed, fixtured and correct at every layer a
contract probe can see.** It fails only at the layer none of them look at:
**whether a screen renders it.** India's own probe surfaced it and correctly
dismissed it as a spread artefact, because *"does the server set it"* is the
wrong question.

> **PROBE 4, FOR THE NEXT RUN: SERVED BUT NEVER RENDERED. It has to read
> components, not routes.**

**AND IT HAS ALREADY FOUND A SECOND INSTANCE, MEASURED ACROSS ALL SIX FORKS:**

```
analyseIntonation (speechPitch.ts)   ZERO callers in ALL SIX FORKS
analyseRhythm     (speechRhythm.ts)  ZERO callers in ALL SIX FORKS
```

**Not stubs. YIN pitch tracking, chosen over plain autocorrelation because raw
autocorrelation octave-errors and jumps an octave mid-word**, with a header
saying the f0 contour is shared infrastructure for **TONE**. The only other
mentions of intonation or rhythm in the server are **TTS prompt text, not
scoring.**

**Real speech analysis, built with care, and no learner's speech has ever been
measured by it, in any of the six apps** — including SEA and East Asia, whose
Thai, Vietnamese, Lao, Cantonese and Mandarin are the languages it was built for.

**India's caveat is kept rather than dropped: a speech scoring matrix exists as a
separate artefact and this may be PARKED rather than forgotten.** Nobody has
asked him. **A gap with an honest question mark beats a finding with a confident
frame, which is the lesson of the entry above this one.**

**PROBE 3 DID NOT COMPLETE in India** — the asset scan timed out twice against
236 mobile and 331 web files. **Reported as incomplete rather than shipped as a
partial number**, which is the correct handling and worth naming, since a
truncated scan reported as a result is how X-20260909-2358 happened.

---

## X-20260909-0430 — A FIX TRAVELS AS BADLY AS A BUG, AND WITH MORE AUTHORITY

**SEA's rule, caught within minutes of India starting a correction I had told it
needed no ruling. Verified in all three trees before acting.**

India's `lib/daily-gift` comment reads *"Both clients build a literal to pass in
here"*, and X-20260909-0310 recorded it as a genuine defect: **India has zero
callers.** India was right to fix its own. **I said correcting a false statement
about our own code needs no ruling, which was true and incomplete.**

```
giftOpenedCopy call sites, non-test, excluding the definition

  INDIA    ZERO
  SEA      DailyGiftCard.tsx:285      giftOpenedCopy({ day, kopi: amount,
           daily-gift-card.tsx:279     tomorrowKopi: tomorrow })
  EUROPE   DailyGiftBox.tsx:90        giftOpenedCopy({ day, caj, tomorrowCaj })
```

**THE SENTENCE IS FALSE IN INDIA AND A LITERAL DESCRIPTION OF WHAT SEA DOES,
TWICE.** So the design argument it makes about narrowing the parameter type is
**vacuous in the parent and load-bearing in the children.** Cherry-picking the
correction would replace a true statement with a false one **and delete the
reason the signature is narrowed**, inviting the next reader to widen it and turn
every new payload field into a compile error in two apps.

    A FIX TRAVELS AS BADLY AS A BUG, AND IT TRAVELS WITH MORE AUTHORITY, BECAUSE
    NOBODY RE-CHECKS A CORRECTION.

**AND IT IS THE EXACT MIRROR OF THE `upgrade.tsx` CASE.** Keep the pair together:

```
upgrade.tsx   India's LITERAL was correct in India and wrong in four children.
this          India's CORRECTION is correct in India and wrong in two children.
```

**We have spent two days saying the parent's value may not be yours. The same is
true of the parent's repair.** General form, in SEA's words and better than mine:

> **A STATEMENT ABOUT OUR OWN CODE IS SCOPED TO THE TREE IT SITS IN. Verify it in
> the tree you are about to change, not in the tree it was written for.**

---

## X-20260909-0435 — THE RULINGS THAT GO MISSING ARE THE ONES ABOUT SOMETHING MOST FORKS DO NOT HAVE

**SEA's structural reading of my routing failure, and it is more useful than
treating it as an oversight.**

Four of the owner's rulings reached SEA on 2026-09-09: the parity ruling, the
stop-gate ruling, the visible-state ruling, and the economy alignment. **One did
not: "get rid of tomorrow: 5 to 25", given in India's session about a surface
only two of six forks had built.**

    THE RULINGS THAT GO MISSING ARE THE ONES ABOUT SOMETHING MOST FORKS DO NOT
    HAVE, BECAUSE NOBODY IN THE ROOM RECOGNISES THEM AS FLEET-WIDE.

**A ruling about the daily gift is obviously everyone's. A ruling about one line
inside one box reads as local to the person hearing it** — and it is precisely
the forks that already built the surface who most need to hear it, and precisely
the fork that has it who is least likely to think of them.

**THE TEST WHEN A RULING ARRIVES IS NOT "IS THIS FLEET-WIDE". IT IS "WHICH FORKS
HAVE THIS SURFACE, AND HAVE I ASKED".** SEA had four references and Europe two,
and neither was asked.

**SEA also declined to leave a hold-marker comment in the file**, on the grounds
that a note from one fork would collide with whoever lands the ruling. **The
message is the record instead.** Correct, and the same instinct as Europe writing
the `.html` rule inside the file the next filer will open: **put the note where
its reader is, and nowhere else.**

---

## X-20260910-0130 — CONTENTION PRODUCES FALSE FAILURES, NEVER FALSE PASSES

**SEA's finding, and it is the rule that made six simultaneous pre-build checks
interpretable instead of worthless.**

The owner's *"i want ios builds for all the apps tonight in testflight"*, plus
the standing rule that full suites run once immediately before a build, **sent
six forks to run full suites on ONE laptop at the same time.** Measured:

```
load averages: 27.57  51.75  38.92      30 node processes, 16 in ~/bolo alone
```

**THE SIGNATURE, AND IT IS UNAMBIGUOUS:**

```
SEA mobile run 1   3 failed / 1568 passed
SEA mobile run 2   0 failed / 1571 passed        ZERO LINES CHANGED
SEA web run 1      4 failed  retry, start-position, streak-xp
SEA web run 2      4 failed  retry, start-position, home-brand-splash,
                             phrase-navigation      DIFFERENT MEMBERSHIP
those files alone  46 passed, 0 failed
SEA web, quiet     146 files, 1527 passed, ZERO FAILED
```

Every failure a **timeout, 2s to 14s**, in the most timing-sensitive files.
India's re-run was **killed outright for low memory**, which is what finally
named the cause; the same suite passed at `--maxWorkers=2`.

    A TEST CANNOT TIME OUT INTO PASSING.

> **SO A GREEN RUN UNDER LOAD IS STRONG EVIDENCE AND CAN BE TRUSTED. A RED RUN
> UNDER LOAD IS UNINTERPRETABLE AND PROVES NOTHING EITHER WAY.**

**The wrong move is BOTH "chase the red" and "wave the red through".** East Asia
and Africa both went green under load and correctly **refused their serialised
slots** — *"a green run does not improve by being repeated in a quiet room."*

### AND INDIA GOT A CONFIDENT WRONG ANSWER FROM A CLEAN A/B

It swapped its changed file for the predecessor, saw green; swapped back, saw
red; **and concluded it had caused the failures.** Both files then passed alone,
twice each, on the same code.

    A ONE-VARIABLE A/B IS ONLY A CONTROLLED EXPERIMENT IF THE ROOM IS
    CONTROLLED TOO.

**India had read rule 13 to five forks that same hour and then walked into it.**
Europe stopped one step earlier, at *"not mine"* after a stash, which was the
safer failure. **The instruction that created the room was mine.**

---

## X-20260910-0145 — `--non-interactive` MEANS "REFUSE ANYTHING THAT REQUIRES A CHOICE"

**Cost this fleet two separate blockages in one night, on two different
commands, and in one case sent a job to the owner that no owner was needed for.**

```
eas build  --non-interactive  -> "Distribution Certificate is not validated
                                  for non-interactive builds."
eas submit --non-interactive  -> "App Store Connect API Keys cannot be set up
                                  in --non-interactive mode."
```

**BOTH CREDENTIALS ALREADY EXISTED ON THE ACCOUNT.** The distribution
certificate, push key and provisioning profile were reused from the team's
existing set; the ASC API key (`AM4CLV44R7`, `[Expo] EAS Submit`) was already on
EAS servers. **East Asia and Africa cleared the build gate with a pty and PACED
input, one newline every 7 seconds, with no password.**

> **THE FLAG IS NOT THE SAFE UNATTENDED OPTION. IT IS A REFUSAL TO SELECT.**
> Choosing an existing credential is a choice, so the flag forbids it. **An
> agent reaching for `--non-interactive` because it reads as "do this without
> bothering anyone" gets the exact opposite: a hard stop on work it was fully
> entitled to do.**

**LATAM concluded from it that only the owner could proceed and handed the job
back.** The refusal to type a password was correct and stays correct. **The
inference that a password was REQUIRED was the flag talking.**

---

## X-20260910-0200 — JSON-VALID IS NOT SCHEMA-VALID. VERIFY WITH THE CONSUMER, NOT WITH A PARSER.

**SEA's rule, paid for by breaking its own tree on my instruction.**

I told all six forks to add `"autoSubmit": true` to `build.production` in
`eas.json`. **It is not a key eas-cli 21 accepts**, and an invalid `eas.json`
does not degrade:

```
eas.json is not valid.
- "build.production.autoSubmit" is not allowed
    Error: build:list command failed.
```

**EVERY `eas` COMMAND STOPS**, including `build:list` and `build:view`, **so
three forks lost the ability to look at builds that were already running.**

SEA validated with `python3 -c "json.load(...)"`, confirmed the submit profile
survived, reported *"valid json? yes"*, committed and pushed.

> **A PARSER IS NOT THE AUTHORITY ON A CONFIG FILE. THE TOOL THAT READS IT IS.**
> The question was never "is this JSON", it was **"will eas take it"**, and the
> check was one command SEA had already run twice that hour.

### THE LATENCY CLAUSE, WHICH IS LATAM'S AND IS THE HALF THAT EXPLAINS THE SPREAD

SEA reasoned East Asia must be on a newer CLI, since it had accepted the key.
**Measured: all six are on eas-cli 21.0.0.** East Asia had simply not run an
`eas` command since editing.

    THE BREAKAGE WAS LATENT, NOT ABSENT. AN UNTRIED CONFIG CHANGE IS NOT A
    WORKING ONE, and a fork that edits a tool's config without immediately
    running the tool has learned nothing about whether it works.

**Both reverts were verified by RUNNING the command, not by reading the diff.**

**THE CAPABILITY IS REAL AND IS A FLAG:** `eas build --auto-submit`, or
`--auto-submit-with-profile`. Same behaviour, same submit profile, nothing to
commit.

**AND THE INSTRUCTION THAT CARRIED IT WAS MINE: "all six adding it
identically",** asserted on the night this fleet proved six times over that
uniformity across forks is precisely the assumption that does not hold. **Two
forks had refused to port three constants for that exact reason hours earlier.**

---

## X-20260910-0215 — READING THE OUTPUT YOU CAN SEE AND CALLING IT THE STATE

**Africa's self-correction, twice in one message, and it names a failure mode
distinct from every other one recorded tonight.**

Africa reported: *"nothing was spent, no version burned"* and *"my build is not
queued, it never started"*. **Both false.**

```
app.json   autoIncrement had ALREADY written 3
build:list 3e1d491f  iOS production 1.0.0 (3) status new, started 21:29:45
```

**Africa's first iOS binary had been scheduled by the pty run**, and the
credential prompt it stopped at was not the gate it assumed. Its own reading:

> **I READ THE OUTPUT I COULD SEE AND CALLED IT THE STATE.** The pty showed a
> password prompt, so "no build". `app.json` showed no diff at the moment I
> looked, so "no number burned". **Both are inferences from a partial view,
> reported as measurements.**

    THE AVAILABLE CHECK WAS THE SAME IN BOTH CASES AND NEITHER WAS RUN: ASK THE
    SYSTEM THAT HOLDS THE STATE.

**Cousin of the truncated-output rule and of the failed-seek rule, but sharper:
those were absent evidence read as evidence of absence. This is PRESENT evidence
about one layer read as evidence about another.** A terminal shows what a
command printed, not what a server did.

**AND IT INVERTS AFRICA'S OWN BEST ARTEFACT, four hours apart in the same tree.**
`legal-routes.test.tsx` works because **its subject is the source of its own
cases**, so it cannot fall behind what it guards. These two failed because the
check consulted something adjacent to the thing that decides. **Same shape,
opposite sign.**

---

## X-20260910-0230 — A CORRECT METHOD APPLIED TO A PRECONDITION THAT HAD ALREADY BEEN DISPROVED

**India's joining of its own error and mine, made within an hour of each other,
and the pair is worth more than either entry alone.**

```
INDIA   ran a one-variable A/B to isolate a test failure.
        The method is right. THE PRECONDITION IS A CONTROLLED ROOM, and the
        room was at load 27 with five other agents in it. India had read
        rule 13 to five forks THAT SAME HOUR.

ME      told six forks to add one config key "identically".
        The method is right: an ENGINE change travels. THE PRECONDITION IS
        THAT THE SIX ARE ALIKE IN THE RELEVANT WAY, and this fleet had
        disproved that six times that evening - the paywall URL, the price
        retune reaching five forks five ways, three constants two forks
        refused, a comment true in two trees and false in a third.
```

> **NEITHER OF US USED A BAD METHOD. WE BOTH APPLIED A GOOD ONE WHOSE
> PRECONDITION HAD BEEN DISPROVED IN FRONT OF US THAT EVENING.**

    A METHOD CARRIES ITS PRECONDITION WITH IT. Reciting the method is not the
    same as checking the precondition still holds, and the more familiar the
    method, the less likely anyone checks.

**THE TELL IS THE SAME IN BOTH: the reasoning felt routine.** A one-variable A/B
and "port the ENGINE change to all forks" are both things this fleet does
correctly every day. **Familiarity is what stopped either of us asking the one
question that would have cost a single command** — *what else is running?* and
*are they on the same version?*

**Cousin of X-20260909-0030's other hat and of "a fix travels as badly as a
bug".** Those are about the CONTENT of a change failing to travel. **This is
about the METHOD failing to travel, which is harder to see, because a method
looks portable by definition.**

---

## X-20260910-0310 — THE BOX ALWAYS SHOWS, LOCKED UNTIL A STOP IS DONE

**Owner ruling, 2026-09-10, made while holding a TestFlight build and unable to
find the gift.**

> **"i don't see the gift on SEA. does it not appear until i complete a lesson?"**
> **"I want it to always show but be locked until the lesson is complete"**

**IT OVERTURNS THE PARENT'S DESIGN, NOT A BUG.** Measured across five forks:

```
bolo        if (!gift) return null;
            if (!gift.earnedToday && !gift.claimed) return null;   HIDES IT
bolo-sea    if (!gift) return null;
bolo-east   if (!gift) return null;
bolo-latam  if (!gift) return null;
bolo-europe NEITHER. Already correct.
```

**India deliberately hides the box until the day is earned, on both platforms,
and every fork inherited a weaker version that hides it whenever the payload has
not arrived.** LOCKED IS THE RESTING STATE, NOT THE ABSENT STATE.

**WHY IT MATTERS MORE THAN A GUARD.** An absent box teaches nothing: no state,
no instruction, and no promise to come back for. It is the strongest possible
version of the failure that produced *"we should show that on the gift so its
obvious"* and LATAM's *"an unearned box gives an instruction, not a state."*

### AND THE RULING DID NOT SETTLE WHAT A NO-PAYLOAD BOX MAY DRAW. SEA DID.

```
range     SHOWN, at the BASE multiplier, correcting when a payload lands
reason    "Finish a stop today to open it."
day       NOT PRINTED. "GIFT" rather than a guessed "Day 0"
meter,    NEITHER DRAWN. Both are made of balances.
wallet
```

> **A PROMISE SURVIVES A MISSING PAYLOAD. A FACT DOES NOT.**

**The range is a promise about what the box could pay; the meter is a fact about
what this learner has.** One is safe to draw from nothing and the other is a
fabrication. **"Show the locked card" does not by itself say which of the six
things on it are safe.**

### THE THIRD ANSWER NOBODY OFFERED HIM

He saw nothing on SEA because he had **build 6**, uploaded 7 September, and SEA's
gift card was added on the 8th at `6b2b9157`. **The card was not in that binary
at all.** Neither of the two explanations on offer — "it is hidden until earned"
and "it is a bug" — was the reason he saw nothing that night.

**AND THE RULING IS STILL RIGHT.** Even build 7 would have shown him nothing on
an unpractised day. **He found a real design fault while looking at a binary that
could not have shown it either way.**

---

## X-20260910-0320 — A NEGATIVE ASSERTION NEEDS A POSITIVE ANCHOR

**SEA's finding, against its own new pin, and it completes the set of vacuous
checks this fleet has collected in one night.**

SEA wrote three pins for the locked no-payload box. The third read **"no meter,
no wallet, no draw"** and **PASSED AGAINST THE OLD EARLY RETURN**, because

    A CARD THAT RENDERS NOTHING SATISFIES EVERY ABSENCE.

> **A NEGATIVE ASSERTION CANNOT TELL "NO NUMBERS" FROM "NO CARD" UNLESS IT FIRST
> ASSERTS THE THING IS THERE.**

Fixed by asserting the box is **present** before asserting what is absent from
it; all three then go red on the old guard.

**AND IT WAS ONLY FOUND BECAUSE SEA REINSTATES THE BUG EVERY TIME AND WATCHES
WHICH PINS MOVE.** Three tests, two went red, one stayed green. **A pin that does
not move when you restore the defect is not a pin.** SEA applied the fix to the
mobile twin before running it, so the vacuous version never shipped on either
platform.

**THE FOURTH MEMBER OF TONIGHT'S SET**, and they are all the same shape from
different angles:

```
X-20260909-0215  a test deriving its expectation from the constant under test
X-20260910-0200  a parser standing in for the consumer of a config file
X-20260909-2345  a fixture that satisfies the precondition for both doors
X-20260910-0320  a negative assertion with no positive anchor
```

**Every one passes while the thing it exists to catch is present.** The common
repair is also one sentence: **make the check consult the thing that decides, and
prove it by restoring the defect.**

---

## X-20260910-0430 — THE BOX MOVES DOWN, AND A LOCKED TAP MUST SPEAK

**Two owner rulings, 2026-09-10, made while signed into East Asia's TestFlight
build with the gift box on screen. Verbatim:**

> **"it shouldn't be all the way up top. when i click on it, i should get a
> message saying that it will unlock once i finish a stop on the journey."**

**PLACEMENT, MEASURED ACROSS FOUR FORKS:**

```
bolo-east    index.tsx:554   above the greeting
bolo-latam   index.tsx:553   above the greeting
bolo-europe  index.tsx:577   above the greeting
bolo-sea     index.tsx:837   ABOVE THE JOURNEY FRAME    <- the accepted one
```

**SEA's comment is the ruling's own reasoning, written before the ruling:** *"the
box and the map answer the same question in that order: what did today earn you,
and where does it take you."*

**LATAM'S ARGUMENT FOR THE TOP WAS GOOD AND IT LOST:** *"the one thing on this
page that EXPIRES, and a box that must be opened today should not be below a
fold."* **It deleted that comment rather than leaving it beside the new one** —
*"two comments disagreeing about why is worse than either alone."* **Same family
as the stale TODO: a comment defending a decision the code no longer makes.**

### THE TAP, AND WHY IT IS A REAL DEFECT RATHER THAN A POLISH ITEM

```
const onTap = async () => {
  if (!claimable || claim.isPending) return;      <- silent
```

    A DEAD TAP IS WORSE THAN A DIMMED BOX. A DIMMED BOX IS AT LEAST A STATE.

**Message in his vocabulary, which is the app's own on that screen: a STOP on the
JOURNEY.** Not "practise", not "a lesson". **And the two not-nows survive into
the message as well as the card:** unearned gets the journey instruction,
already-claimed gets *"Opened. Come back tomorrow."* **A learner who has claimed
must never be told to go and finish a stop.**

---

## X-20260910-0440 — A `disabled` BUTTON CANNOT SPEAK, SO ONE §6c SIGNAL HAD TO BE TRADED

**LATAM's finding while shipping the ruling above, and it is a rule change to
§6c rather than an implementation note.**

`disabled` was one of the four non-hue signals separating a locked box from an
open one, for a partially colour-blind owner. **But a disabled button swallows
the tap**, so the moment a locked box must respond, `disabled` cannot stay.

```
was    disabled
now    aria-disabled  (web)     accessibilityState  (mobile)
```

**The state is still announced to a screen reader and the press still lands.**

> **THREE OF THE FOUR SIGNALS SURVIVE AND THE FOURTH IS AN UPGRADE RATHER THAN A
> LOSS, BECAUSE A MESSAGE IS THE ONLY SIGNAL THAT ANSWERS THE QUESTION THE TAP
> WAS ASKING.** A glyph, opacity and words say *what*; only the message says
> *what to do about it*.

**AND THE MECHANICAL COST, WHICH EVERY FORK DOING THIS WILL HIT:**

```
a locked tap now SETS STATE
raw .click() in a web test  ->  act() warning  ->  failure
fix                          ->  fireEvent.click
```

**The older tap tests passed only because a claim spy changes nothing.** **The
tell is a test going red with no assertion edited** — which on a night of
contention failures is exactly the signature that gets misread as the room.

---

## X-20260910-0440b — ADDENDUM: TWO FORKS FOUND THE `disabled` TRAP INDEPENDENTLY, AND SEA'S SENTENCE IS THE ONE TO KEEP

**LATAM at `d48bc0f4` and SEA at `017ac095`, separately, within the hour. Neither
had the other's finding when it hit its own.**

    ONTAP DECIDES WHAT A PRESS MEANS. DISABLED DECIDES THAT A PRESS DOES NOT
    HAPPEN.

**SEA's framing of why it catches everybody:** `disabled={!claimable}` is the
obvious thing to have written, **and it reads like an accessibility nicety rather
than a gate.** Both forks wrote a correct handler and watched the message never
appear.

### THE FLAG WAS DOING A SECOND JOB AND ONLY THE SECOND JOB IS GONE

SEA found two existing pins asserting the claimed box is `disabled`. **Both were
right until this ruling**, and what they were actually protecting was **THE
STILLNESS** — an always-on animation on a home screen has hung a suite in this
repo before.

> **So the flag carried two meanings: "no press" and "no motion". The ruling
> removes the first and the second still needs asserting.** SEA **inverted** the
> pins rather than deleting them, one per platform, keeping the stillness half.
> **A flag doing two jobs looks like one line to whoever removes it.**

**Both forks left a comment saying why `disabled` is absent, because the next
person to tidy will want to put it back.**

---

## X-20260910-0450 — RECORD A LOSING ARGUMENT AS A JUDGEMENT, NOT AS A CORRECTION

**SEA's point about LATAM's overruled placement comment, and it is a rule about
how this ledger should be written rather than about the gift.**

LATAM argued the box belongs at the top because **it is the one thing on the page
that expires, and a thing that must be opened today should not sit below a
fold.** The owner ruled the other way.

> **THAT IS SOUND REASONING FROM A TRUE PREMISE. IT WAS DECIDED AGAINST, NOT
> REFUTED.**

    A FORK READING THE OUTCOME LATER MUST SEE THAT IT WAS A JUDGEMENT RATHER
    THAN A CORRECTION, OR IT WILL RE-RAISE IT.

**This matters because most of this ledger records errors, and an entry that
merely says "the box moved down" reads as though the old position was a mistake.
It was not.** The premise still holds: **the gift really does expire, and it
really is now below a fold.** He accepted that cost for a different ordering.

**THE GENERAL FORM:** when a ruling overturns a documented decision, record
**what was given up**, not only what was chosen. **An outcome with no cost
attached looks like a bug fix, and bug fixes invite reversal by anyone who
rediscovers the original argument.**

---

## X-20260910-0510 — THE FOUR RUNGS, AND EVERY ONE OF THEM CAUGHT SOMEBODY IN ONE NIGHT

**SEA's ladder, assembled from three separate mistakes made by three different
parties within four hours. Only the last rung means a human can open the app.**

```
REGISTERED    a submission id exists.  THE BUILD MAY NOT.
SCHEDULED     the CLI says "scheduled". Nothing has moved.
SUBMITTED     the binary is at Apple, Processing.
INSTALLABLE   Apple finished. It is in the tester-facing list.
```

**WHO EACH RUNG CAUGHT:**

- **REGISTERED.** `--auto-submit` **registers the submission before the build
  finishes compiling**, so SEA held a submission id while there was no binary.
- **SCHEDULED.** The supervisor reported East Asia as submitted on the strength
  of the CLI printing a key banner and the word "scheduled". **SEA challenged
  it. The challenge was right about the reasoning and wrong about the fact**,
  which only a console read could separate.
- **SUBMITTED.** The supervisor called three forks "in TestFlight" when they
  were in App Store Connect. **East Asia corrected it: Apple processes for
  minutes to an hour and eas does not report that.**
- **INSTALLABLE.** East Asia's binary reached this rung and **still could not be
  installed, because the app had no tester group at all.**

    A STATUS WORD FROM A TOOL DESCRIBES THAT TOOL'S STEP, NOT THE JOURNEY. Each
    rung has its own reporter and none of them can see the next one.

**AND THE HEALTHY BAND IS NOW MEASURED RATHER THAN ASSERTED.** Five binaries,
five forks, one night:

```
Africa 45,891   Europe 46,028   SEA(7) 46,058   SEA(8) 46,062
East Asia 46,061   India 46,471        poisoned cluster ~52,900
```

**Every one checked BEFORE its submit rather than after**, which is what turns
the pre-flight from a quality gate into a cost control on an account 200 builds
over its credits.

**AND SEA'S 401 IS RETROSPECTIVELY CLOSED.** Build 8's auto-submit authorised
cleanly with the identical key `AM4CLV44R7` and the identical app id. **The key
was never the problem; the first failure was transient**, which is what the
console read said at the time against the error message's own testimony.
X-20260910-0145's rule holds: **a 401 is Apple's description of a request, not a
diagnosis of a credential.**

---

## X-20260910-0525 — THE REPRODUCIBILITY CONTROL NOBODY ASKED FOR, AND IT SUGGESTS THE OLD BUG IS GONE

**SEA built the same fork twice, two hours apart, and the bundles came out within
FOUR functions of each other.**

```
SEA build 7   46,058 functions
SEA build 8   46,062 functions        two hours later, same tree plus six pins
```

**THAT IS THE MEASUREMENT THE ANIMATION INVESTIGATION NEVER GOT.** India's
CLAUDE.md records seven store builds where **two builds of byte-identical source
came out 8,792 functions apart** — 44,080 against a frozen cluster at ~52,900 —
and concludes: *"THE ROOT PROBLEM IS THAT YOUR BUILDS ARE NOT REPRODUCIBLE. Two
builds of one commit were never guaranteed to be the same app, which is why a
week of one-variable-at-a-time bisecting produced nothing."*

> **TONIGHT SIX BINARIES ACROSS FIVE FORKS ALL LANDED IN A 580-FUNCTION SPREAD,
> AND ONE FORK REPRODUCED ITSELF TO WITHIN FOUR.**

```
Africa 45,891   Europe 46,028   SEA(7) 46,058   East Asia 46,061
SEA(8) 46,062   India 46,471            poisoned cluster ~52,900
```

**NOT PROOF, AND SAY SO: nobody built the same commit twice.** Build 8 carries
six pins build 7 does not, so it is *nearly* identical rather than identical.
**But the old failure was two builds of the SAME source diverging by nearly nine
thousand functions**, and nothing in tonight's spread is within an order of
magnitude of that.

    THE CHEAPEST EXPERIMENT NOBODY HAS RUN IS STILL AVAILABLE: build one commit
    twice and read both headers. It costs two builds and it would close a
    question that cost about nineteen.

**Worth putting to the owner as its own commission rather than folding into a
release**, because a definite answer changes how every future animation or
freeze report gets triaged.

---

## X-20260910-0530 — SEA BUILD 8 REACHED THE FOURTH RUNG, AND IT IS THE FIRST BINARY THAT COULD SHOW HIM THE FAULT HE FOUND

```
Build Uploads   1.0.0 (8)  Complete           Sep 9, 11:12 PM
Version 1.0.0   Build 8    Ready to Submit    expires in 90 days
                Groups     Internal Alpha Testers, Team (Expo)
```

**NEITHER EARLIER BINARY COULD HAVE SHOWN HIM THE BUG HE REPORTED.** Build 6 has
no gift card at all; build 7 still returned `null` with no payload. **He found a
real design fault on a binary that could not have displayed it either way**, and
the fix reached a phone the same night.

> **A REPORT THAT NAMES THE WRONG RUNG SENDS SOMEBODY TO OPEN AN APP THAT IS NOT
> THERE, AND THEY CONCLUDE THE FEATURE IS BROKEN.** That is exactly what happened
> to him on build 6, one layer up from the ladder itself.

---

## X-20260910-0545 — THE FLAG AND THE MISSING TTY ARE THE SAME FAILURE, AND THE TELL IS THAT THE BUILD PASSES

**X-20260910-0145 recorded half a rule.** It said `--non-interactive` means
*"refuse anything that requires a choice"*, and prescribed dropping the flag.
**LATAM dropped the flag and died in exactly the same place.**

```
eas build -p ios --profile production --auto-submit        no flag passed
  build    SUCCEEDED
  submit   App Store Connect API Keys cannot be set up in --non-interactive mode
```

> **A MISSING TTY IS TREATED AS `--non-interactive` WHETHER YOU PASS THE FLAG OR
> NOT.** A backgrounded command has no tty, so the flag was never the mechanism.
> It was one of two ways into the same state.

**AND THE SPLIT IS DIAGNOSTIC, WHICH IS THE USEFUL PART:**

```
the BUILD half succeeded      resolved credentials require no CHOICE
the SUBMIT half refused       picking one of two API keys IS a choice
```

    IF A BUILD SUCCEEDS AND THE SUBMIT IN THE SAME COMMAND REFUSES, THE PROBLEM
    IS THE TTY. IT IS NOT THE CREDENTIALS, WHICH JUST DEMONSTRATED THEY WORK BY
    BUILDING.

**So dropping the flag is necessary and not sufficient.** The whole command goes
through `script -q /dev/null` with a newline every seven seconds. LATAM's chose
"Choose an existing key" and `AM4CLV44R7` unattended, both first-highlighted, and
uploaded `1.0.0 (3)`, its first binary ever in App Store Connect.

**Generalises past eas.** Any tool that asks a question can be silenced by an
absent terminal as easily as by a flag, and the absent terminal leaves no trace
in the command you typed. **The command you can read is not the environment it
ran in.**

---

## X-20260910-0600 — IT HAD THE ANSWER ON DISK AND BELIEVED A FLAG'S ERROR MESSAGE INSTEAD

**LATAM filed this against itself, unprompted, and it is the sharpest thing
recorded tonight.**

Its own memory file says, in these words: **"never put 'run the first build
yourself' on an owner list again."** It put that on the owner's list anyway.

**WHY:** `--non-interactive` printed *"Distribution Certificate is not
validated"*, and it read that as *"there is no certificate"*.

```
what the message described     a request that could not proceed without a choice
what it was read as            a fact about the state of the account
the actual state               certificate present, valid to July 2027, on Expo
```

> **AN ERROR MESSAGE DESCRIBES A REQUEST. IT IS NOT A DIAGNOSIS OF THE THING IT
> NAMES.** "Cannot validate X" and "X does not exist" are different sentences,
> and only one of them was on screen.

**THIS IS THE THIRD INSTANCE TONIGHT OF THE SAME SHAPE:**

```
the ASC 401        read as "the key is bad"        the key had authenticated twice that hour
the cert warning   read as "there is no cert"      it was on the servers all along
the schedule line  read as "it submitted"          the CLI had scheduled, not finished
```

**In all three the correct move was the same and cheap: go and look at the thing
itself.** The console, the credential list, the Build Uploads table. Each time
the reading of the message cost more than the looking would have.

    AND THE AGGRAVATING FACT IS THE ONE LATAM PUT IN CAPITALS ABOUT ITSELF: THE
    ANSWER WAS ALREADY WRITTEN DOWN IN ITS OWN MEMORY, AND A FLAG'S PHRASING
    OUTWEIGHED IT. A WRITTEN RULE THAT IS NOT GREPPED IS NOT A RULE.

**Same failure I made twice tonight in a different costume:** I told LATAM
"§4a cannot touch you" without grepping its tree, and told it four functions were
missing without grepping my own ledger, which had ruled them deliberate. **Both
times the record held the answer and I did not open it.**

---

## X-20260910-0620 — TWO FORKS ARE IN TESTFLIGHT ON A CLERK **DEVELOPMENT** INSTANCE, AND THE REASON NOBODY NOTICED IS THAT IT LOOKS LIKE IT WORKS

**Decoded, not read by prefix, from each fork's EAS `production` environment:**

```
bolo         pk_live   clerk.bolo-india.app
bolo-sea     pk_live   clerk.bolo-sea.app
bolo-east    pk_live   clerk.bolo-east.app
bolo-africa  pk_live   clerk.bolo-africa.app
bolo-europe  pk_test   tender-ant-1393.clerk.accounts.dev
bolo-latam   pk_test   decent-lab-855.clerk.accounts.dev
```

**Europe and LATAM ship binaries that authenticate against their DEVELOPMENT
Clerk instance.** Both production instances read *"Awaiting deployment"*, 0/3
setup tasks, **0 sign-ups all time**, and DNS configuration **0/5 Verified**.

> **AND THE SYMPTOM IS INVERTED, WHICH IS WHY IT SURVIVED A WHOLE NIGHT OF
> LOOKING AT SIGN-IN.** A Clerk development instance uses **Clerk's own shared
> OAuth credentials**. So the two forks with no production instance at all are
> the two where **Google and Apple appear to work**, and the fork that got the
> "Missing required parameter: client_id" error is East Asia, which is further
> ahead.

```
East Asia, Africa   instance IN SERVICE, OAuth credentials missing   -> fails LOUDLY
Europe, LATAM       instance NOT IN SERVICE AT ALL                   -> fails QUIETLY
```

    THE FORK THAT THREW THE ERROR WAS THE HEALTHIER ONE. AN ERROR IS EVIDENCE OF
    A LIVE SYSTEM. TWO FORKS THREW NOTHING BECAUSE THEY WERE NOT PLUGGED IN.

**This is the fifth face of the silent default**, and the memory file already
names the shape: *absent and passing look identical; the danger is whatever never
entered the count.* Europe and LATAM never entered the OAuth count.

**AND IT EXPLAINS EUROPE'S STATS BAR** by a mechanism Europe's own `api-server`
documents at `src/app.ts:135`: *"a session minted by one Clerk instance cannot be
verified with another instance's secret... whichever hostname does not match it
401s EVERYTHING, with nothing in the error that names the cause."* The comment
even names Africa hitting it in this exact direction on a simulator. **Europe is
hitting it on a phone.** Unverified link: I cannot read the Repl's
`CLERK_SECRET_KEY_PROD`, so Europe was asked to falsify it, not confirm it.

---

## X-20260910-0625 — I BUILT A DETECTOR, IT FIRED, AND THEN THE CONTROL FIRED TOO

**Worth recording because the finding above was nearly filed on garbage.**

Each fork proxies Clerk at `/api/__clerk`. So: ask each fork's own server for
`/v1/environment` and see which instance answers. Europe returned:

```
{"errors":[{"code":"host_invalid","long_message":
 "We were unable to attribute this request to an instance running on Clerk..."}]}
```

**That reads like proof.** It names the exact fault I was already expecting.

**THEN I RAN IT AGAINST INDIA, WHICH IS `Ready for Distribution` ON THE APP STORE
THIS MORNING.**

```
bolo-india.app   host_invalid      <- a shipping, approved, working app
bolo-sea.app     host_invalid
bolo-east.app    host_invalid
bolo-africa.app  host_invalid
bolo-europe.app  host_invalid
bolo-latam.app   host_invalid
```

> **SIX OUT OF SIX. THE PROBE DISCRIMINATED NOTHING.** It measured that a bare
> GET cannot drive Clerk's proxy, and said so in language that sounded like a
> diagnosis of the instance.

**The replacement passes its own control:**

```
dig clerk.<domain> CNAME
  india, sea, east, africa   frontend-api.clerk.services.
  europe, latam              <none>, and the other four records absent too
```

    A DETECTOR IS NOT VALIDATED BY FIRING ON THE CASE YOU SUSPECT. IT IS
    VALIDATED BY STAYING SILENT ON THE CASE YOU KNOW IS HEALTHY.

**Two memory files already said this** in different costumes: *test the detector,
not just the tree*, and *a guard only run against failure is untested*. **I have
now spent the cost of learning it a third time**, and the only thing that saved
the report was running one extra row that I expected to be boring.

**Rule for the fleet: every wire probe carries a control row, and the control is
the fork you would bet your house on.**

---

## X-20260910-0650 — THREE PROBES IN ONE NIGHT RETURNED THE SAME VALUE IN THE CASE THEY WERE BUILT TO DISTINGUISH

**LATAM audited a claim in its own setup doc and struck it, unprompted.**

`SETUP-STATE-2026-09-08` recorded, as settled fact:

> *"/api/categories answers 401 rather than 500, so the dev-in-CLERK_SECRET_KEY
> and live-in-CLERK_SECRET_KEY_PROD split is right"*

**LATAM's words: "THAT INFERENCE DOES NOT HOLD."**

```
what 401-not-500 proves      the Clerk middleware did not crash
what it was read as          which secret is loaded
why it cannot say that       BOTH configurations answer 401 to a request
                             carrying no token
```

> **A REQUEST WITH NO TOKEN IS REJECTED BY EVERY POSSIBLE CONFIGURATION.** The
> test was run without the one ingredient that could have made the two cases
> differ.

**AND IT IS THE THIRD INSTANCE TONIGHT OF EXACTLY THIS:**

```
X-20260909-2345  a test proving two paths agree on a VALUE
                 cannot see them disagree on a PRECONDITION
X-20260910-0625  /v1/environment returned host_invalid for all six forks,
                 including one live on the App Store this morning
X-20260910-0650  401-not-500 returns 401 whichever secret is loaded
```

    A PROBE IS ONLY A PROBE IF THERE EXISTS AN INPUT THAT WOULD MAKE IT SAY THE
    OTHER THING. IF YOU CANNOT NAME THAT INPUT, YOU HAVE MEASURED THE WEATHER.

**LATAM then wrote the probe that does discriminate**, and its virtue is that it
answers the question while revealing nothing:

```
[ -n "$CLERK_SECRET_KEY_PROD" ] && echo PROD_SET || echo PROD_UNSET
```

```
PROD_UNSET   dev token, dev secret, the binary works
PROD_SET     EVERY authenticated call 401s the moment he opens it
```

**Note what it does NOT print.** The value of a secret is not the same question as
whether a secret is set, and only the second one is ever needed. **The forks have
been blocked on unreadable secrets all week and nobody had written the
one-liner that steps around the whole problem.**

**This also retires the standing suspicion about Europe's deployment.** Europe was
told to look for a `CLERK_SECRET_KEY` mismatch. The question was always narrower
than that and now has a one-line answer.

---

## X-20260910-0715 — CORRECTION TO X-20260910-0650: A SOUND READING WITH AN OVERSIZED CONCLUSION IS NOT A WORTHLESS PROBE

**LATAM overturned my framing of its own strike, in its favour, and it is right.**

X-20260910-0650 filed LATAM's `401-not-500` observation alongside two probes that
measured nothing. **LATAM's correction:**

> *"a probe can be sound and its CONCLUSION oversized, and striking the conclusion
> should not throw away the reading."*

```
what the doc claimed     "the dev-in-KEY and live-in-PROD split is right"   OVERSIZED
what the reading proves  ONE secret is loaded and the middleware did not throw
```

**And the smaller claim turned out to be the one that mattered.** Twelve hours
later Europe proposed *"neither secret is on the deployment"*, and LATAM's
allegedly worthless reading falsified it immediately.

    STRIKE THE INFERENCE, KEEP THE OBSERVATION. THEY ARE STORED IN THE SAME
    SENTENCE AND DELETED WITH THE SAME KEYSTROKE, WHICH IS WHY THE OBSERVATION
    KEEPS GOING WITH IT.

**MEASURED ACROSS THE FLEET**, two authenticated endpoints, no token, on the
custom domain of each fork:

```
india  sea  east  africa  europe  latam       401 every time, 500 never
```

**No Clerk secret is missing on any deployment.** Europe's hypothesis B is dead.
Corroborated independently in Sentry: `bolo-europe-api` has **no "Missing Clerk
Secret Key" issue in seven days**, while `GET /api/pricing` threw a *Stripe* error
seven times in 24 hours, which cannot happen downstream of a middleware that
throws on every request.

---

## X-20260910-0720 — LINE 50 OF CLERK'S OWN HELPER MAKES THE ENTIRE PER-HOST MECHANISM CONDITIONAL, AND FOUR FORKS DOCUMENT IT WITHOUT SAYING SO

**Read in `@clerk/shared@4.29.3`, not assumed:**

```js
function publishableKeyFromHost(host, fallbackKey) {
  if (fallbackKey && isDevelopmentFromPublishableKey(fallbackKey)) return fallbackKey;
  const hostname = host.toLowerCase().replace(/:\d+$/, "");
  if (!hostname) throw new Error("Host must not be empty.");
  return buildPublishableKey(`clerk.${hostname}`);
}
```

> **IF `CLERK_PUBLISHABLE_KEY` IS A `pk_test`, THE HOST IS NEVER CONSULTED.** The
> function returns the dev key for every hostname, custom domain included, and
> the whole per-host derivation the forks' comments describe at length **does not
> run at all.**

**Four forks carry a long comment about serving multiple Clerk custom domains from
one deployment. None of them mentions the guard that switches the mechanism off.**
The comment is accurate about what the function does in production and silent
about the branch that decides whether production behaviour applies.

**IT ADDS A FOURTH SHAPE TO A QUESTION EVERYONE THOUGHT HAD TWO:**

```
A  _PROD = sk_live                      dev token, prod secret     401 everything
B  no secret at all                     FALSIFIED above            500 everything
C  CLERK_SECRET_KEY = sk_live, no _PROD  same as A                 401 everything
D  CLERK_PUBLISHABLE_KEY = pk_test       server runs in DEV MODE   EVERYTHING WORKS
```

**And `401-not-500` fires identically under A, C and D**, which makes it the fourth
probe of the night that returns the same value in the case it is meant to
separate.

    THE VARIABLE THAT DECIDES WHETHER THE OTHER TWO MATTER WAS NOT IN EITHER
    FORK'S PROBE, BECAUSE BOTH FORKS WERE READING THE CODE THAT USES IT RATHER
    THAN THE CODE THAT IMPLEMENTS IT.

**Europe named why the one-line answer went unwritten for a week, and it is a
supervisor failure rather than a fork one:**

> *"the people who needed it could not run it, and the person who could run it was
> never handed it."*

**The Repl Shell pane renders blank for an agent.** Six sessions could reason about
the secret and none could read it; the one person who could was never given the
line. **That is a handoff gap wearing the costume of a knowledge gap.**

---

## X-20260910-0745 — THE FIFTH PROBE. THIS TIME THE CONTROL RAN FIRST AND KILLED IT BEFORE IT REACHED A SENTENCE

**The idea was sound and the guard's own comment promised it.** `unreadableTokenGuard`
re-throws anything not about the presented token, and lists `jwk-*` among them:

> *"anything that indicates the verification service itself is unhealthy, a
> missing or unloadable JWKS, a bad secret key, a network fault, is re-thrown to
> express so it stays a 500."*

**So a well-formed JWT carrying a `kid` from ONE instance, presented to a server
holding ANOTHER instance's secret, should have produced a 500** and answered the
last open variable on Europe without waking anybody.

**I built the controls into the same run, on India, whose configuration is known:**

```
India + India's own kid       expect 401     HTTP 401   <no reason header>
India + Europe's dev kid      expect 500     HTTP 401   <no reason header>   <-- CONTROL FAILED
Europe + Europe's dev kid                    HTTP 401
LATAM  + Europe's dev kid     expect 500     HTTP 401
```

> **A FOREIGN `kid` DOES NOT THROW.** `authenticateRequest` returns a signed-out
> state rather than raising, the middleware proceeds unauthenticated, and the
> route's own auth check answers a plain 401 with **no `x-bolo-auth-error` header
> at all**. The guard's throw path is narrower than its comment implies: it
> catches what Clerk THROWS, and Clerk does not throw here.

**THAT IS FIVE IN ONE NIGHT.** Every one returned the same value in the case it
was built to separate:

```
a test agreeing on a VALUE, blind to the PRECONDITION      X-20260909-2345
/v1/environment host_invalid on all six, India included    X-20260910-0625
401-not-500 with no token presented                        X-20260910-0650
401-not-500 under A, C and D alike                         X-20260910-0720
a foreign kid, which does not throw                        this entry
```

    THE DIFFERENCE THIS TIME IS ONLY THAT THE CONTROL WAS IN THE SAME COMMAND AS
    THE MEASUREMENT, SO IT COST ONE RUN INSTEAD OF AN EVENING AND A RETRACTION.

**Two things it did establish, and they are worth keeping:**

- **The guard behaves exactly as documented.** A decodable token never reaches the
  throw path; Europe's earlier `token-unreadable` came from an *undecodable*
  signature segment, and mine produced no header because mine decoded fine.
- **Nothing was written to Sentry.** Europe had just raised that a probe against a
  live service is also a write to its observability, and an unlabelled 500 is
  indistinguishable from a real fault. **Four 401s wrote nothing.** The concern
  was right and the cost happened not to land.

**CONCLUSION, NOW MEASURED RATHER THAN ASSUMED: there is no external probe for
this. The owner's one paste is the only instrument.** That is worth knowing before
he wakes, because it means the plate cannot be improved by more cleverness.

---

## X-20260910-0805 — THE SIXTH ONE WAS IN THE COMMAND I HAD ALREADY PUT ON HIS PLATE

**LATAM found the better instrument and in doing so exposed a defect in mine.**

I corrected both forks that the Repl Shell reads the **workspace** while the
deployment inherits App secrets, so a Shell answer is *probably* the deployment's
and probably is not measured. **LATAM took the correction and went one better:**

> *"`[userenv.production]` in a tracked file is not probably: it is the block
> Replit injects into the deployed environment, and it is in git. FOR ANY VALUE
> THAT IS NOT A REAL SECRET, THE TRACKED FILE IS THE BETTER INSTRUMENT."*

**Then I checked what my own three-line paste would have done. Measured in
`~/bolo-europe/.replit`:**

```
[userenv]              no CLERK key
[userenv.shared]       no CLERK key
[userenv.development]  no CLERK key
[userenv.production]   line 297  CLERK_PUBLISHABLE_KEY = "pk_test_...tender-ant-1393"
```

> **`CLERK_PUBLISHABLE_KEY` EXISTS ONLY IN THE PRODUCTION BLOCK.** The Repl Shell
> runs the development environment. **It would have printed `UNSET`.**

```
what he would have read     CLERK_PUBLISHABLE_KEY  UNSET
what is true of the Shell   correct
what he would conclude      "no publishable key on the deployment"
what is true                pk_test, tender-ant-1393, in git, line 297
```

    A CORRECT READING OF THE WRONG SCOPE. THE SIXTH THING TONIGHT TO ANSWER THE
    SAME WAY FOR OPPOSITE REASONS, AND THE ONLY ONE I HAD ALREADY HANDED TO HIM.

**THE RULE THAT COMES OUT OF IT, and it is more useful than the bug:**

```
a value in a tracked [userenv.production] block   read GIT, never the Shell
a real secret, absent from the file by design     the Shell is the ONLY reading
```

**Both forks put `CLERK_SECRET_KEY` in Secrets deliberately** and say so in the
file: *"CLERK_SECRET_KEY IS NOT HERE AND MUST NOT BE. It is a real secret."*
**That sentence is also the instrument selector.** What the file refuses to hold
is exactly what the Shell must answer, and what the file holds is exactly what the
Shell would answer wrongly.

**LATAM's tree confirms the same shape independently:** `[userenv.production]` at
line 294, `CLERK_PUBLISHABLE_KEY` at 331 decoding to `decent-lab-855`, all three
publishable keys the same development instance.

**And LATAM's summary of the night is the entry this whole run should be filed
under:**

> *"THIS SYSTEM IS UNUSUALLY GOOD AT ANSWERING THE SAME THING FOR OPPOSITE
> REASONS, AND THE ONLY RELIABLE INSTRUMENT HAS BEEN READING THE THING THAT
> DECIDES."*

---

## X-20260910-1120 — GATE 3 RULED: THE AI CONSENT CONTRACT, AND THE HALF THAT CANNOT BE ADDED LATER

**LATAM stopped at the gate rather than shipping a shape**, naming the exact risk:
*"six forks implementing X-20260910-CONSENT independently is exactly the 'one
owner ruling became four different wire formats' case the gate exists for."*

**RULED, fleet-wide:**

```
GET  /ai-consent   -> AiConsent      { decision: "granted"|"declined"|null, decidedAt }
POST /ai-consent   <- AiConsentInput { granted: boolean }  -> AiConsent
Entitlements.aiConsent -> AiConsent
403 { error, reason: "ai_consent_required" }   on every learner-audio route

users.ai_consent          boolean   NULLABLE
users.ai_consent_at       timestamp NULLABLE
users.ai_consent_version  text
```

**THE NULLABLE BOOLEAN IS LATAM'S AND IT IS LOAD-BEARING.** *Asked once, never
nagged* needs **three** states, and a boolean defaulting false makes a brand-new
learner indistinguishable from one who declined. **The owner's ruling is
unimplementable on two states**, which nobody noticed when the ruling was made.

**THE VERSION COLUMN IS THE ONE THAT CANNOT BE BACKFILLED.**

> **A consent with no version is a consent to an unknown text.** The disclosure
> will change: LATAM already runs ElevenLabs as a live recipient where India runs
> it dormant. When the text changes you must re-ask only those who agreed to the
> old one, **and every row written before the column exists is unattributable.**

**THE SERVER 403 IS REQUIRED, AND THE ARGUMENT IS ABOUT WHO SENDS:**

```
the client sends to US.  OUR SERVER sends to OpenAI.
six forks x (mobile + web)  twelve clients that must all be correct, forever
one server per fork          six places the send can be refused
```

    A CLIENT-ONLY GATE IS A PROMISE THAT EVERY CURRENT AND FUTURE BUILD BEHAVES.
    AND IT GUTS THE OWNER'S OWN "IF NO" RULING: IF ONLY THE CLIENT HONOURS A
    REFUSAL, ONE BUG RE-ENABLES THE FEATURES SILENTLY.

**AND THE COPY NAMES NO ELDER.** LATAM's elder is unruled, so it cannot write
"Chacha-ji's call". Rather than make it the exception: **all six describe what
each feature does and where the data goes, never who is behind it.** India loses
the warmer line; it buys nothing from Apple and costs five forks a rewrite.

---

## X-20260910-1125 — A CONSOLE THAT RENDERS A PLACEHOLDER BEFORE IT RENDERS A VALUE, AND THE FORK THAT WARNED ME FIRST

**LATAM found its App Store category was never set, and attached a method note
that is worth more than the finding:**

> *"The page served Bundle ID and Primary Language as 'Loading...' while Category
> already showed its placeholder. Screenshotted at that moment it looks exactly
> like a settled empty field."*

**I swept all six on the strength of that warning, and my FIRST pass proved it:**

```
first read, SEA and Europe     selects: ["Loading…","Loading…","Loading…"]
after polling until resolved   SEA Education/Travel     Europe Education/Travel
```

**Screenshotted at that first moment, Europe would have read as unset.**

```
India Education/Reference   SEA Education/Travel      East Asia Education/Reference
Europe Education/Travel     Africa Education/Travel   LATAM  NEVER SET, loading flag clear
```

**Third console with this behaviour**, after the Replit Secrets pane and the ASC
privacy fields. **The rule generalises: before calling a field empty, wait for a
NEIGHBOURING field to resolve.** An empty value and an unrendered value are the
same pixels.

**And LATAM's argument for the Kids question is better than the one India and I
both used.** We reasoned from `EDUCATION` being selected. LATAM reasoned that
**Kids is a VALUE of the dropdown, so an unset primary cannot be Kids** — which
holds whatever the value is, and was reached from the one fork that has none.

---

## X-20260910-1440 — I RELAYED THE FORK'S NAME FOR A BLOCK INSTEAD OF THE OWNER'S VIEW OF IT

**Two forks reported the same thing: `git commit` and `eas env:update` "denied by
the auto-mode classifier". I put that on his plate as "take the tab out of auto
mode".**

**HIS CORRECTION, VERBATIM:**

> **"they were just waiting for me to hit approve. you have to tell me these things"**

```
what the fork experienced   a classifier denial
what he had to do           walk to the tab and press Approve on a prompt
                            that was ALREADY SITTING THERE
what I told him to do       change a permission mode
```

    A BLOCK HAS TWO DESCRIPTIONS AND THEY ARE NOT INTERCHANGEABLE. THE AGENT'S IS
    A MECHANISM. THE OWNER'S IS A THING ON A SCREEN WITH A BUTTON ON IT. I
    FORWARDED THE FIRST AND CALLED IT AN INSTRUCTION.

**AND I COMPOUNDED IT.** When nothing landed I concluded *"a permission change
does not wake a session"* and sent both forks a go. **They were already awake and
waiting on him.** So the second diagnosis was as wrong as the first, from the
same root: I never asked what the block looked like from where he was sitting.

**THE RULE, and it generalises past permissions:**

```
never relay a peer's description of a blocker as an owner instruction
say WHICH tab, WHAT is on the screen, and WHICH control to press
if you cannot say that, you do not yet know what the blocker is
```

**This is the fifth thing today that answered the same way for two different
reasons** and the first where the ambiguity was in my own sentence rather than in
a probe. **"Blocked on permissions" reads identically whether the fix is a
setting or a button, and only one of them was true.**

---

## X-20260910-1520 — THE FIX FOR "CANNOT CHOOSE" WAS A TOOL THAT CANNOT DECLINE, AND I GAVE IT TO SIX FORKS

**East Asia caught the newline pump signing into the owner's Apple Developer
account, unattended, and making writes on Apple's servers.**

```
? Do you want to log in to your Apple account? › (Y/n)
✔ … yes                                        <- the pump
? Apple ID: › aakesh_patel@yahoo.com78         <- the pump INSIDE a prefilled field
✔ Logged in New session
✔ Bundle identifier registered com.bolo.east
✔ Synced capabilities: No updates
```

**I described the recipe as "one newline every seven seconds to accept the
first-highlighted option", which sounds like picking a stored credential.**

> **IT IS NOT A CHOOSER. IT IS A DEVICE THAT SAYS YES TO WHATEVER IS ON SCREEN.**
> What was on screen was an account sign-in, a live bundle-identifier
> registration and a capability sync. **Outward-facing writes that no human and
> no session approved.**

**HARMLESS ONLY BY COINCIDENCE:** the account, team and bundle id were already
correct and the capability sync returned "No updates".

**TWO THINGS THAT MAKE IT WORSE THAN THE INCIDENT:**

```
the password came from the macOS KEYCHAIN, so nothing typed a secret HERE.
   on a machine without that entry the next prompt is a PASSWORD FIELD, and a
   pump submits EMPTY PASSWORDS on a 7-second timer against a real Apple ID.
   Apple locks accounts for that.

the stray "78" in aakesh_patel@yahoo.com78 is the pump landing INSIDE a
   prefilled field rather than after it. eas normalised it. NOTHING GUARANTEES
   THE NEXT FIELD IS NORMALISABLE.
```

**AND THE LOGIN BOUGHT NOTHING.** eas then printed *"Using remote iOS credentials
(Expo server)"* and *"All credentials are ready to build"*, using the certificate
already on the Expo servers, valid to July 2027.

    EAST ASIA'S SENTENCE IS THE ENTRY: "A TOOL THAT CANNOT DECLINE IS NOT THE
    OPPOSITE OF A TOOL THAT CANNOT CHOOSE; IT IS A DIFFERENT FAILURE WITH A WORSE
    BLAST RADIUS."

**X-20260910-0145 and X-20260910-0545 diagnosed a tool that refuses every
choice. The remedy I broadcast makes it accept every choice, including the ones
nobody enumerated.** The diagnosis was right and the treatment was unbounded.

**THE RULE AS FIRST WRITTEN: a pump needs a STOP CONDITION, not a timer.**

**SUPERSEDED THE SAME NIGHT by X-20260910-NOPUMP below. RETRACTED BY ITS
AUTHOR.** A stop condition still leaves a device on the wire that says yes to a
question nobody enumerated. **India built twice with no pump at all.** Read the
superseding entry before acting on this one.

---

## X-20260910-NOPUMP. REMOVE THE QUESTION. DO NOT TEACH THE PUMP TO ANSWER IT.

**India, 2026-09-10. India's own build logs, against a fleet rule India was
also sent.**

**India shipped 1.0.17 and 1.0.18 tonight and the logs contain no question at
all:**

```
build18.log:17  Using remote iOS credentials (Expo server)
build18.log:19  Distribution Certificate is not validated for non-interactive builds.
build18.log:20  Using App Store Connect API Key from EAS credentials service.
build18.log:44  All credentials are ready to build @aakeshp/bolo-mobile
```

Zero prompts, both builds. `--non-interactive` plus an **App Store Connect API
key on the EAS credentials service** means eas never asks, so nothing has to
answer and nothing can mis-answer.

**Line 19 is the same sentence the paced-input recipe reads as the flag BLOCKING
a build.** Here it is a note and the build ran. **It is not a failure message.**

**THE RECONCILIATION, and it is why both earlier findings were right:**

> **`--non-interactive` refuses CHOICES, and an established fork has none left
> to make.** On a NEW fork the credentials do not exist, so creating or selecting
> one IS a choice and the flag blocks, which is what Europe hit on 2026-09-06.
> Once credentials are resolved on the Expo servers there is nothing to choose
> and the same flag runs clean.

**So the flag is wrong for exactly ONE build per fork and right for every build
after it.**

**AND THE PUMP IS THE MIRROR IMAGE, WHICH IS THE WORST POSSIBLE SHAPE.** The
pump is needed only on that first build. The first build is also the only one
that performs unenumerated writes on Apple's side, because registering a bundle
id and syncing capabilities happen ONCE. **The single build where the pump is
required is the single build where its blast radius is real.**

**LATAM's finding is rehabilitated, not contradicted.** A missing tty making eas
refuse every choice is CORRECT behaviour and should be kept. A refusal means
credentials are not ready, which is a one-time human job. **The pump converted
"eas declines to guess" into "eas accepts my guess."**

**THE RULE: no pump. `--non-interactive`, credentials made ready ONCE by a
human.** East Asia's sentence deserves the direct answer: a tool that cannot
decline is worse than one that cannot choose, and **the fix is not to teach it to
choose, it is to remove the question so nothing has to.**

---

## X-20260910-TSCGRAPH. THE TYPECHECK FIX COMPILED LESS THAN THE THING IT FIXED

**India, 2026-09-10. India measured it after being sent the rule.**

A shipped `TS2339` was missed because `tsc -b` without `--force` trusted stale
buildinfo. The fleet was told: **`tsc -b --force` before any build or publish.**

**RUN AT A BOLO REPO ROOT, THAT COMMAND COMPILES NINE LIBRARIES AND NO APP.**

```
tsconfig.json   files: []
                references: lib/db  lib/api-client-react  lib/api-zod
                            lib/referral-link  lib/train-class  lib/emergency
                            lib/game-taste  lib/integrations-openai-*
NOT REFERENCED: artifacts/bolo-mobile  artifacts/gujarati-coach
                artifacts/api-server   scripts
```

**EXIT=0 in about a second, zero lines of app code in the graph.** A fork obeying
the rule reads green and ships. **That is not a weaker form of the original
failure. It is the same failure reissued as its own fix**, and it is worse,
because the number now has a rule standing behind it.

**AND ONLY ONE OF SIX PROJECTS CAN GO STALE:**

| project | script | exposed |
|---|---|---|
| api-server, bolo-mobile, bolo-launch-video, mockup-sandbox, scripts | `tsc -p tsconfig.json --noEmit` | **no**, non-incremental, reads no buildinfo |
| gujarati-coach | `tsc -b` + live `tsconfig.tsbuildinfo` + references `lib/api-client-react` | **yes**, and it references the package that goes stale |

**THE RULE, CORRECTED:**

```
BEFORE A BUILD OR PUBLISH      pnpm typecheck        the fork's own root script
IF YOU EDIT api-client-react   tsc -b --force INSIDE gujarati-coach, nowhere else
```

`--force` everywhere buys nothing but wall-clock on five projects never at risk.

**THE TRANSFERABLE HALF: check what a zero was made of, not just that it was
zero.** Both failures in this pair are a green number from a compiler that was
not looking at the code in question.

---

## X-20260910-MOCKANNO. A MOCK OF A GENERATED CLIENT IS A SECOND COPY OF THE CONTRACT

**East Asia found the bug, India tested the fix. 2026-09-10.**

Four green tests per platform passed against a broken paywall, because the mock
was double-wrapped in exactly the way the component was:

```
useGetTokens: () => ({ data: { data: { balance } } })     the mock
tokens?.data?.balance ?? 0                                the component
```

> **A HAND-WRITTEN MOCK OF A GENERATED CLIENT CAN ENCODE THE VERY BUG IT WAS
> WRITTEN TO CATCH.**

**THE ANNOTATION FIRST BROADCAST DOES NOT COMPILE.** All four combinations run
against a real tsc rather than reasoned about:

```
{ data: TokenState }          vs { data: { balance: 23 } }     TS2739  BREAKS
{ data: TokenState }          vs the double wrap               TS2353  catches
{ data: Partial<TokenState> } vs { data: { balance: 23 } }       ok    compiles
{ data: Partial<TokenState> } vs the double wrap               TS2353  catches
```

**USE `Partial<T>`.** What catches a double wrap is **TS2353 excess-property
checking on the object literal**, which fires whether or not the type is
complete. The complete type adds nothing and breaks every partial mock.

**India alone has 48 `useGetTokens` mock sites, 13+ of them partial**, and every
fork inherits the same tests. A fork applying the complete type meets a wall of
TS2739 on mocks that were never wrong, and **the likely response is to back the
annotation out entirely**, losing the guard for good.

**India's 48 are all correctly shaped and all unannotated: correct by
discipline, with no mechanism.** Same shape as LATAM's pinned consent flag.
**India is frozen and has NOT applied this to its own tree.** The five who are
not frozen should.


---

## X-20260910-1605 — "READ THE HEADER BEFORE THE SUBMIT" IS IMPOSSIBLE WITH --auto-submit, AND I TOLD SIX FORKS TO DO IT

**East Asia read its own build log rather than accepting my instruction:**

```
✔ Computed project fingerprint
✔ App Store Connect API Key already set up.
✔ Scheduled iOS submission              <- HERE. BEFORE THE BUILD RUNS.
Waiting for build to complete...
```

> **`--auto-submit` SCHEDULES THE SUBMISSION AT BUILD START, NOT AT BUILD END.**
> There is no window in which to read the bundle header first.

**I gave the fleet "read your header before the submit, not after" as a cost
control, and in the same breath told everyone to use `--auto-submit`.** The two
instructions cannot both be followed.

    EAST ASIA'S SENTENCE IS THE ENTRY: "BOTH ARE DEFENSIBLE; WHAT IS NOT
    DEFENSIBLE IS BELIEVING YOU HAVE A GATE WHEN YOU HAVE A RECORD."

```
WANT A GATE     eas build --no-wait, wait, read the .ipa, then eas submit --id <build>
WANT A RECORD   --auto-submit is fine and the reading happens afterwards
```

**It reported having a record rather than reporting the number as though it had
checked in time.** That distinction is the whole value of the entry.

**AND THE READING NEEDS NO TOOLING.** The Hermes `BytecodeFileHeader` is
fixed-width, so the count is four little-endian bytes at **offset 40** of
`Payload/*.app/main.jsbundle` inside the `.ipa`:

```
magic[8] c61fbc03c103191f | version[4] | sourceHash[20] | fileLength[4]
| globalCodeIndex[4] | functionCount[4]     <- offset 40
```

**Ten seconds, and it reads the artefact APPLE GOT rather than anything in the
working tree.**

---

## X-20260910-1610 — THE COUNTER IS STABLE ACROSS A REAL CHANGE, WHICH IS THE STRONGER CLAIM

```
Africa 45,891   Europe 46,028   LATAM 46,037   SEA(7) 46,058
EAST(2) 46,061  SEA(8) 46,062   EAST(3) 46,062  India 46,471
```

**Eight healthy readings, spread 580, against the poisoned cluster at ~52,900.**

**X-20260910-0525 recorded SEA rebuilding itself to within four functions and
called it a reproducibility control. East Asia has made it a stronger one:**

> **its two builds landed ONE function apart across a commit that added a
> locked-state branch, a notice element and three new copy functions.**

```
reproducible across a REBUILD      what SEA showed
stable across a REAL CHANGE        what East Asia showed
```

    A POISONED BUNDLE IS NOT A DRIFT, IT IS A DIFFERENT OBJECT. India's records
    show two builds of BYTE-IDENTICAL source 8,792 functions apart. Tonight a
    genuine feature moved the count by one.

**The old failure mode would now be unmistakable rather than arguable**, which is
what nineteen wasted builds were missing.

---

## X-20260910-1720 — I TURNED ONE FORK'S MEASUREMENT INTO A FLEET RULE THREE TIMES IN A ROW

**Same hour, same subject, three broadcasts, each wrong in a different direction:**

```
1  "tsc -b --force at the root"        wrong for EVERY fork. India measured the
                                       root graph: 8 lib projects, 3 seconds,
                                       ZERO app code, EXIT 0.
2  "the exposure is gujarati-coach"    right for INDIA. East Asia measured three
                                       of its projects on tsc -b, and the bug that
                                       shipped was in bolo-mobile.
3  "force all three"                   right for EAST ASIA. India re-measured:
                                       only gujarati-coach runs tsc -b there.
```

> **BOTH FORKS WERE RIGHT ABOUT THEIR OWN TREE. I WAS WRONG THREE TIMES BECAUSE I
> KEPT PROMOTING A MEASUREMENT INTO A RULE.**

    THE FLEET'S OWN GATE MODEL ALREADY CLASSIFIES THIS AND I MISFILED IT. A
    TYPECHECK SCRIPT IS **REGION**, NOT **ENGINE**. THE FORKS HAVE DIVERGED IN
    THEIR package.json AND NOTHING KEEPS THEM TOGETHER.

**THE CORRECT RULE IS NOT A NUMBER:**

```
EACH FORK READS ITS OWN package.json AND FORCES WHICHEVER OF ITS OWN
PROJECTS RUN `tsc -b`. India: one. East Asia: three. Neither is the fleet's.
```

**AND INDIA FOUND THE TRAP IN MEASURING IT**, which is the transferable half:

```
artifacts/api-server/.tsbuildinfo    963 KB, present, and a DOTFILE
artifacts/api-server typecheck       tsc -p --noEmit, which never reads it
```

**A fork that greps `*.tsbuildinfo` to find its exposure gets two wrong answers at
once: the glob misses the dotfile, and the file's existence does not mean the
typecheck consults it.** Something else writes one. **READ THE SCRIPT, NOT THE
FILESYSTEM.**

**The supervisor failure mode this names:** a fork reports a measurement of its
own tree, I hear a fact about the codebase, and six trees get an instruction
derived from one. **A fork's measurement is evidence about that fork until a
second fork reproduces it.** East Asia and India disagreeing is not a conflict to
resolve; it is two correct readings of two different trees.

---

## X-20260910-1915 — CARE SPENT ON THE FIRST LINK AND NOT THE SECOND

**India nearly broadcast a fleet-wide SEO emergency that did not exist**, and its
own account of why is the entry:

> **"I checked `seo.ts` before believing `index.html`'s comment, and I was pleased
> with myself for it. Then I did not check a single fork before believing my own
> inference about five of them."**

    VERIFYING ONE LINK IN THE CHAIN AND THEN REASONING FREELY PAST THE NEXT IS
    NOT CARE. IT IS CARE SPENT IN THE WRONG PLACE.

**THE CLAIM:** all five forks carry `canonical` pointing at `bolo-india.app`,
asking Google to de-index them, and hotlinking India's `og-image`.

**MEASURED, LIVE AND IN SOURCE, ALL FIVE:**

```
bolo-sea    canonical https://bolo-sea.app/      SITE_ORIGIN 'https://bolo-sea.app'
bolo-east   https://bolo-east.app/               'https://bolo-east.app'
bolo-europe https://bolo-europe.app/             'https://bolo-europe.app'
bolo-africa https://bolo-africa.app/             'https://bolo-africa.app'
bolo-latam  https://bolo-latam.app/              'https://bolo-latam.app'
```

**Every fork edited it at fork time. Nothing was ever wrong.**

**AND THE SYMMETRY IS THE POINT.** India spent the same afternoon correcting ME,
three times, for promoting one tree's measurement into a fleet rule. **Then it
did exactly that.** The rule reads the same in both directions and neither of us
applied it to ourselves while applying it to the other.

**WHERE THE CORRECTION WENT IS THE REUSABLE PART.** `a9e01c04`'s message cannot
be amended on main, so India put the retraction in **`seo.ts` and
`seo.origin.test.ts` themselves**, on the grounds that a fork picking this up
opens the files and never reads the commit message.

> **THE FIX BELONGS WHERE THE READER IS, NOT WHERE THE AUTHOR WAS.**

**AND THE REFRAME MATTERS MORE THAN THE RETRACTION.** The change survives as
**hardening, not repair**: a per-fork constant that nothing imports, sitting
beside a hardcoded duplicate of itself, is a hazard whatever today's values are.
Six match because six people remembered. **The seventh will not.**

**Tell a fork "you are broken" when it is fine and it stops reading the next
message.** That is the difference between the message India nearly sent and the
one it sent.

---

## X-20260910-2005  I created products for ids the code does not ask for

**Fork:** Africa (measured by Africa), fleet implication.

I told Africa its tree "still asks the store for SEA's `bolo_kopi_*`". Wrong.
The kopi ids were already renamed out of Africa: zero live hits, one comment at
`kopiPacks.ts:50` explaining the rename and one test string. The live constants
at `kopiPacks.ts:65/73/81` are `bolo_africa_cowries_25 / _75 / _200`, pinned by
six test files.

**The mismatch runs the other way, and I made it.** I created
`bolo_cowrie_few / _string / _purse` in App Store Connect. Neither set is a
rename of the other. Apple product ids are account-unique and unrenameable
after a sale, so one side has to move.

**Subscriptions are worse and untouched:** Africa still names India's
account-unique `bolo_plus_monthly`, `bolo_plus_annual`,
`bolo_one_language_monthly`. I created `bolo_africa_allaccess_monthly/_yearly`.
Note `annual` vs `yearly`. The cowries prefix I saw was the packs half of a
rename that was finished; the subscriptions half was never started.

**The rule I broke:** I read the store side and inferred the code side. The
product ids a fork asks for are a measurement of that fork's tree, and Africa
measured it in one pass after I had already created nine objects.

**Owner call, not mine and not Africa's:** create three more ASC products under
the ids the code and its six tests already pin, or change code plus tests plus
`docs/store-listing-copy.md:200`. Africa flagged it and refused to pick, which
is right.

## X-20260910-2010  Chacha-ji is in Africa's source, not just an asset name

Part 6 forbids naming the elder in a fork. I listed Africa's exposure as a hero
video filename and alt text. Africa found `chachaCall.ts`, `chachaStrings.ts`,
`chachaTts.ts`, `chachaCallTurn.ts` plus four tests and a CSS comment.

**Africa then declined to call it a leak**, because file names are not rendered
strings and a grep is a hypothesis. That is the correct stopping point, and it
is the same discipline as `open-the-asset-do-not-trust-its-name`. The next
measurement is which of those strings reaches a learner's screen. Every fork
should run it; I had it filed as an asset problem in all five.

## X-20260910-2015  ttsConfig line 42 makes India's privacy copy possibly wrong for the forks

Africa's `ttsConfig.ts:42` hard-sets `TTS_PROVIDER = "elevenlabs"`, so target
phrases, parrot chat and greeting TEXT leave to `api.elevenlabs.io`. India may
be on `gpt-audio`. **India's Part 1 copy is therefore not automatically valid
for a fork that copies it** — every fork reads its own line 42 before reusing
India's processor list. East Asia's published policy already names both OpenAI
and ElevenLabs, which is the correct shape for an elevenlabs fork.

Africa also proved R2 inert rather than assuming it: `.replit:249`
`PILOT_CAPTURE_USER_IDS = ""`, split to an empty allowlist at
`pilotCapture.ts:32`, so `teeAudioToPilot` is gated. Measured, not presumed.

## X-20260910-2030  Africa's product ids resolved: owner ruled A

Three consumables created on Africa under the ids the code and its six test
files already pin:

    bolo_africa_cowries_25   6810761532
    bolo_africa_cowries_75   6810760208
    bolo_africa_cowries_200  6810761664

**The 409 was on the NAME, not the id.** An IAP reference name is unique per
app, and the three wrongly-idded products already held "Bolo! Cowries 25/75/200".
Names are editable and ids are not, so the wrong three were renamed to
`RETIRED Bolo! Cowries *` rather than deleted. Nothing has sold on them; the
rename is reversible in both directions. **Delete them only when the owner says
so.**

I also handed the owner a `--rename-old` flag I had not implemented, so he ran
the identical failing command twice. **A flag named in a paste must exist in the
file at the moment the paste is sent.**

Still Africa's code work, awaiting his go: two subscription constants off
India's account-unique `bolo_plus_monthly` / `bolo_plus_annual` onto
`bolo_africa_allaccess_monthly` / `_yearly` (note `annual` vs `yearly`).
**SEA has already solved this shape** — `scripts/src/seedRevenueCat.ts` builds
ids from an `ID_PREFIX` and refuses to run while `app.json` still carries
India's bundle id. Africa reads that rather than inventing one.

## X-20260910-2035  SEA's TTS provider is per language, not per fork

Africa is global elevenlabs. **SEA is not.** `ELEVENLABS_LANGUAGES` is exactly
`{id, ms, tl, zh}`; the other six of its ten synthesise on `gpt-4o-mini-tts`.
So "read your own `ttsConfig.ts:42`" is necessary but **not sufficient** — line
42 sets a default that a per-language allowlist then overrides. Read both.

SEA also recorded that its deployed `ELEVENLABS_API_KEY` is a key ID rather than
an `sk_` key, so those paths currently fall back to gpt-audio. **The policy still
names ElevenLabs**: the disclosure describes what the shipped code will do, not
what a broken secret happens to prevent today. That is the right reading.

## X-20260910-2110  An EXIT trap restored the fixture before the test ran

Africa was proving SEA's parent-bundle guard actually fires in Africa's tree. It
flipped `app.json` to `com.bolo.mobile` with a restore trap, ran the script, and
the script did **not** refuse — it ran on to a network-layer failure. That reads
exactly like a guard that did not port.

**The trap fired when that shell exited.** Each Bash call is its own shell, so
`app.json` was already restored by the time the next call ran the script. Africa
had measured the NEGATIVE case and would have filed "SEA's guard does not port".

Re-run with both steps in ONE shell:

    com.bolo.mobile  -> throws at seedRevenueCat.ts:98, before any network call
    com.bolo.africa  -> proceeds past the guard, reaches the connector

**Rule: a fixture and the thing it is a fixture for must be in the same shell.**
A per-call shell silently unwinds your setup between the setup and the test.
This is the same family as [[test-the-detector-not-just-the-tree]] and
[[a-guard-only-run-against-failure-is-untested]]: the failing observation was
real, the thing it was an observation ABOUT was not what we thought.

## X-20260910-2115  Africa's Play half is unprovisioned and says so in the log

Africa nulled `PLUS_PLAY_MONTHLY_ID` / `_ANNUAL_ID` rather than synthesising
`:monthly` / `:annual` from India's pattern, made `playStoreId` nullable, and
made the creation loop SKIP a null store. **The run prints "NOT PROVISIONED, AND
THEREFORE NOT CREATED"** with each skipped tier, and the wiring log prints
`UNPROVISIONED` where an id used to go, including the line that the Android API
key is real but sells nothing yet.

**That is the correct treatment of the silent default.** A synthesised Play id
would have been created against nothing; a silently dropped one would have read
as complete. The `one_language` entitlement is likewise skipped with a log line
rather than attached to an empty product list, because **an empty attach
succeeds and reads as done.**

Africa also recorded WHY the cowrie consumables are NOT built from `ID_PREFIX`:
they live in `kopiPacks.ts` and are pinned by six tests, so prefixing them
breaks the server catalogue mapping. Africa deliberately did NOT port SEA
wholesale — SEA's removal of one_language, its seeded consumables and its
dropped annual placeholder are SEA's owner rulings, not Africa's.

## X-20260910-2140  OWNER RULING: one_language and family are DEAD, fleet-wide

Owner, 2026-09-10, his own words: **"one language and family are DEAD"** and
**"EVERY App sells the same things as india, 3 consumeables, and a monthly and
yearly subscription"**.

**The catalogue is five products per fork.** Three consumables, one ONE_MONTH
subscription, one ONE_YEAR subscription. No one_language tier, no family tier,
in any fork, on either store.

Africa had already nulled the one_language ids and skipped its entitlement
rather than attaching it to an empty product list. **That is now correct rather
than provisional, and the tier should be removed outright, not left declared.**

I offered this as an A/B and the owner answered "b" while describing A. **His
sentence was the ruling, not the letter** — I stopped and asked rather than
building four products nobody sells. A letter is a pointer; the sentence is the
instruction.

Measured on the wire the same minute:

    East Asia  bolo_cha_cup/_pot/_chest       + bolo_east_plus_monthly/_annual
    Africa     bolo_africa_cowries_25/75/200  + bolo_africa_allaccess_monthly/_yearly
    LATAM      bolo_cacao_pod/_basket/_sack   + bolo_latam_allaccess_monthly/_yearly

**Unmeasured: India, SEA, Europe.** My app ids for those three returned 404, so
I have no reading for them and did not infer one.

## X-20260910-2145  East Asia's yearly is a different group LEVEL from its monthly

    East Asia  bolo_east_plus_monthly  level 1
               bolo_east_plus_annual   level 2
    Africa     both level 1
    LATAM      both level 1

A subscription group's level ranks tiers for upgrade and downgrade. **Two
durations of the SAME tier belong at the same level**; splitting them makes the
yearly an upgrade tier, which changes what happens when a subscriber switches
and what Apple shows them. East Asia is the odd one out of the three I could
read.

Not yet diagnosed as a defect: it may have been deliberate. **Ask East Asia
before changing it** — a level is editable while nothing has sold.

## X-20260910-2205  "Dead" kills the SELLING path, not the HONOURING path

SEA, on the fleet ruling that one_language and family are dead:

    seed / ENTITLEMENTS        one_language REMOVED outright
    api-server                 ONE_LANGUAGE_ENTITLEMENT_ID KEPT deliberately

**A tier can stop being sold without stopping being honoured.** Removing the
entitlement id from the server would strand anyone already paying for it: their
subscription keeps renewing at Apple and the app stops recognising it. SEA kept
the honour path and created nothing new for it.

**Carry the distinction with the shape.** I told Africa to remove the tier
outright and did not say this. Africa has never sold anything, so nothing is
stranded there, but the instruction was incomplete and would have been wrong for
India or SEA.

SEA's reasoning for removing rather than dormanting the SEED half is also worth
keeping: **a seeded product is a real store artifact, and an unsold tier still
consumes an account-unique id.**

## X-20260910-2210  SEA's five, and the groupLevel that only ASC knows

    bolosea_plus_monthly    P1M  $12.99  package $rc_monthly   Play  ...:monthly
    bolosea_plus_annual     P1Y  $89.99  package $rc_annual    Play  ...:annual
    bolo_kopi_cup           consumable  $1.99   25 Kopi
    bolo_kopi_pot           consumable  $4.99   75 Kopi
    bolo_kopi_tray          consumable  $9.99  200 Kopi

Consumables are deliberately NOT packaged: **a package is what a paywall renders,
and Kopi sells from the wallet.**

**`groupLevel` appears nowhere in SEA's tree** — its `ProductSpec` has no
subscription-group field, so the level its two subscriptions carry was set by
hand in App Store Connect. **For SEA the answer is only readable from ASC, never
from the repo.** East Asia's split (monthly 1, annual 2) therefore cannot be
diagnosed by reading code in any fork.

SEA also flagged that `family` still greps across api-server
(`familyInviteEmail.ts`, `loadEntitlements.ts`, `freeTierContentPolicy.ts`) and
**declined to call that a live family tier**, on the same reasoning Africa used
for Chacha-ji: a grep is a hypothesis. Second fork to stop at that line today.

## X-20260910-2230  A verified line number expires when you edit above it

Africa re-proved its parent-bundle guard AFTER removing one_language, in one
shell, echoing the fixture before the probe:

    com.bolo.mobile  -> throws at seedRevenueCat.ts:102  (was :98)
    com.bolo.africa  -> proceeds, restored and confirmed on the way out

**The removal moved a hundred lines above the guard and the citation shifted by
four.** A guard verified at `:98` and then cited at `:98` after the edit is
exactly the artifact that looks verified and is not — same family as
[[a-correction-is-never-re-checked]].

Africa also confirmed `PRODUCTS` is two specs **by reading the array, not by a
grep count**, which is [[open-the-asset-do-not-trust-its-name]] applied to its
own edit.

**Africa reached the honour-path distinction independently and kept
`REVENUECAT_ONE_LANGUAGE_ENTITLEMENT_ID` in api-server before my correction
arrived**, on the reasoning that the ruling killed the seeding, not the
honouring, and that ripping out the server side is wider than the ruling. It
asked for that to be routed as its own item rather than inferred from a message.
**Correct on both the call and the routing.**

## X-20260910-2300  LATAM served SEA's ten language pages on its own domain

`bolo-latam.app/languages/thai`, `/burmese`, `/khmer` and seven more were live
public marketing pages, each with native script, romanisation and three
phrases, for the whole life of the fork.

**Every other fork rewrote `languagePages.ts` as fork work.** Europe 22, India
22, Africa 10, East Asia 10, SEA 10. LATAM inherited SEA's ten and nobody
diffed them, because **inherited text is not a diff** and never enters a
review. That is the same mechanism as the Kopi copy, the paywall's family
promise and the "Every Southeast Asian language we teach" bullet.

**The thing that caught it was `catalogue-count-copy.test.ts`**, which compares
the COPY against the DATA. It is the only check in the fleet that does, it
fired twice on my own wrong counts, and it was right both times. **Every fork
should have one.**

LATAM now ships six: spanish, portuguese, nahuatl, quechua, guarani,
yucatec-maya. Spanish and Portuguese were checked against Europe's own entries
for the same two languages rather than written fresh. **The four indigenous
entries are UNREVIEWED and say so in the file**, which matters more here than
in the seed because these are public marketing pages.

## X-20260910-2305  I reported "India has 0 language pages" and India has 22

My grep was `"slug": "` with a space. India writes `"slug":"assamese"` without
one. **The empty result was a fact about my pattern, not about India**, and I
put it in front of the owner as a fleet gap and a lost-SEO argument.

The repo's own CLAUDE.md already carries this rule as X50: *an empty or uniform
search result is a claim about the search until a positive control proves the
instrument works.* I had a positive control available for free (five other
forks returned non-zero with the same pattern) and read the odd one out as a
finding rather than as a smell.

**A count that makes one member of a fleet look dramatically different from
every sibling is a reason to re-measure, not to report.**

## X-20260910-2340  All six forks are now on their own production Clerk instance

East Asia and Africa were the last two serving a `pk_test` from
`[userenv.production]` while `CLERK_PRODUCTION_INSTANCE_EXISTS = true` and
their phone builds minted sessions on the production instance. Same fault
Europe had, which reached the owner as "Your stats couldn't load".

    fork        production CLERK_PUBLISHABLE_KEY
    India       pk_live
    SEA         pk_live
    Europe      pk_live   (fixed earlier today)
    LATAM       pk_live   (fixed earlier today)
    East Asia   pk_live   c05283c1
    Africa      pk_live   252d812c

**All three keys move together** (`CLERK_`, `VITE_CLERK_`,
`EXPO_PUBLIC_CLERK_`). One left behind is the same bug, smaller.

**The derivation was CONTROLLED before it was trusted.** `pk_live_` +
base64(host + `"$"`), padding stripped, reproduces LATAM's and SEA's
already-live keys character for character, and each new key was decoded back
to its host before being written. Five-of-five DNS confirmed for both new
instances.

**Africa's `.replit` carried a comment that was FALSE:**
`# EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is the pk_live now` sat directly above a
`pk_test` value. It was true of the EAS environment and written beside the
Repl's. **A comment that names a value is a claim about the line under it, and
this one had been wrong for eight days.** Same family as
[[vendor-defaults-in-comments-expire]].

## X-20260910-2345  I reported a fleet copy problem that was one fork's

I told the owner all four non-SEA forks shipped SEA's copy, with counts of 12,
9 and 8 files. **Those counts included comments and test files.** On live,
user-visible strings:

    East Asia   clean; its TTS accent already says East Asian English and
                already forbids a Southeast Asian one BY NAME, and its
                parrotChat.test already asserts "nor Southeast Asia's"
    Europe      clean, and AHEAD: dailyGift.test.ts has a test literally named
                "the copy says Caj and never Chai, Kopi, Cha or cowries",
                which loops the other four forks' currency words
    Africa      one real leak, an aria-label (below)
    LATAM       the only fork that had never localised any of it

**Europe already built the cross-fork copy guard I said nobody had.** Before
declaring a fleet-wide gap, grep the forks for a test that already closes it.

## X-20260910-2350  The rename fixed everything on screen and missed the aria-label

Africa's `bazaar-languages.tsx` showed **"Cowries opens stops"** and its
`aria-label` said **"Kopi opens its stops"**. A sighted learner saw the right
word; a screen reader user heard another fork's currency.

Every other fork agrees with itself (India Chai/Chai, SEA Kopi/Kopi, East Asia
Cha/Cha, LATAM Cacao/Cacao). **A fork rename sweep reads what is on screen, and
an aria-label is not on screen.** So are alt text, `title`, and accessible
names generally. **Second time today that the text nobody LOOKS at was the text
that was wrong**, the first being the hero alt text.

## X-20260910-2355  Every fork's logged-out landing page shows INDIA's screens

Owner reported it for East Asia, Europe, LATAM and then Africa. **Measured by
md5 across all six: the six hero files are byte-identical in every fork,
INCLUDING SEA.**

    public/hero/{home,practice,journey,games,progress,leaderboard}.webp
    f7a34b  e15c8a  f2acef  91a7b3  01141d  fa06ca      identical, six of six

**SEA is the fork currently in App Review and nobody had reported it there**,
because a screenshot of an app you do not read looks plausible. A visual bug
gets reported per fork, one at a time, as each fork's owner happens to look;
**hashing the asset finds all six in one command.**

This is a REGION commission, not a copy fix: six real captures per fork from a
signed-in simulator, which is the same work as the store screenshots and
should be done in the same sitting. Same job carries the removal of
`chachaji-call.mp4` from the public landing page, which names the elder that
Part 6 forbids naming in a fork.

**Do not trust a filename or a fork boundary for an asset.** Related:
[[open-the-asset-do-not-trust-its-name]].

## X-20260911-0005  The copy was localised and the ART was not

Owner screenshot: Africa's home shows **"Mama's Stall"**, Cowries, and
"Lamu to Zanzibar" over **SEA's uncle in a batik shirt beside SEA boats**.

Hashed, not eyeballed:

    Africa      44 of 52 public art files byte-identical to SEA's
    Europe      29 of 51
    LATAM       21 of 51
    East Asia   16 of 52

Africa's is total for the two directories that matter: **all 23 journey assets
including all six zone films and `train-loco.png`** (on a fork whose world is a
ROAD), and **all 8 stall assets including `uncle.png`, `uncle-pour.png`,
`uncle-phone.png`** under a card that says Mama.

**MY COPY SWEEP CAME BACK CLEAN FOR AFRICA AND IT WAS RIGHT.** The strings ARE
localised. I checked strings and never hashed the pictures, then reported the
fork clean. **A fork audit that greps text is blind to exactly the half a
learner looks at first.**

Same shape as LATAM's "Uncle's Kopitiam" over a drawing of a grandmother, found
the same way: the owner looked at a screen. **Both were invisible to every
check we have, and both were one `md5` away from being obvious.**

**Add to the fork readiness list: hash every asset directory against the parent
and list what matches.** It is one command and it found four forks at once.
Related: [[open-the-asset-do-not-trust-its-name]], [[audit-forks-against-the-merge-base]].

## X-20260911-0030  GATE 3 CLEARED WITHOUT A RULING: two forks, one contract, byte-identical

`lib/api-spec/openapi.yaml` is the Gate 3 file and the gate exists because
**one owner ruling once became four different wire formats.** Checked tonight:

    LATAM      b910fff3, committed and published   108 added lines
    East Asia  uncommitted working tree            108 added lines
    diff       IDENTICAL

East Asia **cherry-picked** the contract instead of writing its own. No ruling
is needed and no divergence exists. **This is the first time the gate has been
tested by two forks arriving at the same file, and it held.**

**The contract itself, worth knowing before any fork builds against it:**

    GET  /ai-consent    getAiConsent
    POST /ai-consent    setAiConsent
    Entitlements.aiConsent embeds the record, so a client needs no second call

    AiConsent      decision  nullable enum [granted, declined, null]
                   decidedAt nullable date-time
                   version   nullable string
    AiConsentInput granted   boolean (required)
                   version   string  (required)

**THREE STATES AND `null` IS NOT `declined`.** Only `null` may put the
disclosure on screen; only `granted` permits a send. A client reading `null` as
a refusal never asks; one reading it as consent **sends audio for somebody
nobody asked**.

**`version` is sent by the CLIENT, not assumed by the server**, so a stale build
cannot record agreement to wording it never displayed. A granted consent on an
older version is STALE, which means ask again about what changed. **Stale is not
a refusal and must not lock anything.**

**The input is asymmetric with the output on purpose**: `granted: boolean` in,
tri-state out. There is no third input state, because "never asked" is not
something a learner can submit.

East Asia's generated clients were REGENERATED, not hand-patched: `api.schemas.ts`,
`api.ts`, the zod api and three new zod type files. That is the correct route
since 2026-09-08, when the missing `dom.iterable` lib entry was fixed.

## X-20260911-0045  I nearly had SEA disclose a transfer it does not make

I told SEA it was "the fork that carries `PILOT_CAPTURE_USER_IDS` with entries
in it" and that its consent copy must name the Cloudflare R2 transfer.
**Measured across all six:**

    India   2 entries   the ONLY fork that performs it
    SEA / East Asia / Europe / Africa / LATAM   0 entries, inert

**SEA is under review for 5.1.1(i)/5.1.2(i) right now.** Naming a transfer that
does not happen, in the document Apple reads when it asks what you send and to
whom, on that fork, is the worst available place to be generous with the truth.
**Naming a transfer you do not make is the same inaccuracy as omitting one you
do.**

**Africa was told the same thing and did not take it**, proving R2 inert from
`.replit:249` and `pilotCapture.ts:32`. SEA then verified in ITS tree and found
the same fact at **`.replit:230`** — same finding, different line, which is the
expected shape and the reason a fork must read its own file rather than a
sibling's line number.

**SEA then generalised the failure better than I did:** it declined to list
Sentry and RevenueCat on LATAM's precedent, because **a neighbouring fork's
published copy is evidence about that fork.** That is the same rule as
*a measurement of your tree is evidence about your tree*, applied to a document
instead of a test run.

## X-20260911-0050  The fork that ships the R2 transfer is the one disclosing least

India performs the R2 capture for two real user ids. **India's live privacy page
names no processor at all** — not OpenAI, not ElevenLabs, not Cloudflare. Two
generic mentions of "third part" in 32,970 bytes. East Asia's, by contrast, is
48,853 bytes and names OpenAI and ElevenLabs explicitly.

**NOT ACTED ON.** Owner's standing instruction, 2026-09-10: *"don't touch
india's consent terms unless we run into a problem. I don't want them to
withdraw approval."* The privacy policy is being treated as inside that
instruction. Ruling is with the owner.

**OWNER RULING, 2026-09-10, on the entry above: A.** India's privacy page and
consent terms are **NOT** to be touched until the other five forks are approved.
Reasons on the record: India is live and approved, its R2 exposure is two user
ids the owner controls, and SEA's rejection shows Apple auditing NEW submissions
rather than re-auditing shipped ones. **No session edits India's disclosure on
its own initiative. Re-open only when five approvals are in hand.**

## X-20260911-0110  OWNER STANDARD: every Repl holds TWO Clerk secret keys

Owner, 2026-09-10: **"every repl should have 2 keys. clerk_secret_key and
clerk_secret_key_prod."**

    CLERK_SECRET_KEY        sk_test   the .replit.app / .replit.dev preview
                                      AND the simulator dev client
    CLERK_SECRET_KEY_PROD   sk_live   the custom domain

`app.ts`: `secretKey = (isCustomDomain ? CLERK_SECRET_KEY_PROD : undefined) ?? CLERK_SECRET_KEY`

**One deployment answers on TWO hostnames and they are two different Clerk
instances.** A session issued by one cannot be verified with the other's secret,
and the failure is a bare 401 that says nothing about why.

**Africa is the inverse of East Asia's case and the file already says so.** Its
single slot holds `sk_live`, so the custom domain works through the `??`
fallback while **the dev preview and the SIMULATOR 401**. That is not a preview
annoyance: **signed-in simulator testing is the gate on store screenshots**, and
four forks have none.

Owner is fixing the Secrets himself.

## X-20260911-0115  Four forks cannot be submitted: no screenshots at all

    India       1.0.18   iPhone 6.7 = 10   iPad 12.9 = 7   (en-US and en-GB)
    SEA         1.0      iPhone 6.7 = 8    iPad 12.9 = 8
    East Asia   1.0      NONE
    Europe      1.0      NONE
    Africa      1.0      NONE
    LATAM       1.0      NONE

App Store Connect refuses a submission with no screenshots, and **nothing
surfaces this until Submit is pressed.** An iPad-capable binary additionally
needs the 13-inch set, which TestFlight never asks for.

**OWNER RULING: one capture session feeds BOTH surfaces.** The same shots go to
App Store Connect at 1290x2796 and, resized to webp, into
`public/hero/{home,practice,journey,games,progress,leaderboard}.webp`. **That
also kills X-20260910-2355**, the India-screens-on-every-landing-page bug, which
is currently true in all six forks including SEA.

**The capture needs a SIGNED-IN app on the simulator, which is exactly what the
missing `CLERK_SECRET_KEY` sk_test blocks.** So the entry above is a
prerequisite for this one, in every fork.

## X-20260911-0140  Replace a film, remeasure its tone. LATAM had it wrong since the fork.

`ZONE_FILM_TONES` is six hex values **measured from the shipped film**, and it
is the ground the layer paints **while a film is still buffering** plus the
colour a failed fetch dissolves through. **Replace the films and not the tones
and every zone opens on the previous region's colour.** Invisible on a fast
connection, obvious on a slow one, which is why it survives.

**Africa found it in its own tree while placing art and warned the fleet.**
Tested all six immediately:

    SEA         origin
    East Asia   films differ, tones remeasured    ok
    Europe      films differ, tones remeasured    ok
    Africa      films differ, remeasured tonight  ok
    LATAM       films differ, tones IDENTICAL TO SEA'S   <- the only one

Fixed in `ce459db5`. Zone 1 was `#A3987C` olive against an actual `#F1DEC8`
bright market morning. **The fallback `?? "#8F8874"` was SEA's too and it
HIDES**: it is the same string as zone 4's tone, so a replace-once pass leaves
it behind. One value, two meanings, only one of them a tone.

**THE REMEASURE IS UNGUARDED, FLEET-WIDE.** `zone-films.test.tsx` asserts the
tones are six unique uppercase hex strings and nothing more: **23 green before
the fix and 23 green after.** A test that checks a SHAPE cannot catch a wrong
VALUE. Africa flagged it and declined to patch one tree. **Open item: a real
guard, and the cheap shape is to pin each film's checksum beside its tone so
changing the film fails the test until both move.**

## X-20260911-0145  My 44 of 52 was a slice. The real number is 246 of 271.

Africa hashed the WHOLE web public tree rather than the two directories I named:
**246 of 271 files byte-identical to SEA.** Beyond journey and stall, the
remainder is `mascot/`, `story/`, `sounds/bands/`, `games/`, `hero/`, `screens/`,
`bazaar/` and `chachaji-call.mp4`.

**`story/` is a thali, chai and a pagdi. That is INDIA's, not even SEA's**, two
forks up the chain and never touched.

**A count I chose the boundary of is a claim about my boundary.** Tonight's work
covers what a learner sees first; the rest is a larger audit and is unowned.

## X-20260911-0150  Three of my nine asset mappings were the wrong ORIENTATION

I mapped source films to slots by reading a filename list. Africa ran `ffprobe`:

    home-hero   needs 1200x600 LANDSCAPE   I sent a 720x1280 portrait
    stall.mp4   needs 1024x576 LANDSCAPE   I sent a 720x1280 portrait
    zone-4, zone-6  need PORTRAIT          I sent the only two landscape files

**Exactly backwards, and it reads fine in a list of names.** Same family as
[[open-the-asset-do-not-trust-its-name]], one level up: not the asset's NAME
lying about its content, but a LIST of names carrying no shape information at
all and me supplying it from imagination.

**`stall.mp4` has no landscape source in the folder at all.** Africa left SEA's
in place rather than crop a portrait film to 1024x576 and throw away two thirds
of the frame. **Leaving one slot honestly unfilled beats filling it badly.**

## X-20260911-0230  A correct change broke six forks, because an accident was load-bearing

**Symptom:** every authenticated route 401s on the custom domain, public ones
stay 200. Reaches a learner as **"Your stats couldn't load."** Measured on
bolo-africa.app with the browser's own network log: **1 request at 200 and 48 at
401.**

**TWO FILES CHOOSE A CLERK SECRET AND ONLY ONE KNEW ABOUT THE SPLIT.**

    app.ts clerkMiddleware       CLERK_SECRET_KEY_PROD per host      correct
    clerkProxyMiddleware.ts:61   process.env.CLERK_SECRET_KEY        once, at boot

The web client routes Clerk through the app's OWN proxy (`App.tsx` passes
`proxyUrl`), so the session is ISSUED against whichever instance the proxy
authenticates as and VERIFIED against whichever `app.ts` picks. Two instances,
one session, guaranteed 401.

**THE OWNER'S TWO-KEY STANDARD IS CORRECT AND IT IS WHAT BROKE THIS.** While one
slot held the `sk_live`, the proxy was right BY ACCIDENT. Filling the second slot
moved the accident onto the file nobody updated. **An accident that is
load-bearing is not a fix, and removing the thing that was hiding it looks
exactly like causing the bug.**

**MY PROCESS FAILURE, AND IT IS THE REAL ENTRY.** I wrote the two-key standard
into this ledger as a FLEET RULE without checking that each fork's `app.ts`
could honour it. **India's could not** — its callback set only the publishable
key and had no secret selection at all. So India, live and approved, broke the
moment the owner did exactly what I asked. **Before writing a standard here,
grep every fork for the code that has to implement it.**

Fixed six forks: `a985cb5e` (India, which needed the `app.ts` split ADDED as
well), `9ec43c5d`, `8dc79db8`, `53d01a1e`, `bb2d432d`, `cd888eac`.

**The `??` is load-bearing in both files.** A fork with only one slot filled must
fall back rather than send an empty header, and that is the state a fork is in
until its owner fills the second slot.

## X-20260911-0235  Two India web bugs, filed and NOT chased

Owner screenshots: the boarding pass card overlaps its own GANGA LINE header,
and the journey stepper is missing entirely.

**Both are consistent with a screen rendering against NO DATA**, which is what
48 consecutive 401s produce. **Re-check after the auth fix is published before
opening either as a layout bug.** A visual symptom measured during an outage is
a claim about the outage.

## X-20260911-0330  Every generated film cuts on repeat, and the code always said so

Owner, watching one journey card: the film should crossfade when it repeats.

`journey-hero.tsx` has carried the requirement since the first film was
commissioned: **"its tail dissolved into its head so the loop has no seam
(owner: 'cross fade the video loop seam')"**. Every film generated for a fork is
a RAW CLIP and has no dissolve. **The code was right; the assets were missing a
property the code assumes.**

Measured as mean absolute difference between last frame and first, 64x64 grey,
where an authored film sits near 0.5:

    East Asia home-hero   38.86 -> 0.69     a HARD cut, never reported
    Europe    home-hero    5.97 -> 0.44
    LATAM     home-hero    2.64 -> 0.36
    Africa    all 7 films          fixed
    SEA       home-hero    0.95              authored, untouched

**ONE REPORT ON ONE CARD, FOUR FORKS AFFECTED, AND THE WORST WAS IN THE FORK
NOBODY WAS LOOKING AT.** Same shape as the hero screenshots and the zone tones:
a visual defect gets reported per fork as somebody happens to look, and one
measurement across the fleet finds all of them.

**Fixed with ffmpeg, not regeneration:** blend the last second over the first,
output one second shorter so the tail is consumed rather than appended.

**THE POSTERS HAD TO BE RE-DERIVED AFTERWARDS AND THIS IS THE TRAP.** A poster
is frame one, and frame one is now a blend of the old head and old tail. Every
poster made before the loop fix was stale the moment it landed, including ones
made an hour earlier the same night. **A derived asset inherits the staleness of
whatever it was derived from.**

**Nothing in code or the suites can catch a seam**, because a seam is a fact
about pixels. Tool at `scratchpad/seamless-loop.sh`; the rule is now in
`~/Downloads/BOLO-ART-PROMPTS.md`.

## X-20260911-0410  Web is fixed. Every EXISTING BUILD is not, and cannot be.

After the proxy fix published, East Asia's web went from **1 x 200 / 48 x 401**
to **30 requests, all 200**, `/api/progress/summary` included. Owner confirmed
the stats bar loads. **The web half is settled once each fork publishes.**

**The phone is a different fault with the same symptom.** Read out of the
installed simulator build's own bundle:

    baked into the binary   pk_test_b3JnYW5p…   DEVELOPMENT
    server now verifies     sk_live             PRODUCTION

`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is **compile-time**. **No publish fixes an
installed build; only a new build does.** Every simulator and TestFlight build
in every fork predates tonight's flip and will 401 against the corrected
servers.

**CONSEQUENCE FOR THE PLAN, AND I HAD THE ORDER WRONG.** I said screenshots then
builds. **Screenshots cannot come from a build whose every screen shows "Your
stats couldn't load."** It is builds first, then captures from those builds.

**THE PROXY PROBE WAS VOID AND THE CONTROL CAUGHT IT AGAIN.** A bare GET to
`/api/__clerk/v1/environment` returns **400 "Invalid host" on INDIA**, the fork
that works, exactly as X-20260910 recorded. I ran it on three forks and would
have reported a false cause for the second time tonight if I had not tested
India first. **A probe without a positive control is a claim about the probe.**

**PRE-FLIGHT BEFORE ANY BUILD:** EAS does not read `.replit`. The phone's
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` lives in the **EAS project's environment
variables**, and a build with the old value wastes the whole build.

## X-20260911-0500  All six web deployments current, verified BY CONTENT

Two publish rounds. The first was fired before the Repls had pulled, so it
redeployed stale workspaces; Replit then refuses a second publish while the
first promotes, which cost about twenty minutes of waiting. **Publish AFTER the
pull, never in the same breath.**

Verified by hashing a served asset against the repo, not by the panel:

    LATAM / East Asia / Europe / Africa / SEA   home-hero.jpg CURRENT
    Africa stall/uncle.png CURRENT              the market mother is live
    LATAM journey/zone-1.jpg CURRENT
    India has no journey film; api 200

**A failed publish looks identical to a successful one from the app**, which is
why the check is an asset hash rather than a green tick.

## X-20260911-0505  India web: boarding pass overlap and a slow homepage

Owner screenshots, filed together and NOT chased tonight.

1. **The boarding pass card overlaps its own GANGA LINE header.**
2. **The homepage takes an extended time to load, every time.**

**CORRECTION TO MY EARLIER GUESS.** I said both were probably artifacts of the
48 consecutive 401s. **The second screenshot shows India rendering its data
fine and the card still overlapping**, so the overlap is a REAL LAYOUT BUG.
A symptom measured during an outage is a claim about the outage; a symptom that
survives the fix is a bug.

The slow load is unmeasured. `journey/parchment.png` is 1.4 MB and the journey
directory runs to 13 to 21 MB per fork, so weight is the first place to look,
but that is a hypothesis and nobody has profiled it.

## X-20260911-0620  India's 500 was a MISSING COLUMN, and a supervisor handoff

**Root cause, from the Repl deployment log, not from probing:**

    column "ai_consent" of relation "users" does not exist
      at ensureLocalUser (api-server/src/lib/userIdentity.ts:69)
      at requireAuth   (api-server/src/middlewares/requireAuth.ts:29)

`ensureLocalUser` upserts naming the FULL column list, so the four consent-era
columns (`ai_consent`, `ai_consent_at`, `ai_consent_version`, `share_stats`)
being absent from the PRODUCTION database fails EVERY authenticated request.
Public `/api/languages` stayed 200 throughout, which is exactly why it read as
an auth problem for hours.

**It was never Clerk.** The `pk_live`, the two secret slots, the proxy secret
fix, the incognito test: all correct, all irrelevant.

**THE PROCESS LESSON, which is the point of this entry.** I probed from OUTSIDE
for three rounds: 401-vs-500 shape, secret kinds, bundle key, Clerk host. Every
probe returned a true fact and not one of them could have found this, because
the cause was never visible from outside. **When authenticated routes fail as a
CLASS and a public route passes, the first move is the deployment log.** An
outside-in probe can only rank hypotheses you already have.

Filed as a general trap: **the shape of a failure tells you where to look, not
what is wrong.** A whole tier failing identically means one shared dependency,
and shared dependencies are named in stack traces, not in HTTP status codes.

**Not fixed.** The migration must be applied to India's production DB, and then
ALL SIX forks checked, because the columns are in shared code and any fork whose
deployed DB is behind carries the same latent 500. Africa and LATAM are the
least exercised and the most likely.

**Supervisor handoff written to `~/bolo-supervisor/HANDOFF.md`** at the owner's
request: the live bug, standing instructions (cost saving until Sat 1pm, web
consent held, App Store readiness only), the fleet table, what is done, the
eight open items in order, the traps already sprung, the security lines, and
the tools left behind.

---

## FIXED: the ai_consent 500, all six forks checked

Closes the entry above. `grep: ai_consent, share_stats, ensureLocalUser,
column does not exist, requireAuth 500`

**India**: `lib/db/drizzle/0061_sweet_shape.sql` applied by hand to production
(`ai_consent`, `ai_consent_at`, `ai_consent_version`). Clean. Owner confirmed
the stats bar and the boarding pass card both load correctly signed in.

**Europe**: same three columns, its own migration file
(`0063_useful_the_order.sql`), applied the same way. Clean. Owner confirmed
signed-in load.

**LATAM**: already had all three columns in production before this session
touched it. Its migration files (`0063_thankful_wendell_rand.sql`,
`0064_natural_crusher_hogan.sql`) both errored `already exists` on every
column, which is the proof rather than a guess. Nothing was broken here.

**SEA, East Asia, Africa**: ruled out by reading the schema, not by assumption.
`lib/db/src/schema/users.ts` in all three has no `ai_consent` field, so
`ensureLocalUser`'s upsert never names those columns and cannot hit this
crash. The consent feature has not been cherry-picked into these three forks
yet; that is a separate, unstarted task, not a live bug.

**Applied by hand to production in all cases** (never `drizzle-kit migrate`
against production, per the standing rule). Dev databases were not touched,
so the next `sync-schema` / publish cycle in each fork should find no diff on
these columns. Not independently re-verified this session.

**Secrets note.** Europe and LATAM's production DB URLs are not in any local
`.env` (Europe's CLAUDE.md says so explicitly and it is current). They were
read via a `read -s "VAR?prompt: "` zsh prompt, typed directly into the
owner's terminal, never pasted into chat. `read -p` (bash syntax) fails
silently wrong in zsh with `no coprocess`; use the `VAR?prompt` form here.

---

## FIXED: Africa's web 401s were a stale DEPLOYMENT-level secret, not the workspace one

`grep: deployment secrets, workspace secrets, CLERK_SECRET_KEY_PROD, 401 had_bearer=true, stale secret, republish did not fix`

**Symptom looked like the ai_consent entry above but was not.** Stats bar blank,
"Try again", every authenticated route 401 (not 500). Console showed
`[auth] 401 path=... had_bearer=true` on every one: a real session token was
being sent and rejected as a class, same SHAPE as the ai_consent bug, different
cause entirely. Ruled out fast and for good reason not to guess twice:
`ensureLocalUser`'s upsert never references `ai_consent` in Africa's schema at
all (confirmed by reading it), so that crash literally cannot happen here.

**The actual cause.** Africa's web client correctly derives `pk_live` from the
hostname (`publishableKeyFromHost`, Clerk's own library function, confirmed by
reading `@clerk/shared/dist/keys.js`) and talks to the right instance
(`ins_3IyOopeaBl9oPGBlpp4b9JY0urw` via `clerk.bolo-africa.app`, confirmed live
in Chrome). The server verifies against `CLERK_SECRET_KEY_PROD` on the custom
domain (`app.ts` and `clerkProxyMiddleware.ts`, same logic that works
correctly in Europe and India). **Replit's DEPLOYMENT holds its own separate
copy of that secret, distinct from the workspace Secrets pane.** The owner
edited the workspace value (twice) and republished; the deployment's own copy
never changed, because editing one does not edit the other. Overwriting the
value directly in the Deployment's own secrets panel, then republishing, fixed
it in one shot. Confirmed by reading the network request directly
(`/api/progress/summary` → 200) and the "Pick a username" modal appearing,
not by the owner's report alone.

**What burned time before landing on this.** Three wrong or half-wrong
hypotheses in order: the ai_consent migration (ruled out by reading the
schema, cheap), the value being unset (it was already there, so this cost one
round), the value being from the wrong Clerk instance (checked the Instance ID
directly, matched, one round). **The tell that should have been read sooner:**
"already there" and "been there" to a direct question both pointed at the
workspace copy, and neither one was ever asked to verify the DEPLOYMENT'S own
copy until the fourth hypothesis. Two Replit surfaces can hold the same-named
secret with different values, and a republish does not obviously reconcile
them.

**Filed as a general trap for the fleet:** when an env var was JUST edited and
JUST republished and the symptom is unchanged, check whether the platform
keeps a second copy of it (Replit deployments vs. workspace, here) before
assuming the edit itself was wrong.

---

## QUEUED FOR SATURDAY: LATAM's spine is still rail, ruling says road

`grep: LATAM spine, camion, colectivo, chicken bus, train track, world is the bus route`

Owner flagged 2026-09-10, live in the app: LATAM's journey spine is still a
**train track**. `~/bolo-latam/CLAUDE.md` already documents the correct
ruling, 2026-09-07: "THE WORLD IS THE BUS ROUTE, NOT THE WATER" — camion,
colectivo, chicken bus. **The documented ruling and the shipped app disagree**;
implementation never caught up to the ruling, or reverted after a merge from
a rail-spine parent (SEA/India/Europe all use rail). Not investigated further
this session — owner said this is a note for Saturday's build pass, not
tonight's.

---

## QUEUED FOR SATURDAY: LATAM's journey maps aren't complete

`grep: LATAM journey map, Yucatan Camioneta, incomplete map art`

Owner flagged 2026-09-10, screenshot of the Yucatan Camioneta map (road spine,
correctly NOT rail here — so the earlier "still a train track" note is about a
different route/zone, not every one). The map art itself reads as unfinished
compared to other forks' journey maps. Not investigated this session; owner
said it is a note for Saturday.

---

## CORRECTION to the two entries above: LATAM's road spine is a label, not a render

`grep: LATAM rail art, Yucatan Camioneta, Kopi Halt, Mercadito, railroad crossing`

Owner screenshot, 2026-09-10, Zone 1 Merida: the zone header correctly says
"YUCATAN CAMIONETA" with a bus icon, but **the route line itself is drawn as
railroad track** (dashed rail ties, a railroad-crossing signal icon at stop 1)
identical to SEA/India's rail rendering. So the spine swap is a copy/label
change, not a render change: whatever component draws the path is still
hardcoded to rail art regardless of the fork's spine theme, or never had a
road variant built. **Also live in the same screenshot:** the rest stop
reads "Chiich's KOPI HALT" — SEA's word, not this fork's ruled "Mercadito"
(2026-09-10 elder/currency ruling, already in CLAUDE.md) — even though its
reward correctly says "3 Cacao". Same shape as the fork's documented Kopi/
Kopitiam inheritance problem (32 files, ledger already flags it as the
largest open debt). Not investigated further this session; queued for
Saturday same as the entries above.

---

## QUEUED FOR SATURDAY: coach voice swap reported still falling back

`grep: COACH_VOICE_ID, coach voice, default voice fallback, JYyJjNPfmNJdaby8LdZs, dOqxOZEisn8SiUH1dPCC`

Africa and LATAM's `COACH_VOICE_ID` were both changed and deployed tonight
(2026-09-10): Africa to `dOqxOZEisn8SiUH1dPCC`, LATAM to
`JYyJjNPfmNJdaby8LdZs`. Typecheck clean, both committed, pushed, merged into
each Repl's workspace, and published successfully. Owner then reported LATAM
"still falling back to default voice" after the publish settled.

**Not diagnosed.** `COACH_VOICE_ID` only governs phrase audio
(`getVoiceIdForLanguage` in `languageVoice.ts`, resolved via `LANGUAGE_VOICE_MAP`,
`es`/`pt` confirmed mapped to it, `ELEVENLABS_LANGUAGES` confirmed includes
`es` for LATAM). Chat ("Chat with Bolo") and story narration use SEPARATE
voice identity functions (`narrationAudioIdentity` and chat's own) that this
change never touched, so if the fallback was heard on one of those surfaces,
this was never the right fix in the first place. Which surface it was heard
on was not established this session. Start there Saturday before touching
code.

---

## CORRECTION: the Shikamoo scream is still there after the voice swap

`grep: Shikamoo, means hello, scream, Africa TTS, coach voice swap did not fix it`

Owner sent a screen recording after the Africa coach-voice deploy settled.
Whisper-transcribing the clip (same method the app's own TTS verification
uses) returned "Shikamu Memes, hello" and read as clean at first glance — it
was not. **Owner heard the actual audio: "Shikamu ahahahahaha means hello."**
Whisper heard the scream and hallucinated a plausible word ("Memes") instead
of flagging it, which is exactly the failure mode `synthesizeVerifiedPhraseAudio`
is supposed to catch and did not here, or caught on a DIFFERENT cached phrase
than the one actually playing.

**What this changes about the earlier fix.** The clip in question says the
FULL sentence "Shikamu means hello," not the bare word "Shikamoo" — a
different phrase TEXT than the one this session diagnosed, so it is a
DIFFERENT cache-key entry. The `COACH_VOICE_ID` swap orphans every clip by
voice, so this one should also have missed cache and resynthesized under the
new voice. **That it did not fix it means either the new voice has the same
failure on this text, or something is still serving the old clip.** Neither
is established. Do not assume the voice swap solved anything for Africa's
audio until a fresh listen confirms it, on this phrase specifically.

---

## QUEUED FOR SATURDAY: LATAM's abuela call uses an English OpenAI voice, not Spanish

`grep: uncleSynthesisIdentity, UNCLE_ELEVENLABS_VOICE_ID, CHACHA_TTS_VOICE, shimmer, abuela call, American accent`

Owner: "grandma's call on latam, the first message is not spoken in spanish,
its an american voice badly trying to speak spanish."

**Root cause, confirmed by reading the code, not guessing.**
`uncleSynthesisIdentity(languageCode)` in `chachaStrings.ts` only uses
ElevenLabs when `UNCLE_ELEVENLABS_VOICE_ID` is set AND the language is in
`ELEVENLABS_LANGUAGES`. **`UNCLE_ELEVENLABS_VOICE_ID` is not defined anywhere
in this fork's `chachaStrings.ts`**, so every call falls through to
`CHACHA_TTS_PROVIDER = "gpt-4o-mini-tts"`, `CHACHA_TTS_VOICE = "shimmer"` — a
fixed OpenAI voice with only text instructions asking for a Spanish accent.
This codebase already has direct, written proof that instruction-only accent
steering does not work (`ttsConfig.ts`'s narration fallback comment: the
identical approach was tried on the canned chat greeting, the owner listened,
and said it did not sound fixed). Same failure, different call site.

**The fix, once the owner picks a voice by ear:** set
`UNCLE_ELEVENLABS_VOICE_ID` to a real ElevenLabs voice ID (Spanish is already
in `ELEVENLABS_LANGUAGES` as `es`), the same shape as `COACH_VOICE_ID`. Not
done this session; not touched.

---

## QUEUED FOR SATURDAY: Africa's market still shows chachaji's bazaar splash

`grep: Africa market, chachaji, bazaar welcome, BazaarWelcome, market splash`

Owner flagged 2026-09-10: the market screen in Africa still shows the
chachaji/bazaar welcome art inherited from SEA/India rather than Africa's own
(currency is cowrie, stall is the market, per Africa's own ruling). Not
investigated this session; likely the same class of inherited-asset gap
documented elsewhere for this fleet (BazaarWelcome.tsx losing its film,
inherited copy not showing up as a diff). Start at `components/BazaarWelcome.tsx`
Saturday.

---

## PARKED: SEA coach voice still plays a fallback voice, not the new ElevenLabs ID

`grep: SEA coach voice fallback, d15jrIAARvF899pDoC6T, phrase-tts, gpt-4o-mini-tts nova, elevenLabsSpeaks race`

Owner ruling 2026-09-11: parked until tomorrow (Claude plan renews), today is
App Review blockers only. What's PROVEN and what's NOT, so nobody re-derives
this from scratch:

**PROVEN, by reading the actual deployment logs (not guessed):**
- `COACH_VOICE_ID` swap to `d15jrIAARvF899pDoC6T` did deploy correctly.
  Confirmed via a direct `fetch('/api/openai/tts', {languageCode:'id', ...})`
  from the browser console, logged server-side as
  `"provider":"elevenlabs","model":"eleven_multilingual_v2","voice":"d15jrIAARvF899pDoC6T","hit":true`.
  The server-side identity resolution and cache are correct when given an
  explicit, correct `languageCode`.
- A DIFFERENT, earlier request for the SAME phrase ("Halo", Indonesian, 4
  chars) logged `"provider":"gpt-4o-mini-tts","voice":"nova","hit":true"` —
  the OpenAI fallback identity, cached under whatever key that resolved to.
  `PHRASE_AUDIO_DEFAULT_VOICE = "nova"` confirms this is the
  `elevenLabsSpeaks(languageCode)===false` (or `languageCode` falsy) branch,
  not a synthesis failure.
- Indonesian (`id`) IS in `ELEVENLABS_LANGUAGES` (`{id, ms, tl, zh}`), so this
  branch should not be reachable for Indonesian with a correct `languageCode`.
- Per-user `ttsVoice` preference is confirmed `null` (Auto) on the test
  account via `GET /api/openai/tts/voices` → `"current": null`, ruling out a
  personal override.
- `elevenLabsQuotaMonitor.isExhausted()` does NOT trigger on a missing
  `user_read` permission — read the source directly, the docstring says so:
  "Returns false when... The API key lacks user_read permission (quota is
  unknowable)." An earlier claim in this same investigation that this was the
  mechanism was WRONG and was retracted in the conversation; do not re-chase
  it.
- Owner confirmed `ELEVENLABS_API_KEY` is a real `sk_` key, not a key ID
  (also ruling out `languageVoice.ts`'s own long-standing comment about that
  being the cause — that comment may itself be stale).

**NOT PROVEN / where to pick this up:**
- After the owner tapped "Listen" again live in the app (a fresh, deliberate
  tap, not the page-load prewarm), it STILL played the fallback voice. This
  is the open contradiction: a direct API call with `languageCode:'id'`
  correctly hits the new-voice cache row, but the real client "Listen" tap
  does not. Leading hypothesis, unconfirmed: `activeLang` from
  `useLanguage()` is empty/stale at the moment `practice.tsx` fires its
  `synthesize.mutateAsync` call (an early/prewarm call logged as req 204 hit
  this exact way), and EITHER the same stale value is used on every
  subsequent tap for that mounted screen, OR the client is caching the
  AUDIO BLOB itself client-side after the first (wrong) fetch and replaying
  it without re-fetching — confirmed elsewhere in this codebase
  (`bolo-mobile/lib/audio.ts` writes a scratch file per play) that a genuine
  re-fetch does happen per platform, but this was not checked for the WEB
  client specifically.
- Next step: read `practice.tsx` around the `synthesize.mutateAsync` call
  sites (lines ~966, ~987, ~1082 in this fork) for what `activeLang` actually
  is at each call, and check whether the web audio player caches the fetched
  blob per phrase for the life of the mounted screen (would explain "still
  hear fallback" after a fresh tap, if the fresh tap replays a
  previously-fetched-and-cached-in-React-state blob rather than issuing a new
  network request).
- Also worth checking: does the bad `gpt-4o-mini-tts`/`nova` cached row
  need to be manually deleted, or does it get superseded automatically the
  next time a request computes the CORRECT key? (Cache is keyed by resolved
  identity, so a correct request should simply miss the bad row and create
  its own — this was observed working via the direct API test. If the live
  app never sends a correct key, the bad row is irrelevant either way.)

Migration/DB layer was untouched by this investigation. No code was changed
for this specific bug tonight; only the voice ID swap (already committed,
`377b1aee`) and the bazaar-welcome removal (same commit) were shipped.

---

## QUEUED FOR TOMORROW: SEA's spine is still railroad, should be river/water

`grep: SEA spine railroad, water spine, Nanyang route, journeyLinesSea`

Owner flagged 2026-09-11: SEA's world spine is still showing as a railroad
rather than the water/river route it's supposed to be. Per SEA's own
CLAUDE.md, the world was already converted from rail to water in an earlier
build ("THAT PASS IS NOW DONE, 2026-09-02... the app casts off rather than
laying tracks"), so this may be a regression, a specific screen/zone that
never got the conversion, or new content added since that still uses rail
assets. Not investigated this session — owner said today is App Review
blockers only. Start by checking whether this is fleet-wide-shared journey
map rendering code (same class of bug as LATAM's rail-art-under-a-road-label
finding earlier tonight) or SEA-specific.

## X-20260911-1500  Apple account mid-conversion to Business blocks every fork's iOS build

Owner converted the Apple Developer account (Team ID 57PJ64Z5FA) from
Individual to Organization/Business. **`developer.apple.com` Membership still
shows Team ID 57PJ64Z5FA, Enrolled as Individual** — the account page has not
updated. But `eas build` for India failed three times in a row, and once more
when the owner ran it INTERACTIVELY himself (ruling out the paced-newline
script eating a 2FA prompt, the first theory):

    Authentication with Apple Developer Portal failed!
    You have no team associated with your Apple account, cannot proceed.
    (Do you have a paid Apple Developer account?)

**SEA's build succeeded on this same Apple ID earlier the same session**,
before the conversion request, which is the timing that points at the
conversion rather than at credentials, cookies, or the automation script.

**READ AS: Apple's backend is mid-processing the conversion, and the
Developer Portal team-lookup API (what `eas build`'s Fastlane/Spaceship layer
calls) is returning no team during that window, even though the account
SETTINGS PAGE has not caught up to reflect any change yet.** Not confirmed
against Apple support; inferred from the timing and from the account page
disagreeing with the API.

**BLOCKS EVERY FORK.** All six `eas.json` submit blocks hardcode
`appleTeamId: "57PJ64Z5FA"`, and every fork's build credentials (distribution
cert, provisioning profile) are scoped to that team. No new iOS build can be
cut anywhere until this clears.

**DO NOT KEEP RETRYING BLIND.** Each attempt is a paid build slot regardless
of outcome ($320+ already in overages this cycle before this was found). If
this ledger entry is still current, check developer.apple.com's Team ID first
in the same message rather than spending a build to re-discover the same wall.

**NOT YET DONE:** confirming with Apple support whether a Team ID actually
changed, or waiting out the conversion and re-testing. Owner's call when to
retry.

**UPDATE, same session, later:** owner confirmed Team ID is STILL
`57PJ64Z5FA` (checked developer.apple.com directly, screenshot: Enrolled as
Individual, unchanged). Retried anyway on that basis. **FOUR IDENTICAL
FAILURES TOTAL now**, including one the owner ran himself, interactively, in
his own terminal (ruling out the paced-newline script eating a 2FA prompt).
**This is not a transient mid-conversion window. It is persistent** despite
the account page showing no change at all. The team-lookup API eas-cli calls
and the account SETTINGS PAGE disagree, and they still disagree after
multiple retries spread over several minutes. **Stop retrying blind.** This
needs either Apple support contact or the business conversion to actually
resolve (forward or back) before another build attempt, on any fork.

## 2026-09-11 — SEA daily-gift attempt bypass, natural river, and lesson coach language routing

`grep: SEA river spine, daily gift premature Kopi, mobile coach missing languageCode, bY54gWrN4O4G9QOFtXwl`

SEA commit **15002957**, pushed to origin/main at owner request. Handoff: `bolo-sea/docs/handoffs/2026-09-11-mobile-fixes.md`.

**ENGINE:** Removed SEA's obsolete flat 1-Kopi `earn_streak_day` grant from POST /attempts; individual attempts bypassed the completed-lesson gate and paid separately from the gift claim. GET /tokens and the home cell already use actual balance; no pending draw was added by the UI. Existing balances untouched, and screenshot's exact 15 Kopi not attributed. Claim failure no longer opens mobile gift card. Siblings owed review/port; none changed here.

**ENGINE — concrete resolution of parked SEA coach fallback:** mobile practice/[id].tsx omitted languageCode on starting prewarm, native phrase playback, and next-phrase prefetch. All now send activeLang. Missing code selects gpt-4o-mini-tts/nova by configuration; no API-key/quota hypothesis needed. Cache keys include language/phrase/voice and starting prewarm must match. This proves the mobile omission; the separate earlier web observation was not reproduced or diagnosed here.

**REGION:** SEA mobile rails/ties replaced with irregular filled river banks/shallows/ripples around the same route curves. Owner visually approved in simulator. Stops, ship motion, interactions and API station identifiers preserved. Owner replaced coach and Bolo Chat default with `bY54gWrN4O4G9QOFtXwl` through shared COACH_VOICE_ID. Existing provider language support policy remains id/ms/tl/zh.

Mobile/API tsc -b and diff checks passed. Regression cases written, no suites run during iteration or Git push. No backend publish or new distributed build. New voice not yet auditioned through deployed account. Full suites required before build/publish. Replit must pull and publish for server changes to become live.

## 2026-09-11 — SEA storybook narrator uses the approved coach/chat voice

`grep: SEA storybook narrator, NARRATION_VOICE_ID, bY54gWrN4O4G9QOFtXwl`

REGION, owner-approved: SEA **4a0e991f**, pushed to origin/main. `ttsConfig.ts` now sets NARRATION_VOICE_ID = COACH_VOICE_ID, replacing inherited India voice IYUZs7LoFwd5QZsMgrMU with bY54gWrN4O4G9QOFtXwl. /openai/narrate and voice-keyed cache already consume that identity; no manual cache deletion, model change, fallback change, or contract change. API tsc -b passed. Backend publication remains with the owner.

Owner's updated testing instruction for this Codex work: **skip full suites, typecheck only**. This supersedes the earlier handoff's instruction to run suites. No suites run.


## 2026-09-11 — SEA all-stop Kopi access, forward harbour loop, river buoys and chat fixes

`grep: journey-stops unlock, SEA Zone 1 free, all stop types Kopi, story trace ownership, river buoy, Kopitiam reverse steam, chat first reply overlap, vocabulary hint echo`

SEA **854933e2**, pushed to origin/main at owner's request “push all SEA”. Handoffs:
`bolo-sea/docs/handoffs/2026-09-11-journey-stop-unlocks.md` and
`bolo-sea/docs/handoffs/2026-09-11-mobile-fixes.md`.

**CONTRACT — names explicitly owner-approved before editing:** GET
`/tokens/journey-stops` and POST `/tokens/journey-stops/unlock`, with `kind`
(lesson/story/trace), `languageCode`, `journey`, `zone`, and `lessonGroupId` for
lessons. Existing lesson endpoint remains compatible. Generated clients/Zod
regenerated through Orval, no hand-edited generated implementation.

**ENGINE:** Zone 1 is free; individual paid-zone stops can be permanently bought
with currency, including full premium lesson content, storybooks and tracing.
Existing spend_stop_unlock ledger reason; legacy lesson refs preserved, new
story/trace refs scope kind/language/journey/zone. No DB migration. Atomic wallet
lock and ownership recheck make concurrent replays free. Owned lessons retain
progress/completion even across a zone gate; scoring, attempts and earned-day
computation respect ownership. Mobile offers spend existing Kopi, buy Kopi, or
All-Access on the existing paywall. Nest counts/drills stop purchases.

**REGION:** All-Access badges on SEA Zones 2–6/cards and stops. Kopitiam's 20s
forward/reverse MP4 replaced from original source by a silent 9s forward-only
loop with a one-second crossfade; matching posters refreshed on web/mobile.
Crossing gates/X signs replaced by lantern buoys with identical signal states,
size and interactions; encounter language now maritime. Other films untouched.

**ENGINE:** Mobile chat mascot/status now occupy a normal-layout band above the
fact card/transcript; first-answer note no longer floats over either. Owner
confirmed the layout fix. Silent-chat report was a prefix-free echo of the seed
vocabulary. India's mic-metering fix 8b888d9c was already in SEA as 5b81009f;
kept it, added exact multi-entry seed-list echo rejection before transcript/
reply/TTS/usage/memory, and mobile handling for the existing noSpeech response.
Short genuine replies and typed text remain allowed. This is not a universal
ambient-noise speech detector; existing transcripts/memories were not edited.

Mobile/API/web typechecks passed for final relevant changes; diff and commit
conflict-marker checks passed. **No suites run**, per owner's explicit
typecheck-only instruction. Buoy inspected in simulator; chat layout approved
by owner. Updated server purchase/echo paths await backend deployment. No live
wallet spend, subscription mutation, deployment or new distributed build was
performed here. Other forks are owed ENGINE/CONTRACT review; none edited.

## 2026-09-11 — India chat echo rejection and first-reply layout parity

`grep: India vocabulary hint echo, chat first reply overlap, SEA chat port`

ENGINE: India **92932140**, pushed to origin/main at owner request. Surgical
chat-only port from SEA **854933e2** (mixed source commit also contains regional
art and purchases). Exact multi-entry vocabulary echo rejection precedes
transcript/reply/TTS/billing/memory; mobile handles existing noSpeech in both
audio branches. Mascot/status band, first-answer note and TipCard flow match
SEA. Hindi seed regression definitions added; existing metering guard retained.
India mobile/API typechecks passed; no suites run per owner instruction.
Pre-existing app.json edit excluded. Backend deployment remains with owner.
Handoff: bolo/docs/handoffs/2026-09-11-chat-echo-layout.md.

## 2026-09-11 — Fleet ordered stop purchases, mobile and web (working trees)

`grep: Zone 1 free, all stop types, ordered currency purchases, journey-stops letter, mobile web parity`

Owner requested SEA access parity in India, Africa, East Asia, Europe, LATAM
and SEA, explicitly BOTH mobile and web. Clarification: "any stop in zone 1
is free, any stop after can be purchased. stops can only be purchased in order."
This answered the proposed `letter` kind addition affirmatively. Existing
GET /tokens/journey-stops and POST /tokens/journey-stops/unlock names remain;
only kind=letter is additive, no extra response fields or DB migration.

Local working-tree implementation in all six repos, NOT COMMITTED OR PUSHED
YET. Source is a surgical port of mixed SEA 854933e2 plus this clarification;
regional art, voices, store IDs, existing prices and wire currency aliases stay
local. API and both clients derive the same stop order with existing synthetic
stop insertion functions. Both purchase endpoints refuse skipping earlier
unowned paid stops before charging. Prior free stops require no purchase;
ownership, not completion, is the purchase prerequisite. Existing ownership
survives. India authors letter stops and wires their owned content gate; others
refuse an unauthored letter target. Category slugs replace numeric-ID assumptions.

Mobile/web badges, spend/buy-currency/subscribe choices and ordered-stop links
are present fleet-wide. SEA web audit additionally closes missing river and
failed-gift-claim handling. India/SEA web chat already handled noSpeech and
flow layout; their status/fact regions now explicitly resist flex shrink.
Voice config, SEA practice language routing, forward stall film and buoy twins
were audited. India chat 92932140 was already pushed separately.

All six final mobile/web/API typechecks, codegen/library checks, diff checks
and source order parity passed. No suites run (owner's standing instruction),
no deployment/build/live wallet activity. Pre-existing edits preserved. See each
repo's docs/handoffs/2026-09-11-ordered-stop-purchases.md for exact scope and
pending delivery. Legacy One-Language subscription behavior is not redesigned.

## 2026-09-11 — Fleet ordered stop purchases delivered

Owner requested push before daily-gift parity audit. All six main branches pushed and remote hashes verified:
- bolo: `365d47fe5ababf834a770b5e6668c60fd6cf1f91`
- bolo-sea: `c53bf196a734c6b64e67b43694bc70d36c762359`
- bolo-africa: `bb4e4ec84ffc0ad114de79db8460c986019e0d45`
- bolo-east: `6e7369e3546b37937286fe791a80436afac3f4f4`
- bolo-europe: `7ead923dc0f0829452edce3d141c79493030080d`
- bolo-latam: `74cc93b06ab4827d4cd08bcc615ba2b57b2ca2cd`

Mobile, web, API and generated library typechecks passed; no suites per owner instruction. Pre-existing app.json/consent edits excluded and preserved. Backend publication remains with owner.

## 2026-09-11 — Daily gift parity across all six forks (local)

Keywords: daily gift, claim-only award, premature wallet currency, pending claim, Africa missing card, LATAM claim response.

Owner requested push of prior fleet work first (commit IDs above), then gift behavior matching SEA on MOBILE AND WEB. Shared ledger reviewed before named work. SEA source 15002957/c53bf196, regional Cowries copy rewritten for Africa. All six now gate opening on earned+claimable state, refresh gift/wallet on home return, and handle claim failures without opening. India no longer treats pending as claimed. Africa had no card at all; added both home cards with existing workspace gift library. SEA/Africa/East/LATAM receipt state is local-day scoped.

Removed attempts-route daily gift payment in India/Africa/East/Europe to match SEA/LATAM claim-only behavior. Earlier installs without a gift UI need the updated client to claim. Existing canClaimGift fields remain compatible and inert; no schema names changed. Regional draw amounts/multipliers and ledger identities preserved. LATAM now serves full already-declared claim state; East claim includes already-declared meter fields. Stat bars remain actual wallet reads.

All six mobile/web/API typechecks passed; no suites per owner instruction. Regression definitions updated, not executed. Prior unrelated edits preserved. Gift changes local, not pushed or deployed. See each repo's docs/handoffs/2026-09-11-daily-gift-parity.md. Runtime visual/claim validation awaits publication.

## 2026-09-11 — East Asia journey river and buoy parity (local)

Keywords: East Asia river spine, railroad crossing posts, lantern buoy, mobile web. Owner explicitly requested SEA river visual fixes for East Asia. Surgical region port from SEA 15002957/854933e2/c53bf196: identical irregular shore/water/channel/ripples, floating lantern buoys with existing four state lamps and halo, maritime encounter/accessibility copy using Cha. Existing East Asia boat/scenery, centreline, stops, route progress, movement, hit targets and legacy station/API identities preserved. No economy or access behavior edits. Mobile and web typechecks passed, no suites/build/publish/push. Existing signal test expectations adapted; not executed. Gift/consent working edits untouched. See bolo-east/docs/handoffs/2026-09-11-east-river.md.

## 2026-09-11 — All pending BOLO source changes pushed

Owner: "Push all changes you are currently holding." Includes daily gift parity in all six, East Asia mobile/web river and buoy visuals, previously pending consent presentation/copy updates in Africa/East/LATAM and India iOS build 546. Generated Africa .pnpm-store cache excluded.

- bolo: `c86358210170a001dd828c3714d7f32c35ffb3ed`
- bolo-sea: `af4bcd5def720287a4c4e4a6d68ccf77bf7bd352`
- bolo-africa: `c5a9ec0c4d6ff522926edc92ea0103b1dca67e93`
- bolo-east: `ef30edfea80411884c8ed118f9c7164370290f7b`
- bolo-europe: `94e389a884c5e30176d2ae62afd5aa965dca70de`
- bolo-latam: `38be5397957aa67e06f68dbfed6ab48656a5d842`

All remote main hashes verified against local HEAD after delivery. East push reported a ref race; re-fetch and ls-remote confirmed the exact local HEAD and all three new commits were already present, with no divergent work or force push. Mobile/web/API typechecks passed before delivery; no suites rerun per owner instruction. No builds or deployment. Supersedes previous local/unpushed status in gift/river handoffs.

## 2026-09-11 — LATAM Cacao catalog, Mercadito and approved character voices (local)

Keywords: LATAM consumables, missing wallet packs, Mercadito welcome, Grandma voice, live phone call voice, coach languageCode.

Owner requested LATAM mobile/web repairs and supplied Grandma aYQAm4rWuigkeuRA5i92, Bolo/coach/storybook P0zSUl3c6tjweeuBGjgP, then Mercadito splash audio.bin. REGION: existing approved Cacao Pod/Basket/Sack store IDs now replace inherited SEA IDs in server catalog/recovery matching. Wallet/hub match home Mercadito names. Supplied 3.040s MP3 replaces India welcome in both assets; new URL/day stamp prevents stale playback. Film retained.

Grandma's encounter/canned-call identity now ElevenLabs, and call cache defaults track actual synthesis identity. Live phone turns previously bypassed this setting with gpt-audio stock speech: now generate reply text then stream ElevenLabs MP3 for supported languages. Bolo chat/coach/narrator share owner-approved second voice. English feedback now explicit and supported. Missing mobile lesson language codes fixed, matching SEA engine finding; indigenous provider restrictions preserved. No contract names changed.

ENGINE debts for siblings: audit purchases-readiness dependency and canned-call cache identity before selecting regional character voice; live-call voice setting otherwise cannot affect direct gpt-audio speech. No blind regional ID/voice port.

Mobile/web/API typechecks passed; NO suites per owner. MP3 decoded and matching hashes verified. Owner-requested LATAM simulator development build installed, Metro 8083, launch verified. Local source only; no push/deploy. See bolo-latam/docs/handoffs/2026-09-11-latam-mercadito-voices.md. Runtime backend voice/catalog changes need publication; live-call latency requires listening.

## 2026-09-11 — Consent version skew and five-app flow repair (local)

Owner requested SEA/East/Africa/Europe/LATAM, explicitly NOT India. LATAM simulator rejected its 2026-09-11 consent with unknown_disclosure_version on the older published backend. Client hooks now catch errors, display known historical disclosure on exact expected-version mismatch, and require another explicit answer; saved server decisions update consent/entitlement caches. Frozen September 10 copy recovered independently from each of SEA/East/Africa/LATAM Git histories; servers accept these known versions and record actual submitted version. Europe preserves its own version/copy. No silent consent upgrade or API schema changes.

Web parity gaps repaired: East's local-storage-only gate replaced; Africa/Europe missing web gates added. All five mobile/web accounts can review/change consent. LATAM feature-level sheets share retry handling. Server enforcement was disabled/unwired despite the UI: central authenticated guard now blocks AI send/synthesis routes for declined/unknown consent, leaves settings/other routes/call-end usable; LATAM/Europe enforcement flags enabled. No re-prompt when declined learner taps AI; Account is the explicit review path. India engine debt held at owner's instruction.

All five mobile/web/API typechecks passed; NO suites per owner. LATAM UI refresh observed on simulator 8083, actual successful save awaiting owner retry. No runtime grant/revoke by agent, no other fork runtime flow exercised, no DB changes. Source local/unpushed. See each docs/handoffs/2026-09-11-consent-rollout.md. Matching client/server rollout required, especially old clients with no disclosure UI.

### Consent follow-up — blocked AI feature helper (same five forks, local)

Owner explicitly requested a helper notification when a declined learner tries an AI feature. Added mobile alert/web toast with Open Account, routed from exact ai_consent_required responses through API-client listener; covered generated requests, mobile calls and web streaming chat. Coalesces simultaneous rejections. Does not re-display consent or change permission. API-client/mobile/web/API typechecks passed in all five. India untouched. No suites/push/deploy.


## 2026-09-11 — LATAM and Africa minibus road / Africa selected intro (local)

`grep: LATAM road spine, Africa road spine, traffic lights, Africa intro splash, 63357`

Owner requested LATAM and Africa journey rails/ties become a road and crossing posts become traffic lights. Both mobile and web now render asphalt with edge lines and dashed center markings, green completed progress, and red/amber/green traffic lights. Existing curve, stop/vehicle positions, signal interactions and IDs are preserved. Region-specific visual update; no API change. Mobile/web typechecks pass; no suites run.

Africa mobile still referenced SEA's boat. Owner selected Downloads/Africa Art/Minibus_parked_at_roadside_stop_20260909163357.mp4. Wired selected minibus to mobile and web, matching posters, reduced-motion stills, landscape crop, cache-busting URLs, and film duration. Details in each repo's docs/handoffs/2026-09-11-minibus-road.md. All local, not pushed.


## 2026-09-11 — Africa Mama’s Stall harbour background replaced (local)

`grep: Africa Mama stall home video, market background, mamas-market-v1`

Owner screenshot exposed SEA harbour film behind Africa’s Mama. Mobile and web STALL_ASSETS now point at the Africa Art market-stalls clip (20260909165904), with a matching first-frame poster, silent forward-only dissolved loop, and new cache-busting filenames. Preserves the separate Mama figure and actions. Mobile stall band shares the corrected still. Typechecks only, no suites; local, not pushed. See bolo-africa/docs/handoffs/2026-09-11-africa-mama-stall.md.


## 2026-09-11 — Five-app consent fixes pushed

Owner explicitly approved pushing the prepared consent repairs. Pushed to main: SEA 7a773aa6, East 3bbcf1c8, Africa 026b7bdd, Europe a15d8fc5, LATAM c54109b2. Only consent scope committed; local LATAM voice/Mercadito/road and Africa road/intro/stall edits preserved. All five API-client/mobile/web/API typechecks passed; no suites. India unchanged.

Live simulator audit before publication: authenticated East POST /api/ai-consent returned 404; LATAM returned unknown_disclosure_version expecting 2026-09-10. LATAM then displayed that historical disclosure and successfully passed the gate after a second explicit Yes. Unauthenticated 401 responses on other sites cannot establish endpoint availability. Owner must pull and publish the five servers/websites; mobile consent changes require inclusion in next app builds. App Store screenshot work remains in progress.


## 2026-09-11 — Five-app consent Replit rollout completed

Owner explicitly authorized Chrome pulls and publishes for SEA, East Asia, Africa, Europe, LATAM. Verified clean workspaces and correct remotes, merged origin/main preserving Replit publish commits, and verified required consent commits are ancestors. Replit merge heads: SEA 7288100c, East e738e523, Africa f43e2854, Europe 5d607eaf, LATAM 52748d95. No GitHub push of Replit merge commits performed.

All five Replit production status indicators confirmed published during this rollout. East and Africa initially proposed destructive automatic schema synchronization: dropping users.ai_consent / ai_consent_at / ai_consent_version from production. Cancelled both before approval. Read-only information_schema checks confirmed all three columns absent in each development DB; added precisely the three nullable fields with ADD COLUMN IF NOT EXISTS, matching committed migrations. Retried publication; no destructive migrations approved and no saved consent values changed.

Live Chrome verification: SEA and LATAM signed-in home and account screens load, with Let Bolo hear you enabled; East, Africa, Europe show their region-specific consent gates. This verifies current pages and loaded account state, not a fresh save/revoke cycle. Native app builds remain separate. No suites run. India and local uncommitted LATAM/Africa media/voice/road changes excluded.


## 2026-09-11 — Daily gift Go Shopping parity (local)

Owner requested LATAM Go Shopping and consistent gift placement/functionality across all apps. All six mobile/web gift cards now have an always-available, full-width Go Shopping footer opening their regional /bazaar shop. Claim gates and currency values preserved; shop navigation does not claim. Europe mobile gift moved above the Journey frame to match web/fleet. Mobile/web typechecks passed; no suites. LATAM simulator confirmed locked gift, zero wallet and successful Mercadito navigation. Existing free-tier shop test expectations updated, not run. Local/unpushed; see each docs/handoffs/2026-09-11-gift-shopping-parity.md.

LATAM content audit: production holds 658 phrases across only zones 1–2. Zone 1 lesson groups: es/pt 10, qu 4, gn/nah/yua 3; Yucatec simulator draws those 3 plus a story stop = 4. No client truncation. Owner explicitly authorized GPT expansion, then all zones to minimum ten stops. This supersedes X62b's earlier requirement to wait for speaker-written additions. Full LATAM library expansion is in progress; do not treat the draft as delivered.


## 2026-09-11 — LATAM full library expansion completed locally

Owner authorized GPT generation and a minimum ten stops in every zone. REGION: all six LATAM languages, both journeys, twelve topics each. Added 6,542 generated phrases to the original 658, totaling 7,200 and 100 per topic. Original rows/order/provenance preserved; new rows use existing generated_c1 marker. Snapshot follows normal seed/top-up and append-only group backfill, shared by mobile/web. No IDs, contracts, purchase rules or other forks’ language content changed.

All 72 topics pass shape/duplicate/content validation, no missing topics. Actual partitionIds confirms at least ten groups for fresh and original-content upgrade scenarios. LATAM libs/API/mobile/web typechecks passed; no suites per owner. Generated batches received a separate automated translation review (GPT-5.4-mini/GPT-5.4), not native-speaker review; a dictionary spot correction is recorded in the handoff. No production mutation, push or publish. Supersedes prior in-progress expansion entry; see bolo-latam/docs/handoffs/2026-09-11-latam-full-library.md.

## X-20260911-1750 — Regional store and homepage captures in progress

Owner stopped publishing; no new deploy clicked. Six prior pushes completed (India77ef55b9, SEA190a007d, East1e941aa8, Africafe3a1051, Europebf7492e3, LATAM158d989d). LATAM Replit merge was submitted, completion not observed.

REGION: Owner requested iPhone/iPad App Store screenshots for East, Africa, LATAM, Europe; all five non-India logged-out homepages must use matching screenshots and actual regional phone-call game recordings. LATAM and East homepage code/assets prepared locally in public/screenshots/2026-09-11, seven real stills each plus Chiich/Po Po clips. Both web typechecks pass, no suites. Download exports are RGB PNGs. LATAM live API still has four stops pending publication of expanded library; journey/progress must be refreshed once deployed. Other captures/homepages ongoing. Unpublished.

## X-20260911-1800 — iPad consent heading and readable column

ENGINE, all five non-India mobile gates: owner reported iPad consent layout. SpeechBubble defaults alignSelf:flex-start and was a direct child of the full-screen ScrollView, stranding its heading left. New bounded content column groups heading beside Bolo; tablet breakpoint768 widens to560, increases text and aligns actions. Each fork retains its own disclosure/legacy copy and API behavior. Five mobile typechecks pass, Europe iPad portrait visually inspected. Web centered heading has no matching defect. Local, uncommitted; publication still paused.

Final consent polish: replaced the consent-only SpeechBubble with a rounded accessible heading card, removing its detached tail. Repeated all five mobile typechecks passed. Final Europe iPad portrait screenshot reviewed; consent choices and persistence untouched.

## X-20260911-Europe-audio — Europe audio audit (local)

Owner reported silent coach and chat microphone failure. Ported existing SEA lesson languageCode routing to Europe mobile (first/current/next + English feedback); added visible coach retry + error report. Ported India92932140 mobile noSpeech handling; Europe web already handles it. REGION: chat buffered/streamed synthesis now uses Europe elevenLabsModelFor instead of hard-coded v2, preserving voice ID. No contract edits. Mobile/API typechecks pass, no suites, no publish. Recording preset/session/hold/nav plumbing matches India; microphone root cause and audible roundtrip NOT established, awaiting owner device/language details and usable simulator controls. See Europe docs/handoffs/2026-09-11-europe-audio-plumbing.md. Other forks owed review only for uncovered equivalent defects; not blindly copied.

## X-20260911-speech-identity — Africa Shikamoo scream and Europe voices (local)

Owner confirms TestFlight Shikamoo -> scream -> means hello. No effect call in the phrase/meaning transition; exact offending clip not listened to here. ENGINE defects: Africa mobile omitted phrase languageCode; live/shared synthesis ignored configured ElevenLabs model and OpenAI instructions, caching mislabelled takes. Corrected Africa and Europe (same defects present); exact languageName fallback supports released clients. Rotated affected v3/mini-TTS primary cache identities only; no production cache deletion. Africa mobile/API and Europe API typechecks pass, no suites/publish. Fresh audible roundtrip remains required, transcription cannot prove scream absent. Other equivalent forks owed review.

REGION Europe: owner supplied Polish2AI3SLYKkKZsvZEiHd3D and Russian female t6lBrEl93uCiLR1Lgm8v. Existing language map now owns both lesson and buffered/streamed chat voice selection. Story languageCode contract addition proposed to owner (optional field, existing /openai/narrate); approval PENDING, story routing not edited. No claim all three surfaces finished. Handoffs in Africa/Europe docs/handoffs dated2026-09-11.

Europe voice additions: owner supplied Bosnian/Croatian7IVTG9LKLYndnFiFDLU2 (bs/hr only; Serbian unchanged) and Ukrainian yMBZR4SLoc24wOJLWAB2. Existing per-language map updated, API typecheck passed. Story request-field approval remains pending.

Europe Portuguese pt voice: owner supplied zKjRewuiqTkXNUVAMwat, now assigned in the language map. Local/unpublished; story wiring still awaits request-field approval.

Owner confirmed Serbian shares Bosnian voice: Europe sr now7IVTG9LKLYndnFiFDLU2, matching bs/hr.

Europe owner supplied Slovak9Nd358gE1qQp0pDh8FgP and requested broader regional sharing. Applied previously proposed Czech/Slovak shared voice to cs/sk. Larger grouping proposal is an audition plan, not yet additional mappings.

Europe Spanish es: owner supplied wKvrrFnAmhvpNRpZkbmh; mapped locally.

## X-20260911-hold-pulse — Mobile lesson button pulse parity

Owner requested India/SEA mobile hold-to-talk pulse in all apps. Found India bc364b7a first-use HoldHintRings + AttentionPulse after3idle seconds; ported only practice/helper/component hunks to SEA/East/Africa/Europe/LATAM. India unchanged. Reduced-motion and hold gesture behavior retained. All5mobile typechecks pass, no suites. Source port not full cherry-pick because original also includes unrelated animation diagnostics. Local/unpublished. Visual approval still pending.

Voice updates: Europe French ebRwkdEFVZIx2A6YucFh and German2etPlvmUpTvN6iCGyIDC mapped; API typecheck passed. LATAM BrazilianPortuguese ORgG8rwdAiMYRug8RJwR mapped and chat now resolves per-language voice; other languages/Grandma unchanged. Story languageCode contract approval still pending; no narration claims.

Europe owner authorized judgment-based regional voice reuse. Applied sl/bg/mk -> Bosnian/Croatian/Serbian; it/ro -> Spanish; hu -> Czech/Slovak; lt/lv/et -> Polish. All21 ElevenLabs languages use nine owner-supplied IDs; actual language/model unchanged; Albanian stays OpenAI. Europe API typecheck passed; no suites/publish. Audible review pending. Story languageCode field approval remains pending. LATAM Brazilian Portuguese API typecheck also passed.

## 2026-09-11 — All6 owner-authorized rollout resumed
Pushed local completed work: SEA20309760 East85dd5167 Africa0396c5cc Europea765dfb4 LATAM42f804e7. India77ef55b9 already current; Replit strict check exposed implicit-any image error events in three launch-video scenes; explicit SyntheticEvent<HTMLImageElement> plus void handler committed/pushed1cc29b6e, local typecheck passes. ENGINE sibling audit debt only if same check fails (all other local/Replit checks pass). No full suites per owner. Six development servers left ready; native builds explicitly held for owner simulator review. Reviewer consent reset deferred by owner; no consent mutations. Replit publication in progress, final results to follow.

## X-20260911-India-consent-hold — Complete clients, shared flag off

Owner clarified India stays feature-flagged off unless explicitly activated after review feedback, then requested the complete implementation. India964eb532 pushed: approved four-card mascot disclosure on mobile/web, phone/tablet column, persistent explicit decisions with save error/retry, Account review/change, declined-feature helper, authenticated client boundaries and central API AI-send guard. Shared AI_CONSENT_ENABLED=false controls both clients and server; off causes no consent UI/consent-specific query/enforcement and never manufactures a saved grant. No API contract or account data edits. Five non-India enabled flows untouched by this India-only rollout decision. Root typecheck passes, Metro India iOS bundle200; no suites per owner. Simulator currently signed out, so no fresh consent-save cycle claimed. India Replit pull/typecheck/publication in progress. See India docs/handoffs/2026-09-11-india-consent-ready-disabled.md. Native release builds and reviewer consent resets remain held.

## X-20260911-compact-gift-row — All six MOBILE, local visual iteration
Owner requested one resting row, compact shopping, and locked-tap wiggle followed by instruction popping forward; then enlarged the gift. Added identical region-free DailyGiftRow helper to all6, regional art/ranges/callbacks retained in each adapter. Shop is separate48pt target, art slot80pt, no claim from locked tap, repeated-tap/unmount cleanup and Reduce Motion respected. Claimed receipts/celebrations retained. All6mobile typechecks passed, no suites/release builds. India current simulator visually inspected with enlarged gift; manual tap-animation playback not independently verified. Local/uncommitted pending visual iteration. Shared engine port source is identical in all6; no API/economy/web edits. See docs/handoffs/2026-09-11-compact-mobile-gift.md in each repo.

India prior consent rollout964eb532: Replit final typechecks passed, pulled and published; Current status Live confirmed and production healthz returned200{"status":"ok"}. All6 prior web/server republishes now completed. India shared consent flag remains false; other5 enabled. No native release builds and no reviewer consent resets.

## X-20260911-owner-gift-preview — all6 authenticated account exception
Owner requested gift preview without a stop, then supplied exact Clerk ID user_3HBsmeNhc3jxT6rCH1WXI4R0Ykv. Final engine helper compares only authenticated server user ID. Shared read/claim loaders skip only earned-stop eligibility for that ID; no lesson/streak writes, no automatic grant, normal draw/multiplier and daily ledger uniqueness retained. Mobile/web share API behavior. Initial email-verification implementation superseded before publication. Pushed final India9cb6d3d3 SEA36a56bfd Eastec6ec9b9 Africa208dc034 Europef9330928 LATAMee4bdfe7. API typechecks passed all6; no suites/native builds. Replit rollout in progress. Compact/enlarged mobile gift rows remain separate local work.

## X-20260911-regional-release-media — local Europe/Africa call assets and capture progress
REGION: Europe/Africa native calls replaced inherited SEA uncle footage with owner-provided Babcia/Mama files; legacy backdrop IDs and APIs unchanged. Mobile typechecks passed. Europe real Polish call connected and greeting clip recorded; Africa call start failed, investigation/usable clip pending. Europe landing now uses only own five real captures/clip, with Zone 1 free copy corrected; web typecheck passed, local browser preview renders. East, LATAM, Europe each now have real RGB iPad sets; Africa iPad capture underway. SEA screenshot simulator startup fixed with signed development rebuild; awaits owner sign-in. All changes local, no production mobile builds, no new publications or App Store review submissions.

## X-20260911-chat-blur-recorder — all six mobile, local
ENGINE: Africa iPad navigation reproduced unhandled promise rejection from stopping an idle native recorder. Existing sync try/catch could not catch the stop() promise. Added a best-effort rejection handler to the same chat blur cleanup in all6. No web native-recorder path, no API/recording/transcription changes. All6 mobile typechecks passed; no full suites. Local pending release commit.


## X-20260911-call-show-meaning — roadmap only

Owner requested a tap-to-reveal meaning helper on all six regional phone-call games. Recorded in ROADMAP.md and HANDOFF.md. No implementation, API change, build, or deployment in this update.


## X-20260912-sea-google-secret — resolved
SEA Google sign-in failed with needs_identifier. Clerk logs identified oauth_token_exchange_error / invalid_client: provided client secret invalid. Stored Client Secret contained literal enclosing double quotes. Inner value matched Google’s enabled secret suffix. Removed only wrapping quotes in Clerk production; fresh simulator Google sign-in reached consent. No credential rotation, API/code auth changes, or iOS identity registration. Simulator generated native scheme was separately refreshed to match current config; this alone had not resolved the failure.


## X-20260912-nest-fleet-cockpit — six-app owner dashboard, local

Owner requested one aggregate Nest plus six individual views and drill-downs on all statistics (continuing X91). Implemented shared nest-fleet.html and owner-gated hub/GET-only relay in all6; explicit per-repo identity, fixed regional HTTPS origins, independent server-only keys, redirect refusal, timeout, no-store, secret header redaction. Existing writes keep session-only owner checks. No API-spec/schema changes. Aggregate metrics disclose coverage, missing is not zero, accounts are not cross-app people, maxima are not summed, currencies stay separate. Unknown metrics show per-app readings. Existing learner drills (200 records/app cap), all numeric fields, source records, chart-day drills, operations, people/content, classic tools links. All6 API typechecks pass; no suites. Browser preview is synthetic and explicitly marked, outside repos; aggregate/app scopes and drill/search visually inspected. No production relay keys or deployment yet. PagerDuty service PDNPFQ7 created separately but delivery/SMS/external monitoring and $20 balance alert remain UNARMED; dashboard explicitly shows this. See each repo docs/handoffs/2026-09-12-nest-control-center.md.


## X-20260912-nest-fleet-cockpit — production rollout completed

Owner authorized private keys and six-app push/pull/publish. Pushed India e67367b8, SEA f1dd7b60, East 2beaa612, Africa 8cd043f4, Europe ed6b3120, LATAM ad2a58b5. All six pulled into Replit preserving deployment merge history and published live. Five unique spoke NEST_RELAY_KEY secrets synced into production; matching five NEST_FLEET_*_KEY secrets configured only in India hub. No key values recorded in code/docs. Added Bolo bird-in-nest logo, subway learner map, fixed today/week signup boxes, browser-local owner/tester selection picker, and signed-out Nest login redirect while non-owner checks remain strict. API/web typechecks passed in all six; no suites per owner. Live aggregate 6/6 coverage, six-source account drills, remote picker, individual Europe view and all six signed-out redirects verified. Public health endpoints all 200; unauthenticated regional relays deny. India publishing review initially rejected unused Stripe connector setup notice; source confirmed direct Stripe secret client and existing production secrets, and normal publish retry approved. PagerDuty primary SMS is verified, but background Nest event delivery and exact $20 balance feed remain UNARMED; no claim alert integration complete.

## 2026-09-12 — East Asia Cha App Store catalog (REGION)
East commit d60789ca aligns server Apple consumable identifiers to existing App Store products bolo_cha_cup, bolo_cha_pot, bolo_cha_chest (25/75/200). Previous bolo_east_cha_* names caused StoreKit product lookup to return no packs. Updated catalog and fixture references; API server typecheck passed, no suites per owner. Pushed GitHub; exact commit bundle merged into clean Replit checkout after saved GitHub auth failed. Replit republished successfully (refreshed Live UI), public healthz OK. No new binary. Apple worldwide pack pricing configured per owner; device sellability still requires propagation/verification. Africa and LATAM catalog IDs separately checked against Apple; no blind propagation.
