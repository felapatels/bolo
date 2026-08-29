import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateAccountPreferences,
  getGetAccountQueryKey,
  type Account,
} from "@workspace/api-client-react";
import type { MascotPose } from "@/components/mascot";
import { track, ANALYTICS_EVENTS } from "@/lib/analytics";

// THE FIRST-RUN WALKTHROUGH, build 19. Mobile twin:
// artifacts/bolo-mobile/lib/walkthrough.ts, which carries the full reasoning;
// same steps, same words, same rules. Change both or neither.
//
// In one line: step one is the language chooser (opened with ?next=welcome),
// then three cards, skippable at every step, shown ONCE per account by way of
// the server-side hasCompletedTour flag that the retired guided tour left
// behind. Skipping lands on home with the seeded language, which is exactly
// what the July 30 2026 decision made the default, so that behaviour survives
// as the skip path.

export type WalkthroughStep = {
  key: string;
  pose: MascotPose;
  title: string;
  body: string;
};

export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  {
    key: "journey",
    pose: "wave",
    title: "Welcome aboard",
    body: "Every language is a train line. Ride it stop by stop, from your first hello to real conversations.",
  },
  {
    key: "speak",
    pose: "thinking",
    title: "Say it out loud",
    body: "Listen to a phrase, then speak it back. Bolo listens, and saying it aloud is how it sticks.",
  },
  {
    key: "chai",
    pose: "cheer",
    title: "Chai, games and friends",
    body: "Practice earns XP and Chai. Play quick games, add a friend, and climb the board together.",
  },
];

export type FirstRunPrefs = {
  hasCompletedTour?: boolean;
  hasChosenLanguage?: boolean;
};

export const CHOOSER_THEN_WELCOME = "/choose-language?next=welcome";
export const WELCOME = "/welcome";

/**
 * Where a first run goes, or null when there is nothing left to show.
 * Strictly `=== false`: a server that omits the field reads as done, because
 * the other reading nags every learner on every visit.
 */
export function firstRunPath(prefs: FirstRunPrefs): string | null {
  if (prefs.hasCompletedTour !== false) return null;
  if (prefs.hasChosenLanguage === true) return WELCOME;
  return CHOOSER_THEN_WELCOME;
}

// Session-scoped "already dismissed" marker, the same sessionStorage shape as
// lib/language-step.ts: it covers the moment between the tap and the PATCH
// landing, and a PATCH that never lands means the walkthrough returns next
// session, the right failure direction for something meant to be seen once.
const DISMISS_KEY = "bolo.walkthroughDismissed";

export function hasDismissedWalkthrough(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWalkthroughDismissed(): void {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Private mode etc.: worst case the cards come back once this session.
  }
}

export type WalkthroughExit = "done" | "skipped";

/**
 * Retire the walkthrough for this account: the session marker now, the
 * server flag in one PATCH, and the response merged straight into the account
 * cache (no refetch) so the gate never sees a stale hasCompletedTour.
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
