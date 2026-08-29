import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUpdateAccountPreferences,
  getGetAccountQueryKey,
  type Account,
} from '@workspace/api-client-react';
import type { MascotPose } from '@/components/Mascot';
import { track, ANALYTICS_EVENTS } from '@/lib/analytics';

// THE FIRST-RUN WALKTHROUGH, build 19. The Play testers asked for a short,
// skippable introduction; the paid testers' report already describes one.
// Web twin: artifacts/gujarati-coach/src/lib/walkthrough.ts, same steps, same
// words, same rules. Change both or neither.
//
// STEP ONE IS THE LANGUAGE PICKER: the modal with the search box and the
// coloured tiles that home's Practicing card and Account > Language open,
// NOT the plainer full-screen choose-language route (owner, 2026-08-29, on
// seeing that one: "what happened to the colors, and search bar"). The
// welcome screen opens the picker over card one for an account that has not
// chosen; closing it, with or without a pick, lands on the cards. The July
// 30 2026 decision that removed the old first-run redirect and let fresh
// accounts land on home with Hindi seeded survives as the SKIP path: skip at
// any point and you land on home with Hindi, exactly as before.
//
// ONCE MEANS ONCE, ON EVERY DEVICE. Finishing OR skipping writes the account's
// hasCompletedTour, a server-side preference that has existed since the old
// guided tour and that nothing had read or written since Task #906 retired
// it. A per-device flag would replay the walkthrough on every new phone and
// on web; a per-account one does not. The in-memory session marker below only
// covers the seconds between the tap and the PATCH landing, and a PATCH that
// never lands (offline) means the walkthrough returns next launch, which is
// the right failure direction for something meant to be seen once.
//
// EXISTING ACCOUNTS SEE IT ONCE TOO. hasCompletedTour defaults to false and
// the retired tour only ever set it for the handful of accounts that finished
// it, so every learner meets the walkthrough on their next launch after this
// ships. For the paid testers that is the point; for everyone else it is one
// skippable screen.

export type WalkthroughStep = {
  key: string;
  pose: MascotPose;
  title: string;
  body: string;
};

export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  {
    key: 'journey',
    pose: 'wave',
    title: 'Welcome aboard',
    body: 'Every language is a train line. Ride it stop by stop, from your first hello to real conversations.',
  },
  {
    key: 'speak',
    pose: 'thinking',
    title: 'Say it out loud',
    body: 'Listen to a phrase, then speak it back. Bolo listens, and saying it aloud is how it sticks.',
  },
  // Owner, 2026-08-29, on seeing the cards: "the walkthrough doesn't say
  // anything about bolo learning from you and getting more accurate and
  // personalized as you move forward."
  {
    key: 'learns',
    pose: 'thumbsup',
    title: 'Bolo learns you',
    body: 'Every word you say teaches Bolo how you sound. Scoring gets more accurate, and more personal, the further you go.',
  },
  // The last line is the owner's, 2026-08-29: "welcome tour should say,
  // watch out for emergencies and unexpected fun!"
  {
    key: 'chai',
    pose: 'cheer',
    title: 'Chai, games and friends',
    body: 'Practice earns XP and Chai. Play quick games, add a friend, and climb the board together. Watch out for emergencies and unexpected fun!',
  },
];

export type FirstRunPrefs = {
  hasCompletedTour?: boolean;
  hasChosenLanguage?: boolean;
};

export const WELCOME_ROUTE = '/(app)/welcome' as const;

/**
 * Where a first run goes, or null when there is nothing left to show. The
 * welcome screen itself decides whether the picker opens on top (it reads
 * hasChosenLanguage), so the gate has one destination.
 *
 * Strictly `=== false`: a server that omits the field (none does today) must
 * read as "done", because the failure mode of the other reading is nagging
 * every learner on every launch.
 */
export function firstRunHref(prefs: FirstRunPrefs): typeof WELCOME_ROUTE | null {
  if (prefs.hasCompletedTour !== false) return null;
  return WELCOME_ROUTE;
}

// Session-scoped "already dismissed" marker, the same external-store shape
// as lib/language-step.ts, so the layout gate re-evaluates the instant the
// learner taps Skip or Let's go rather than after the PATCH round trip.
let dismissed = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function hasDismissedWalkthrough(): boolean {
  return dismissed;
}

export function markWalkthroughDismissed(): void {
  dismissed = true;
  notify();
}

/** Test-only: simulates a cold start (the in-memory marker clears). */
export function resetWalkthroughForTests(): void {
  dismissed = false;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWalkthroughDismissed(): boolean {
  return useSyncExternalStore(subscribe, hasDismissedWalkthrough);
}

export type WalkthroughExit = 'done' | 'skipped';

/**
 * Retire the walkthrough for this account: the session marker now, the
 * server flag in one PATCH, and the response merged straight into the account
 * cache (no refetch) so nothing downstream sees a stale hasCompletedTour.
 */
export function useFinishWalkthrough() {
  const updatePrefs = useUpdateAccountPreferences();
  const queryClient = useQueryClient();

  return (reason: WalkthroughExit, step: number) => {
    markWalkthroughDismissed();
    track(ANALYTICS_EVENTS.WALKTHROUGH_FINISHED, { reason, step });
    updatePrefs.mutate(
      { data: { hasCompletedTour: true } },
      {
        onSuccess: (res) => {
          const key = getGetAccountQueryKey();
          const current = queryClient.getQueryData<Account>(key);
          if (current) {
            queryClient.setQueryData(key, {
              ...current,
              preferences: res.preferences,
            });
          }
        },
      },
    );
  };
}
