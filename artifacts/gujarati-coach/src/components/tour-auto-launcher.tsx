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

// Routes where we must never auto-launch the tour — the learner is mid-session
// and navigating away would interrupt their practice.
const BLOCKED_PREFIXES = ["/practice", "/learn", "/review"];

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
