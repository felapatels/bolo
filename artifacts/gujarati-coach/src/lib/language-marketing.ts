// Regional marketing copy. Native phrases come from languagePages.ts.
export const LANGUAGE_MARKETING = {
  "region": "South Asia",
  "screenshot": "hero/home.webp",
  "screenshotLanguage": "Hindi",
  "journey": "railway journey",
  "introductions": {
    "assamese": "Make room for Assamese in your everyday conversations, starting with a greeting you can say with confidence.",
    "bengali": "Bring Bengali from familiar sounds into words of your own, one short conversation at a time.",
    "bodo": "Give Bodo a regular place in your day. Begin with a few useful phrases and return to them out loud.",
    "dogri": "Start a Dogri conversation with something small: a greeting, an introduction, a moment of connection.",
    "gujarati": "A little Gujarati, a little closer. Build the confidence to join family conversations instead of sitting them out.",
    "hindi": "Turn the Hindi you recognize into Hindi you can say. Start with everyday phrases and practice at your own pace.",
    "kannada": "Build a Kannada speaking habit around the little exchanges that make a day feel more connected.",
    "kashmiri": "Make your first Kashmiri words a beginning, then build toward the conversations you want to share.",
    "konkani": "Practice Konkani for the moments that matter to you, from a warm hello to a longer conversation.",
    "maithili": "Find your voice in Maithili with short phrases you can repeat, remember, and use again.",
    "malayalam": "Move from listening to Malayalam to joining in. Give yourself a small, manageable speaking goal.",
    "manipuri": "Begin speaking Manipuri with a few everyday phrases, then make practice part of your routine.",
    "marathi": "Make your next Marathi conversation feel a little less distant. Start with a phrase you will want to use.",
    "nepali": "Practice a Nepali greeting today and an introduction next. Small exchanges are a useful place to begin.",
    "odia": "Build a connection to Odia through your own voice, with a little practice you can come back to each day.",
    "punjabi": "You understand it. Now practice saying it. Make space for your own voice in Punjabi family conversations.",
    "sanskrit": "Take Sanskrit off the page and practice saying it aloud. Start with short examples before longer phrases.",
    "santali": "Give yourself a place to practice Santali, beginning with a few words and a repeatable daily habit.",
    "sindhi": "Bring Sindhi into the conversations you want to have. A short greeting can be your first step.",
    "tamil": "Start saying the Tamil you have been meaning to learn. Practice useful phrases before trying a longer exchange.",
    "telugu": "Build confidence in Telugu one everyday phrase at a time, from your first hello to the next reply.",
    "urdu": "Hear Urdu, follow the words, and try them out loud. Begin with simple exchanges you can practice again tomorrow."
  }
} as const;

export function languagePageHref(slug: string) {
  return `/languages/${slug}.html`;
}

export function languageSignupHref(search = '') {
  const incoming = new URLSearchParams(search);
  const params = new URLSearchParams({ redirect_url: '/choose-language' });
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = incoming.get(key);
    if (value) params.set(key, value.slice(0, 200));
  }
  return `/sign-up?${params}`;
}
