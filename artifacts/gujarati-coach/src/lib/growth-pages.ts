export const GROWTH_PAGES = {
  gujarati: {
    headline: 'Learn Gujarati without making it feel like homework.',
    intro: 'Short lessons, speaking practice and a journey through India. Bring Gujarati into the conversations that matter to you.',
    audience: 'For you. For your children. For family.',
    connectionTitle: 'Keep the language in the family.',
    connection: 'A greeting at the door. A question at the dinner table. A little more to say on the next family call. Whether you are learning for yourself or alongside your children, start bringing Gujarati into everyday life.',
    promise: 'A little Gujarati, a little closer.',
  },
  punjabi: {
    headline: 'You understand Punjabi. Now learn to speak it.',
    intro: 'Turn familiar words into words you can say out loud. Practise Punjabi one phrase at a time, with Bolo by your side.',
    audience: 'For the conversations you want to join.',
    connectionTitle: 'Have more to say than “yeah.”',
    connection: 'You know the feeling: the conversation flows in Punjabi, but your answer comes out in English. Start with a greeting, practise a reply, and build a little more confidence for the people you love.',
    promise: 'Your next conversation starts here.',
  },
  hindi: {
    headline: 'Turn the Hindi you recognize into Hindi you can actually use.',
    intro: 'Reconnect with the Hindi you grew up around. Hear a phrase, say it out loud and keep moving through a language-learning adventure.',
    audience: 'For the language that sounds like home.',
    connectionTitle: 'Bring familiar words back into your day.',
    connection: 'The Hindi you heard at home can become part of your own conversations. Start small, practise everyday phrases and make room for a little more connection with family and friends.',
    promise: 'Reconnect, one phrase at a time.',
  },
} as const;

export type GrowthLanguage = keyof typeof GROWTH_PAGES;

// Carry campaign tags through the existing account flow without accepting a
// visitor-supplied redirect destination or changing their account preferences.
export function growthSignupHref(search: string): string {
  const incoming = new URLSearchParams(search);
  const params = new URLSearchParams({ redirect_url: '/choose-language' });
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = incoming.get(key);
    if (value) params.set(key, value.slice(0, 200));
  }
  return `/sign-up?${params.toString()}`;
}
