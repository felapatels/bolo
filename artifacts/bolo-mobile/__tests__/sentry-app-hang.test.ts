import { jest } from '@jest/globals';

// APP HANG TRACKING IS A CONFIG LINE, AND A CONFIG LINE IS THE EASIEST THING IN
// A CODEBASE TO LOSE. It was added 2026-09-18 to answer whether fourteen
// WatchdogTermination reports across four forks were real kills or the iOS
// SDK's own inference. Nothing in the app reads it back, no screen changes, and
// no other test touches lib/sentry's init, so a future edit to initSentry could
// drop it and every suite would stay green while the fleet quietly went blind
// again.
//
// This pins the two values that matter and says why each one is what it is.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setUser: jest.fn(),
  captureException: jest.fn(),
}));

describe('initSentry', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    // clearAllMocks, not just resetModules: the mocked module object survives a
    // module registry reset, so without this the second case counts the first
    // case's init call and passes or fails for the wrong reason.
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, EXPO_PUBLIC_SENTRY_DSN: 'https://k@example.test/1' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('turns app hang tracking on, at two seconds', () => {
    const Sentry = require('@sentry/react-native');
    const { initSentry } = require('@/lib/sentry');

    initSentry();

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const options = (Sentry.init as jest.Mock).mock.calls[0][0] as Record<string, unknown>;

    // Without this the SDK reports a tombstone with no stack. With it, a
    // blocked main thread arrives with a stack and a screen name.
    expect(options.enableAppHangTracking).toBe(true);

    // Two, not the SDK default of one. The splash film runs on the launch path
    // and a one-second threshold would report the splash as a hang.
    expect(options.appHangTimeoutInterval).toBe(2);
  });

  // THE NO-DSN CASE CANNOT BE TESTED FROM HERE, and finding that out is worth
  // recording. Expo's babel plugin INLINES every process.env.EXPO_PUBLIC_*
  // reference as a literal at transform time, so lib/sentry's `const dsn` is
  // already a fixed string by the time jest runs. Deleting the variable at
  // runtime changes nothing, and a test asserting init is skipped passes or
  // fails for reasons that have nothing to do with the code. Left unwritten on
  // purpose rather than written and muted.
});
