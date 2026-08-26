import {
  shouldShowPrimer,
  nextPrimerRecord,
  PRIMER_MAX_SHOWS,
  PRIMER_COOLDOWN_MS,
  type PrimerState,
} from '@/lib/notificationPrimer';

// The back-off rules around the ONE iOS permission dialog. Pure, so they are
// tested without a device.
const NOW = 1_787_700_000_000;

function state(over: Partial<PrimerState> = {}): PrimerState {
  return {
    supported: true,
    granted: false,
    canAskAgain: true,
    ready: true,
    timesShown: 0,
    lastShownAt: null,
    ...over,
  };
}

describe('shouldShowPrimer', () => {
  it('asks a freshly signed-up learner', () => {
    expect(shouldShowPrimer(state(), NOW)).toBe(true);
  });

  it('never asks before the first-run language step is done', () => {
    // Otherwise the primer renders on top of the language screen and the
    // learner meets two full-screen decisions at once.
    expect(shouldShowPrimer(state({ ready: false }), NOW)).toBe(false);
  });

  it('never asks when permission is already granted', () => {
    expect(shouldShowPrimer(state({ granted: true }), NOW)).toBe(false);
  });

  it('never asks once the OS will not re-prompt', () => {
    // canAskAgain false means requestPermissionsAsync shows nothing. A primer
    // would promise a dialog that cannot appear.
    expect(shouldShowPrimer(state({ canAskAgain: false }), NOW)).toBe(false);
  });

  it('never asks where notifications are not supported', () => {
    expect(shouldShowPrimer(state({ supported: false }), NOW)).toBe(false);
  });

  it('stops after the cap', () => {
    expect(shouldShowPrimer(state({ timesShown: PRIMER_MAX_SHOWS - 1, lastShownAt: null }), NOW)).toBe(true);
    expect(shouldShowPrimer(state({ timesShown: PRIMER_MAX_SHOWS }), NOW)).toBe(false);
  });

  it('waits a week between asks', () => {
    const yesterday = NOW - 24 * 60 * 60 * 1000;
    expect(shouldShowPrimer(state({ timesShown: 1, lastShownAt: yesterday }), NOW)).toBe(false);

    const longAgo = NOW - PRIMER_COOLDOWN_MS - 1;
    expect(shouldShowPrimer(state({ timesShown: 1, lastShownAt: longAgo }), NOW)).toBe(true);
  });
});

describe('nextPrimerRecord', () => {
  it('counts the show whatever the learner answered', () => {
    // Recorded on SHOW, not on accept. A "not now" that did not count would
    // re-ask on the next launch, which is the nagging this exists to bound.
    expect(nextPrimerRecord({ timesShown: 0 }, NOW)).toEqual({
      timesShown: 1,
      lastShownAt: NOW,
    });
  });
});
