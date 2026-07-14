// Device-side daily reminder plumbing: persisting reminder preferences locally
// (reminders are scheduled per-device, so the device owns the full preference
// set) and (re)scheduling the local notifications from those preferences.
// All the pure math and copy live in lib/reminder-logic.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  buildReminderCopy,
  computeUpcomingReminderDates,
  DEFAULT_REMINDER_PREFS,
  type ReminderPrefs,
} from '@/lib/reminder-logic';

const PREFS_KEY = 'bolo.reminder-prefs.v1';

/** Where a tapped reminder routes: a resolver that starts a practice session. */
export const REMINDER_TARGET_ROUTE = '/(app)/practice/daily' as const;

const ANDROID_CHANNEL_ID = 'daily-reminders';

/** Local notifications never work in the web preview; everything no-ops there. */
export const remindersSupported = Platform.OS !== 'web';

export async function loadReminderPrefs(): Promise<ReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_REMINDER_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReminderPrefs>;
    return {
      ...DEFAULT_REMINDER_PREFS,
      ...parsed,
      days: Array.isArray(parsed.days)
        ? parsed.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : DEFAULT_REMINDER_PREFS.days,
    };
  } catch {
    return DEFAULT_REMINDER_PREFS;
  }
}

export async function saveReminderPrefs(prefs: ReminderPrefs): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/** Current OS notification permission, normalized. */
export async function getNotificationPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  if (!remindersSupported) return { granted: false, canAskAgain: false };
  const p = await Notifications.getPermissionsAsync();
  return { granted: p.granted, canAskAgain: p.canAskAgain };
}

export async function requestNotificationPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  if (!remindersSupported) return { granted: false, canAskAgain: false };
  const p = await Notifications.requestPermissionsAsync();
  return { granted: p.granted, canAskAgain: p.canAskAgain };
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Daily practice reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

/**
 * Rebuilds the device's scheduled reminders from the stored preferences and
 * the learner's current progress. Called on app open, on foreground, and after
 * any preference change — local notifications can't check "did they practice?"
 * at fire time, so we re-derive the schedule whenever fresh data is available:
 * today's slot is dropped once the learner has practiced, and the copy is
 * rebuilt from the current streak.
 */
export async function rescheduleReminders(input: {
  streakDays: number;
  practicedToday: boolean;
}): Promise<void> {
  if (!remindersSupported) return;
  try {
    const prefs = await loadReminderPrefs();
    const { granted } = await getNotificationPermission();

    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!prefs.enabled || !granted) return;

    await ensureAndroidChannel();
    const copy = buildReminderCopy(input.streakDays);
    const dates = computeUpcomingReminderDates(
      prefs,
      new Date(),
      input.practicedToday,
    );
    for (const date of dates) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: copy.title,
          body: copy.body,
          sound: 'default',
          data: { url: REMINDER_TARGET_ROUTE },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          channelId: ANDROID_CHANNEL_ID,
        },
      });
    }
  } catch {
    // Scheduling is best-effort; a failure here must never break the app.
  }
}

/** Clears every scheduled reminder (used when the learner turns them off). */
export async function cancelAllReminders(): Promise<void> {
  if (!remindersSupported) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Best-effort.
  }
}
