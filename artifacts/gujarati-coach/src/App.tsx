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
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import Landing from '@/pages/landing';
import Home from '@/pages/home';
import CategoryDetail from '@/pages/category-detail';
import Practice from '@/pages/practice';
import Progress from '@/pages/progress';
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
    colorPrimary: '#F5871F',
    colorForeground: '#111827',
    colorMutedForeground: '#64748B',
    colorDanger: '#EF4444',
    colorBackground: '#FFFFFF',
    colorInput: '#FFFFFF',
    colorInputForeground: '#111827',
    colorNeutral: '#CBD5E1',
    fontFamily: "'Bricolage Grotesque', sans-serif",
    borderRadius: '1rem',
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
    footerActionLink: 'text-[#F5871F] font-bold hover:text-[#d96f0a]',
    footerActionText: 'text-slate-500',
    dividerText: 'text-slate-400',
    identityPreviewEditButton: 'text-[#F5871F]',
    formFieldSuccessText: 'text-emerald-600',
    alertText: 'text-slate-700',
    logoBox: 'justify-center h-12',
    logoImage: 'h-12 w-auto',
    socialButtonsBlockButton:
      'border-2 border-slate-200 hover:bg-slate-50 rounded-2xl',
    formButtonPrimary:
      'bg-[#F5871F] hover:bg-[#e8790f] text-white font-bold rounded-2xl normal-case text-base shadow-none',
    formFieldInput:
      'border-2 border-slate-200 rounded-2xl focus:border-[#F5871F]',
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
      <Route path="/app">
        <Guard>
          <Home />
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
          <Progress />
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
            subtitle: 'Create an account to start speaking',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <TooltipProvider>
            <AppRouter />
            <Toaster />
          </TooltipProvider>
        </LanguageProvider>
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
