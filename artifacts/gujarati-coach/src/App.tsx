import { ClerkProvider, SignIn, SignUp, Show, useUser } from '@clerk/react';
import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { identifyUser, trackOnce, ANALYTICS_EVENTS } from './lib/analytics';
import { setSentryUser } from './lib/sentry';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Switch,
  Route,
  Redirect,
  useLocation,
  useSearch,
  Router as WouterRouter,
} from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from './lib/queryClient';
import { LanguageProvider } from './lib/language-context';
import { EquippedOutfitProvider } from '@/hooks/use-equipped-outfit';
import { ThemeProvider } from './lib/theme-context';
import { Toaster } from '@/components/ui/toaster';
import { StopSplash } from "@/components/stop-splash";
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/layout/app-shell';
import { ClerkAuthSync } from '@/components/clerk-auth-sync';
import { ReferralRedemptionProvider } from '@/components/referral-redeemer';
import { safeAuthRedirect } from '@/lib/auth-redirect';

import Landing from '@/pages/landing';
import Home from '@/pages/home';

// Route-level code splitting: only Landing and Home load eagerly (they are
// the two entry pages). Everything else is fetched on navigation — without
// this, opening the logged-in home pulled in every page (chat, practice,
// all six games…), ~190 dev-server requests, which made the dev preview
// crawl on phones and bloats the production entry chunk.
//
// lazyRoute = React.lazy plus two things lazy alone can't do:
// 1. `.preload()` — lets IdleRoutePrefetch warm the chunk in the background.
// 2. Once the module is loaded, the wrapper renders the real component
//    DIRECTLY, bypassing Suspense. This matters because wouter's location
//    updates are sync external-store updates that React cannot transition,
//    so even an already-fulfilled lazy() promise commits the RouteLoading
//    fallback for a frame — a visible spinner blink on every navigation.
type RouteModule<P> = { default: ComponentType<P> };
function lazyRoute<P extends object>(loader: () => Promise<RouteModule<P>>) {
  let resolved: ComponentType<P> | null = null;
  let promise: Promise<RouteModule<P>> | undefined;
  const preload = () =>
    (promise ??= loader().then((m) => {
      resolved = m.default;
      return m;
    }));
  const Lazy = lazy(preload);
  function RouteComponent(props: P) {
    const Resolved = resolved;
    return Resolved ? <Resolved {...props} /> : <Lazy {...(props as any)} />;
  }
  RouteComponent.preload = preload;
  return RouteComponent;
}

const Chat = lazyRoute(() => import('@/pages/chat'));
const ChooseLanguage = lazyRoute(() => import('@/pages/choose-language'));
const CategoryDetail = lazyRoute(() => import('@/pages/category-detail'));
const Practice = lazyRoute(() => import('@/pages/practice'));
const Journey = lazyRoute(() => import('@/pages/journey'));
const Phrasebook = lazyRoute(() => import('@/pages/phrasebook'));
const Progress = lazyRoute(() => import('@/pages/progress'));
const Friends = lazyRoute(() => import('@/pages/friends'));
const Leaderboard = lazyRoute(() => import('@/pages/leaderboard'));
const Games = lazyRoute(() => import('@/pages/games/index'));
const GamesWordMatch = lazyRoute(() => import('@/pages/games/word-match'));
const GamesSpeedRound = lazyRoute(() => import('@/pages/games/speed-round'));
const GamesListenAndPick = lazyRoute(() => import('@/pages/games/listen-and-pick'));
const GamesPhraseBuilder = lazyRoute(() => import('@/pages/games/phrase-builder'));
const GamesScriptTrace = lazyRoute(() => import('@/pages/games/script-trace'));
// PROTOTYPE sandbox for stroke-based trace scoring. Unlisted: reachable by
// URL only and linked from nowhere, so it cannot be stumbled into.
const GamesScriptTraceProto = lazyRoute(
  () => import('@/pages/games/script-trace-proto'),
);
// Authoring tool for the stroke data the prototype needs. Also unlisted.
const GamesScriptTraceAuthor = lazyRoute(
  () => import('@/pages/games/script-trace-author'),
);
// Script Trace rebuilt on stroke scoring. Gated on authored content rather
// than a flag: it tells the learner plainly when its alphabet is unwritten.
const GamesScriptTraceGame = lazyRoute(
  () => import('@/pages/games/script-trace-game'),
);
const GamesBoloQuiz = lazyRoute(() => import('@/pages/games/bolo-quiz'));
const GamesTicketCheck = lazyRoute(() => import('@/pages/games/ticket-check'));
const GamesWrongPlatform = lazyRoute(() => import('@/pages/games/wrong-platform'));
const GamesWrongPlatform2 = lazyRoute(() => import('@/pages/games/wrong-platform-2'));
const GamesLuggageMatch = lazyRoute(() => import('@/pages/games/luggage-match'));
const GamesExpressListening = lazyRoute(() => import('@/pages/games/express-listening'));
const GamesSignalLights = lazyRoute(() => import('@/pages/games/signal-lights'));
const GamesStorybook = lazyRoute(() => import('@/pages/games/storybook'));
const GamesEmergency = lazyRoute(() => import('@/pages/games/emergency'));
const Bazaar = lazyRoute(() => import('@/pages/bazaar'));
const Account = lazyRoute(() => import('@/pages/account'));
const Contact = lazyRoute(() => import('@/pages/contact'));
const Subscription = lazyRoute(() => import('@/pages/subscription'));
const Upgrade = lazyRoute(() => import('@/pages/upgrade'));
const Family = lazyRoute(() => import('@/pages/family'));
const FamilyJoin = lazyRoute(() => import('@/pages/family-join'));
const Privacy = lazyRoute(() => import('@/pages/privacy'));
const Terms = lazyRoute(() => import('@/pages/terms'));
// Public per-language SEO pages (/languages/<slug>), no auth required.
const LearnLanguage = lazyRoute(() => import('@/pages/learn-language'));
// Public: a shared referral link lands here, signed in or not.
const Join = lazyRoute(() => import('@/pages/join'));
const NotFound = lazyRoute(() => import('@/pages/not-found'));
const Nest = lazyRoute(() => import('@/pages/nest'));

// Most-likely-next pages first; long tail after. Order matters because the
// prefetcher loads them one at a time.
const PREFETCH_ORDER = [
  Journey,
  Practice,
  Phrasebook,
  Chat,
  Games,
  Progress,
  CategoryDetail,
  Account,
  Friends,
  Upgrade,
  GamesWordMatch,
  GamesListenAndPick,
  GamesPhraseBuilder,
  GamesSpeedRound,
  GamesScriptTrace,
  GamesBoloQuiz,
  Subscription,
  Family,
  FamilyJoin,
  Contact,
  Privacy,
  Terms,
  LearnLanguage,
  Join,
  NotFound,
];

// Warms every lazy route chunk in the background so the first tap on
// Practice/Chat/Journey/etc. never shows the RouteLoading spinner.
//
// Rules that keep this from undoing the code-splitting win:
// - starts ~3s after mount (well past first paint and the home data fetches)
// - loads chunks SEQUENTIALLY, so it never floods a slow phone connection
// - skips entirely when the user asked to save data
// Failures are ignored — the route will simply load on demand as before.
function IdleRoutePrefetch() {
  useEffect(() => {
    const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      for (const route of PREFETCH_ORDER) {
        if (cancelled) return;
        await route.preload().catch(() => {});
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}

/** Minimal centered spinner shown while a lazy route chunk loads. */
function RouteLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center" role="status" aria-label="Loading page">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

// Clerk publishable key resolution.
//
// Trap (hit in production, July 2026): the Vite deployment build bakes whatever
// VITE_CLERK_PUBLISHABLE_KEY it sees at build time — and the Replit deployment
// build saw the workspace pk_test secret, not the production env var. Worse,
// publishableKeyFromHost returns a DEV fallback key unconditionally, so host
// derivation never ran and bolo-india.app served the dev Clerk instance.
//
// Fix: on the production custom domain, derive the pk_live from the hostname at
// runtime and ignore the baked env entirely (pk_live is deterministic:
// base64("clerk.<domain>$")). Every other host (replit.dev, replit.app,
// localhost) keeps using the baked dev key.
const PROD_CLERK_DOMAIN = 'bolo-india.app';
const pageHost = window.location.hostname.toLowerCase();
const isProdClerkHost =
  pageHost === PROD_CLERK_DOMAIN || pageHost === `www.${PROD_CLERK_DOMAIN}`;
const clerkPubKey = isProdClerkHost
  ? publishableKeyFromHost(PROD_CLERK_DOMAIN)
  : publishableKeyFromHost(
      window.location.hostname,
      import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
    );

// REQUIRED — copy verbatim. Empty in dev, auto-set in prod. Do NOT gate on env.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

// Clerk passes full paths to routerPush/routerReplace, but wouter's
// setLocation prepends the base — strip it to avoid doubling.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/mascot/mascot-wave.png`,
    socialButtonsPlacement: 'bottom' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  // THEME-AWARE, and it has to be. Reported 2026-08-23: dark mode hid part of
  // the sign-in screen. Every colour here and in `elements` below was a
  // hardcoded light-mode literal, so on a dark page the card flipped dark (it
  // uses bg-card, which follows the theme) while the title stayed text-slate-900
  // and the subtitle text-slate-500. Near-black on near-black: "Welcome back to
  // Bolo!" and its subtitle simply vanished.
  //
  // These now read the same CSS variables the rest of the app does, defined
  // once under :root and again under .dark in index.css, so both themes get
  // their own values from one source instead of one theme being written down
  // and the other left to chance.
  variables: {
    colorPrimary: '#4F46E5',
    colorForeground: 'hsl(var(--card-foreground))',
    colorMutedForeground: 'hsl(var(--muted-foreground))',
    colorDanger: '#DC2626',
    colorBackground: 'hsl(var(--card))',
    colorInput: 'hsl(var(--card))',
    colorInputForeground: 'hsl(var(--card-foreground))',
    colorNeutral: 'hsl(var(--border))',
    fontFamily: "'Inter', sans-serif",
    borderRadius: '0.625rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-card rounded-3xl w-[440px] max-w-full overflow-hidden shadow-xl border border-card-border',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-card-foreground font-extrabold text-2xl',
    headerSubtitle: 'text-muted-foreground font-medium',
    socialButtonsBlockButtonText: 'text-card-foreground font-semibold',
    formFieldLabel: 'text-card-foreground font-semibold',
    footerActionLink: 'text-[#4F46E5] font-bold hover:text-[#4338CA]',
    footerActionText: 'text-muted-foreground',
    dividerText: 'text-muted-foreground',
    identityPreviewEditButton: 'text-[#4F46E5]',
    formFieldSuccessText: 'text-emerald-600',
    alertText: 'text-card-foreground',
    logoBox: 'justify-center h-12',
    logoImage: 'h-12 w-auto',
    socialButtonsBlockButton:
      'border-2 border-card-border hover:bg-muted rounded-2xl',
    formButtonPrimary:
      'bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold rounded-2xl normal-case text-base shadow-none',
    formFieldInput:
      'border-2 border-card-border rounded-2xl focus:border-[#4F46E5]',
    footerAction: 'text-muted-foreground',
    dividerLine: 'bg-card-border',
    otpCodeFieldInput: 'border-2 border-card-border rounded-xl text-card-foreground',
    main: 'gap-4',
  },
};

// A `?redirect_url=` on the auth screens lets a landing page send the visitor
// back to itself once the account exists (the referral link uses this, so the
// referee sees their invite confirmed instead of silently arriving on home).
// Same-origin app paths only, validated by canonical origin in
// lib/auth-redirect: a shared link must never be able to bounce someone to
// another site the moment they finish signing up.
function useAuthRedirectUrl(): string | undefined {
  return safeAuthRedirect(useSearch(), basePath);
}

function SignInPage() {
  const redirectUrl = useAuthRedirectUrl();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={redirectUrl}
      />
    </div>
  );
}

function SignUpPage() {
  const redirectUrl = useAuthRedirectUrl();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={redirectUrl}
      />
    </div>
  );
}

// Base path: public landing for signed-out users, straight into the app for
// signed-in users.
function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/app" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

// Wraps authenticated-only pages; bounces signed-out visitors to the landing.
function Guard({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function AppRouter() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      {/* Public per-language marketing/SEO pages. The /languages prefix is
          deliberate: /learn/:categoryId is the authenticated CategoryDetail. */}
      <Route path="/languages/:slug" component={LearnLanguage} />
      {/* Referral landing. Deliberately NOT behind Guard: a signed-out visitor
          arriving here is the whole point, and the family invite link shows
          what guarding costs (Guard bounces to "/" and the token is lost). */}
      <Route path="/join/:code" component={Join} />
      <Route path="/join" component={Join} />
      <Route path="/choose-language">
        <Guard>
          <ChooseLanguage />
        </Guard>
      </Route>
      <Route path="/app">
        <Guard>
          <AppShell>
            <Home />
          </AppShell>
        </Guard>
      </Route>
      <Route path="/journey">
        <Guard>
          <AppShell>
            <Journey />
          </AppShell>
        </Guard>
      </Route>
      <Route path="/phrasebook">
        <Guard>
          <AppShell>
            <Phrasebook />
          </AppShell>
        </Guard>
      </Route>
      <Route path="/learn/:categoryId">
        <Guard>
          <CategoryDetail />
        </Guard>
      </Route>
      <Route path="/practice/:categoryId">
        <Guard>
          <Practice />
        </Guard>
      </Route>
      <Route path="/review">
        <Guard>
          <Practice mode="review" />
        </Guard>
      </Route>
      <Route path="/progress">
        <Guard>
          <AppShell>
            <Progress />
          </AppShell>
        </Guard>
      </Route>
      <Route path="/friends">
        <Guard>
          <AppShell>
            <Friends />
          </AppShell>
        </Guard>
      </Route>
      {/* Standing gets its own surface; /friends stays management. */}
      <Route path="/leaderboard">
        <Guard>
          <AppShell>
            <Leaderboard />
          </AppShell>
        </Guard>
      </Route>
      <Route path="/bazaar">
        <Guard>
          <AppShell>
            <Bazaar />
          </AppShell>
        </Guard>
      </Route>
      <Route path="/games">
        <Guard>
          <AppShell>
            <Games />
          </AppShell>
        </Guard>
      </Route>
      <Route path="/games/word-match">
        <Guard>
          <GamesWordMatch />
        </Guard>
      </Route>
      <Route path="/games/speed-round">
        <Guard>
          <GamesSpeedRound />
        </Guard>
      </Route>
      <Route path="/games/listen-and-pick">
        <Guard>
          <GamesListenAndPick />
        </Guard>
      </Route>
      <Route path="/games/phrase-builder">
        <Guard>
          <GamesPhraseBuilder />
        </Guard>
      </Route>
      <Route path="/games/script-trace">
        <Guard>
          <GamesScriptTrace />
        </Guard>
      </Route>
      <Route path="/games/script-trace-proto">
        <Guard>
          <GamesScriptTraceProto />
        </Guard>
      </Route>
      <Route path="/games/script-trace-author">
        <Guard>
          <GamesScriptTraceAuthor />
        </Guard>
      </Route>
      <Route path="/games/script-trace-game">
        <Guard>
          <GamesScriptTraceGame />
        </Guard>
      </Route>
      <Route path="/games/bolo-quiz">
        <Guard>
          <GamesBoloQuiz />
        </Guard>
      </Route>
      <Route path="/games/ticket-check">
        <Guard>
          <GamesTicketCheck />
        </Guard>
      </Route>
      {/* Part 2 FIRST: wouter matches in order and these are literal paths,
          but a future switch to a prefix match would have /games/wrong-platform
          swallow /games/wrong-platform-2 silently. Ordering costs nothing and
          removes the trap. */}
      <Route path="/games/wrong-platform-2">
        <Guard>
          <GamesWrongPlatform2 />
        </Guard>
      </Route>
      <Route path="/games/wrong-platform">
        <Guard>
          <GamesWrongPlatform />
        </Guard>
      </Route>
      <Route path="/games/luggage-match">
        <Guard>
          <GamesLuggageMatch />
        </Guard>
      </Route>
      <Route path="/games/express-listening">
        <Guard>
          <GamesExpressListening />
        </Guard>
      </Route>
      <Route path="/games/signal-lights">
        <Guard>
          <GamesSignalLights />
        </Guard>
      </Route>
      {/* The storybook reads ?journey=&zone=, defaulting to the zone that
          carries the free taste. One route, every book. */}
      <Route path="/games/storybook">
        <Guard>
          <GamesStorybook />
        </Guard>
      </Route>
      {/* THE EMERGENCY. Two callers, one screen: the journey sends
          ?journey=1&zone=N and gets the alarm, the film and five phrases;
          the Games hub sends nothing and gets a length picker and the game. */}
      <Route path="/games/emergency">
        <GamesEmergency />
      </Route>
      <Route path="/account">
        <Guard>
          <Account />
        </Guard>
      </Route>
      {/* Public: the /privacy and /terms pages link signed-out readers here.
          The API route is likewise mounted before requireAuth. */}
      <Route path="/contact" component={Contact} />
      <Route path="/account/subscription">
        <Guard>
          <Subscription />
        </Guard>
      </Route>
      <Route path="/chat">
        <Guard>
          <Chat />
        </Guard>
      </Route>
      <Route path="/family">
        <Guard>
          <Family />
        </Guard>
      </Route>
      <Route path="/family/join">
        <Guard>
          <FamilyJoin />
        </Guard>
      </Route>
      <Route path="/upgrade">
        <Guard>
          <Upgrade />
        </Guard>
      </Route>
      {/* THE NEST: internal tooling. It renders the app's own not-found page
          for anybody the server does not clear, so this route is
          indistinguishable from a typo unless you own the product. It sits
          before the catch-all for the ordinary reason, and note that
          bolo-india.app/nest already returned 200 before this existed, because
          the catch-all serves index.html for every unknown path. */}
      <Route path="/nest">
        <Nest />
      </Route>

      <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// Keeps PostHog + Sentry identity in sync with the Clerk session (user id
// only, never email), and fires sign_up_completed exactly once for a freshly
// created account. Detection is deliberately outside the auth screens: a user
// whose account was created moments ago is a new sign-up.
function AnalyticsIdentitySync() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    identifyUser(user?.id ?? null);
    setSentryUser(user?.id ?? null);
    if (user?.createdAt && Date.now() - user.createdAt.getTime() < 2 * 60 * 1000) {
      trackOnce(ANALYTICS_EVENTS.SIGN_UP_COMPLETED);
    }
  }, [isLoaded, user?.id, user?.createdAt]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back to Bolo!',
            subtitle: 'Sign in to keep practicing',
          },
        },
        signUp: {
          start: {
            title: 'Join Bolo!',
            subtitle: "Create an account and find your way back to your family's language",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      {/* Registers a fresh Clerk bearer token getter before QueryClientProvider
          and its children render, closing the startup race. Must be first. */}
      <ClerkAuthSync />
      <AnalyticsIdentitySync />
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LanguageProvider>
            <TooltipProvider>
              {/* What Bolo is wearing, resolved once for every mascot on
                  screen. Signed-out visitors fetch nothing (see the hook). */}
              <EquippedOutfitProvider>
                {/* Owns the one POST /referral/redeem call. Sits above the
                    router so a code stored before signup is still redeemed
                    when Clerk drops the new learner on home. */}
                <ReferralRedemptionProvider>
                  <AppRouter />
                </ReferralRedemptionProvider>
              </EquippedOutfitProvider>
              <IdleRoutePrefetch />
              {/* The stop transition, ABOVE the router on purpose: it covers
                  the navigation away from the journey, and anything mounted
                  inside AppRouter unmounts the moment the route changes.
                  Mobile twin sits beside BrandSplash in app/_layout.tsx. */}
              <StopSplash />
              <Toaster />
            </TooltipProvider>
          </LanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
