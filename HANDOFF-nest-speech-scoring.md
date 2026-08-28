# For the Nest agent: the speech scoring matrix

**From BOLO BUILD CHAT 14, 2026-08-28.** Everything below was read out of the
repo at commit `c24baecf`, so you should not need to research any of it again.
Re-verify before quoting it as current, but start from here rather than from
scratch.

**Live reference, already designed and published:**
https://claude.ai/code/artifact/90a483c4-a16e-4f9c-8a9b-601066e266ca

That page is the content. The ask is to put the same thing in the Nest.

---

## 1. READ THIS FIRST, IT IS NOT OPTIONAL

**The owner is partially colour blind.** The first version of that artifact
distinguished its states with a coloured left border and coloured legend
swatches, and he could not read it. Every state on any Nest surface must carry:

1. **A word on the element itself**, not only in a legend.
2. **A shape or border treatment.** Solid fill, dashed outline, flat tint,
   heavy double rule. These survive greyscale.
3. **A glyph.** Filled circle, half circle, hollow circle, cross.

**Do not use a red / amber / green triad.** That is the worst possible set for
red-green deficiency. Use **blue versus orange**, and separate states by
**luminance** as well as hue. The corrected artifact above is the pattern to
copy.

**This applies to the whole Nest, not just this page.** Any status pill, health
chip or severity stripe already on there is worth checking against it.

## 2. Build system, so you do not lose work

`nest-growth.html` is **generated output**, per `tools/growth-board/README.md`:
edit `data.py` / `sections.py` and rebuild with
`python3 gen.py ../../artifacts/api-server/assets/nest-growth.html nest`, and
the trailing `nest` argument is load bearing. The README's byte-for-byte `cmp`
check is the gate before committing.

`nest-production.html` has no generator under `tools/`. **Work out which of the
two this belongs in, or whether it wants a third page, before writing anything.**
That call is yours; I have not made it.

My instinct, for what it is worth: this is neither growth nor production health.
It is a **capability audit**, and it dates. Whatever you do, put the commit it
was verified against on the page, because half of it will be wrong the week
somebody wires up the audio model.

## 3. The findings, all verified

**NOTHING IN BOLO LISTENS TO AUDIO.** Every speech path is
`audio -> gpt-4o-mini-transcribe (gpt-4o-transcribe when highQuality) -> text -> LLM`.
Pronunciation scoring and chat both. `PRONUNCIATION_RUBRIC_PROMPT` in
`artifacts/api-server/src/routes/openai.ts` says it outright: *"The transcript is
your ONLY evidence: you cannot hear the audio itself."*

**An audio-native path exists and is dead code.** `voiceChat` and
`voiceChatStream` on model `gpt-audio`, in
`lib/integrations-openai-ai-server/src/audio/client.ts`. Nothing in api-server,
web or mobile calls either. (`gpt-audio` IS used by `textToSpeech` in that same
file, which is output, not listening. Do not confuse the two.)

**A marketing line drafted 2026-08-27 claims the opposite** and is false: "the
raw recording goes to an audio model rather than a transcript match, so it hears
how you said it, accent and all". If that copy reaches anything you own, it needs
correcting.

**What the rubric actually weighs**, all inferred from text: phoneme match
(heaviest), syllable count and structure, then stress and vowel length. The last
two cannot be measured from a transcript, so they are claims rather than
measurements. **Aspiration is explicitly excluded**: the prompt says aspiration
spelled differently does not count as an error.

**Four of the 22 are tonal, not one.** Punjabi and Dogri (unusual for
Indo-Aryan, from the collapse of the voiced aspirates), Meetei/Manipuri and Bodo
(ordinary for Tibeto-Burman). Kashmiri is arguable, usually called pitch accent.
Tamil is not tonal and no Dravidian language is.

**speechCapability, from `lib/db/src/seedData.ts`:**

- `brx` Bodo and `mni` Manipuri are **`unsupported`**. The route returns band
  `nocatch` before any audio work: no score, no XP, no streak break.
- `ks` Kashmiri and `sat` Santali are **`degraded`**.
- The other 18 are `supported`.

**So two of the four tonal languages are already dark**, and tone work is only
reachable in Punjabi and Dogri. And Punjabi is the worse served of the two: the
transcribe models reject the `pa` language code with a 400 on `language`, so
`client.ts` retries with no language hint at all.

**Server-side DSP already ships.** `artifacts/api-server/src/lib/audioNoise.ts`
decodes WAV to PCM, computes a short-term energy envelope, and exports
`snrDbFromWav`, which runs on **every scored attempt**.
`audioDuration.ts` exports `wavDurationSeconds`. So a pitch or rhythm measure is
another function in a file that already has the decode, not new infrastructure.

**Highest value unbuilt feature is not pitch.** It is **retroflex versus
dental**: it applies to all 22 rather than four, needs no reference audio, and
STT currently hides the error entirely by snapping to the nearest real word.

## 4. Sources, all read 2026-08-28 at `c24baecf`

```
artifacts/api-server/src/routes/openai.ts          rubric, capability gate, SNR call
lib/integrations-openai-ai-server/src/audio/client.ts   gpt-audio, transcribe models, the pa rejection
artifacts/api-server/src/lib/audioNoise.ts         PCM decode, energy envelope, snrDbFromWav
artifacts/api-server/src/lib/audioDuration.ts      wavDurationSeconds
lib/db/src/seedData.ts                             the 22 languages and speechCapability
artifacts/api-server/src/lib/parrotChat.ts         the chat turn, also transcript-based
```

## 5. Housekeeping

**Six uncommitted files in this tree are mine**, the mobile half of the memory
screen: `app/(app)/account/memories.tsx`, two edits under `app/(app)/`, and three
tests in `__tests__/`. **Please do not stage them.** Same courtesy as chat 14
left your `imapflow` and `nodemailer` changes alone earlier tonight.
