import { ClerkProvider, SignIn, SignUp, Show } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Switch,
  Route,
  Redirect,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from './lib/queryClient';
import { LanguageProvider } from './lib/language-context';
import { ThemeProvider } from './lib/theme-context';
import { TourProvider } from './lib/tour-context';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/layout/app-shell';
import { GuidedTourOverlay } from '@/components/guided-tour-overlay';
import { TourAutoLauncher } from '@/components/tour-auto-launcher';

import Landing from '@/pages/landing';
import Home from '@/pages/home';
import Chat from '@/pages/chat';
import CategoryDetail from '@/pages/category-detail';
import Practice from '@/pages/practice';
import Progress from '@/pages/progress';
import Friends from '@/pages/friends';
import Games from '@/pages/games/index';
import GamesWordMatch from '@/pages/games/word-match';
import GamesSpeedRound from '@/pages/games/speed-round';
import GamesListenAndPick from '@/pages/games/listen-and-pick';
import GamesPhraseBuilder from '@/pages/games/phrase-builder';
import GamesScriptTrace from '@/pages/games/script-trace';
import GamesBoloQuiz from '@/pages/games/bolo-quiz';
import Account from '@/pages/account';
import Contact from '@/pages/contact';
import Subscription from '@/pages/subscription';
import Upgrade from '@/pages/upgrade';
import Family from '@/pages/family';
import FamilyJoin from '@/pages/family-join';
import Privacy from '@/pages/privacy';
import Terms from '@/pages/terms';
import NotFound from '@/pages/not-found';

// REQUIRED — copy verbatim. Resolves the key from window.location.hostname so the
// same build serves multiple Clerk custom domains.
const clerkPubKey = publishableKeyFromHost(
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
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: 'bottom' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: '#4F46E5',
    colorForeground: '#0F172A',
    colorMutedForeground: '#64748B',
    colorDanger: '#DC2626',
    colorBackground: '#FFFFFF',
    colorInput: '#FFFFFF',
    colorInputForeground: '#0F172A',
    colorNeutral: '#CBD5E1',
    fontFamily: "'Inter', sans-serif",
    borderRadius: '0.625rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-3xl w-[440px] max-w-full overflow-hidden shadow-xl border border-slate-200',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-slate-900 font-extrabold text-2xl',
    headerSubtitle: 'text-slate-500 font-medium',
    socialButtonsBlockButtonText: 'text-slate-700 font-semibold',
    formFieldLabel: 'text-slate-700 font-semibold',
    footerActionLink: 'text-[#4F46E5] font-bold hover:text-[#4338CA]',
    footerActionText: 'text-slate-500',
    dividerText: 'text-slate-400',
    identityPreviewEditButton: 'text-[#4F46E5]',
    formFieldSuccessText: 'text-emerald-600',
    alertText: 'text-slate-700',
    logoBox: 'justify-center h-12',
    logoImage: 'h-12 w-auto',
    socialButtonsBlockButton:
      'border-2 border-slate-200 hover:bg-slate-50 rounded-2xl',
    formButtonPrimary:
      'bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold rounded-2xl normal-case text-base shadow-none',
    formFieldInput:
      'border-2 border-slate-200 rounded-2xl focus:border-[#4F46E5]',
    footerAction: 'text-slate-500',
    dividerLine: 'bg-slate-200',
    otpCodeFieldInput: 'border-2 border-slate-200 rounded-xl text-slate-900',
    main: 'gap-4',
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
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
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/app">
        <Guard>
          <AppShell>
            <Home />
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
      <Route path="/games/bolo-quiz">
        <Guard>
          <GamesBoloQuiz />
        </Guard>
      </Route>
      <Route path="/account">
        <Guard>
          <Account />
        </Guard>
      </Route>
      <Route path="/contact">
        <Guard>
          <Contact />
        </Guard>
      </Route>
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
      <Route component={NotFound} />
    </Switch>
  );
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
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LanguageProvider>
            <TourProvider>
              <TooltipProvider>
                <AppRouter />
                <Toaster />
                <GuidedTourOverlay />
                <TourAutoLauncher />
              </TooltipProvider>
            </TourProvider>
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
