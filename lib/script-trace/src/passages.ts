// Reading passages for native-speaker reference audio.
//
// WHY A PASSAGE AND NOT A WORD LIST. A list of thirteen nouns gives you thirteen
// citation forms, each said in isolation with the same flat intonation. What
// pronunciation scoring needs is connected speech: the way a vowel shortens
// before a cluster, where a speaker breathes, what a question does to the end of
// a phrase. One paragraph read aloud carries all of that and takes less of a
// contributor's time than a list does.
//
// WHY EVERY PASSAGE SAYS THE SAME THING. One cold morning, a girl with a cup of
// tea, an offer, and a five-minute wait. Holding the meaning constant means a
// reviewer who reads two of these can compare them, a contributor always knows
// what they are saying, and the sounds each one exercises are the same sounds.
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
  "This morning it was very cold outside the house. The little girl picked up " +
  "her cup of tea and drank it slowly. Would you like a cup of tea too? " +
  "Dinner will be ready in five minutes.";

export const READING_PASSAGES: Record<ScriptId, ReadingPassage> = {
  devanagari: {
    id: "passage-hi-1",
    language: "Hindi",
    text:
      "आज सुबह घर के बाहर बहुत ठंड थी। छोटी लड़की ने चाय का प्याला उठाया, और धीरे-धीरे पीने लगी। " +
      "क्या तुम भी एक कप चाय लोगे? पाँच मिनट में खाना तैयार हो जाएगा।",
    gloss: PASSAGE_GLOSS,
    confidence: "high",
    verified: false,
  },
  gujarati: {
    id: "passage-gu-1",
    language: "Gujarati",
    text:
      "આજે સવારે ઘરની બહાર બહુ ઠંડી હતી. નાની છોકરીએ ચાનો પ્યાલો ઉઠાવ્યો, અને ધીમે ધીમે પીવા લાગી. " +
      "શું તમે પણ એક કપ ચા લેશો? પાંચ મિનિટમાં જમવાનું તૈયાર થઈ જશે.",
    gloss: PASSAGE_GLOSS,
    confidence: "high",
    verified: false,
  },
  "perso-arabic": {
    id: "passage-ur-1",
    language: "Urdu",
    text:
      "آج صبح گھر کے باہر بہت ٹھنڈ تھی۔ چھوٹی لڑکی نے چائے کا پیالہ اٹھایا، اور دھیرے دھیرے پینے لگی۔ " +
      "کیا تم بھی ایک کپ چائے لو گے؟ پانچ منٹ میں کھانا تیار ہو جائے گا۔",
    gloss: PASSAGE_GLOSS,
    confidence: "high",
    verified: false,
  },
  gurmukhi: {
    id: "passage-pa-1",
    language: "Punjabi",
    text:
      "ਅੱਜ ਸਵੇਰੇ ਘਰ ਤੋਂ ਬਾਹਰ ਬਹੁਤ ਠੰਢ ਸੀ। ਛੋਟੀ ਕੁੜੀ ਨੇ ਚਾਹ ਦਾ ਪਿਆਲਾ ਚੁੱਕਿਆ, ਅਤੇ ਹੌਲੀ ਹੌਲੀ ਪੀਣ ਲੱਗੀ। " +
      "ਕੀ ਤੁਸੀਂ ਵੀ ਇੱਕ ਕੱਪ ਚਾਹ ਲਵੋਗੇ? ਪੰਜ ਮਿੰਟਾਂ ਵਿੱਚ ਖਾਣਾ ਤਿਆਰ ਹੋ ਜਾਵੇਗਾ।",
    gloss: PASSAGE_GLOSS,
    confidence: "high",
    verified: false,
  },
  bengali: {
    id: "passage-bn-1",
    language: "Bengali",
    text:
      "আজ সকালে ঘরের বাইরে খুব ঠান্ডা ছিল। ছোট মেয়েটি চায়ের কাপ তুলে নিল, আর ধীরে ধীরে খেতে লাগল। " +
      "তুমিও কি এক কাপ চা নেবে? পাঁচ মিনিটের মধ্যে খাবার তৈরি হয়ে যাবে।",
    gloss: PASSAGE_GLOSS,
    confidence: "high",
    verified: false,
  },
  tamil: {
    id: "passage-ta-1",
    language: "Tamil",
    text:
      "இன்று காலை வீட்டுக்கு வெளியே மிகவும் குளிராக இருந்தது. சிறுமி தேநீர் கோப்பையை எடுத்தாள், " +
      "மெதுவாகக் குடிக்கத் தொடங்கினாள். நீங்களும் ஒரு கப் தேநீர் அருந்துவீர்களா? " +
      "ஐந்து நிமிடங்களில் சாப்பாடு தயாராகிவிடும்.",
    gloss: PASSAGE_GLOSS,
    confidence: "medium",
    verified: false,
  },
  telugu: {
    id: "passage-te-1",
    language: "Telugu",
    text:
      "ఈ ఉదయం ఇంటి బయట చాలా చలిగా ఉంది. చిన్న అమ్మాయి టీ కప్పు తీసుకుంది, మెల్లగా తాగడం మొదలుపెట్టింది. " +
      "మీరు కూడా ఒక కప్పు టీ తీసుకుంటారా? ఐదు నిమిషాల్లో భోజనం సిద్ధమవుతుంది.",
    gloss: PASSAGE_GLOSS,
    confidence: "medium",
    verified: false,
  },
  kannada: {
    id: "passage-kn-1",
    language: "Kannada",
    text:
      "ಇಂದು ಬೆಳಿಗ್ಗೆ ಮನೆಯ ಹೊರಗೆ ತುಂಬಾ ಚಳಿಯಿತ್ತು. ಚಿಕ್ಕ ಹುಡುಗಿ ಚಹಾದ ಲೋಟವನ್ನು ಎತ್ತಿಕೊಂಡಳು, " +
      "ಮತ್ತು ನಿಧಾನವಾಗಿ ಕುಡಿಯಲು ಪ್ರಾರಂಭಿಸಿದಳು. ನೀವೂ ಒಂದು ಕಪ್ ಚಹಾ ತೆಗೆದುಕೊಳ್ಳುತ್ತೀರಾ? " +
      "ಐದು ನಿಮಿಷಗಳಲ್ಲಿ ಊಟ ಸಿದ್ಧವಾಗುತ್ತದೆ.",
    gloss: PASSAGE_GLOSS,
    confidence: "medium",
    verified: false,
  },
  malayalam: {
    id: "passage-ml-1",
    language: "Malayalam",
    text:
      "ഇന്ന് രാവിലെ വീടിന് പുറത്ത് വളരെ തണുപ്പായിരുന്നു. കൊച്ചു പെൺകുട്ടി ചായക്കപ്പ് എടുത്തു, " +
      "പതുക്കെ കുടിക്കാൻ തുടങ്ങി. നിങ്ങളും ഒരു കപ്പ് ചായ കുടിക്കുന്നോ? " +
      "അഞ്ച് മിനിറ്റിനുള്ളിൽ ഭക്ഷണം തയ്യാറാകും.",
    gloss: PASSAGE_GLOSS,
    confidence: "medium",
    verified: false,
  },
  odia: {
    id: "passage-or-1",
    language: "Odia",
    text:
      "ଆଜି ସକାଳେ ଘର ବାହାରେ ବହୁତ ଥଣ୍ଡା ଥିଲା। ଛୋଟ ଝିଅଟି ଚା କପ ଉଠାଇଲା, ଏବଂ ଧୀରେ ଧୀରେ ପିଇବାକୁ ଲାଗିଲା। " +
      "ତୁମେ ମଧ୍ୟ ଏକ କପ ଚା ନେବ କି? ପାଞ୍ଚ ମିନିଟ ମଧ୍ୟରେ ଖାଦ୍ୟ ପ୍ରସ୍ତୁତ ହୋଇଯିବ।",
    gloss: PASSAGE_GLOSS,
    confidence: "medium",
    verified: false,
  },
  "ol-chiki": {
    id: "passage-sat-1",
    language: "Santali",
    text:
      "ᱛᱮᱦᱮᱸ ᱥᱮᱛᱟᱜ ᱚᱲᱟᱜ ᱵᱟᱦᱨᱮ ᱯᱩᱨᱟᱹ ᱨᱟᱵᱟᱝ ᱛᱟᱦᱮᱸᱠᱟᱱᱟ᱾ ᱩᱠᱩ ᱠᱩᱲᱤ ᱫᱚ ᱪᱟᱭ ᱠᱟᱯ ᱟᱹᱜᱩ ᱠᱮᱫᱟᱭ, " +
      "ᱟᱨ ᱟᱞᱜᱟ ᱟᱞᱜᱟ ᱧᱩ ᱮᱦᱚᱵ ᱠᱮᱫᱟᱭ᱾ ᱟᱢ ᱦᱚᱸ ᱢᱤᱫ ᱠᱟᱯ ᱪᱟᱭ ᱤᱫᱤ ᱢᱮᱭᱟᱢ ᱥᱮ? " +
      "ᱢᱚᱬᱮ ᱢᱤᱱᱤᱴ ᱨᱮ ᱡᱚᱢᱟᱜ ᱛᱮᱭᱟᱨ ᱦᱩᱭᱩᱜᱼᱟ᱾",
    gloss: PASSAGE_GLOSS,
    confidence: "low",
    verified: false,
  },
  meitei: {
    id: "passage-mni-1",
    language: "Meitei (Manipuri)",
    text:
      "ꯉꯁꯤ ꯑꯌꯨꯛ ꯌꯨꯝꯒꯤ ꯃꯄꯥꯟꯗ ꯌꯥꯝꯅ ꯏꯡꯅꯈꯤ꯫ ꯑꯉꯥꯡ ꯅꯨꯄꯤꯃꯆꯥ ꯑꯗꯨꯅ ꯆꯥꯒꯤ ꯀꯞ ꯑꯗꯨ ꯂꯧꯈꯤ, " +
      "ꯑꯃꯁꯨꯡ ꯇꯞꯅ ꯇꯞꯅ ꯊꯛꯂꯝꯃꯤ꯫ ꯅꯪꯅꯁꯨ ꯆꯥ ꯀꯞ ꯑꯃ ꯊꯛꯀꯗ꯭ꯔꯥ? " +
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
