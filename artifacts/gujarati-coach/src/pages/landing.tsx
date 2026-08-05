import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'wouter';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Mic,
  Sparkles,
  ArrowRight,
  Hand,
  MessageCircle,
  Check,
  X,
  Users,
  Heart,
} from 'lucide-react';
import { useListLanguages, type Language } from '@workspace/api-client-react';
import { nativeTextProps } from '@/lib/language-context';
import { SpeakingDemo } from '@/components/speaking-demo';
import { Mascot } from '@/components/mascot';
import { FloatingTag, springs } from '@/lib/motion';
import { diasporaOrdered, LANGUAGE_PAGES } from '@/lib/languagePages';
import { usePricing, FAMILY_SEATS } from '@/lib/pricing';
import { track, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useDocumentHead, useHomepageStructuredData } from '@/lib/seo';
import { isIosSafariWeb } from '@/lib/iosAudio';

// Native app listing. The numeric id is ascAppId from bolo-mobile/eas.json;
// the badge below renders only for iOS user agents (reuse-first: the same
// isIosSafariWeb helper that gates the silent-switch hint).
const APP_STORE_URL = 'https://apps.apple.com/app/id6790907772';
// Flip to true when the listing is approved and live in the App Store. Until
// then the badge renders muted and unlinked with a coming-soon caption; the
// Smart App Banner meta stays in the shell because Safari will not render it
// for an unpublished listing anyway.
const APP_STORE_LIVE = false;

const CHIP_COLORS = ['#4F46E5', '#0D9488', '#6366F1'];

// Shown instantly on first paint (and if the languages API is slow/empty) so
// the hero never renders an empty chip row. The eight diaspora leaders, in
// priority order, including Urdu so the RTL rendering path is exercised even
// in fallback. Replaced by the full list once loaded.
const FALLBACK_LANGS = [
  { code: 'hi', nativeName: 'हिन्दी', name: 'Hindi', fontFamily: 'Noto Sans Devanagari', rtl: false },
  { code: 'pa', nativeName: 'ਪੰਜਾਬੀ', name: 'Punjabi', fontFamily: 'Noto Sans Gurmukhi', rtl: false },
  { code: 'ur', nativeName: 'اردو', name: 'Urdu', fontFamily: 'Noto Nastaliq Urdu', rtl: true },
  { code: 'bn', nativeName: 'বাংলা', name: 'Bengali', fontFamily: 'Noto Sans Bengali', rtl: false },
  { code: 'ta', nativeName: 'தமிழ்', name: 'Tamil', fontFamily: 'Noto Sans Tamil', rtl: false },
  { code: 'te', nativeName: 'తెలుగు', name: 'Telugu', fontFamily: 'Noto Sans Telugu', rtl: false },
  { code: 'gu', nativeName: 'ગુજરાતી', name: 'Gujarati', fontFamily: 'Noto Sans Gujarati', rtl: false },
  { code: 'mr', nativeName: 'मराठी', name: 'Marathi', fontFamily: 'Noto Sans Devanagari', rtl: false },
] as Language[];

// The five how-it-works steps, in the mandated order. Screenshots were
// captured fresh from the current dev build (Task 997) at 390x780 css px
// (2x), band labels only, no raw numeric scores anywhere.
//
// IMAGE WEIGHT BUDGET: the five webp screenshots below total ~102 KB
// (practice 17.2 + chat 16.6 + journey 29.4 + games 20.7 + progress 17.8),
// under the 150 KB budget for this section; all lazy-load below the fold.
const HOW_IT_WORKS_STEPS = [
  {
    img: 'practice',
    alt: 'Bolo! practice screen showing a Hindi phrase in native script with romanization, and Bolo the parrot ready to listen',
    title: 'Speak and get coached',
    body: 'Hear the phrase, hold Bolo, and say it out loud. You get warm, instant coaching on the spot, phrase by phrase.',
  },
  {
    img: 'chat',
    alt: 'Talk to Bolo chat screen where you hold Bolo the parrot to speak and have a real conversation in Hindi',
    title: 'Chat with Bolo',
    body: 'Have real back-and-forth conversations with Bolo the parrot in your language. He talks, you talk back, out loud.',
  },
  {
    img: 'journey',
    alt: 'Bolo! journey map showing the Ganga Line boarding pass and a railway route of stops through Greetings and Manners',
    title: 'Ride the journey map',
    body: 'Your path unfolds stop by stop, zone by zone. Each station you clear unlocks the next stretch of track.',
  },
  {
    img: 'games',
    alt: 'Bolo! games arcade showing Word Match, Listen and Pick, and Phrase Builder game cards',
    title: 'Play the games arcade',
    body: 'Six mini-games from Word Match to Script Trace, where you learn to handwrite the script itself.',
  },
  {
    img: 'progress',
    alt: 'Bolo! progress screen with mastered phrases, practice count, best attempt, and day streak',
    title: 'Spaced review makes it stick',
    body: "Each phrase comes back right before you'd forget it, and your streaks, badges, and progress keep the momentum going.",
  },
];

// Spring-based reveal that mirrors the launch video's section entrances.
// Honors the OS reduce-motion setting: collapses to a plain, instant fade
// (framer-motion is JS-driven, so the global CSS reduce-motion reset doesn't
// neutralize it).
function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={reduceMotion ? { duration: 0.001 } : { ...springs.gentle, delay }}
    >
      {children}
    </motion.div>
  );
}

// Fires section_in_viewport (once, with the section name) when a named
// landing section first scrolls into view.
function useSectionInViewport(section: string) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          track(ANALYTICS_EVENTS.SECTION_IN_VIEWPORT, { section });
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [section]);
  return ref;
}

// A public CTA that routes to /sign-up: fires cta_click (by placement) and
// signup_started (attributed to the public surface) on the way through.
function SignUpCta({
  placement,
  className,
  children,
}: {
  placement: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href="/sign-up"
      onClick={() => {
        track(ANALYTICS_EVENTS.CTA_CLICK, { placement });
        track(ANALYTICS_EVENTS.SIGNUP_STARTED, { source: placement });
      }}
      className={className}
    >
      {children}
    </Link>
  );
}

const PRIMARY_CTA_CLASS =
  'w-full sm:w-auto bg-primary text-primary-foreground font-black text-lg py-4 px-8 rounded-2xl inline-flex items-center justify-center gap-3 shadow-[0_8px_0_hsl(var(--primary-shadow))] active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all';

// appStoreLive defaults to the module const; tests inject the live state
// through the prop because a same-module const cannot be vi.mocked.
export default function Landing({
  appStoreLive = APP_STORE_LIVE,
}: { appStoreLive?: boolean } = {}) {
  const reduceMotion = useReducedMotion();
  const { data: languages } = useListLanguages();
  const langs = languages ?? [];
  // Diaspora-priority order: Hindi, Punjabi, Urdu, Bengali, Tamil, Telugu,
  // Gujarati, Marathi first, then the rest.
  const displayLangs = diasporaOrdered(langs.length > 0 ? langs : FALLBACK_LANGS);

  useDocumentHead({
    title: "Bolo! - Actually speak your family's language",
    description:
      "Bolo! is a speaking-first app for South Asian languages. Say every phrase out loud, get coached on the spot, and find your way back to your family's language. 22 languages, free to start.",
    canonicalPath: '/',
  });
  useHomepageStructuredData();

  useEffect(() => {
    track(ANALYTICS_EVENTS.HOMEPAGE_VIEW);
  }, []);

  const showcaseRef = useSectionInViewport('language-showcase');
  const howRef = useSectionInViewport('how-it-works');
  const whyRef = useSectionInViewport('why-bolo');
  const familiesRef = useSectionInViewport('families');
  const pricingRef = useSectionInViewport('pricing');
  const bottomRef = useSectionInViewport('bottom-cta');

  // Hero entrances animate on load (above the fold); softened to a fade when
  // motion is reduced.
  const heroItem = (delay: number) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: reduceMotion ? { duration: 0.001 } : { ...springs.smooth, delay },
  });

  // Live Stripe prices. Absent until they load (or if they cannot be loaded):
  // the pricing cards then show a placeholder instead of an invented amount.
  const { pricing } = usePricing();
  const plusMonthly = pricing?.plus.monthly;
  const plusAnnual = pricing?.plus.annual;
  const familyMonthly = pricing?.family.monthly;
  const familyAnnual = pricing?.family.annual;

  return (
    <div className="app-surface min-h-[100dvh] bg-background overflow-x-hidden">
      {/* Nav: the living rigged Bolo stands in as the logo mark (intentional
          second mount alongside the hero, per the Step 0 ruling). */}
      <header className="px-6 pt-8 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <Mascot pose="wave" size={36} idle="none" />
          <span className="text-2xl font-black text-foreground tracking-tight">Bolo!</span>
        </div>
        <Link
          href="/sign-in"
          className="font-bold text-foreground/80 hover:text-foreground px-4 py-2 rounded-xl transition-colors"
        >
          Sign in
        </Link>
      </header>

      <main className="px-6 max-w-6xl mx-auto">
        {/* Hero: two columns on desktop, copy left and live demo right. */}
        <section className="pt-12 pb-14 lg:pt-20 lg:pb-20 grid items-center gap-12 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <motion.div {...heroItem(0)} className="flex justify-center lg:justify-start">
              <Mascot pose="wave" size={88} idle="float" className="mb-5" />
            </motion.div>

            <motion.div
              {...heroItem(0.05)}
              className="inline-flex items-center gap-2 bg-secondary/10 text-secondary font-bold text-sm px-4 py-2 rounded-full mb-6"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              Talk, don't tap. It hits different.
            </motion.div>

            <motion.h1
              {...heroItem(0.1)}
              className="text-5xl sm:text-6xl font-black text-foreground leading-[1.05] tracking-tight"
            >
              Actually speak your
              <br />
              family's language.
            </motion.h1>

            <motion.p
              {...heroItem(0.15)}
              className="text-lg sm:text-xl text-muted-foreground font-medium mt-6 max-w-xl mx-auto lg:mx-0"
            >
              22 South Asian languages, taught out loud. Say every phrase and
              get coached on the spot, chat with Bolo the parrot, ride a
              journey map, play the games arcade, and let spaced review bring
              each phrase back right before you'd forget it. For kids and
              grown-ups finding their way back home.
            </motion.p>

            <motion.div
              {...heroItem(0.2)}
              className="mt-9 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
            >
              <SignUpCta placement="hero-primary" className={PRIMARY_CTA_CLASS}>
                Get started free
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </SignUpCta>
              <Link
                href="/sign-in"
                onClick={() => track(ANALYTICS_EVENTS.CTA_CLICK, { placement: 'hero-secondary' })}
                className="w-full sm:w-auto bg-card text-foreground border-2 border-border font-bold text-lg py-4 px-8 rounded-2xl flex items-center justify-center active:scale-95 transition-all"
              >
                I have an account
              </Link>
            </motion.div>

            {/* Official Apple badge, iOS visitors only. Android and desktop
                render nothing here; Safari additionally shows the Smart App
                Banner from the apple-itunes-app meta in index.html. */}
            {isIosSafariWeb() && (
              <motion.div
                {...heroItem(0.25)}
                className="mt-6 flex flex-col items-center lg:items-start"
              >
                {appStoreLive ? (
                  <a
                    href={APP_STORE_URL}
                    onClick={() =>
                      track(ANALYTICS_EVENTS.CTA_CLICK, { placement: 'hero-appstore-badge' })
                    }
                  >
                    <img
                      src={`${import.meta.env.BASE_URL}appstore-badge.svg`}
                      alt="Download on the App Store"
                      className="h-12 w-auto"
                    />
                  </a>
                ) : (
                  <>
                    {/* Pre-release: same slot, muted, unlinked, no tracking. */}
                    <img
                      src={`${import.meta.env.BASE_URL}appstore-badge.svg`}
                      alt="Download on the App Store"
                      className="h-12 w-auto opacity-50"
                    />
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">
                      Coming soon to the App Store
                    </p>
                  </>
                )}
              </motion.div>
            )}
          </div>

          {/* Live product demo: the actual speak, transcribe, coach loop. */}
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduceMotion ? { duration: 0.001 } : { ...springs.gentle, delay: 0.2 }}
            className="flex flex-col items-center"
          >
            <SpeakingDemo />
            <p className="mt-4 text-sm font-bold uppercase tracking-widest text-muted-foreground text-center">
              Watch the speak-out-loud loop in action
            </p>
          </motion.div>
        </section>

        {/* Language showcase: every language, diaspora leaders first, each
            chip linking to its public per-language page. */}
        <section ref={showcaseRef} className="py-12" aria-labelledby="languages-heading">
          <Reveal className="text-center max-w-2xl mx-auto mb-9">
            <h2 id="languages-heading" className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
              22 South Asian languages, ready when you are
            </h2>
            <p className="text-muted-foreground font-medium text-lg mt-3">
              From Hindi to Punjabi to Urdu to Tamil: find your family's
              language and start speaking it today.
            </p>
          </Reveal>

          <div className="flex flex-wrap items-center justify-center gap-3 max-w-4xl mx-auto">
            {displayLangs.map((lang, i) => {
              const native = nativeTextProps(lang);
              const page = LANGUAGE_PAGES.find((p) => p.code === lang.code);
              const href = page ? `/languages/${page.slug}` : '/sign-up';
              return (
                <FloatingTag
                  key={lang.code}
                  delay={Math.min(i, 12) * 0.18}
                  distance={7}
                  dir={native.dir}
                  className="!p-0"
                >
                  <Link
                    href={href}
                    onClick={() => track(ANALYTICS_EVENTS.LANGUAGE_ENTRY_CLICK, { language: lang.name })}
                    className="inline-flex items-center gap-2.5 bg-card border border-card-border rounded-2xl px-4 py-2.5 shadow-sm hover:border-primary/40 transition-colors"
                  >
                    <span
                      className="text-xl font-bold leading-none"
                      style={{ ...native.style, color: CHIP_COLORS[i % 3] }}
                      lang={lang.code}
                    >
                      {lang.nativeName}
                    </span>
                    <span className="text-sm font-bold text-muted-foreground leading-none">
                      {lang.name}
                    </span>
                  </Link>
                </FloatingTag>
              );
            })}
          </div>
        </section>

        {/* How it works: the five real surfaces, in the loop's order. */}
        <section ref={howRef} className="py-12" aria-labelledby="how-heading">
          <Reveal className="text-center max-w-2xl mx-auto mb-9">
            <h2 id="how-heading" className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
              What using Bolo! is actually like
            </h2>
            <p className="text-muted-foreground font-medium text-lg mt-3">
              Real screens from the real app. This is the loop, start to
              finish.
            </p>
          </Reveal>

          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 list-none">
            {HOW_IT_WORKS_STEPS.map((step, i) => (
              <Reveal key={step.img} delay={i * 0.06} className="h-full">
                <li className="glass-card rounded-3xl overflow-hidden h-full flex flex-col">
                  <img
                    src={`${import.meta.env.BASE_URL}screens/${step.img}.webp`}
                    alt={step.alt}
                    loading="lazy"
                    width={520}
                    height={1040}
                    className="w-full aspect-[1/1.55] object-cover object-top border-b border-card-border"
                  />
                  <div className="p-5">
                    <p className="text-xs font-black uppercase tracking-wide text-primary mb-1">
                      Step {i + 1}
                    </p>
                    <h3 className="text-lg font-black text-foreground mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground font-medium">{step.body}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>

          {/* Honest free-tier note (M1 teaser): starter phrases everywhere. */}
          <Reveal delay={0.1} className="mt-8">
            <p className="text-center text-muted-foreground font-medium max-w-2xl mx-auto">
              All of this starts free: every language, even the locked ones,
              offers free starter phrases in every topic so you can taste it
              before paying anything.
            </p>
          </Reveal>
        </section>

        {/* Why Bolo! is different */}
        <section ref={whyRef} className="py-12" aria-labelledby="why-heading">
          <Reveal className="text-center max-w-2xl mx-auto mb-9">
            <h2 id="why-heading" className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
              Why Bolo! hits different
            </h2>
            <p className="text-muted-foreground font-medium text-lg mt-3">
              Most apps have you tap the matching tile and call it a day. You
              can recognize words, but can you actually say them? Big
              difference.
            </p>
          </Reveal>

          <div className="grid gap-5 sm:grid-cols-2 max-w-4xl mx-auto">
            <Reveal className="glass-card rounded-3xl p-7 h-full">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-muted text-muted-foreground">
                <Hand className="w-7 h-7" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-black text-muted-foreground mb-3">Other apps</h3>
              <ul className="space-y-2.5">
                {[
                  'Tap the tile that matches. Silent the whole time.',
                  'You can point at words but freeze up out loud.',
                  'Cram, forget, cram the same words again.',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-muted-foreground font-medium">
                    <X className="w-5 h-5 shrink-0 mt-0.5 text-destructive" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.08} className="relative h-full">
              <div className="glass-card rounded-3xl p-7 h-full border-2 border-primary">
                <span className="absolute -top-3 right-6 bg-primary text-primary-foreground text-xs font-black uppercase tracking-wide px-3 py-1 rounded-full">
                  The Bolo! way
                </span>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-primary/15 text-primary">
                  <MessageCircle className="w-7 h-7" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-black text-foreground mb-3">With Bolo!</h3>
                <ul className="space-y-2.5">
                  {[
                    'You open your mouth and actually speak, every time.',
                    'Real coaching on your pronunciation, then real conversations with Bolo.',
                    'Spaced review brings each phrase back at the right moment, so it sticks.',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-foreground font-medium">
                      <Check className="w-5 h-5 shrink-0 mt-0.5 text-success" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        {/* For families: heritage recovery for kids and adults. */}
        <section ref={familiesRef} className="py-12" aria-labelledby="families-heading">
          <Reveal>
            <div className="glass-card rounded-3xl p-7 sm:p-10 max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row items-center gap-7">
                <div className="w-20 h-20 shrink-0 rounded-3xl bg-secondary/10 text-secondary flex items-center justify-center">
                  <Heart className="w-10 h-10" aria-hidden="true" />
                </div>
                <div className="text-center sm:text-left">
                  <h2 id="families-heading" className="text-2xl sm:text-3xl font-black text-foreground tracking-tight mb-3">
                    Built for the whole family
                  </h2>
                  <p className="text-muted-foreground font-medium text-lg">
                    Kids hearing their grandparents' language for the first
                    time, and grown-ups finding their way back to it: Bolo!
                    meets everyone where they are. The{' '}
                    <span className="font-bold text-foreground">Family plan</span>{' '}
                    covers up to {FAMILY_SEATS} people on one bill, and each
                    person's progress stays their own. Curious how we handle
                    your family's data? It's all in our{' '}
                    <Link href="/privacy" className="font-bold text-primary hover:underline">
                      privacy policy
                    </Link>
                    .
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Pricing preview: honest prices before signup. Prices come from the
            shared canonical pricing config (lib/pricing), never hardcoded
            here. The Free daily lesson cap was retired in July 2026, so no
            daily-limit copy appears (verified against the entitlements
            config: dailyNewLessonLimit returns null for every plan). */}
        <section ref={pricingRef} className="py-12" aria-labelledby="pricing-heading">
          <Reveal className="text-center max-w-2xl mx-auto mb-9">
            <h2 id="pricing-heading" className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
              Honest pricing, up front
            </h2>
            <p className="text-muted-foreground font-medium text-lg mt-3">
              Start free and stay free as long as you like. Upgrade only when
              you want the full library.
            </p>
          </Reveal>

          <div className="grid gap-5 sm:grid-cols-3 max-w-5xl mx-auto items-stretch">
            <Reveal className="h-full">
              <div className="glass-card rounded-3xl p-7 h-full flex flex-col">
                <h3 className="text-xl font-black text-foreground">Free</h3>
                <p className="mt-1 text-3xl font-black text-foreground">
                  $0
                  <span className="text-sm font-bold text-muted-foreground"> forever</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm font-medium text-muted-foreground flex-1">
                  <li>Hindi, with free starter phrases in every topic</li>
                  <li>A free taste of all 22 languages</li>
                  <li>Four of the games, chats with Bolo, streaks and badges</li>
                  <li>No card required</li>
                </ul>
                <SignUpCta
                  placement="pricing-free"
                  className="mt-6 inline-flex items-center justify-center rounded-2xl border-2 border-border bg-card px-6 py-3 font-black text-foreground transition-all active:scale-95"
                >
                  Start free
                </SignUpCta>
              </div>
            </Reveal>

            <Reveal delay={0.08} className="h-full">
              <div className="glass-card rounded-3xl p-7 h-full flex flex-col border-2 border-primary relative">
                <span className="absolute -top-3 right-6 bg-primary text-primary-foreground text-xs font-black uppercase tracking-wide px-3 py-1 rounded-full">
                  Most popular
                </span>
                <h3 className="text-xl font-black text-foreground">All-Access</h3>
                <p className="mt-1 text-3xl font-black text-foreground">
                  {plusMonthly ? (
                    <>
                      {plusMonthly.price}
                      <span className="text-sm font-bold text-muted-foreground">{plusMonthly.per}</span>
                    </>
                  ) : (
                    <span
                      className="inline-block h-8 w-28 animate-pulse rounded-lg bg-muted align-middle"
                      aria-label="Loading price"
                    />
                  )}
                </p>
                {plusAnnual && (
                  <p className="text-xs font-bold text-muted-foreground mt-1">
                    or {plusAnnual.price}
                    {plusAnnual.per} billed yearly
                  </p>
                )}
                <ul className="mt-4 space-y-2 text-sm font-medium text-muted-foreground flex-1">
                  <li>All 22 languages, the full phrase library and sentences</li>
                  <li>Every game, including Script Trace and the Bolo Quiz</li>
                  <li>Unlimited chat and spaced review of your weakest phrases</li>
                  <li>7-day free trial</li>
                </ul>
                <SignUpCta
                  placement="pricing-allaccess"
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 font-black text-primary-foreground shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
                >
                  Get started free
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </SignUpCta>
              </div>
            </Reveal>

            <Reveal delay={0.16} className="h-full">
              <div className="glass-card rounded-3xl p-7 h-full flex flex-col">
                <h3 className="text-xl font-black text-foreground">Family</h3>
                <p className="mt-1 text-3xl font-black text-foreground">
                  {familyMonthly ? (
                    <>
                      {familyMonthly.price}
                      <span className="text-sm font-bold text-muted-foreground">{familyMonthly.per}</span>
                    </>
                  ) : (
                    <span
                      className="inline-block h-8 w-28 animate-pulse rounded-lg bg-muted align-middle"
                      aria-label="Loading price"
                    />
                  )}
                </p>
                {familyAnnual && (
                  <p className="text-xs font-bold text-muted-foreground mt-1">
                    or {familyAnnual.price}
                    {familyAnnual.per} billed yearly
                  </p>
                )}
                <ul className="mt-4 space-y-2 text-sm font-medium text-muted-foreground flex-1">
                  <li>
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-primary" aria-hidden="true" />
                      All-Access for up to {FAMILY_SEATS} people
                    </span>
                  </li>
                  <li>One bill for the whole household</li>
                  <li>Each person's progress stays their own</li>
                </ul>
                <SignUpCta
                  placement="pricing-family"
                  className="mt-6 inline-flex items-center justify-center rounded-2xl border-2 border-border bg-card px-6 py-3 font-black text-foreground transition-all active:scale-95"
                >
                  Start with Free
                </SignUpCta>
              </div>
            </Reveal>
          </div>
          <p className="mt-5 text-center text-xs font-medium text-muted-foreground max-w-xl mx-auto">
            Sign up free first; you can upgrade from inside the app whenever
            you're ready. Prices shown in USD.
          </p>
        </section>

        {/* Bottom CTA */}
        <section ref={bottomRef} className="py-12">
          <Reveal>
            <div className="bg-foreground text-background rounded-[2.5rem] p-10 sm:p-14 text-center relative overflow-hidden">
              <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/20" aria-hidden="true" />
              <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-secondary/20" aria-hidden="true" />
              <div className="relative max-w-2xl mx-auto">
                <h2 className="text-3xl sm:text-4xl font-black mb-3">
                  Ready to actually say something?
                </h2>
                <p className="text-background/70 font-medium text-lg mb-7 max-w-md mx-auto">
                  Make a free account and speak your first phrase in under a minute. No cap.
                </p>
                <SignUpCta
                  placement="bottom-cta"
                  className="inline-flex bg-primary text-primary-foreground font-black text-lg py-4 px-8 rounded-2xl items-center justify-center gap-3 shadow-[0_8px_0_hsl(var(--primary-shadow))] active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
                >
                  Get started free
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </SignUpCta>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="px-6 pb-10 text-center text-sm text-muted-foreground font-medium">
        <p>Bolo! - stop tapping, start talking.</p>
        <nav className="mt-3 flex items-center justify-center gap-4">
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
