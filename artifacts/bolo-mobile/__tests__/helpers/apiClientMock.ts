// Shared @workspace/api-client-react mock base for the jest suites.
//
// THE TWIN CLAUDE.md ASKED FOR, built 2026-09-08 the next time the bill
// arrived. Its words: "gujarati-coach solved this with src/test/
// api-client-mock.ts, which derives its export surface from the real module at
// runtime; its header promises 'no per-file patching pass ever again' and it
// delivered, costing web ZERO lines for the same change. Build the twin the
// next time this bill arrives."
//
// WHAT THE BILL LOOKS LIKE. Nearly every mobile suite mocks
// @workspace/api-client-react with a FULL-replacement factory, so importing a
// NEW hook into a widely tested screen breaks every file that renders it, at
// import time, with "useX is not a function". On 2026-09-04 two hooks on home
// and practice cost THIRTY-TWO SUITES three mock lines each. Web paid nothing
// for the identical change. Today the gift card grew `useGetTokens` and the
// same bill arrived again, which is the trigger the instruction names.
//
// HOW IT AVOIDS THE BILL. The surface is derived from the REAL module at
// runtime, so a hook added to the generated client exists here automatically:
//
//   get*QueryKey exports  ->  stable key fns  (() => [name])
//   use* exports          ->  idle hook stubs (no data, inert mutate/refetch)
//   everything else       ->  the real export (ApiError, setBaseUrl, ...)
//
// Usage, and SPREAD IT FIRST so per-file overrides win:
//
//   jest.mock('@workspace/api-client-react', () => ({
//     ...jest.requireActual('./helpers/apiClientMock').baseApiClientMock(),
//     useGetDailyGift: () => myStub,
//   }));
//
// NOT ASYNC, unlike web's. vitest's factory may return a promise and jest's may
// not, so this reads the real module with `jest.requireActual` synchronously
// rather than porting web's `await vi.importActual` shape. Copying that shape
// across would have produced a factory returning a promise, which jest accepts
// silently and which then fails at every property access.
//
// idleHook() covers both query and mutation shapes: components read only the
// fields relevant to the hook kind, and any hook whose data must drive a test
// belongs in that file's overrides anyway.

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
