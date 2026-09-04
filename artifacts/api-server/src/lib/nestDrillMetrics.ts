/**
 * WHAT EACH NEST NUMBER COUNTS, and the note the drill panel prints under it.
 *
 * ITS OWN MODULE so a test can hold the cockpit and the server to the same list
 * of metric names without importing routes/nest.ts, which pulls in @workspace/db
 * and therefore needs a DATABASE_URL. This map is pure data; the test that
 * guards it now runs on a Mac like the rest of the Nest's structural checks.
 *
 * A tile whose data-metric the server does not know answers 400 on click, which
 * reads as a broken page rather than a missing case, and nothing else in the app
 * would ever notice: the Nest is the one screen with no user to complain.
 */
export const DRILL_METRICS: Record<
  string,
  { label: string; note: string; windowed: boolean }
> = {
  accounts: {
    label: "Accounts",
    note: "Every account, ignoring the date range. A snapshot of the users table.",
    windowed: false,
  },
  paid: {
    label: "Paid",
    note:
      "tier is not free AND subscription_status is active, right now. A sandbox " +
      "or TestFlight purchase looks identical here and bills nothing: RevenueCat " +
      "sends the environment on every webhook and nothing stores it yet, so check " +
      "the provider and the dates by eye.",
    windowed: false,
  },
  free: {
    label: "Free",
    note: "Everybody who is not paid, right now. Paid plus free is the account total.",
    windowed: false,
  },
  reachable: {
    label: "Reachable by push",
    note:
      "Accounts holding at least one live push token, ranked by how many devices. " +
      "This is the ONLY thing that decides whether a reminder can arrive: the " +
      "sender gates on the window, the streak, not-already-sent and a token, and " +
      "never reads the reminder preference. Disabled tokens are excluded because " +
      "Expo answered DeviceNotRegistered for them.",
    windowed: false,
  },
  remindersOn: {
    label: "Reminder preference on",
    note:
      "Accounts whose dailyReminderEnabled is true. WORTH KNOWING: this column " +
      "is written by the account screen and read back by it, and nothing else in " +
      "the product consults it. It does not turn reminders on and clearing it " +
      "does not turn them off.",
    windowed: false,
  },
  reporters: {
    label: "Reporters",
    note:
      "Accounts that have filed at least one phrase report, ever, ranked by how " +
      "many they filed. LIFETIME, ignoring the date range, exactly as the tile " +
      "is. Added build 26 on the owner's ask that every stat drills down; it was " +
      "the one Flagged tile whose rows are PEOPLE, so it reuses this panel rather " +
      "than needing a second shape. The other three Flagged numbers count " +
      "reports and phrases, which this panel cannot describe.",
    windowed: false,
  },
  trialing: {
    label: "Trialing",
    note: "subscription_status is trialing, right now.",
    windowed: false,
  },
  signups: {
    label: "Sign ups",
    note: "Accounts created inside the selected window.",
    windowed: true,
  },
  activeUsers: {
    label: "Active learners",
    note:
      "Distinct people who recorded an attempt inside the window, ranked by how " +
      "many. NOT logins: this counts practice. Who is merely SIGNED IN is a " +
      "different question and /nest/live answers it from Clerk.",
    windowed: true,
  },
  attempts: {
    label: "Practice attempts",
    note: "Who made them, ranked. The tile's number is the sum of this column.",
    windowed: true,
  },
  games: {
    label: "Games",
    note: "Finished game sessions inside the window, by learner.",
    windowed: true,
  },
  chats: {
    label: "Chat replies",
    note: "Chat turns inside the window, by learner.",
    windowed: true,
  },
  letterDrills: {
    label: "Letter drills passed",
    note:
      "Letter stops CLEARED inside the window, by learner, not merely played. " +
      "The bar is the stop's own (LETTER_STOP_PASS of its length, read from " +
      "@workspace/script-trace rather than typed in here), so this panel and " +
      "the screen the learner saw cannot disagree about what passing means. " +
      "The letter stop is position 4 of every zone and is the only thing in " +
      "the app that asks somebody to READ; tracing at stop 2 teaches the hand.",
    windowed: true,
  },
  giftsToday: {
    label: "Gifts opened today",
    note:
      "Learners who opened the daily gift box on today's UTC day key. THE TAP " +
      "IS THE GRANT since 2026-09-04, so this is also the list of everybody " +
      "who earned any Chai for showing up today: the silent grant on the first " +
      "attempt is gone. Not windowed, because the box forfeits at the end of " +
      "the local day and 'today' is the only question about it that expires. " +
      "UTC rather than each learner's own zone, which is right to within a few " +
      "hours at the edges.",
    windowed: false,
  },
  giftRuns: {
    label: "Longest gift runs",
    note:
      "Learners ranked by their longest run of consecutive days with the box " +
      "opened, computed from the ledger by gaps and islands. There is no stored " +
      "counter to read: the ladder rides the practice streak and keeps nothing " +
      "of its own, which is exactly why streak repair mends it. The Chai caps " +
      "at a week, so this is the number that says whether anybody goes past it.",
    windowed: false,
  },
};
