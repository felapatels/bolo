# "It's learning your pace." — the AI campaign

7 assets. Regenerate:

```bash
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node scripts/gen-ai-campaign.mjs
```

## The line you can and cannot walk

**Verified true today, 2026-08-22, against the code:**

- **Real audio reaches an audio model.** `gpt-audio`, 19 times in
  `routes/openai.ts`. Scoring v2 shipped, so the transcript-only, accent-blind
  v1 pipeline is history.
- **Five bands, real thresholds** (`lib/scoreBands.ts`): perfect 91+, great
  80-90, good 68-79, almost 55-67, retry under 55.
- **Every attempt updates per-phrase memory.** `applyFsrsRating` on the attempt
  write path, ts-fsrs v5, retention target 0.85, intervals to 365 days.
- **Review is ordered by due date**, soonest first. Bolo! Plus feature.

**Do NOT claim adaptation.** The app is **learning** the learner's pace, it is
not yet **adjusting** to it. "Adapts to you", "adjusts to your level",
"personalised plan" are all out until that ships. Asset `f-whats-next` is the
only one that touches it and it says "next" on its face. Hold that one back if
you would rather not pre-announce.

## Posting order

| # | Asset | Format | Job |
| --- | --- | --- | --- |
| 1 | `a1-learning-your-pace-9x16` | 9:16 | The thesis |
| 2 | `c-it-listens-9x16` | 9:16 | The differentiator, and the strongest one |
| 3 | `b-five-bands-9x16` | 9:16 | Show your work. Builds the credibility |
| 4 | `d-remembers-1x1` | 1:1 | The memory |
| 5 | `e-talk-to-bolo-1x1` | 1:1 | The conversation |
| 6 | `a2-learning-your-pace-1x1` | 1:1 | Feed cut of asset 1 |
| — | `f-whats-next-1x1` | 1:1 | Roadmap tease, optional |

## Captions

### a1 / a2 — It's learning your pace
> Say it out loud and Bolo hears it. Every attempt gets a real score and gets
> remembered against that exact phrase. 22 languages, from the first one you try.
> TryBolo.app

`#ai #languagelearning #pronunciation #edtech #speakbolo #indianlanguages #aitools #languageapp`

### c — It doesn't check spelling. It listens.
> Most speech practice compares your words to a transcript. If the right word
> comes out, you pass, accent and all. Bolo sends your actual recording to an
> audio model, so it hears **how** you said it. TryBolo.app

`#ai #pronunciation #accent #languagelearning #speakbolo #edtech #voiceai #learnhindi`

### b — Five bands
> Perfect. Great. Good. Almost. Retry. Every attempt lands on one of five bands
> with a real score behind it, not a green tick. And every one gets logged
> against that phrase, for you. TryBolo.app

`#languagelearning #pronunciation #ai #edtech #speakbolo #languageapp #learntamil`

### d — It knows which words are slipping
> Every phrase gets its own review schedule, built from how well you actually
> said it. The ones slipping away come back first. TryBolo.app

`#spacedrepetition #languagelearning #ai #memory #speakbolo #edtech #studytips`

### e — Talk to Bolo
> A real back-and-forth conversation, out loud, in any of the 22 languages. He
> talks, you talk back. No typing. TryBolo.app

`#ai #conversation #languagelearning #speakbolo #voiceai #learnhindi #edtech`

### f — What's next (optional)
> Right now Bolo is learning your pace. Every attempt you record is teaching it
> what you need. Next, it starts setting the pace for you. TryBolo.app

`#ai #roadmap #languagelearning #speakbolo #edtech #buildinpublic`
