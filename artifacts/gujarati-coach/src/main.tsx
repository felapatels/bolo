import { createRoot } from 'react-dom/client';

import { initSentry } from './lib/sentry';
import { initAnalytics } from './lib/analytics';
import { cleanupStaleDevClerkCookies } from './lib/clerkCookieCleanup';
import { installStaleBuildRecovery } from './lib/staleBuild';

import App from './App';

// Purge stale dev-instance Clerk cookies left on the production domain from
// the pre-July-28-2026 dev-keyed window; must run before Clerk initializes.
cleanupStaleDevClerkCookies('bolo-india.app');

// A PUBLISH ROTATES EVERY CHUNK HASH, and a tab that was open across one asks
// for files that are gone. Installed before render so the listeners exist
// before the first lazy route can be reached. See lib/staleBuild.ts.
installStaleBuildRecovery();

// Both are no-ops unless their env keys (VITE_SENTRY_DSN / VITE_POSTHOG_KEY)
// are present. Initialize before render so early errors are captured.
initSentry();
initAnalytics();

import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
