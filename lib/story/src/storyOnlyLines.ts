import type { StoryOnlyLines } from "./storyOnly";

/**
 * STORYBOOK-ONLY LINES: the data. REGION, and a fork replaces this whole map.
 *
 * One line per (language, concept) the storybook needs and the language's
 * lessons do not teach, served by GET /games/story/book only when the database
 * has no matching phrase row (see storyOnly.ts for why these are not lesson
 * rows, and why a database row always wins).
 *
 * EVERY LINE HERE IS UNREVIEWED UNTIL A SPEAKER CONFIRMS IT. They were written
 * by an agent with no translation tool and no speaker of each language to
 * hand, the same footing as the reading passages in
 * @workspace/script-trace/passages.ts, and they carry that file's convention:
 * a `confidence` saying how far to trust the draft, and `verified: false`.
 *
 * RULES FOR AN ENTRY, pinned by the story-only test:
 *   - the key is a concept exactly as a book names it (`bookConcepts`);
 *   - `english` is exactly that key, so it matches without any alias;
 *   - `nativeScript` is in the script the language's own seed rows use;
 *   - `romanized` follows that language's seed romanization style.
 *
 * RETIRE A LINE when a lesson row for the concept lands in that language
 * (the ledger's X114 note makes these words the journey 2 lesson backlog).
 * Until it is deleted it is simply never served.
 *
 * INDIA, 2026-09-16: 40 lines, one per (language, concept) gap left by the
 * seed census after the 2026-09-16 spelling aliases (2fb3ce92). Nothing for
 * bn, gu, hi, pa, sd, ta, te: their lessons already carry every concept.
 * Handoff: ~/bolo-supervisor/handoff-assets-2026-09-16/story-only-lines-india.md
 */
export const STORY_ONLY_LINES: StoryOnlyLines = {
  // Assamese
  as: {
    now: { nativeScript: "এতিয়া", romanized: "etiya", english: "now", confidence: "high", verified: false },
    yesterday: { nativeScript: "কালি", romanized: "kali", english: "yesterday", confidence: "high", verified: false },
  },
  // Bodo
  brx: {
    // the seed's own "grandchild" word, kept identical so lesson and story agree; both unreviewed.
    grandson: { nativeScript: "नोना", romanized: "nona", english: "grandson", confidence: "low", verified: false },
    "son-in-law": { nativeScript: "जामाइ", romanized: "jamai", english: "son-in-law", confidence: "low", verified: false },
  },
  // Dogri
  doi: {
    rice: { nativeScript: "चौल", romanized: "chaul", english: "rice", confidence: "medium", verified: false },
    "son-in-law": { nativeScript: "जवाई", romanized: "jawai", english: "son-in-law", confidence: "medium", verified: false },
  },
  // Kannada
  kn: {
    congratulations: { nativeScript: "ಅಭಿನಂದನೆಗಳು", romanized: "abhinandanegalu", english: "congratulations", confidence: "high", verified: false },
  },
  // Konkani
  kok: {
    // best attempt; Konkani in-law terms vary by region.
    "father-in-law": { nativeScript: "सासरो", romanized: "saasro", english: "father-in-law", confidence: "low", verified: false },
    "good news": { nativeScript: "खुशखबर", romanized: "khushkhabar", english: "good news", confidence: "high", verified: false },
    // best attempt; Konkani in-law terms vary by region.
    "mother-in-law": { nativeScript: "सासू", romanized: "saasu", english: "mother-in-law", confidence: "low", verified: false },
  },
  // Kashmiri
  ks: {
    // the seed's own "grandchild" word, kept identical so lesson and story agree; both unreviewed.
    grandson: { nativeScript: "پُوٗتو", romanized: "putoo", english: "grandson", confidence: "low", verified: false },
    "son-in-law": { nativeScript: "زامٕتُر", romanized: "zaamtur", english: "son-in-law", confidence: "medium", verified: false },
  },
  // Maithili
  mai: {
    "good news": { nativeScript: "शुभ समाचार", romanized: "shubh samaachaar", english: "good news", confidence: "medium", verified: false },
    // best attempt; everyday Maithili leave-taking may prefer another form.
    goodbye: { nativeScript: "विदा", romanized: "vida", english: "goodbye", confidence: "low", verified: false },
    grandson: { nativeScript: "पोता", romanized: "pota", english: "grandson", confidence: "medium", verified: false },
    monday: { nativeScript: "सोमदिन", romanized: "somdin", english: "monday", confidence: "medium", verified: false },
    saturday: { nativeScript: "शनिदिन", romanized: "shanidin", english: "saturday", confidence: "medium", verified: false },
    thursday: { nativeScript: "बृहस्पतिदिन", romanized: "brihaspatidin", english: "thursday", confidence: "medium", verified: false },
  },
  // Malayalam
  ml: {
    bowl: { nativeScript: "കിണ്ണം", romanized: "kinnam", english: "bowl", confidence: "medium", verified: false },
    "father-in-law": { nativeScript: "അമ്മായിയപ്പൻ", romanized: "ammaayiyappan", english: "father-in-law", confidence: "high", verified: false },
    "mother-in-law": { nativeScript: "അമ്മായിയമ്മ", romanized: "ammaayiyamma", english: "mother-in-law", confidence: "high", verified: false },
    saturday: { nativeScript: "ശനിയാഴ്ച", romanized: "shaniyaazhcha", english: "saturday", confidence: "high", verified: false },
    thursday: { nativeScript: "വ്യാഴാഴ്ച", romanized: "vyaazhaazhcha", english: "thursday", confidence: "high", verified: false },
  },
  // Manipuri (Meitei Mayek)
  mni: {
    // a first draft; Meitei in-law kinship terms were not checkable.
    "father-in-law": { nativeScript: "ꯈꯨꯔꯥ", romanized: "khura", english: "father-in-law", confidence: "low", verified: false },
    // a transliterated loanword, a first draft.
    fork: { nativeScript: "ꯐꯣꯔꯛ", romanized: "phorak", english: "fork", confidence: "low", verified: false },
    monday: { nativeScript: "ꯅꯤꯡꯊꯧꯀꯥꯕ", romanized: "ningthoukaba", english: "monday", confidence: "medium", verified: false },
    // a first draft; Meitei in-law kinship terms were not checkable.
    "mother-in-law": { nativeScript: "ꯏꯅꯦ", romanized: "ine", english: "mother-in-law", confidence: "low", verified: false },
    saturday: { nativeScript: "ꯊꯥꯡꯖ", romanized: "thangja", english: "saturday", confidence: "medium", verified: false },
    // "at that (place)", a first draft.
    there: { nativeScript: "ꯑꯗꯨꯗ", romanized: "aduda", english: "there", confidence: "low", verified: false },
    thursday: { nativeScript: "ꯁꯒꯣꯜꯁꯦꯟ", romanized: "sagolsen", english: "thursday", confidence: "medium", verified: false },
    // "please come", a first draft.
    welcome: { nativeScript: "ꯂꯥꯛꯄꯤꯌꯨ", romanized: "lakpiyu", english: "welcome", confidence: "low", verified: false },
  },
  // Marathi
  mr: {
    knife: { nativeScript: "सुरी", romanized: "suri", english: "knife", confidence: "high", verified: false },
    rice: { nativeScript: "भात", romanized: "bhaat", english: "rice", confidence: "high", verified: false },
  },
  // Nepali
  ne: {
    night: { nativeScript: "रात", romanized: "raat", english: "night", confidence: "high", verified: false },
  },
  // Odia
  or: {
    rice: { nativeScript: "ଭାତ", romanized: "bhaat", english: "rice", confidence: "high", verified: false },
  },
  // Sanskrit
  sa: {
    // a modern coinage on the "thorn" pattern Hindi and Marathi use for fork, a first draft.
    fork: { nativeScript: "कण्टकः", romanized: "kaṇṭakaḥ", english: "fork", confidence: "low", verified: false },
    goodbye: { nativeScript: "पुनर्दर्शनाय", romanized: "punardarśanāya", english: "goodbye", confidence: "medium", verified: false },
  },
  // Santali (Ol Chiki)
  sat: {
    // a transliterated loanword, a first draft.
    fork: { nativeScript: "ᱯᱷᱚᱨᱠ", romanized: "phork", english: "fork", confidence: "low", verified: false },
    // a first draft.
    "son-in-law": { nativeScript: "ᱡᱟᱣᱟᱭ", romanized: "jawae", english: "son-in-law", confidence: "low", verified: false },
  },
  // Urdu
  ur: {
    saturday: { nativeScript: "ہفتہ", romanized: "hafta", english: "saturday", confidence: "high", verified: false },
  },
};
