# Bolo! social campaigns

**Two complete sets of the same 40 assets.** Pick one, do not mix them in a run.

| Folder | Google Play badge | Use when |
| --- | --- | --- |
| `campaign-duo/` `campaign-ai/` `campaign-father/` | Full colour, live | **Android listing is public.** The default set. |
| `campaign-duo-playsoon/` `campaign-ai-playsoon/` `campaign-father-playsoon/` | Greyed, captioned **COMING SOON** | **Launching before Android leaves closed testing.** |

In the coming-soon set only the Play badge changes: it is dimmed and captioned,
the Apple badge stays live and full colour, and everything else on the asset is
byte-for-byte the same decision. **Swap the whole set when Android goes live**;
a feed with both states in it reads as a mistake.

Captions, hashtags and posting order live in each campaign's own `CAMPAIGN.md`.
They are identical for both sets.

## The three campaigns

1. **`campaign-duo`** (26) — the competitive angle. Duolingo teaches 1 of India's
   22 official languages; Bolo teaches 22. One card per language.
2. **`campaign-ai`** (7) — the capability flex. Real audio grading, five bands,
   per-phrase memory. **Claims measurement, never adaptation.**
3. **`campaign-father`** (7) — the emotional one. Signed "Made by a father of
   ABCDs" and the only set that sells the Family plan.

## Regenerating

```bash
cd artifacts/bolo-social-clips
export CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# live set
node scripts/gen-duo-campaign.mjs
node scripts/gen-ai-campaign.mjs
node scripts/gen-father-campaign.mjs

# coming-soon set
PLAY_SOON=1 node scripts/gen-duo-campaign.mjs
PLAY_SOON=1 node scripts/gen-ai-campaign.mjs
PLAY_SOON=1 node scripts/gen-father-campaign.mjs
```

Each generator's header comment records which product facts its copy rests on
and which claims are out of bounds. Read it before changing any wording.
