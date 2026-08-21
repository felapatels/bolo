import { useEffect } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowRight, Mic, Volume2, GraduationCap } from 'lucide-react';
import { Mascot } from '@/components/mascot';
import { useDocumentHead } from '@/lib/seo';
import { languagePageBySlug, type LanguagePageEntry } from '@/lib/languagePages';
import { track, ANALYTICS_EVENTS } from '@/lib/analytics';
import NotFound from '@/pages/not-found';

// Public per-language marketing page: /languages/<slug> for all 22 languages.
//
// Mechanism: client-rendered SPA route (no SSR). All content, including the
// 2-3 sample phrases with romanization, comes from the committed build-time
// data in src/lib/languagePages.ts, which is extracted from the canonical
// language catalog and the committed FREE starter curated lessons (see that
// file's header for the sync mechanism). Zero API calls, no auth, and no
// app-bundle weight beyond this small chunk.

export default function LearnLanguage() {
  const { slug } = useParams<{ slug: string }>();
  const lang = slug ? languagePageBySlug(slug) : undefined;

  if (!lang) return <NotFound />;
  return <LanguagePage lang={lang} />;
}

function LanguagePage({ lang }: { lang: LanguagePageEntry }) {
  useDocumentHead({
    title: `Learn to speak ${lang.name} | Bolo!`,
    description: `Actually speak ${lang.name} out loud. Bolo! coaches your pronunciation phrase by phrase, from your first ${lang.name} greeting to real conversations. Free to start.`,
    canonicalPath: `/languages/${lang.slug}`,
  });

  useEffect(() => {
    track(ANALYTICS_EVENTS.PER_LANGUAGE_PAGE_VIEW, { language: lang.name });
  }, [lang.name]);

  const nativeStyle = { fontFamily: `'${lang.fontFamily}', sans-serif` };
  const dir = lang.rtl ? ('rtl' as const) : ('ltr' as const);
  const trackSignup = () => {
    track(ANALYTICS_EVENTS.CTA_CLICK, { placement: 'per-language-cta' });
    track(ANALYTICS_EVENTS.SIGNUP_STARTED, { source: 'per-language-cta' });
  };

  return (
    <div className="app-surface min-h-[100dvh] bg-background overflow-x-hidden">
      <header className="px-6 pt-8 flex items-center justify-between max-w-4xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <Mascot pose="wave" size={36} idle="none" />
          <span className="text-2xl font-black text-foreground tracking-tight">Bolo!</span>
        </Link>
        <Link
          href="/sign-in"
          className="font-bold text-foreground/80 hover:text-foreground px-4 py-2 rounded-xl transition-colors"
        >
          Sign in
        </Link>
      </header>

      <main className="px-6 max-w-4xl mx-auto pb-16">
        <section className="pt-12 pb-10 text-center">
          <p
            className="text-5xl sm:text-6xl font-bold text-primary mb-4 leading-normal"
            style={nativeStyle}
            dir={dir}
            lang={lang.code}
          >
            {lang.nativeName}
          </p>
          <h1 className="text-4xl sm:text-5xl font-black text-foreground tracking-tight leading-tight">
            Actually speak {lang.name}.
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground font-medium mt-5 max-w-2xl mx-auto">
            Bolo! is speaking-first: you say every {lang.name} phrase out loud
            and get coached on the spot. No silent tile-tapping, just your
            voice getting better phrase by phrase.
          </p>
          <Link
            href="/sign-up"
            onClick={trackSignup}
            className="mt-8 inline-flex bg-primary text-primary-foreground font-black text-lg py-4 px-8 rounded-2xl items-center justify-center gap-3 shadow-[0_8px_0_hsl(var(--primary-shadow))] active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
          >
            Start speaking {lang.name} free
            <ArrowRight className="w-5 h-5" />
          </Link>
        </section>

        <section aria-labelledby="sample-phrases" className="py-8">
          <h2
            id="sample-phrases"
            className="text-2xl sm:text-3xl font-black text-foreground tracking-tight text-center mb-6"
          >
            Your first {lang.name} phrases
          </h2>
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl mx-auto">
            {lang.phrases.map((p) => (
              <div key={p.nativeScript} className="glass-card rounded-3xl p-6 text-center">
                <p
                  className="text-2xl font-bold text-foreground leading-normal"
                  style={nativeStyle}
                  dir={dir}
                  lang={lang.code}
                >
                  {p.nativeScript}
                </p>
                <p className="text-primary font-bold mt-2">{p.romanized}</p>
                <p className="text-sm text-muted-foreground font-medium mt-1">{p.english}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground font-medium mt-5 max-w-xl mx-auto">
            These are real free starter phrases from the app. Every language
            includes free starter phrases in every topic, so you can try{' '}
            {lang.name} before paying anything.
          </p>
        </section>

        <section aria-labelledby="how-bolo-works" className="py-8">
          <h2
            id="how-bolo-works"
            className="text-2xl sm:text-3xl font-black text-foreground tracking-tight text-center mb-6"
          >
            How Bolo! teaches {lang.name}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl mx-auto">
            {[
              {
                icon: Volume2,
                title: 'Hear it',
                body: `Every ${lang.name} phrase spoken clearly, native script and romanization side by side.`,
              },
              {
                icon: Mic,
                title: 'Say it out loud',
                body: 'Tap the mic and go for it. Bolo! listens and shows you exactly what it heard.',
              },
              {
                icon: GraduationCap,
                title: 'Get coached',
                body: 'Warm, instant feedback with the one sound to work on next.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="glass-card rounded-3xl p-6">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 bg-primary/10 text-primary">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-black text-foreground mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground font-medium">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-10 text-center">
          <div className="bg-foreground text-background rounded-[2.5rem] p-10 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-black mb-3">
              Say your first {lang.name} phrase today
            </h2>
            <p className="text-background/70 font-medium mb-6">
              Free to start, no card required. All ages welcome.
            </p>
            <Link
              href="/sign-up"
              onClick={trackSignup}
              className="inline-flex bg-primary text-primary-foreground font-black text-lg py-4 px-8 rounded-2xl items-center justify-center gap-3 shadow-[0_8px_0_hsl(var(--primary-shadow))] active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
            >
              Get started free
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="px-6 pb-10 text-center text-sm text-muted-foreground font-medium">
        <p>Bolo! - stop tapping, start talking.</p>
        <nav className="mt-3 flex items-center justify-center gap-4">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
        </nav>
      </footer>
    </div>
  );
}
