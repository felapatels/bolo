/**
 * Recognizer language pinning for the speech-to-text call (owner item 5,
 * Aug 21, 2026). Practising Hindi धन्यवाद came back "Köszönöm" (Hungarian)
 * and "Děkuji" (Czech): the recogniser was reading the clip with no usable
 * language constraint and writing down whatever fit. The learner sees that
 * string on the "We heard" line, so the captured word has to be in the
 * language they are practising.
 *
 * Two things were wrong at the STT call and both are fixed here.
 *
 * 1. `language` is a HINT, not a constraint. OpenAI's own parameter doc says
 *    supplying it "will improve accuracy and latency" and nothing more, and
 *    the gpt-4o transcribe models are LLM recognisers that will overrule it.
 *    It was also being sent raw, so the six Bolo codes with no ISO-639-1
 *    equivalent (brx, doi, kok, mai, mni, sat) drew a 400 and fell into the
 *    retry in `lib/integrations-openai-ai-server`, which drops the hint
 *    entirely. Those six ran on full auto-detect and nothing said so.
 *
 * 2. The prompt was English prose: "A language learner is speaking Hindi.
 *    Transcribe exactly what they say." The prompt is not an instruction, it
 *    is prior-context text, and OpenAI's doc for the field is explicit that
 *    it "should match the audio language". Eleven words of English in front
 *    of a one-second Devanagari clip outweigh the advisory language field.
 *    That is how the decoder ended up in Latin script, and from Latin script
 *    it is a short step to Hungarian.
 *
 * The chat path is the corroboration: its prompt (`buildTranscriptionPrompt`
 * in parrotChat.ts) has always seeded native-script words, and it has never
 * been reported drifting out of the learner's language.
 *
 * What replaces the English prose is an anchor in the language's OWN script,
 * taken from `languages.native_name`. It carries no phrase vocabulary, which
 * keeps the route's existing rule intact: the target phrase is deliberately
 * kept out of the prompt so the recogniser cannot be talked into hearing it.
 */

/**
 * ISO-639-1 codes the transcription API accepts, keyed by Bolo language code.
 *
 * Explicit rather than derived: `languages.code` holds ISO 639-1 where one
 * exists and 639-3 otherwise, and only the two-letter ones are accepted. The
 * six languages absent here (brx, doi, kok, mai, mni, sat) have no 639-1 code
 * at all, so they get no `language` field and lean on the script anchor.
 * `pa` is listed even though the transcribe models have been observed
 * rejecting it, because the retry that drops the hint is the right handling
 * for a code that IS correct and merely unsupported today.
 */
const ISO_639_1_BY_LANGUAGE_CODE: Record<string, string> = {
  as: "as", // Assamese
  bn: "bn", // Bengali
  gu: "gu", // Gujarati
  hi: "hi", // Hindi
  kn: "kn", // Kannada
  ks: "ks", // Kashmiri
  ml: "ml", // Malayalam
  mr: "mr", // Marathi
  ne: "ne", // Nepali
  or: "or", // Odia
  pa: "pa", // Punjabi
  sa: "sa", // Sanskrit
  sd: "sd", // Sindhi
  ta: "ta", // Tamil
  te: "te", // Telugu
  ur: "ur", // Urdu
};

/**
 * The ISO-639-1 code to send for a Bolo language code, or null when the
 * language has none. Null means "send no language field", never "send the
 * three-letter code and let the API reject it".
 */
export function sttLanguageCode(
  languageCode: string | null | undefined,
): string | null {
  if (!languageCode) return null;
  return ISO_639_1_BY_LANGUAGE_CODE[languageCode] ?? null;
}

/** Strips case, whitespace and punctuation so two strings compare as speech. */
function comparable(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

export interface SttPinning {
  /** ISO-639-1 code, omitted when the language has none. */
  language?: string;
  /** Native-script anchor, omitted when no native name is known. */
  prompt?: string;
}

/**
 * Builds the `language` + `prompt` pair for one transcription call.
 *
 * Both fields are omitted rather than guessed: a request with no resolved
 * language keeps the old auto-detect behaviour instead of being pinned to
 * something arbitrary.
 */
export function buildSttOptions(opts: {
  languageCode?: string | null;
  languageNativeName?: string | null;
}): SttPinning {
  const language = sttLanguageCode(opts.languageCode);
  const anchor = opts.languageNativeName?.trim();
  return {
    ...(language ? { language } : {}),
    ...(anchor ? { prompt: anchor } : {}),
  };
}

/**
 * Blanks a transcript that is only the anchor echoed back.
 *
 * Whisper returns its own prompt as the transcript when the clip holds no
 * speech; parrotChat.ts defends the chat path against the same thing. It
 * mattered less while the prompt was English, because a transcript of English
 * prose hit `script-mismatch-nocatch` and resolved to a system miss. A
 * native-script anchor would echo in the TARGET script, look like a real
 * reading, and be scored as the learner saying the wrong word, so the echo
 * has to be caught before scoring rather than after.
 */
export function discardAnchorEcho(
  transcript: string,
  anchor: string | undefined,
): string {
  if (!anchor) return transcript;
  return comparable(transcript) === comparable(anchor) ? "" : transcript;
}
