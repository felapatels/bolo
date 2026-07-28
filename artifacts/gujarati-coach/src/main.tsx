import { createRoot } from 'react-dom/client';

import { initSentry } from './lib/sentry';
import { initAnalytics } from './lib/analytics';

import App from './App';

// Both are no-ops unless their env keys (VITE_SENTRY_DSN / VITE_POSTHOG_KEY)
// are present. Initialize before render so early errors are captured.
initSentry();
initAnalytics();

import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
