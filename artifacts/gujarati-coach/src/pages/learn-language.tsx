import { useEffect } from 'react';
import { Link, useParams, useSearch } from 'wouter';
import { ArrowRight, Mic, Volume2, Repeat2 } from 'lucide-react';
import { Mascot } from '@/components/mascot';
import { AppStoreBadge } from '@/components/app-store-badge';
import { useDocumentHead } from '@/lib/seo';
import { LANGUAGE_PAGES, languagePageBySlug, type LanguagePageEntry } from '@/lib/languagePages';
import { LANGUAGE_MARKETING, languagePageHref, languageSignupHref } from '@/lib/language-marketing';
import { track, ANALYTICS_EVENTS } from '@/lib/analytics';
import NotFound from '@/pages/not-found';

export default function LearnLanguage() {
  const { slug } = useParams<{ slug: string }>();
  const lang = slug ? languagePageBySlug(slug.replace(/\.html$/, '')) : undefined;
  return lang ? <LanguagePage lang={lang} /> : <NotFound />;
}

export function languageMetadata(lang: LanguagePageEntry) {
  return {
    title: `Learn ${lang.name} | Bolo! ${LANGUAGE_MARKETING.region}`,
    description: LANGUAGE_MARKETING.introductions[lang.slug as keyof typeof LANGUAGE_MARKETING.introductions],
    canonicalPath: languagePageHref(lang.slug),
  };
}

// Also rendered at build time, without auth or network requests.
export function LanguagePage({ lang, signedIn = false }: { lang: LanguagePageEntry; signedIn?: boolean }) {
  const meta = languageMetadata(lang);
  useDocumentHead(meta);
  const search = useSearch();
  const href = signedIn ? '/app' : languageSignupHref(search);
  useEffect(() => {
    track(ANALYTICS_EVENTS.PER_LANGUAGE_PAGE_VIEW, { language: lang.name });
  }, [lang.name]);
  const trackSignup = () => {
    track(ANALYTICS_EVENTS.CTA_CLICK, { placement: `language-${lang.slug}`, language: lang.code });
    if (!signedIn) track(ANALYTICS_EVENTS.SIGNUP_STARTED, { source: `language-${lang.slug}`, language: lang.code });
  };
  const nativeStyle = { fontFamily: `'${lang.fontFamily}', sans-serif` };
  const dir = lang.rtl ? 'rtl' : 'ltr';
  const ctaClass = 'inline-flex bg-primary text-primary-foreground font-black text-base sm:text-lg py-4 px-6 rounded-2xl items-center justify-center gap-3 shadow-[0_8px_0_hsl(var(--primary-shadow))] active:translate-y-2 active:shadow-none transition-all';
  const DownloadBadges = ({ placement }: { placement: string }) => <div className="flex flex-wrap justify-center gap-x-5 gap-y-5 mt-8" aria-label="Get the app">
    <div className="flex flex-col items-center"><AppStoreBadge store="apple" placement={`${placement}-apple`} /></div>
    <div className="flex flex-col items-center"><AppStoreBadge store="play" placement={`${placement}-play`} /></div>
  </div>;
  return <div className="app-surface min-h-[100dvh] bg-background overflow-x-hidden">
    <a href="#language-main" className="sr-only focus:not-sr-only focus:block focus:p-4">Skip to content</a>
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/85 backdrop-blur">
      <div className="px-5 py-3 flex items-center justify-between gap-3 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-2" aria-label={`Bolo! ${LANGUAGE_MARKETING.region} home`}>
          <Mascot pose="wave" size={32} idle="none" /><span className="text-xl font-black tracking-tight">Bolo!</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2 sm:gap-5 text-sm font-bold">
          <a href="#all-languages" className="px-2 py-3 hover:text-primary">Languages</a>
          <Link href="/sign-in" className="px-2 py-3 hover:text-primary">Sign in</Link>
        </nav>
      </div>
    </header>
    <main id="language-main" className="max-w-6xl mx-auto px-5 sm:px-8 pb-12">
      <section className="relative pt-12 sm:pt-20 pb-12 text-center">
        <div aria-hidden="true" className="pointer-events-none absolute -top-8 left-1/4 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <p className="relative text-xs font-black uppercase tracking-widest text-muted-foreground">Bolo! {LANGUAGE_MARKETING.region}</p>
        <p className="relative text-4xl sm:text-6xl font-bold text-primary my-5 leading-normal break-words" style={nativeStyle} dir={dir} lang={lang.code}>{lang.nativeName}</p>
        <h1 className="relative text-4xl sm:text-6xl font-black tracking-tight leading-tight">Learn to speak<br /><span className="text-primary">{lang.name}.</span></h1>
        <p className="relative mt-6 text-lg sm:text-xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">{meta.description}</p>
        <div className="relative mt-8"><Link href={href} onClick={trackSignup} className={ctaClass}>{signedIn ? 'Open Bolo' : `Start learning ${lang.name}`}<ArrowRight className="w-5 h-5 shrink-0" aria-hidden="true" /></Link></div>
        <p className="mt-6 text-sm font-medium text-muted-foreground">Try free starter phrases. Choose {lang.name} when you enter the app.</p>
        <DownloadBadges placement={`language-${lang.slug}-hero`} />
      </section>
      <section aria-labelledby="sample-phrases" className="py-10 border-t border-border/50">
        <p className="text-primary text-xs font-black uppercase tracking-widest text-center">Start with something you can say</p>
        <h2 id="sample-phrases" className="text-2xl sm:text-4xl font-black tracking-tight text-center mt-3 mb-7">Your first {lang.name} phrases</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {lang.phrases.map((p, i) => <article key={`${p.nativeScript}-${i}`} className="glass-card rounded-3xl p-6 text-center min-w-0">
            <p className="text-xs font-black text-muted-foreground mb-4">0{i + 1}</p>
            <p className="text-2xl font-bold leading-relaxed break-words" style={nativeStyle} dir={dir} lang={lang.code}>{p.nativeScript}</p>
            <p className="text-primary font-bold mt-3 break-words">{p.romanized}</p>
            <p className="text-sm text-muted-foreground font-medium mt-2">{p.english}</p>
          </article>)}
        </div>
        <p className="text-center text-sm text-muted-foreground mt-6 max-w-xl mx-auto">Examples from the {lang.name} starter lessons in Bolo! Open the app to hear them and practice out loud.</p>
      </section>
      <section aria-labelledby="how-bolo-works" className="py-10">
        <h2 id="how-bolo-works" className="text-2xl sm:text-4xl font-black tracking-tight text-center mb-7">A little practice. Your own voice.</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Volume2, title: 'Listen first', body: `Hear a ${lang.name} phrase in the app. Follow the written example and its meaning, then listen again.` },
            { icon: Mic, title: 'Try it out loud', body: 'Hold the speaking button while you say the phrase. Release it when you finish and review your attempt.' },
            { icon: Repeat2, title: 'Come back to it', body: `Repeat one useful ${lang.name} phrase before adding another. A small routine is easier to keep.` },
          ].map(({ icon: Icon, title, body }) => <div key={title} className="glass-card rounded-3xl p-6"><Icon className="w-10 h-10 p-2 rounded-xl bg-primary/10 text-primary mb-4" aria-hidden="true" /><h3 className="text-xl font-black mb-3">{title}</h3><p className="text-muted-foreground font-medium leading-relaxed">{body}</p></div>)}
        </div>
      </section>
      <section aria-labelledby="practice-plan" className="py-10 grid gap-8 md:grid-cols-2 items-center">
        <div>
          <p className="text-primary text-xs font-black uppercase tracking-widest">Make it part of your day</p>
          <h2 id="practice-plan" className="text-3xl sm:text-4xl font-black tracking-tight mt-3 mb-6">Your first week with {lang.name}</h2>
          <ol className="space-y-5 text-muted-foreground font-medium leading-relaxed">
            <li><strong className="text-foreground">Days 1 and 2: make the first phrase familiar.</strong> Start with “{lang.phrases[0]?.english}”. Hear it, try it, and revisit it tomorrow.</li>
            <li><strong className="text-foreground">Days 3 and 4: add another exchange.</strong> Practice “{lang.phrases[1]?.english}”. Try recalling it before looking at the written example.</li>
            <li><strong className="text-foreground">Days 5 through 7: put your voice first.</strong> Revisit your {lang.name} starter phrases. Choose the one you would most like to use in a real conversation.</li>
          </ol>
          <p className="mt-6 text-sm text-muted-foreground">This is a suggested practice routine. Move at the pace that works for you.</p>
        </div>
        {LANGUAGE_MARKETING.screenshot ? <figure className="rounded-[2rem] bg-primary/5 border border-primary/10 p-6 text-center">
          <img src={`${import.meta.env.BASE_URL}${LANGUAGE_MARKETING.screenshot}`} alt={`Bolo! ${LANGUAGE_MARKETING.region} app home shown in ${LANGUAGE_MARKETING.screenshotLanguage}`} width={480} height={1043} loading="lazy" className="w-52 max-w-full h-auto mx-auto rounded-3xl shadow-xl" />
          <figcaption className="text-xs text-muted-foreground mt-5">Real Bolo! {LANGUAGE_MARKETING.region} screenshot, shown in {LANGUAGE_MARKETING.screenshotLanguage}. Select {lang.name} in the app.</figcaption>
        </figure> : <div className="rounded-[2rem] bg-primary/5 border border-primary/10 p-10 text-center"><Mascot pose="wave" size={160} idle="none" /><h3 className="text-2xl font-black mt-5">Your {lang.name} journey starts here</h3><p className="mt-4 text-muted-foreground">Explore Bolo! {LANGUAGE_MARKETING.region} and make speaking practice part of your day.</p></div>}
      </section>
      <section aria-labelledby="language-questions" className="py-10 max-w-3xl mx-auto">
        <h2 id="language-questions" className="text-2xl sm:text-4xl font-black tracking-tight mb-7 text-center">Before you start</h2>
        {[
          [`Can I start ${lang.name} as a beginner?`, `Yes. Start with the ${lang.name} examples above, then choose ${lang.name} in Bolo! ${LANGUAGE_MARKETING.region}. Listen and practice one short phrase at a time.`],
          [`What if I understand ${lang.name} but hesitate to speak?`, `Use a familiar phrase as your starting point. Say it in the app, listen again, and repeat it before adding something new. You can practice privately at your own pace.`],
          [`Can I try ${lang.name} for free?`, `Bolo! includes free starter phrases so you can try ${lang.name} before deciding whether to buy access to more content. Check the app for current plans.`],
          [`Which Bolo! app includes ${lang.name}?`, `${lang.name} is included in Bolo! ${LANGUAGE_MARKETING.region}. Use the store badges on this page, or start in your browser. A grey badge means that store release is coming soon.`],
        ].map(([q, a]) => <details key={q} className="border-b border-border py-5"><summary className="font-bold cursor-pointer leading-relaxed pr-3">{q}</summary><p className="mt-3 text-muted-foreground leading-relaxed">{a}</p></details>)}
      </section>
      <section className="py-10 text-center">
        <div className="glass-card rounded-[2rem] p-6 sm:p-10">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">Your next {lang.name} conversation starts with one phrase.</h2>
          <p className="text-muted-foreground mb-7">Start small. Say it out loud. Come back tomorrow.</p>
          <Link href={href} onClick={trackSignup} className={ctaClass}>{signedIn ? 'Open Bolo' : `Start learning ${lang.name}`}<ArrowRight className="w-5 h-5 shrink-0" aria-hidden="true" /></Link>
          <DownloadBadges placement={`language-${lang.slug}-footer`} />
        </div>
      </section>
      <nav id="all-languages" aria-label={`All ${LANGUAGE_MARKETING.region} languages`} className="py-10 scroll-mt-24 text-center">
        <h2 className="text-2xl font-black mb-5">Explore Bolo! {LANGUAGE_MARKETING.region}</h2>
        <div className="flex flex-wrap justify-center gap-3">{LANGUAGE_PAGES.map(other => <Link key={other.slug} href={languagePageHref(other.slug)} aria-current={other.slug === lang.slug ? 'page' : undefined} className={`px-4 py-3 rounded-full border font-bold text-sm transition-colors ${other.slug === lang.slug ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary hover:text-primary'}`}>{other.name}</Link>)}</div>
      </nav>
    </main>
    <footer className="px-5 pb-10 text-center text-sm text-muted-foreground font-medium">
      <p>Bolo! {LANGUAGE_MARKETING.region}. Stop tapping, start talking.</p>
      <nav aria-label="Footer" className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-3"><Link href="/">Home</Link><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link><a href="https://LARKEnterprisesLLC.com" className="underline underline-offset-4 hover:text-primary">LARK Enterprises LLC</a></nav>
    </footer>
  </div>;
}
