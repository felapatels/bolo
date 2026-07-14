---
name: Local daily reminders (Expo)
description: How Bolo! mobile schedules device-local streak reminders and the constraints that shaped it
---

Daily practice reminders are device-local notifications (no push backend).

**Key constraints / decisions:**
- Local notifications cannot evaluate conditions ("has the learner practiced?")
  at fire time. So the app **re-derives the whole schedule** (cancel-all +
  schedule next 7 dated occurrences) on app open, on foreground, and after any
  preference change — dropping today's slot once `attemptsToday > 0` and
  rebuilding copy from `currentStreakDays`.
- Pure logic (quiet hours, cadence days, next-occurrence dates, streak/milestone
  copy) lives in a platform-free module so jest tests need no native mocks; the
  expo-notifications/AsyncStorage plumbing is a separate module.
- Reminder prefs are device-authoritative (stored in AsyncStorage); only
  enabled+time are mirrored to the account preferences endpoint for
  cross-device visibility. Cadence days + quiet hours exist only on-device.
- Install expo packages with `pnpm exec expo install <pkg>` — plain `pnpm add`
  picked an SDK-incompatible major for expo-notifications (57.x instead of the
  SDK 54-matched 0.32.x).
- Tapping a reminder routes to a stable resolver route that picks the best
  topic and redirects into practice, so notification payloads never embed a
  category id that could go stale.

**Expo Go crash guard:** expo-notifications' native module is absent in Android Expo Go (SDK 53+); any touch of it (even module-scope `setNotificationHandler` in the signed-in tree) can crash the app. `remindersSupported` must exclude web AND (android + `Constants.executionEnvironment === 'storeClient'`), and import-time calls stay in try/catch. Reminders remain enabled in dev/prod builds.
