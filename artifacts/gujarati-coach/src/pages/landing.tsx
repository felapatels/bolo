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
import { HeroShowcase, type ShowcasePanel } from '@/components/hero-showcase';
import { PlatformStrip } from '@/components/platform-strip';
import { cn } from '@/lib/utils';
import { Mascot } from '@/components/mascot';
import {
  FloatingTag,
  ParallaxLayer,
  Reveal,
  RevealChild,
  RevealStagger,
  ScrollProgressRail,
  SplitHeading,
  springs,
} from '@/lib/motion';
import { diasporaOrdered, LANGUAGE_PAGES } from '@/lib/languagePages';
import { usePricing, FAMILY_SEATS, FAMILY_PLAN_ENABLED } from '@/lib/pricing';
import { track, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useDocumentHead, useHomepageStructuredData } from '@/lib/seo';
import { detectShortcutPlatform } from '@/lib/platform';
import { StoreBanner } from '@/components/store-banner';
import { LoopingVideo } from '@/components/looping-video';
// The badges (and the listing URLs and LIVE flags behind them) now live in one
// shared component so the signed-in home page shows the same ones. The hero
// still owns its own gate and entrance animation, below. Until a flag flips,
// that store's badge is muted and unlinked with a coming-soon caption; the
// Smart App Banner meta stays in the shell because Safari will not render it
// for an unpublished listing anyway.
import {
  AppStoreBadge,
  APP_STORE_LIVE,
  PLAY_STORE_LIVE,
} from '@/components/app-store-badge';

const CHIP_COLORS = ['#4F46E5', '#0D9488', '#6366F1'];

// THE HERO'S ROTATING PANELS, AND EVERY ONE IS A CAPTURE OF THE REAL APP.
//
// What stood here before was SpeakingDemo, a hand-built mock of a practice
// screen, and it had drifted into being simply untrue: it read "Tap, then
// speak" over "LISTENING... STOPS ON ITS OWN", describing an auto-stop
// recorder. The real screen says "Hold and say it out loud" and submits on
// RELEASE. Reported 2026-08-30: "this is not how lessons work or scoring
// looks." A drawn mock cannot be kept honest, because nothing fails when the
// app changes underneath it; a screenshot at least goes visibly stale.
//
// HOME FIRST, THEN THE CALL, then the rest in any order (owner, 2026-08-30).
// Home is what the app actually opens on, and the call is the thing nothing
// else does, so those two are the argument; the remaining five are evidence.
//
// Six of these are the owner's own App Store set (1320x2868, ~/Desktop/
// appstore-noalpha), which is curated and clean; `practice` is a simulator
// capture at 1206x2622, because that set has no practice screen and it is the
// one that shows hold-to-talk. Both aspects are 0.460, so they sit in the same
// frame without cropping. All re-encoded to 480 wide.
//
// RE-CAPTURE THESE TOGETHER when a screen changes shape: a set where one panel
// is a season out of date looks worse than one that is uniformly old.
const HERO_PANELS: readonly ShowcasePanel[] = [
  {
    id: 'home',
    caption: 'Pick up where you left off',
    alt: "The Bolo home screen: a greeting, day streak, total XP, phrases mastered and chai, above a carved boarding pass showing the next stop on the Ganga Line.",
    src: `${import.meta.env.BASE_URL}hero/home.webp`,
  },
  {
    id: 'call',
    caption: 'Chacha-ji rings you',
    alt: 'Chacha-ji phones in Hindi. You answer, hold the button to reply out loud, and he answers back.',
    src: `${import.meta.env.BASE_URL}video/chachaji-call.mp4`,
    poster: `${import.meta.env.BASE_URL}video/chachaji-call-poster.webp`,
  },
  {
    id: 'practice',
    caption: 'Hold Bolo, say it out loud',
    alt: 'A Hindi practice screen: नमस्ते with its romanisation and meaning, a Hear it button, and a microphone captioned "Hold and say it out loud".',
    src: `${import.meta.env.BASE_URL}hero/practice.webp`,
  },
  {
    id: 'journey',
    caption: 'Ride the line, stop by stop',
    alt: 'The Ganga Line journey map: an illustrated bazaar with a railway winding through it, and station cards for tracing, stories and each stop.',
    src: `${import.meta.env.BASE_URL}hero/journey.webp`,
  },
  {
    id: 'games',
    caption: 'Play your way to fluency',
    alt: 'The games arcade: Luggage Match, Chacha-ji Calls, Word Match and Signal Lights, each with its own painted card.',
    src: `${import.meta.env.BASE_URL}hero/games.webp`,
  },
  {
    id: 'progress',
    caption: 'Watch it actually stick',
    alt: 'A progress screen showing the next milestone, phrases mastered, practices, best score and a day streak.',
    src: `${import.meta.env.BASE_URL}hero/progress.webp`,
  },
  {
    id: 'leaderboard',
    caption: 'Ride with everyone else',
    alt: 'The weekly leaderboard: a podium of top travellers with their XP, and the rest of the ranking below.',
    src: `${import.meta.env.BASE_URL}hero/leaderboard.webp`,
  },
];

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

// How far each how-it-works card drifts against the scroll, in px, cycled
// across the five columns. Deliberately small and deliberately uneven: equal
// values just move the whole row, and anything past ~20px starts to fight the
// grid's alignment on a short viewport.
const PARALLAX_STEP_DRIFT = [14, -8, 18, -6, 12];

// Reveal, RevealStagger/RevealChild and SplitHeading were lifted out of this
// file into @/lib/motion on 2026-08-28, when the scroll pass gave them
// directions, cascades and a second consumer (the per-language pages). The
// reduce-motion behaviour is unchanged: a plain, instant fade.

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

// appStoreLive and playStoreLive default to the module consts; tests inject
// the live state through the props because a same-module const cannot be
// vi.mocked.
export default function Landing({
  appStoreLive = APP_STORE_LIVE,
  playStoreLive = PLAY_STORE_LIVE,
}: { appStoreLive?: boolean; playStoreLive?: boolean } = {}) {
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

  const platformsRef = useSectionInViewport('platforms');
  const showcaseRef = useSectionInViewport('language-showcase');
  const howRef = useSectionInViewport('how-it-works');
  const callRef = useSectionInViewport('chachaji-call');
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

  // Which store badge the hero offers, if any. detectShortcutPlatform() is
  // wider than the isIosSafariWeb() gate it replaces, which is deliberate: it
  // also recognizes an iPad reporting a Macintosh user agent. What it does not
  // carry is that helper's standalone check, and losing that would be a
  // regression, so the check lives here rather than inside either helper (the
  // audio path depends on isIosSafariWeb() unchanged). A visitor who already
  // added Bolo to their home screen is not pitched a native app on top of it.
  const isStandalone =
    typeof navigator !== 'undefined' &&
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const badgePlatform = isStandalone ? 'unknown' : detectShortcutPlatform();

  // NO overflow-x-hidden ON THE ROOT ANY MORE. It made this a scroll container,
  // and `position: sticky` then resolves against IT rather than the viewport,
  // so the header simply would not stick. The ambient colour fields were the
  // only reason it was there and they already clip inside their own
  // overflow-hidden box below, so nothing is left to bleed sideways.
  return (
    <div className="app-surface relative min-h-[100dvh] bg-background">
      {/* How far down the page you are, as a length rather than a colour.
          Renders nothing under reduce-motion. */}
      <ScrollProgressRail />

      {/* Ambient depth. Three soft colour fields drifting against the scroll,
          so the background travels at its own speed instead of sliding past at
          exactly reading pace. This is what stops a long marketing page
          reading as a stack of static slides. Wallpaper only: pointer events
          off, hidden from assistive tech, and dead still under reduce-motion
          (ParallaxLayer zeroes its own travel). */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <ParallaxLayer
          className="absolute -top-24 -right-32 h-[26rem] w-[26rem]"
          distance={90}
        >
          <div className="h-full w-full rounded-full bg-primary/[0.07] blur-3xl" />
        </ParallaxLayer>
        <ParallaxLayer
          className="absolute top-[40%] -left-40 h-[30rem] w-[30rem]"
          distance={150}
        >
          <div className="h-full w-full rounded-full bg-secondary/[0.07] blur-3xl" />
        </ParallaxLayer>
        <ParallaxLayer
          className="absolute top-[75%] -right-40 h-[28rem] w-[28rem]"
          distance={110}
        >
          <div className="h-full w-full rounded-full bg-primary/[0.05] blur-3xl" />
        </ParallaxLayer>
      </div>

      {/* Nav: the living rigged Bolo stands in as the logo mark (intentional
          second mount alongside the hero, per the Step 0 ruling). The
          `relative` here and on main/footer is load-bearing: the ambient
          layer above is positioned, so static content would paint underneath
          it. */}
      {/* THE ACTIONS LIVE UP HERE NOW, and they stay. Suggested 2026-08-30:
          "maybe we move the CTA buttons to the top header so they stay
          sticky?" It buys the hero back about ninety pixels, which is what
          lets the phones clear the fold, and it means the primary action is
          reachable from anywhere on a long marketing page instead of only at
          the two ends of it.
          Translucent with a blur rather than opaque: the ambient colour fields
          drift underneath, and a solid bar would cut a hard line across them. */}
      <header
        data-testid="site-header"
        className="sticky top-0 z-40 border-b border-border/40 bg-background/85 backdrop-blur"
      >
        <div className="px-6 py-3 flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <Mascot pose="wave" size={32} idle="none" />
            <span className="text-xl font-black text-foreground tracking-tight">Bolo!</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              onClick={() => track(ANALYTICS_EVENTS.CTA_CLICK, { placement: 'header-signin' })}
              className="font-bold text-foreground/80 hover:text-foreground px-3 py-2 rounded-xl transition-colors"
            >
              Sign in
            </Link>
            <SignUpCta
              placement="header-primary"
              className="bg-primary text-primary-foreground font-black py-2.5 px-5 rounded-xl inline-flex items-center gap-2 shadow-[0_4px_0_hsl(var(--primary-shadow))] active:translate-y-1 active:shadow-none transition-all"
            >
              Get started free
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </SignUpCta>
          </div>
        </div>
      </header>

      <main className="relative px-6 max-w-6xl mx-auto">
        {/* Hero: two columns on desktop, copy left and live demo right. */}
        {/* THE HERO IS ONE WIDE COLUMN NOW, not copy beside a widget. Asked for
            2026-08-30: "an actively changing wide hero". Two columns pinned the
            demo to half the page, which is why it was a single small phone; the
            showcase gets the full width and shows three at a time on a desktop.
            The copy is centred rather than left-aligned to match. */}
        <section className="pt-6 pb-10 lg:pt-8 lg:pb-12">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div {...heroItem(0)} className="flex justify-center">
              <Mascot pose="wave" size={56} idle="float" className="mb-3" />
            </motion.div>

            <motion.div
              {...heroItem(0.05)}
              className="inline-flex items-center gap-2 bg-secondary/10 text-secondary font-bold text-sm px-4 py-1.5 rounded-full mb-4"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              Talk, don't tap. It hits different.
            </motion.div>

            <motion.h1
              {...heroItem(0.1)}
              className="text-4xl sm:text-5xl lg:text-[3.25rem] font-black text-foreground leading-[1.05] tracking-tight"
            >
              Actually speak your
              <br />
              family's language.
            </motion.h1>

            <motion.p
              {...heroItem(0.15)}
              className="text-lg text-muted-foreground font-medium mt-4 max-w-xl mx-auto"
            >
              22 South Asian languages, taught out loud. Say every phrase, get
              coached on the spot, and find your way back home.
            </motion.p>

            {/* THE HERO'S OWN CTA ROW MOVED INTO THE STICKY HEADER. Both
                actions are two inches up and now follow the reader down the
                page, so repeating them here bought a duplicate button at the
                cost of the ninety pixels the showcase needed to clear the
                fold. "I have an account" and the header's "Sign in" were
                always the same door. */}

            {/* The official badge for the store the visitor's platform will
                get the app from: Apple on iOS, Google Play on Android, and
                nothing on desktop or an unrecognized platform. Never both.
                Safari additionally shows the Smart App Banner from the
                apple-itunes-app meta in index.html. */}
            {badgePlatform !== 'unknown' && (
              <motion.div
                {...heroItem(0.25)}
                className="mt-6 flex flex-col items-center"
              >
                {badgePlatform === 'ios' ? (
                  <AppStoreBadge live={appStoreLive} placement="hero-appstore-badge" />
                ) : (
                  <AppStoreBadge
                    store="play"
                    live={playStoreLive}
                    placement="hero-playstore-badge"
                  />
                )}
              </motion.div>
            )}
          </div>

          {/* The real app, rotating. Entrance on load (it is above the fold),
              then a slow upward drift as the hero leaves, so the fold has some
              depth instead of scrolling away as one flat sheet.
              decorative={false}: these are the product, not wallpaper. */}
          <ParallaxLayer decorative={false} distance={18} className="mt-8">
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={reduceMotion ? { duration: 0.001 } : { ...springs.gentle, delay: 0.2 }}
            >
              <HeroShowcase panels={HERO_PANELS} />
            </motion.div>
          </ParallaxLayer>
        </section>

        {/* WHERE YOU CAN USE IT. Directly under the hero, so it is the first
            thing a visitor meets on starting to scroll, and deliberately NOT
            inside the hero: the showcase has to clear the fold, and every row
            added above it costs that. Availability comes off the store flags
            rather than being typed in here. */}
        <section ref={platformsRef} className="pb-10" aria-labelledby="platforms-heading">
          <Reveal>
            <div className="max-w-3xl mx-auto">
              <h2
                id="platforms-heading"
                className="text-center text-xs font-black uppercase tracking-widest text-muted-foreground"
              >
                One account, every screen
              </h2>
              <div className="mt-4">
                <PlatformStrip />
              </div>
            </div>
          </Reveal>
        </section>

        {/* Language showcase: every language, diaspora leaders first, each
            chip linking to its public per-language page. */}
        <section ref={showcaseRef} className="py-12" aria-labelledby="languages-heading">
          <div className="text-center max-w-2xl mx-auto mb-9">
            <SplitHeading
              id="languages-heading"
              text="22 South Asian languages, ready when you are"
              className="text-3xl sm:text-4xl font-black text-foreground tracking-tight"
            />
            <Reveal delay={0.14}>
              <p className="text-muted-foreground font-medium text-lg mt-3">
                From Hindi to Punjabi to Urdu to Tamil: find your family's
                language and start speaking it today.
              </p>
            </Reveal>
          </div>

          {/* The chips already bob forever; the cascade is what they were
              missing. Their own mount entrance fires below the fold long
              before anyone reaches them, so without this the whole wall of 22
              is simply already there when you arrive. */}
          <RevealStagger
            className="flex flex-wrap items-center justify-center gap-3 max-w-4xl mx-auto"
            stagger={0.025}
          >
            {displayLangs.map((lang, i) => {
              const native = nativeTextProps(lang);
              const page = LANGUAGE_PAGES.find((p) => p.code === lang.code);
              const href = page ? `/languages/${page.slug}` : '/sign-up';
              return (
                <RevealChild key={lang.code} from="scale" y={14} spring="poppy">
                <FloatingTag
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
                </RevealChild>
              );
            })}
          </RevealStagger>
        </section>

        {/* How it works: the five real surfaces, in the loop's order. */}
        <section ref={howRef} className="py-12" aria-labelledby="how-heading">
          <div className="text-center max-w-2xl mx-auto mb-9">
            <SplitHeading
              id="how-heading"
              text="What using Bolo! is actually like"
              className="text-3xl sm:text-4xl font-black text-foreground tracking-tight"
            />
            <Reveal delay={0.14}>
              <p className="text-muted-foreground font-medium text-lg mt-3">
                Real screens from the real app. This is the loop, start to
                finish.
              </p>
            </Reveal>
          </div>

          {/* The cascade is driven from the parent, not from a per-card delay.
              With five cards in one desktop row they all cross the viewport
              margin on the same frame, so five independent delay timers start
              together and the stagger is invisible; the parent's
              staggerChildren is the only form that actually reads as a
              cascade. Each card then drifts by a different amount as it goes
              past (PARALLAX_STEP_DRIFT), so the row breathes rather than
              travelling as one rigid block. decorative={false}: these are the
              product shots, and the effect must not cost them their alt text.
          */}
          <RevealStagger
            as="ol"
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 list-none"
            stagger={0.09}
          >
            {HOW_IT_WORKS_STEPS.map((step, i) => (
              <RevealChild key={step.img} as="li" className="h-full" from="scale" y={34}>
                <ParallaxLayer
                  decorative={false}
                  distance={PARALLAX_STEP_DRIFT[i % PARALLAX_STEP_DRIFT.length]}
                  className="h-full"
                >
                  <div className="glass-card rounded-3xl overflow-hidden h-full flex flex-col">
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
                  </div>
                </ParallaxLayer>
              </RevealChild>
            ))}
          </RevealStagger>

          {/* Honest free-tier note (M1 teaser): starter phrases everywhere. */}
          <Reveal delay={0.1} className="mt-8">
            <p className="text-center text-muted-foreground font-medium max-w-2xl mx-auto">
              All of this starts free: every language, even the locked ones,
              offers free starter phrases in every topic so you can taste it
              before paying anything.
            </p>
          </Reveal>
        </section>

        {/* Chacha-ji's call. Added 2026-08-29: the one feature that is an
            EVENT rather than a lesson, so it earns its own section and a real
            recording rather than a still. The clip is a simulator capture cut
            to one complete beat — he rings, you answer, he speaks, you hold to
            talk, he answers back — so a loop returns to the ringing phone
            rather than to the middle of a sentence.
            IT SAYS "IN THE APP" AND THAT LINE IS LOAD-BEARING. The call is
            iOS-only; a browser cannot place one. Without the line this is a
            demo of something the page it sits on cannot do. */}
        <section ref={callRef} className="py-12" aria-labelledby="call-heading">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <SplitHeading
                id="call-heading"
                text="Chacha-ji rings you"
                className="text-3xl sm:text-4xl font-black text-foreground tracking-tight"
              />
              <Reveal delay={0.14}>
                <p className="text-muted-foreground font-medium text-lg mt-3">
                  Not a lesson you sit down for: a phone call you pick up. Your
                  uncle rings, asks how you are, and waits. Hold the button,
                  answer him out loud, and he answers back.
                </p>
              </Reveal>
              <Reveal delay={0.2}>
                <ul className="mt-5 space-y-2.5">
                  {[
                    'He calls you, in your language, about nothing in particular.',
                    'Hold to talk and let go: releasing is how you finish a turn.',
                    'Every reply earns XP, and the chai adds up.',
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-foreground font-medium"
                    >
                      <Check className="w-5 h-5 shrink-0 mt-0.5 text-success" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={0.26}>
                <p className="mt-5 text-sm font-bold text-muted-foreground">
                  Chacha-ji's calls are in the iPhone app.
                </p>
              </Reveal>
            </div>

            {/* The phone. A drawn bezel rather than a screenshot of one: the
                capture is the screen only, so the frame has to come from CSS
                or the clip floats. */}
            <Reveal from="scale" y={36} className="order-1 lg:order-2">
              <div className="mx-auto w-full max-w-[280px]">
                <div className="rounded-[2.25rem] border-[6px] border-foreground/85 bg-foreground/85 shadow-[0_18px_40px_-12px_rgba(15,23,42,0.45)]">
                  <LoopingVideo
                    src={`${import.meta.env.BASE_URL}video/chachaji-call.mp4`}
                    poster={`${import.meta.env.BASE_URL}video/chachaji-call-poster.webp`}
                    label="Chacha-ji calls in Hindi. You answer, hold the button to reply out loud, and he answers back."
                    className="overflow-hidden rounded-[1.75rem]"
                  />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Why Bolo! is different */}
        <section ref={whyRef} className="py-12" aria-labelledby="why-heading">
          <div className="text-center max-w-2xl mx-auto mb-9">
            <SplitHeading
              id="why-heading"
              text="Why Bolo! hits different"
              className="text-3xl sm:text-4xl font-black text-foreground tracking-tight"
            />
            <Reveal delay={0.14}>
              <p className="text-muted-foreground font-medium text-lg mt-3">
                Most apps have you tap the matching tile and call it a day. You
                can recognize words, but can you actually say them? Big
                difference.
              </p>
            </Reveal>
          </div>

          {/* The two cards arrive from opposite sides, which is the comparison
              the section is making, done as motion. */}
          <RevealStagger className="grid gap-5 sm:grid-cols-2 max-w-4xl mx-auto" stagger={0.12}>
            <RevealChild from="left" y={40} className="glass-card rounded-3xl p-7 h-full">
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
            </RevealChild>

            <RevealChild from="right" y={40} className="relative h-full">
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
            </RevealChild>
          </RevealStagger>
        </section>

        {/* For families: heritage recovery across generations. */}
        <section ref={familiesRef} className="py-12" aria-labelledby="families-heading">
          {/* A scale entrance rather than a word-split heading: three splits in
              a row upstream is a tic, and this section reads better as one
              object arriving than as a line assembling itself. */}
          <Reveal from="scale" y={34}>
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
                    Hearing your grandparents' language for the first time,
                    or finding your way back to it: Bolo! meets everyone
                    where they are.{' '}
                    {FAMILY_PLAN_ENABLED ? (
                      <>
                        The{' '}
                        <span className="font-bold text-foreground">
                          Family plan
                        </span>{' '}
                        covers up to {FAMILY_SEATS} people on one bill, and each
                        person's progress stays their own.{' '}
                      </>
                    ) : (
                      <>
                        Everyone learns at their own pace, and each person's
                        progress stays their own.{' '}
                      </>
                    )}
                    Curious how we handle your family's data? It's all in our{' '}
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
          <div className="text-center max-w-2xl mx-auto mb-9">
            <SplitHeading
              id="pricing-heading"
              text="Honest pricing, up front"
              className="text-3xl sm:text-4xl font-black text-foreground tracking-tight"
            />
            <Reveal delay={0.14}>
              <p className="text-muted-foreground font-medium text-lg mt-3">
                Start free and stay free as long as you like. Upgrade only when
                you want the full library.
              </p>
            </Reveal>
          </div>

          {/* THE COLUMN COUNT FOLLOWS THE CARDS THAT ACTUALLY RENDER. This was
              fixed at three from when there were three plans, and the Family
              card was withdrawn on 2026-08-24 without anyone revisiting it, so
              two cards sat in the first two of three columns and the whole
              block hung left of centre with a card's worth of empty space on
              the right. Reported 2026-08-30: "these are off center".
              Derived from FAMILY_PLAN_ENABLED rather than hardcoded to two, so
              the day the Family plan comes back the grid widens with it. The
              max-width narrows too: two cards stretched across a five-column
              measure read as slabs. */}
          <RevealStagger
            className={cn(
              'grid gap-5 mx-auto items-stretch',
              FAMILY_PLAN_ENABLED
                ? 'sm:grid-cols-3 max-w-5xl'
                : 'sm:grid-cols-2 max-w-3xl',
            )}
            stagger={0.11}
          >
            <RevealChild className="h-full" from="scale" y={30}>
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
            </RevealChild>

            <RevealChild className="h-full" from="scale" y={30}>
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
                    {plusAnnual.per}
                    {plusAnnual.monthlyEquivalent
                      ? `, just ${plusAnnual.monthlyEquivalent}/mo`
                      : ''}{' '}
                    billed yearly
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
            </RevealChild>

            {/* Withdrawn from sale 2026-08-24: neither mobile store sells or
                honours the Family plan, so advertising it here promises a
                purchase a learner's phone will not recognise. Existing
                subscribers keep it. See FAMILY_PLAN_ENABLED. */}
            {FAMILY_PLAN_ENABLED && (
              <RevealChild className="h-full" from="scale" y={30}>
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
              </RevealChild>
            )}

          </RevealStagger>
          <p className="mt-5 text-center text-xs font-medium text-muted-foreground max-w-xl mx-auto">
            Sign up free first; you can upgrade from inside the app whenever
            you're ready. Prices shown in USD.
          </p>
        </section>

        {/* Bottom CTA */}
        <section ref={bottomRef} className="py-12">
          <Reveal from="scale" y={36}>
            <div className="bg-foreground text-background rounded-[2.5rem] p-10 sm:p-14 text-center relative overflow-hidden">
              {/* These two circles were already here and already static. Given
                  opposite drifts they slide past each other as the block goes
                  by, which is the last thing you see on the page. */}
              <ParallaxLayer
                className="absolute -top-16 -right-16 w-56 h-56"
                distance={26}
              >
                <div className="w-full h-full rounded-full bg-primary/20" />
              </ParallaxLayer>
              <ParallaxLayer
                className="absolute -bottom-16 -left-16 w-56 h-56"
                distance={-26}
              >
                <div className="w-full h-full rounded-full bg-secondary/20" />
              </ParallaxLayer>
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

      <footer className="relative px-6 pb-10 text-center text-sm text-muted-foreground font-medium">
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

      {/* The sticky get-the-app bar. Fixed to the bottom, so the footer above
          carries clearance for it: without that, the last nav row sits under
          the bar on a short viewport and Privacy Policy is untappable. */}
      <div aria-hidden="true" className="h-20" />
      <StoreBanner />
    </div>
  );
}
