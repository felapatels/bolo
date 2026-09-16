import { createRoot } from 'react-dom/client';

import { initSentry } from './lib/sentry';
import { initAnalytics, track, ANALYTICS_EVENTS } from './lib/analytics';
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
// app_open (audit 2026-09-16): once per browser tab session, so a refresh or a
// route change does not count as another open.
try {
  if (!sessionStorage.getItem('bolo.analytics.app_open')) {
    sessionStorage.setItem('bolo.analytics.app_open', '1');
    track(ANALYTICS_EVENTS.APP_OPEN, { cold_start: true });
  }
} catch {
  track(ANALYTICS_EVENTS.APP_OPEN, { cold_start: true });
}

import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
