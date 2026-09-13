// Shared @workspace/api-client-react mock base for jest suites.
//
// THE TWIN OF gujarati-coach/src/test/api-client-mock.ts, and it is three
// weeks late. Web built its version and its header promised "no per-file
// patching pass ever again"; it delivered, costing web ZERO lines when the
// daily gift added two hooks on 2026-09-04. The same change cost mobile
// ninety-six lines across thirty-two files, and CLAUDE.md wrote down the
// lesson at the time: "Build the twin the next time this bill arrives."
//
// IT ARRIVED AGAIN ON 2026-09-13, bigger. A full fleet run found
// `useGetJourneyStopUnlocks is not a function` 126 times in India, 122 in East
// Asia, 194 in Africa, 110 in Europe, 122 in LATAM, joined by
// `useGetAiConsent` and `getGetDailyGiftQueryKey`. journey-map and
// journey-showroom failed in ALL SIX forks. A suite that dies on a missing
// mock is not testing anything, so this was not only noise: it was coverage
// quietly switched off across the fleet.
//
// The base derives its export surface from the REAL module at runtime
// (jest.requireActual), so a hook added to the generated client exists here
// automatically:
//   - get*QueryKey exports -> stable key fns  (() => [name])
//   - use* exports         -> idle hook stubs (no data, no error, inert
//                             mutate/mutateAsync/refetch)
//   - everything else      -> the real export (ApiError, setBaseUrl, schema
//                             constants, ...)
//
// Usage, spread FIRST so per-file overrides win:
//
//   jest.mock('@workspace/api-client-react', () => ({
//     ...jest.requireActual<typeof import('../helpers/api-client-mock')>(
//       '../helpers/api-client-mock',
//     ).baseApiClientMock(),
//     useListCategoryPhrases: () => myStub,
//   }));
//
// A hook whose data must drive the test belongs in the per-file overrides
// anyway, so an idle stub is the right default for everything else.

export function idleHook() {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    isPending: false,
    isSuccess: false,
    status: 'idle' as const,
    refetch: jest.fn(),
    mutate: jest.fn(),
    mutateAsync: jest.fn(async () => undefined),
    reset: jest.fn(),
  };
}

let cached: Record<string, unknown> | null = null;

/**
 * SYNCHRONOUS, unlike web's. jest.mock factories are hoisted above imports and
 * cannot await, so this uses requireActual rather than an async import. That
 * is the one real difference between the twins and the reason this file cannot
 * simply be copied across.
 */
export function baseApiClientMock(): Record<string, unknown> {
  if (cached) return cached;
  const actual = jest.requireActual<Record<string, unknown>>(
    '@workspace/api-client-react',
  );
  const mockModule: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    if (key.startsWith('get') && key.endsWith('QueryKey')) {
      mockModule[key] = () => [key];
    } else if (key.startsWith('use')) {
      mockModule[key] = () => idleHook();
    } else {
      mockModule[key] = actual[key];
    }
  }
  cached = mockModule;
  return mockModule;
}
