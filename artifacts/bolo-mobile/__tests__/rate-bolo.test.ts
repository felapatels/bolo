/**
 * "RATE BOLO!", build 19. The decision tree in lib/store.ts, per platform,
 * with the store dependencies injected: jest has neither a Play nor an App
 * Store, and the whole point of the helper is what happens when they refuse.
 */
import {
  APP_STORE_WRITE_REVIEW_URL,
  PLAY_LISTING_URL,
  PLAY_MARKET_URL,
  rateBolo,
  rateDestination,
} from '@/lib/store';

function deps(overrides: Partial<Parameters<typeof rateBolo>[0]> = {}) {
  return {
    isAvailable: jest.fn(async () => true),
    requestReview: jest.fn(async () => undefined),
    open: jest.fn(async () => true),
    ...overrides,
  };
}

describe('rateBolo on Android', () => {
  it('uses the in-app Play review flow when Play offers it', async () => {
    const d = deps();
    await expect(rateBolo({ platform: 'android', ...d })).resolves.toBe('in-app');
    expect(d.requestReview).toHaveBeenCalledTimes(1);
    expect(d.open).not.toHaveBeenCalled();
  });

  it('falls back to the Play app when the in-app flow is unavailable', async () => {
    const d = deps({ isAvailable: jest.fn(async () => false) });
    await expect(rateBolo({ platform: 'android', ...d })).resolves.toBe('store');
    expect(d.requestReview).not.toHaveBeenCalled();
    expect(d.open).toHaveBeenCalledWith(PLAY_MARKET_URL);
  });

  it('falls back to the listing when the in-app flow THROWS (sideloaded APK)', async () => {
    const d = deps({ requestReview: jest.fn(async () => { throw new Error('no Play'); }) });
    await expect(rateBolo({ platform: 'android', ...d })).resolves.toBe('store');
    expect(d.open).toHaveBeenCalledWith(PLAY_MARKET_URL);
  });

  it('tries https when no app handles market://', async () => {
    const open = jest.fn(async (url: string) => {
      if (url.startsWith('market:')) throw new Error('no handler');
      return true;
    });
    const d = deps({ isAvailable: jest.fn(async () => false), open });
    await expect(rateBolo({ platform: 'android', ...d })).resolves.toBe('store');
    expect(open).toHaveBeenNthCalledWith(1, PLAY_MARKET_URL);
    expect(open).toHaveBeenNthCalledWith(2, PLAY_LISTING_URL);
  });
});

describe('rateBolo on iOS', () => {
  it('opens the App Store write-review page and never calls the review sheet', async () => {
    // TestFlight never shows SKStoreReviewController's sheet and Apple caps it
    // at three a year; a Rate row driving it would look dead to testers.
    const d = deps();
    await expect(rateBolo({ platform: 'ios', ...d })).resolves.toBe('store');
    expect(d.open).toHaveBeenCalledWith(APP_STORE_WRITE_REVIEW_URL);
    expect(d.requestReview).not.toHaveBeenCalled();
    expect(d.isAvailable).not.toHaveBeenCalled();
  });

  it('reports none when nothing can be opened, so the row can say so', async () => {
    const d = deps({ open: jest.fn(async () => { throw new Error('nope'); }) });
    await expect(rateBolo({ platform: 'ios', ...d })).resolves.toBe('none');
  });
});

describe('rateBolo elsewhere', () => {
  it('has nowhere to go on web', async () => {
    const d = deps();
    await expect(rateBolo({ platform: 'web', ...d })).resolves.toBe('none');
    expect(d.open).not.toHaveBeenCalled();
  });
});

describe('the caption names the store', () => {
  it.each([
    ['ios', 'the App Store'],
    ['android', 'Google Play'],
    ['web', 'the store'],
  ])('%s -> %s', (platform, name) => {
    expect(rateDestination(platform)).toBe(name);
  });
});

describe('the URLs agree with the store identities', () => {
  it('points at ascAppId and the Android package', () => {
    expect(APP_STORE_WRITE_REVIEW_URL).toBe(
      'https://apps.apple.com/app/id6790907772?action=write-review',
    );
    expect(PLAY_LISTING_URL).toBe(
      'https://play.google.com/store/apps/details?id=com.bolo.mobile',
    );
  });
});
