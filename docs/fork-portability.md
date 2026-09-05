# What travels between the forks

**THIS FILE IS A MIRROR OF ONE SECTION.** The canonical document is
`~/bolo-sea/docs/fork-playbook.md`, 1173 lines, and it OUTRANKS a fork
session's own reading of the code, including this copy. What is here is its
section B0 and nothing else, kept in this repo because India is the PARENT the
five forks were cut from and has no playbook of its own: a session working here
still needs to know, before it writes anything, whether the change it is about
to make has to be written five more times.

**There is deliberately no second document.** A second document is a second
place to go stale, which is the whole failure this table exists to avoid. If
this copy and the playbook ever disagree, the playbook is right and this file
is the bug.

The five forks: `~/bolo-sea` (Southeast Asia), `~/bolo-east` (East Asia),
`~/bolo-europe` (Eastern Europe), `~/bolo-africa` (Africa), and this repo,
India, which every one of them was cut from.

**The one question this answers: I have a change. Do I cherry-pick it, or write
it again?** Part B below is the same answer in 170 items; this is the table you
read first.

**Cherry-pick with `-x`.** It writes the source hash into the message, so six
months later the two repos can still be told apart from a coincidence. A change
that does NOT travel gets its own commit in each repo, and its message says so:
one sentence naming why it could not travel is what stops the next session
trying.

| What | Travels? | If not, what instead |
|---|---|---|
| `lib/*` pure packages: `script-trace` engine, `story` engine, `emergency` drill, `daily-gift`, `game-taste` | **Yes**, unchanged | |
| `lib/db/src/schema/**` and `lib/db/drizzle/**` | **Yes** | |
| `lib/api-spec/openapi.yaml` | **Yes** | |
| `lib/api-zod`, `lib/api-client-react` | **Yes**, but REGENERATE | Take the spec, then run codegen. A generated file cherry-picked is a merge conflict wearing a diff. |
| Server engine (playbook B7): scoring, `tokenService`, entitlements machinery, `gating`, Clerk identity, billing plumbing, streak, badge and XP, lesson-group unlock, replenisher | **Yes** | |
| `lib/referral-link` maths | **Yes** | |
| Motion rules, the audio pipeline, design tokens, mascot and wardrobe machinery | **Yes** | |
| Data-free tests, e.g. `zone-walk.test.ts` | **Yes**, unchanged | It sweeps zone sizes 1 to 12, so it fits any zone length without editing. |
| `.github/workflows/ci.yml` | **Yes** | |
| A bug fix inside any row above | **Yes** | This is the row that pays for the whole table. |
| `artifacts/api-server/pure-tests.txt` | **No** | Regenerate per repo: run each api test file alone with `SESSION_SECRET=x OPENAI_API_KEY=x` and keep the ones reporting `fail 0`. |
| Client screens and components | **No**, deliberately | Write it twice. Components are where the forks are SUPPOSED to differ; logic is where they must not. |
| Tests that pin a region fact (playbook B6, 60 files) | **No** | Invert each with a dated comment. Never delete a pin. |
| Language lists (B1), content and phrases (B2) | **No** | Per fork. |
| The metaphor in code (B3): `kopitiam` in SEA is **chai stall** here, `cha` in East Asia | **No** | Prose only, never values. A rename that touches content files corrupts romanisations: `chai` is a Thai and Lao word. |
| Assets and films (B4), fonts | **No** | Per fork, and out of git where they are large. |
| Config and identity (B5): domain, bundle id, slug, scheme, vendor ids | **No** | Per fork, and it is the first thing to get wrong. |
| `lib/train-class` | **Mechanics yes, the four class names no** | Local, Superfast, Rajdhani and Shatabdi are Indian. |
| A FINDING, as opposed to code | **Always, and it is free** | Read the sister fork's commit before writing the same feature. |

**The evidence, all measured. This table is not a preference.**

- Three commits were cherry-picked from `bolo-sea` into `bolo` with `-x` on
  2026-09-04. **Two applied completely unchanged.**
- **CI went green on India's first run**, because SEA had already paid for four
  red runs and the fix commit was taken rather than the spec rebuilt.
- **The zone walk's collision list matched byte for byte**, ten stops, across
  two repos. No document can prove that; a shared data-free test can.
- **One file was not portable and its commit message said so.** That single
  sentence is why `pure-tests.txt` was regenerated instead of shipped wrong.
- **THE LAST ROW IS THE MOST VALUABLE AND IT COST NOTHING.** On 2026-09-04
  `bolo-east` and `bolo` built the same free-taste ruling hours apart, on
  different designs, without sharing a line of code. Reading East's commit
  found FIVE defects in India's half-finished version in minutes: a hand-written
  zod enum still closed at four ids, so the widened contract answered 400; an
  `isCorrect` that named three ids literally, so every new id scored zero; no
  `MAX_RESULTS` entries; a `context` column never written, so a hub play could
  not be told from the journey's; and a wall that refused the journey's own
  runs, which would have stranded a crossing mid-line. It also caught a sixth
  game. Every one of those typechecked. **The forks are each other's review,
  and the cost of using them is reading one commit.**

**WHAT NOT TO BUILD: a shared component library.** Argued and rejected
2026-09-04. Inside ONE repo, web and mobile already cannot share components;
they are hand-maintained twins held together by prose comments. Across five
forks that is ten surfaces, and components are exactly where the forks are
supposed to differ. Logic is where they must not, and logic already travels:
that is the top half of this table.

**Add every fork as a remote of every other.** `git log --oneline sea/main`
is then the shared changelog, and it is the cheapest version of this whole
idea.
