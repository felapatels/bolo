// Task #1089: Settings is the app's only unmasked API failure surface, the
// screen App Review saw an error on. Two things must hold forever after:
//
// 1. The copy must say WHICH kind of failure it was. A rejected session is a
//    sign-in problem; telling that learner to "check your connection" sends
//    them down the wrong path (and told us nothing about build 34).
// 2. The failure must be self-describing: the endpoint + status (+ Clerk's
//    auth reason) are printed on screen AND reported to Sentry, and every
//    non-2xx response anywhere in the app leaves a breadcrumb.
//
// Harness shape follows subscription.test.tsx: the real screen renders with
// its data hooks stubbed, so the error branches are exercised for real.

import React from 'react';
import { Alert } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import * as Sentry from '@sentry/react-native';

const mockState: Record<string, any> = {};

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: jest.fn(), invalidateQueries: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: null }),
  useClerk: () => ({ signOut: jest.fn() }),
}));

// The shared API client is replaced wholesale, so the breadcrumb installer's
// registration point has to be part of the factory too.
jest.mock('@workspace/api-client-react', () => ({
  useGetAccount: () => mockState.account,
  getGetAccountQueryKey: () => ['account'],
  useUpdateAccountProfile: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateAccountPreferences: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteAccount: () => ({ mutateAsync: jest.fn(), isPending: false }),
  setFailedResponseObserver: jest.fn(),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ activeLanguage: 'gu', languages: [] }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useThemePref: () => ({ themePref: 'system', setThemePref: jest.fn() }),
  useThemePrefValue: () => 'system',
}));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    TAB_BAR_CLEARANCE: 0,
    RAISED_PARROT_CLEARANCE: 0,
  };
});

jest.mock('@/components/FunFactLoader', () => {
  const { View } = require('react-native');
  return { FunFactLoader: () => <View testID="loader" /> };
});

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

// Imported after the mocks are declared.
import AccountScreen from '@/app/(app)/account/index';
import { installApiFailureBreadcrumbs } from '@/lib/apiErrors';
import { setFailedResponseObserver } from '@workspace/api-client-react';

// ------------------------------- fixtures ---------------------------------

/** An error shaped exactly like the shared client's ApiError. */
function apiError(status: number, path: string, headers: Record<string, string> = {}) {
  const err = new Error(`HTTP ${status}`);
  Object.assign(err, {
    name: 'ApiError',
    status,
    statusText: '',
    url: `https://bolo-india.app${path}?x=1`,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  });
  return err;
}

function errorQuery(error: unknown) {
  return {
    data: undefined,
    isLoading: false,
    isError: true,
    isSuccess: false,
    error,
    refetch: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

// --------------------------------- tests ----------------------------------

describe('Settings load failure', () => {
  it('calls a rejected session a sign-in problem, not a connection problem', () => {
    mockState.account = errorQuery(
      apiError(401, '/api/account', {
        'x-clerk-auth-reason': 'session-token-and-uat-missing',
      }),
    );

    render(<AccountScreen />);

    expect(
      screen.getByText(/couldn't confirm your sign-in/i),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/check your connection/i)).toBeNull();
  });

  it('prints the failing endpoint, status and Clerk reason on screen', () => {
    mockState.account = errorQuery(
      apiError(401, '/api/account', { 'x-clerk-auth-reason': 'token-expired' }),
    );

    render(<AccountScreen />);

    // Query string dropped; endpoint, status and reason all visible so a
    // reviewer's screenshot alone identifies the failure.
    expect(
      screen.getByText('/api/account, HTTP 401 · token-expired'),
    ).toBeOnTheScreen();
  });

  it('keeps the connection wording for a transport failure', () => {
    mockState.account = errorQuery(new TypeError('Network request failed'));

    render(<AccountScreen />);

    expect(screen.getByText(/check your connection/i)).toBeOnTheScreen();
    expect(screen.queryByText(/confirm your sign-in/i)).toBeNull();
    expect(screen.getByText('request, no response (network)')).toBeOnTheScreen();
  });

  it('says a 500 is our side, not the learner’s', () => {
    mockState.account = errorQuery(apiError(500, '/api/account'));

    render(<AccountScreen />);

    expect(screen.getByText(/wobble on our side/i)).toBeOnTheScreen();
    expect(screen.getByText('/api/account, HTTP 500')).toBeOnTheScreen();
  });

  it('reports the cause to Sentry with status, endpoint and auth reason', () => {
    mockState.account = errorQuery(
      apiError(401, '/api/account', { 'x-clerk-auth-reason': 'jwk-kid-mismatch' }),
    );

    render(<AccountScreen />);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [, options] = (Sentry.captureException as jest.Mock).mock.calls[0];
    expect(options.tags).toMatchObject({
      apiContext: 'account.load',
      apiFailureKind: 'auth',
      httpStatus: '401',
    });
    expect(options.extra).toMatchObject({
      endpoint: '/api/account',
      status: 401,
      authReason: 'jwk-kid-mismatch',
    });
  });

  it('reports a transport failure as a network failure, not a status', () => {
    mockState.account = errorQuery(new TypeError('Network request failed'));

    render(<AccountScreen />);

    const [, options] = (Sentry.captureException as jest.Mock).mock.calls[0];
    expect(options.tags).toMatchObject({
      apiFailureKind: 'connection',
      httpStatus: 'network',
    });
    expect(options.extra.status).toBeNull();
  });

  it('does not report anything while the load is healthy', () => {
    mockState.account = {
      data: {
        profile: { id: 'u1', email: null, displayName: null, avatarUrl: null },
        preferences: {
          notifications: { dailyReminderEnabled: false, dailyReminderTime: null },
          learning: {
            activeLanguage: 'gu',
            dailyGoal: 5,
            theme: 'system',
            timezone: null,
            hasCompletedTour: false,
            hasChosenLanguage: false,
            ttsVoice: null,
          },
        },
        subscription: { tier: 'free', status: 'none' },
      },
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: jest.fn(),
    };

    render(<AccountScreen />);

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('failed-request breadcrumbs', () => {
  it('breadcrumbs every non-2xx response with endpoint and status', () => {
    installApiFailureBreadcrumbs();

    const observer = (setFailedResponseObserver as jest.Mock).mock.calls[0][0];
    observer({
      method: 'GET',
      url: 'https://bolo-india.app/api/entitlements?lang=gu',
      status: 401,
      statusText: 'Unauthorized',
      headers: { get: (n: string) => (n === 'x-clerk-auth-reason' ? 'token-expired' : null) },
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'http',
        level: 'warning',
        message: 'GET /api/entitlements → 401',
        data: {
          method: 'GET',
          endpoint: '/api/entitlements',
          status: 401,
          authReason: 'token-expired',
        },
      }),
    );
  });

  it('marks a 5xx breadcrumb as an error and omits an absent Clerk reason', () => {
    installApiFailureBreadcrumbs();

    const observer = (setFailedResponseObserver as jest.Mock).mock.calls[0][0];
    observer({
      method: 'POST',
      url: 'https://bolo-india.app/api/openai/pronunciation',
      status: 503,
      statusText: 'Service Unavailable',
      headers: { get: () => null },
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: 'POST /api/openai/pronunciation → 503',
        data: {
          method: 'POST',
          endpoint: '/api/openai/pronunciation',
          status: 503,
        },
      }),
    );
  });
});

// The api-server's unreadable-token guard answers 401 with its OWN header,
// `x-bolo-auth-error`, because Clerk never got far enough to classify the
// token. The two sides are coupled only by that header name, so this pin runs
// a REAL HTTP response, served exactly as the guard serves it, through the
// mobile formatter, and fails if either side renames the header.
describe('a server response the guard produced, read by the mobile formatter', () => {
  let server: any;
  let baseUrl = '';

  beforeAll(async () => {
    const http = require('node:http');
    server = http.createServer((_req: any, res: any) => {
      res.setHeader('x-bolo-auth-error', 'token-unreadable');
      res.setHeader('content-type', 'application/json');
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'Unauthorized' }));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function failure() {
    const response = await fetch(`${baseUrl}/api/account`);
    // Shaped like the shared client's ApiError, from the real Response.
    return {
      name: 'ApiError',
      status: response.status,
      url: response.url,
      headers: response.headers,
    };
  }

  it('shows the guard’s reason on screen and sends it to Sentry', async () => {
    const err = await failure();
    mockState.account = errorQuery(err);

    render(<AccountScreen />);

    expect(
      screen.getByText(/couldn't confirm your sign-in/i),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('/api/account, HTTP 401 · token-unreadable'),
    ).toBeOnTheScreen();

    const [, options] = (Sentry.captureException as jest.Mock).mock.calls[0];
    expect(options.extra).toMatchObject({
      endpoint: '/api/account',
      status: 401,
      authReason: 'token-unreadable',
    });
  });

  it('breadcrumbs the same response with the guard’s reason', async () => {
    const response = await fetch(`${baseUrl}/api/account`);
    installApiFailureBreadcrumbs();
    const observer = (setFailedResponseObserver as jest.Mock).mock.calls[0][0];
    observer({
      method: 'GET',
      url: `${baseUrl}/api/account`,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpoint: '/api/account',
          status: 401,
          authReason: 'token-unreadable',
        }),
      }),
    );
  });
});
