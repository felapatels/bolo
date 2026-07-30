import { useEffect, useRef } from "react";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import {
  useGetAccount,
  getGetAccountQueryKey,
  useUpdateAccountPreferences,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTour, TOUR_STEPS } from "@/lib/tour-context";
import { hasSkippedLanguageStep } from "@/lib/language-step";

// Routes where we must never auto-launch the tour — the learner is mid-session
// and navigating away would interrupt their practice. The language-selection
// step is blocked too: the sequence is selection → home → tour, never a tour
// over the selection screen.
const BLOCKED_PREFIXES = ["/practice", "/learn", "/review", "/choose-language"];

/**
 * Mounts silently in the authenticated app shell.
 *
 * - On the learner's first authenticated visit (account.preferences.learning.hasCompletedTour
 *   is false), it auto-opens the guided tour.
 * - Skips auto-launch if the learner is currently inside a practice or lesson
 *   session so the tour never interrupts mid-activity.
 * - When the tour finishes or is skipped, it marks the tour as completed via
 *   PATCH /account/preferences so it never auto-launches again.
 *
 * Renders no UI of its own — the visible overlay is <GuidedTourOverlay />.
 */
export function TourAutoLauncher() {
  const { isSignedIn } = useUser();
  const [location] = useLocation();
  const { data: account } = useGetAccount({
    query: {
      enabled: !!isSignedIn,
      queryKey: getGetAccountQueryKey(),
    },
  });
  const updatePrefs = useUpdateAccountPreferences();
  const queryClient = useQueryClient();
  const { startTour } = useTour();
  const launched = useRef(false);

  useEffect(() => {
    // Wait until account data is ready and we haven't already triggered this.
    if (!account || launched.current) return;
    // If the learner has already completed the tour, do nothing.
    if (account.preferences.learning.hasCompletedTour) return;
    // Don't interrupt an active practice / lesson / review session.
    if (BLOCKED_PREFIXES.some((prefix) => location.startsWith(prefix))) return;
    // B1 sequence is selection → home → tour: a truly fresh account (language
    // step unresolved) must not get the tour yet. Without this, the launcher
    // races the LanguageChoiceGate redirect on first sign-in — startTour
    // navigates to step 1's route (/app) in the same commit as the gate's
    // Redirect to /choose-language, the navigations cancel out, and the
    // learner sees the tour over a blank page. The effect re-runs on location
    // change (post-skip) or account-cache update (post-choice), so the tour
    // launches once the learner actually lands on home.
    if (
      !account.preferences.learning.hasChosenLanguage &&
      !hasSkippedLanguageStep()
    ) {
      return;
    }

    launched.current = true;

    // Mark completed via the server so this never re-triggers, then optimistically
    // update the query cache so the "Replay" button state stays consistent.
    function markDone() {
      updatePrefs.mutate(
        { data: { hasCompletedTour: true } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getGetAccountQueryKey(),
            });
          },
          onError: () => {
            // Non-fatal — the tour still closed correctly; it may re-appear on
            // the next visit if the write failed, which is acceptable.
          },
        },
      );
    }

    startTour({ steps: TOUR_STEPS, onDone: markDone });
  }, [account, location, startTour, updatePrefs, queryClient]);

  return null;
}
