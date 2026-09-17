import { useEffect } from 'react';
import { Link, useSearch } from 'wouter';
import { useUser } from '@clerk/react';
import { ArrowRight, Check, Heart, Mic, MapPin } from 'lucide-react';
import { GROWTH_PAGES, growthSignupHref, type GrowthLanguage } from '@/lib/growth-pages';
import { languagePageBySlug } from '@/lib/languagePages';
import { useDocumentHead } from '@/lib/seo';
import { track, ANALYTICS_EVENTS } from '@/lib/analytics';
import { AppStoreBadge } from '@/components/app-store-badge';
import './growth-language.css';

const screens = [
  { file: 'journey', title: 'Choose your journey', text: 'Follow the railway, one stop at a time.', alt: 'Real Bolo journey screen showing the Hindi Ganga Line and its stations' },
  { file: 'practice', title: 'Learn by doing', text: 'Hear a phrase. Hold Bolo. Say it out loud.', alt: 'Real Bolo Hindi practice screen with native script, romanization and hold-to-speak control' },
  { file: 'progress', title: 'Keep moving forward', text: 'See the phrases and practice you are building up.', alt: 'Real Bolo progress screen showing practice and milestones' },
] as const;

export default function GrowthLanguagePage({ slug }: { slug: GrowthLanguage }) {
  const copy = GROWTH_PAGES[slug];
  const lang = languagePageBySlug(slug)!;
  const search = useSearch();
  const { isSignedIn } = useUser();
  const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
  const startHref = isSignedIn ? '/app' : growthSignupHref(search);
  const ctaLabel = isSignedIn ? 'Open Bolo' : `Start learning ${lang.name}`;

  useDocumentHead({ title: `Learn ${lang.name} with Bolo! | ${copy.promise}`, description: copy.intro, canonicalPath: `/${slug}` });
  useEffect(() => {
    track(ANALYTICS_EVENTS.PER_LANGUAGE_PAGE_VIEW, { language: lang.name, language_code: lang.code, surface: 'growth-landing', page: slug });
  }, [slug, lang.name, lang.code]);

  const cta = (placement: string, className = 'growth-button') => (
    <Link href={startHref} className={className} onClick={() => {
      track(ANALYTICS_EVENTS.CTA_CLICK, { placement: `growth-${slug}-${placement}`, language: lang.code });
      if (!isSignedIn) track(ANALYTICS_EVENTS.SIGNUP_STARTED, { source: `growth-${slug}`, language: lang.code });
    }}>{ctaLabel}<ArrowRight size={19} aria-hidden="true" /></Link>
  );

  const storeBadges = (placement: string) => (
    <div className="growth-stores" aria-label="Download Bolo">
      <AppStoreBadge placement={`growth-${slug}-${placement}-appstore`} />
      <AppStoreBadge store="play" placement={`growth-${slug}-${placement}-playstore`} />
    </div>
  );

  return <div className="growth-page">
    <a href="#growth-main" className="growth-skip">Skip to content</a>
    <header className="growth-header">
      <Link className="growth-brand" href="/" aria-label="Bolo home"><img src={asset('mascot/mascot-wave.png')} width="38" height="46" alt="" />Bolo<span>!</span></Link>
      <nav aria-label="Language pages">{(Object.keys(GROWTH_PAGES) as GrowthLanguage[]).map(key => <Link key={key} href={`/${key}${search ? `?${search}` : ''}`} aria-current={key === slug ? 'page' : undefined}>{languagePageBySlug(key)!.name}</Link>)}</nav>
      <Link className="growth-signin" href={isSignedIn ? '/app' : '/sign-in'}>{isSignedIn ? 'Open app' : 'Sign in'} <ArrowRight size={16} aria-hidden="true" /></Link>
    </header>
    <main id="growth-main">
      <section className="growth-hero growth-wrap">
        <div className="growth-hero-copy">
          <p className="growth-eyebrow">BOLO! SOUTH ASIA · {lang.name.toUpperCase()}</p>
          <p className="growth-native" lang={lang.code} style={{ fontFamily: `'${lang.fontFamily}', sans-serif` }}>{lang.nativeName}</p>
          <h1>{copy.headline}</h1><p className="growth-intro">{copy.intro}</p>
          {storeBadges('hero')}
          {cta('hero')}
          <p className="growth-free"><Check size={16} aria-hidden="true" />Free to start. Learn on the web.</p>
          {!isSignedIn && <p className="growth-start-note">Create your account, then choose {lang.name}.</p>}
        </div>
        <figure className="growth-hero-visual">
          <img className="growth-map" src={asset(`journey/maps/${lang.code}.jpg`)} alt={`Bolo’s illustrated ${lang.name} journey map`} fetchPriority="high" />
          <div className="growth-phone"><img src={asset('hero/home.webp')} width="480" height="1041" alt="Real Bolo home screen showing a Hindi journey, practice progress and the next stop" fetchPriority="high" /></div>
          <figcaption><span>YOUR NEXT STATION IS WAITING</span><small>Real Bolo app screen. Hindi shown.</small></figcaption>
        </figure>
      </section>
      <section className="growth-connection growth-wrap" aria-labelledby="connection-heading">
        <figure><img src={asset('story/photo-2--congratulations.webp')} width="1024" height="682" loading="lazy" alt="Illustration of a parent and child sharing a happy moment at home" /><figcaption>Story artwork from Bolo</figcaption></figure>
        <div><p className="growth-eyebrow">{copy.audience}</p><h2 id="connection-heading">{copy.connectionTitle}</h2><p>{copy.connection}</p><div className="growth-values"><span><Heart size={18} aria-hidden="true" />Learn for connection</span><span><Mic size={18} aria-hidden="true" />Practise out loud</span><span><MapPin size={18} aria-hidden="true" />Take it one stop at a time</span></div></div>
      </section>
      <section className="growth-product growth-wrap" aria-labelledby="product-heading"><p className="growth-eyebrow">A LITTLE PRACTICE. A REAL JOURNEY.</p><h2 id="product-heading">Make {lang.name} part of your day.</h2><p className="growth-section-intro">Speaking practice, games and a journey that gives you a next step.</p><div className="growth-screens">{screens.map((screen, i) => <article key={screen.file}><span className="growth-step">0{i + 1}</span><h3>{screen.title}</h3><p>{screen.text}</p><img src={asset(`hero/${screen.file}.webp`)} width="480" height="1041" alt={screen.alt} loading="lazy" /></article>)}</div><p className="growth-caption">Actual Bolo app screens, shown in Hindi. Choose {lang.name} inside the app.</p></section>
      <section className="growth-phrases growth-wrap" aria-labelledby="phrases-heading"><p className="growth-eyebrow">START WITH SOMETHING YOU CAN SAY</p><h2 id="phrases-heading">Your first {lang.name} phrases.</h2><div>{lang.phrases.map(phrase => <article key={phrase.nativeScript}><p lang={lang.code} style={{fontFamily:`'${lang.fontFamily}', sans-serif`}}>{phrase.nativeScript}</p><strong>{phrase.romanized}</strong><span>{phrase.english}</span></article>)}</div><p className="growth-caption">From Bolo’s free starter lessons. Hear and practise them in the app.</p></section>
      <section className="growth-final growth-wrap"><img src={asset('mascot/mascot-wave.png')} width="105" height="128" loading="lazy" alt="Bolo the parrot waving" /><div><p className="growth-eyebrow">{copy.promise}</p><h2>Your next station is waiting.</h2><p>Start with a phrase. Make room for a conversation.</p></div><div className="growth-final-actions">{storeBadges('footer')}{cta('footer')}</div></section>
    </main>
    <footer className="growth-footer growth-wrap"><Link className="growth-brand" href="/">Bolo<span>!</span></Link><p>Made for the conversations that bring us closer.</p><nav aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Help</Link></nav></footer>
  </div>;
}
