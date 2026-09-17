import { useUser } from '@clerk/react';
import { LanguagePage } from './learn-language';
import { languagePageBySlug } from '@/lib/languagePages';
import type { GrowthLanguage } from '@/lib/growth-pages';

export default function GrowthLanguagePage({ slug }: { slug: GrowthLanguage }) {
  const { isSignedIn } = useUser();
  return <LanguagePage lang={languagePageBySlug(slug)!} signedIn={isSignedIn} />;
}
