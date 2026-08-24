// Reading passages for native-speaker reference audio.
//
// WHY A PASSAGE AND NOT A WORD LIST. A list of thirteen nouns gives you thirteen
// citation forms, each said in isolation with the same flat intonation. What
// pronunciation scoring needs is connected speech: the way a vowel shortens
// before a cluster, where a speaker breathes, what a question does to the end of
// a phrase. One paragraph read aloud carries all of that and takes less of a
// contributor's time than a list does.
//
// WHY EVERY PASSAGE SAYS THE SAME THING. A cold morning, an offer of tea, and a
// five-minute wait. Holding the meaning constant means a reviewer who reads two
// of these can compare them, a contributor always knows what they are saying,
// and the sounds each one exercises are the same sounds.
//
// WHOSE VOICE IT IS, corrected 2026-08-23 after the first native speaker read
// it. The original described a little girl picking up a cup of tea and drinking
// it slowly, and her verdict was that it made no sense: a small child is not who
// drinks chai and offers it, a grandmother is. She was right, and it is exactly
// the class of error the drafting process cannot catch, because the sentences
// were grammatical and the words were real. The passage is now a grandmother
// speaking to the person reading it, which is also the register these
// contributors will read most naturally.
//
// WHERE THESE CAME FROM, stated plainly because it matters. They were written
// here, not produced by a translation service and not by a speaker of each
// language. For Hindi, Gujarati, Urdu, Punjabi and Bengali that is a reasonable
// basis. For Santali and Meetei it is a first draft that deserves suspicion.
// `confidence` records which is which, and nothing here is presented to a
// contributor as correct: the page asks them to confirm the text reads properly
// BEFORE they record, and stores their answer. That turns the weakest part of
// this file into the thing it is easiest to fix.

import type { ScriptId } from "./scripts";

/**
 * How much the drafted text should be trusted before a speaker confirms it.
 *
 * - `high`   idiomatic and structurally checked; expect small edits at most.
 * - `medium` plausible and grammatical as far as can be told; expect edits.
 * - `low`    a genuine first draft in a language with few speakers to hand.
 *            Treat a `low` passage as a question, not as content.
 */
export type PassageConfidence = "high" | "medium" | "low";

export type ReadingPassage = {
  /** Stable id, stored with every recording so audio stays interpretable. */
  id: string;
  /** The language this is actually written in, not just its script. */
  language: string;
  /** What the contributor reads aloud. */
  text: string;
  /** The same meaning in English, so they know what they are saying. */
  gloss: string;
  confidence: PassageConfidence;
  /** A speaker has confirmed the wording. Flipped by hand, never by a script. */
  verified: boolean;
};

/**
 * The English the passages all render.
 *
 * Kept as its own constant so a new language is a translation of a fixed thing
 * rather than a fresh invention, and so a reviewer can see the target.
 */
export const PASSAGE_GLOSS =
  "It was very cold outside this morning. Come, sit down, I have made tea. " +
  "Drink it slowly, while it is hot. Will you eat something too? " +
  "The food will be ready in five minutes.";

export const READING_PASSAGES: Record<ScriptId, ReadingPassage> = {
  devanagari: {
    id: "passage-hi-1",
    language: "Hindi",
    text:
      "आज सुबह बाहर बहुत ठंड थी। आ, बैठ, मैंने चाय बनाई है। धीरे-धीरे पी, जब तक गरम है। " +
      "कुछ खाएगा भी? पाँच मिनट में खाना तैयार हो जाएगा।",
    gloss: PASSAGE_GLOSS,
    confidence: "high",
    // VERIFIED 2026-08-24 by Bharti, a Hindi speaker, through the public page.
    //
    // THE EVIDENCE IS passage_feedback ROW 7 IN PRODUCTION: reads_well = true,
    // and its stored passage_text is byte-identical to the text above. Same
    // 129 characters, same sha256 prefix 1d123f83. Comparing the stored text
    // rather than counting the answer is the whole reason that column exists.
    //
    // IT IS ALSO WHAT SEPARATES THIS FROM GUJARATI. Row 5 is a "yes" from the
    // same person, but the text stored beside it is the old little-girl
    // wording she then complained about, so it says nothing about what ships
    // now. Gujarati stays false until she reads the current passage.
    //
    // AND A COUNT OF "YES" ANSWERS IS NOT EVIDENCE. Three of the five rows in
    // that table are probes which stored a ONE-CHARACTER passage, and nothing
    // in the codebase filters them out: isTestContributor() is only ever
    // called on trace payloads, through compareContributions(). This table is
    // read by hand or not at all.
    verified: true,
  },
  gujarati: {
    id: "passage-gu-1",
    language: "Gujarati",
    text:
      "આજે સવારે બહાર બહુ ઠંડી હતી. આવ, બેસ, મેં ચા બનાવી છે. ધીમે ધીમે પી, ગરમ છે ત્યાં સુધી. " +
      "કંઈક ખાઈશ પણ? પાંચ મિનિટમાં જમવાનું તૈયાર થઈ જશે.",
    gloss: PASSAGE_GLOSS,
    confidence: "high",
    verified: false,
  },
  "perso-arabic": {
    id: "passage-ur-1",
    language: "Urdu",
    text:
      "آج صبح باہر بہت ٹھنڈ تھی۔ آ، بیٹھ، میں نے چائے بنائی ہے۔ دھیرے دھیرے پی، جب تک گرم ہے۔ " +
      "کچھ کھائے گا بھی؟ پانچ منٹ میں کھانا تیار ہو جائے گا۔",
    gloss: PASSAGE_GLOSS,
    confidence: "high",
    verified: false,
  },
  gurmukhi: {
    id: "passage-pa-1",
    language: "Punjabi",
    text:
      "ਅੱਜ ਸਵੇਰੇ ਬਾਹਰ ਬਹੁਤ ਠੰਢ ਸੀ। ਆ, ਬੈਠ, ਮੈਂ ਚਾਹ ਬਣਾਈ ਹੈ। ਹੌਲੀ ਹੌਲੀ ਪੀ, ਜਦ ਤੱਕ ਗਰਮ ਹੈ। " +
      "ਕੁਝ ਖਾਏਂਗਾ ਵੀ? ਪੰਜ ਮਿੰਟਾਂ ਵਿੱਚ ਖਾਣਾ ਤਿਆਰ ਹੋ ਜਾਵੇਗਾ।",
    gloss: PASSAGE_GLOSS,
    confidence: "high",
    verified: false,
  },
  bengali: {
    id: "passage-bn-1",
    language: "Bengali",
    text:
      "আজ সকালে বাইরে খুব ঠান্ডা ছিল। আয়, বোস, আমি চা বানিয়েছি। ধীরে ধীরে খা, যতক্ষণ গরম আছে। " +
      "কিছু খাবি নাকি? পাঁচ মিনিটের মধ্যে খাবার তৈরি হয়ে যাবে।",
    gloss: PASSAGE_GLOSS,
    confidence: "high",
    verified: false,
  },
  tamil: {
    id: "passage-ta-1",
    language: "Tamil",
    text:
      "இன்று காலை வெளியே மிகவும் குளிராக இருந்தது. வா, உட்கார், நான் தேநீர் போட்டிருக்கிறேன். " +
      "சூடாக இருக்கும்போதே மெதுவாகக் குடி. ஏதாவது சாப்பிடுகிறாயா? " +
      "ஐந்து நிமிடங்களில் சாப்பாடு தயாராகிவிடும்.",
    gloss: PASSAGE_GLOSS,
    confidence: "medium",
    verified: false,
  },
  telugu: {
    id: "passage-te-1",
    language: "Telugu",
    text:
      "ఈ ఉదయం బయట చాలా చలిగా ఉంది. రా, కూర్చో, నేను టీ చేశాను. వేడిగా ఉన్నప్పుడే మెల్లగా తాగు. " +
      "ఏమైనా తింటావా? ఐదు నిమిషాల్లో భోజనం సిద్ధమవుతుంది.",
    gloss: PASSAGE_GLOSS,
    confidence: "medium",
    verified: false,
  },
  kannada: {
    id: "passage-kn-1",
    language: "Kannada",
    text:
      "ಇಂದು ಬೆಳಿಗ್ಗೆ ಹೊರಗೆ ತುಂಬಾ ಚಳಿಯಿತ್ತು. ಬಾ, ಕುಳಿತುಕೋ, ನಾನು ಚಹಾ ಮಾಡಿದ್ದೇನೆ. " +
      "ಬಿಸಿಯಾಗಿರುವಾಗಲೇ ನಿಧಾನವಾಗಿ ಕುಡಿ. ಏನಾದರೂ ತಿನ್ನುತ್ತೀಯಾ? " +
      "ಐದು ನಿಮಿಷಗಳಲ್ಲಿ ಊಟ ಸಿದ್ಧವಾಗುತ್ತದೆ.",
    gloss: PASSAGE_GLOSS,
    confidence: "medium",
    verified: false,
  },
  malayalam: {
    id: "passage-ml-1",
    language: "Malayalam",
    text:
      "ഇന്ന് രാവിലെ പുറത്ത് വളരെ തണുപ്പായിരുന്നു. വാ, ഇരിക്ക്, ഞാൻ ചായ ഉണ്ടാക്കിയിട്ടുണ്ട്. " +
      "ചൂടുള്ളപ്പോൾ തന്നെ പതുക്കെ കുടിക്ക്. വല്ലതും കഴിക്കുന്നോ? " +
      "അഞ്ച് മിനിറ്റിനുള്ളിൽ ഭക്ഷണം തയ്യാറാകും.",
    gloss: PASSAGE_GLOSS,
    confidence: "medium",
    verified: false,
  },
  odia: {
    id: "passage-or-1",
    language: "Odia",
    text:
      "ଆଜି ସକାଳେ ବାହାରେ ବହୁତ ଥଣ୍ଡା ଥିଲା। ଆସ, ବସ, ମୁଁ ଚା ବନାଇଛି। ଗରମ ଥିବା ବେଳେ ଧୀରେ ଧୀରେ ପିଅ। " +
      "କିଛି ଖାଇବ କି? ପାଞ୍ଚ ମିନିଟ ମଧ୍ୟରେ ଖାଦ୍ୟ ପ୍ରସ୍ତୁତ ହୋଇଯିବ।",
    gloss: PASSAGE_GLOSS,
    confidence: "medium",
    verified: false,
  },
  "ol-chiki": {
    id: "passage-sat-1",
    language: "Santali",
    text:
      "ᱛᱮᱦᱮᱸ ᱥᱮᱛᱟᱜ ᱵᱟᱦᱨᱮ ᱯᱩᱨᱟᱹ ᱨᱟᱵᱟᱝ ᱛᱟᱦᱮᱸᱠᱟᱱᱟ᱾ ᱦᱮᱡ ᱢᱮ, ᱫᱩᱲᱩᱵ ᱢᱮ, ᱤᱧ ᱪᱟᱭ ᱛᱮᱭᱟᱨ ᱠᱮᱫᱟᱹ᱾ " +
      "ᱟᱞᱜᱟ ᱟᱞᱜᱟ ᱧᱩ ᱢᱮ᱾ ᱡᱚᱢ ᱦᱚᱸ ᱡᱚᱢ ᱢᱮᱭᱟᱢ ᱥᱮ? " +
      "ᱢᱚᱬᱮ ᱢᱤᱱᱤᱴ ᱨᱮ ᱡᱚᱢᱟᱜ ᱛᱮᱭᱟᱨ ᱦᱩᱭᱩᱜᱼᱟ᱾",
    gloss: PASSAGE_GLOSS,
    confidence: "low",
    verified: false,
  },
  meitei: {
    id: "passage-mni-1",
    language: "Meitei (Manipuri)",
    text:
      "ꯉꯁꯤ ꯑꯌꯨꯛ ꯃꯄꯥꯟꯗ ꯌꯥꯝꯅ ꯏꯡꯅꯈꯤ꯫ ꯂꯥꯛꯎ, ꯐꯝꯃꯨ, ꯑꯩꯅ ꯆꯥ ꯊꯣꯡꯂꯦ꯫ " +
      "ꯁꯥꯡꯗ꯭ꯔꯤꯉꯩꯗ ꯇꯞꯅ ꯇꯞꯅ ꯊꯛꯎ꯫ ꯀꯔꯤꯒꯨꯝꯕ ꯑꯃ ꯆꯥꯒꯅꯤꯕ꯭ꯔꯥ? " +
      "ꯃꯤꯅꯤꯠ ꯃꯉꯥꯒꯤ ꯃꯅꯨꯡꯗ ꯆꯥꯅꯕ ꯁꯦꯝ ꯁꯥꯔꯒꯅꯤ꯫",
    gloss: PASSAGE_GLOSS,
    confidence: "low",
    verified: false,
  },
};

/** The passage for a script. Every script has one. */
export function passageFor(script: ScriptId): ReadingPassage {
  return READING_PASSAGES[script];
}

/** Passages a speaker has confirmed, for when only checked text will do. */
export function verifiedPassages(): { script: ScriptId; passage: ReadingPassage }[] {
  return (Object.entries(READING_PASSAGES) as [ScriptId, ReadingPassage][])
    .filter(([, p]) => p.verified)
    .map(([script, passage]) => ({ script, passage }));
}
