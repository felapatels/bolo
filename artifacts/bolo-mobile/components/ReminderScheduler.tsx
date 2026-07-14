// Invisible component mounted inside the signed-in providers. It owns the two
// runtime halves of daily reminders:
//  1. keeping the device's scheduled notifications in sync with the learner's
//     progress (skip today once practiced, streak-aware copy), and
//  2. routing a tapped reminder straight into a practice session.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  getGetProgressSummaryQueryKey,
  useGetProgressSummary,
} from '@workspace/api-client-react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  REMINDER_TARGET_ROUTE,
  remindersSupported,
  rescheduleReminders,
} from '@/lib/reminders';

// Show reminders even if the app happens to be foregrounded when one fires.
// Wrapped defensively: this runs at import time inside the signed-in tree, so
// a missing/limited native module (e.g. Expo Go) must never crash the app.
if (remindersSupported) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Best-effort; reminders simply won't present while foregrounded.
  }
}

export function ReminderScheduler() {
  const router = useRouter();
  const { activeLang } = useLanguage();
  const summary = useGetProgressSummary(
    { lang: activeLang },
    {
      query: {
        enabled: remindersSupported && !!activeLang,
        queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }),
      },
    },
  );

  const streakDays = summary.data?.currentStreakDays;
  const attemptsToday = summary.data?.attemptsToday;

  // Re-derive the schedule whenever fresh progress data lands.
  useEffect(() => {
    if (!remindersSupported) return;
    if (streakDays == null || attemptsToday == null) return;
    rescheduleReminders({ streakDays, practicedToday: attemptsToday > 0 });
  }, [streakDays, attemptsToday]);

  // Refetch progress when the app returns to the foreground so the schedule
  // reflects practice done since (possibly on another device).
  const refetchRef = useRef(summary.refetch);
  refetchRef.current = summary.refetch;
  useEffect(() => {
    if (!remindersSupported) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetchRef.current();
    });
    return () => sub.remove();
  }, []);

  // Tapping a reminder deep-links into a practice session.
  useEffect(() => {
    if (!remindersSupported) return;
    const route = (resp: Notifications.NotificationResponse | null) => {
      const url = resp?.notification.request.content.data?.url;
      if (url === REMINDER_TARGET_ROUTE) router.push(REMINDER_TARGET_ROUTE);
    };
    // Cold start from a notification tap.
    Notifications.getLastNotificationResponseAsync()
      .then(route)
      .catch(() => {
        // Best-effort on partially supported runtimes (e.g. Expo Go).
      });
    const sub = Notifications.addNotificationResponseReceivedListener(route);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
