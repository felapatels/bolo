/**
 * Fixed greeting text played on the first Bolo chat turn.
 *
 * When the user finishes their very first recording the client immediately
 * injects this canned message (already cached as audio) so there is no
 * silent wait while STT → LLM → TTS completes. The real reply runs in the
 * background and plays right after the greeting finishes.
 */

/**
 * Version tag baked into the greeting audio cache key.
 * Bump this string whenever the greeting text changes so the stale cached
 * audio is automatically invalidated and re-synthesized.
 */
export const GREETING_CACHE_KEY_VERSION = "v4";

/**
 * Stable per-language cache key stored in tts_cache.
 * Uses a plain prefix + languageCode (not a SHA-256 hash) because the
 * greeting text is computed deterministically from the languageCode alone.
 */
export function greetingAudioCacheKey(languageCode: string): string {
  return `bolo-greeting-${GREETING_CACHE_KEY_VERSION}::${languageCode}`;
}

/**
 * Per-language native-script greeting map.
 *
 * Each entry carries:
 *   display — text shown in Bolo's chat bubble (with 🦜 emoji, no "Squawk!")
 *   tts     — text sent to the TTS synthesizer (emoji stripped for natural speech)
 *   english — English translation shown in small italic below the bubble
 *
 * Languages that are not listed fall back to the English greeting helpers below.
 * The squawk SFX is always played separately via the squawkVariant field.
 */
export const NATIVE_GREETING_MAP: Record<
  string,
  { display: string; tts: string; english: string }
> = {
  as: {
    display: "স্বাগতম! আপুনি মোৰ সৈতে ইংৰাজী বা অসমীয়াত কথা পাতিব পাৰে! 🦜",
    tts: "স্বাগতম! আপুনি মোৰ সৈতে ইংৰাজী বা অসমীয়াত কথা পাতিব পাৰে!",
    english: "Welcome! You can chat with me in English or Assamese!",
  },
  bn: {
    display: "নমস্কার! আপনি আমার সাথে ইংরেজি বা বাংলায় কথা বলতে পারেন! 🦜",
    tts: "নমস্কার! আপনি আমার সাথে ইংরেজি বা বাংলায় কথা বলতে পারেন!",
    english: "Hello! You can chat with me in English or Bengali!",
  },
  brx: {
    display: "नमस्ते! नंगौ मोनसे इंलिस आरो बड़ो फोरनि थाखाय बाथ्रा दोंफारे! 🦜",
    tts: "नमस्ते! नंगौ मोनसे इंलिस आरो बड़ो फोरनि थाखाय बाथ्रा दोंफारे!",
    english: "Hello! You can chat with me in English or Bodo!",
  },
  doi: {
    display: "नमस्ते! तुस मेरे कोल अंग्रेज़ी या डोगरी च गल्ल करी सकदे ओ! 🦜",
    tts: "नमस्ते! तुस मेरे कोल अंग्रेज़ी या डोगरी च गल्ल करी सकदे ओ!",
    english: "Hello! You can chat with me in English or Dogri!",
  },
  gu: {
    display: "નમસ્તે! તમે મારી સાથે અંગ્રેજી અથવા ગુજરાતીમાં વાત કરી શકો છો! 🦜",
    tts: "નમસ્તે! તમે મારી સાથે અંગ્રેજી અથવા ગુજરાતીમાં વાત કરી શકો છો!",
    english: "Hello! You can chat with me in English or Gujarati!",
  },
  hi: {
    display: "नमस्ते! आप मुझसे अंग्रेज़ी या हिंदी में बात कर सकते हैं! 🦜",
    tts: "नमस्ते! आप मुझसे अंग्रेज़ी या हिंदी में बात कर सकते हैं!",
    english: "Hello! You can chat with me in English or Hindi!",
  },
  kn: {
    display: "ನಮಸ್ಕಾರ! ನೀವು ನನ್ನೊಂದಿಗೆ ಇಂಗ್ಲಿಷ್ ಅಥವಾ ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡಬಹುದು! 🦜",
    tts: "ನಮಸ್ಕಾರ! ನೀವು ನನ್ನೊಂದಿಗೆ ಇಂಗ್ಲಿಷ್ ಅಥವಾ ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡಬಹುದು!",
    english: "Hello! You can chat with me in English or Kannada!",
  },
  ks: {
    display: "السلام علیکم! آپ مے ساتھ انگریزی یا کشمیری میں بات کر سکتے ہیں! 🦜",
    tts: "السلام علیکم! آپ مے ساتھ انگریزی یا کشمیری میں بات کر سکتے ہیں!",
    english: "Hello! You can chat with me in English or Kashmiri!",
  },
  kok: {
    display: "नमस्कार! तुमी म्हज्यासांगाता इंग्रजींत वा कोंकणींत उलोवपाक शकतात! 🦜",
    tts: "नमस्कार! तुमी म्हज्यासांगाता इंग्रजींत वा कोंकणींत उलोवपाक शकतात!",
    english: "Hello! You can chat with me in English or Konkani!",
  },
  mai: {
    display: "प्रणाम! अहाँ हमरासँ अंग्रेज़ी वा मैथिलीमें बात करय सकैत छी! 🦜",
    tts: "प्रणाम! अहाँ हमरासँ अंग्रेज़ी वा मैथिलीमें बात करय सकैत छी!",
    english: "Hello! You can chat with me in English or Maithili!",
  },
  ml: {
    display: "നമസ്കാരം! നിങ്ങൾക്ക് എന്നോട് ഇംഗ്ലീഷിലോ മലയാളത്തിലോ സംസാരിക്കാം! 🦜",
    tts: "നമസ്കാരം! നിങ്ങൾക്ക് എന്നോട് ഇംഗ്ലീഷിലോ മലയാളത്തിലോ സംസാരിക്കാം!",
    english: "Hello! You can chat with me in English or Malayalam!",
  },
  mni: {
    display: "ꯀꯨꯝꯖꯥ! ꯑꯩꯒꯤ ꯃꯇꯦꯡꯗꯥ ꯏꯟꯒ꯭ꯂꯤꯁ ꯅꯠꯠꯔꯒꯥ ꯃꯤꯇꯩ ꯂꯣꯟꯗꯥ ꯋꯥꯍꯩ ꯇꯧꯔꯤꯕꯤ! 🦜",
    tts: "ꯀꯨꯝꯖꯥ! ꯑꯩꯒꯤ ꯃꯇꯦꯡꯗꯥ ꯏꯟꯒ꯭ꯂꯤꯁ ꯅꯠꯠꯔꯒꯥ ꯃꯤꯇꯩ ꯂꯣꯟꯗꯥ ꯋꯥꯍꯩ ꯇꯧꯔꯤꯕꯤ!",
    english: "Hello! You can chat with me in English or Manipuri!",
  },
  mr: {
    display: "नमस्कार! तुम्ही माझ्याशी इंग्रजी किंवा मराठीत बोलू शकता! 🦜",
    tts: "नमस्कार! तुम्ही माझ्याशी इंग्रजी किंवा मराठीत बोलू शकता!",
    english: "Hello! You can chat with me in English or Marathi!",
  },
  ne: {
    display: "नमस्ते! तपाईं मसँग अंग्रेजी वा नेपालीमा कुरा गर्न सक्नुहुन्छ! 🦜",
    tts: "नमस्ते! तपाईं मसँग अंग्रेजी वा नेपालीमा कुरा गर्न सक्नुहुन्छ!",
    english: "Hello! You can chat with me in English or Nepali!",
  },
  or: {
    display: "ନମସ୍କାର! ଆପଣ ମୋ ସହ ଇଂରାଜୀ ବା ଓଡ଼ିଆରେ କଥା ହୋଇ ପାରିବେ! 🦜",
    tts: "ନମସ୍କାର! ଆପଣ ମୋ ସହ ଇଂରାଜୀ ବା ଓଡ଼ିଆରେ କଥା ହୋଇ ପାରିବେ!",
    english: "Hello! You can chat with me in English or Odia!",
  },
  pa: {
    display: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਤੁਸੀਂ ਮੇਰੇ ਨਾਲ ਅੰਗਰੇਜ਼ੀ ਜਾਂ ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰ ਸਕਦੇ ਹੋ! 🦜",
    tts: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਤੁਸੀਂ ਮੇਰੇ ਨਾਲ ਅੰਗਰੇਜ਼ੀ ਜਾਂ ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰ ਸਕਦੇ ਹੋ!",
    english: "Hello! You can chat with me in English or Punjabi!",
  },
  sa: {
    display: "नमस्ते! भवान् मया सह आङ्गलभाषायां संस्कृते वा संवदितुं शक्नोति! 🦜",
    tts: "नमस्ते! भवान् मया सह आङ्गलभाषायां संस्कृते वा संवदितुं शक्नोति!",
    english: "Hello! You can chat with me in English or Sanskrit!",
  },
  sat: {
    display: "ᱡᱚᱦᱟᱨ! ᱟᱯᱮ ᱤᱝᱞᱤᱥ ᱟᱨ ᱥᱟᱱᱛᱟᱲᱤ ᱨᱮ ᱟᱲᱟᱜ ᱦᱩᱭ ᱠᱟᱱᱟ! 🦜",
    tts: "ᱡᱚᱦᱟᱨ! ᱟᱯᱮ ᱤᱝᱞᱤᱥ ᱟᱨ ᱥᱟᱱᱛᱟᱲᱤ ᱨᱮ ᱟᱲᱟᱜ ᱦᱩᱭ ᱠᱟᱱᱟ!",
    english: "Hello! You can chat with me in English or Santali!",
  },
  sd: {
    display: "آداب! توهان منهنجي سان انگريزي يا سنڌيءَ ۾ ڳالهائي سگهو ٿا! 🦜",
    tts: "آداب! توهان منهنجي سان انگريزي يا سنڌيءَ ۾ ڳالهائي سگهو ٿا!",
    english: "Hello! You can chat with me in English or Sindhi!",
  },
  ta: {
    display: "வணக்கம்! நீங்கள் என்னிடம் ஆங்கிலத்திலோ தமிழிலோ பேசலாம்! 🦜",
    tts: "வணக்கம்! நீங்கள் என்னிடம் ஆங்கிலத்திலோ தமிழிலோ பேசலாம்!",
    english: "Hello! You can chat with me in English or Tamil!",
  },
  te: {
    display: "నమస్కారం! మీరు నాతో ఇంగ్లీష్‌లో లేదా తెలుగులో మాట్లాడవచ్చు! 🦜",
    tts: "నమస్కారం! మీరు నాతో ఇంగ్లీష్‌లో లేదా తెలుగులో మాట్లాడవచ్చు!",
    english: "Hello! You can chat with me in English or Telugu!",
  },
  ur: {
    display: "السلام علیکم! آپ مجھ سے انگریزی یا اردو میں بات کر سکتے ہیں! 🦜",
    tts: "السلام علیکم! آپ مجھ سے انگریزی یا اردو میں بات کر سکتے ہیں!",
    english: "Hello! You can chat with me in English or Urdu!",
  },
};

/**
 * Returns the greeting texts for the given language, preferring a native-script
 * entry from NATIVE_GREETING_MAP and falling back to the English versions.
 */
export function buildGreetingTexts(
  languageCode: string,
  languageName: string,
): { display: string; tts: string; english: string } {
  const native = NATIVE_GREETING_MAP[languageCode];
  if (native) return native;
  // English fallback
  return {
    display: buildGreetingDisplayText(languageName),
    tts: buildGreetingTtsText(languageName),
    english: "",
  };
}

/**
 * The full English greeting text shown in Bolo's bubble when no native-script
 * entry exists for the given language.
 * "Squawk!" is a bird-sound placeholder that clients replace with a squawk SFX;
 * the emoji is kept for display but stripped before TTS synthesis.
 */
export function buildGreetingDisplayText(languageName: string): string {
  return `Hi! I'm Bolo, your language coach! Squawk! You can chat with me in English or ${languageName}! 🦜`;
}

/**
 * The English text actually passed to the TTS synthesizer — Squawk! and emoji
 * removed so the voice speaks naturally.
 */
export function buildGreetingTtsText(languageName: string): string {
  return `Hi! I'm Bolo, your language coach! You can chat with me in English or ${languageName}!`;
}

/**
 * The squawk SFX variant used for the greeting (always the same so the
 * welcome chirp is consistent rather than randomized per session).
 */
export const GREETING_SQUAWK_VARIANT: 0 | 1 | 2 = 0;
