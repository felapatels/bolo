// Shared @workspace/api-client-react mock base for vitest suites.
//
// Why this exists: nearly every UI test mocks @workspace/api-client-react with
// a FULL-replacement factory. Consequence: importing a NEW hook in a widely
// tested screen (practice, journey, home, chat) instantly breaks every test
// file that renders that screen, failing loudly at import time with
// `No "<hook>" export is defined on the mock`.
//
// This base derives its export surface from the REAL module at runtime
// (vi.importActual), so a hook added to the generated client exists here
// automatically, no per-file patching pass ever again:
//   - get*QueryKey exports  -> stable key fns  (() => [name])
//   - use* exports          -> idle hook stubs (idleHook(): no data, no error,
//                              inert mutate/mutateAsync/refetch)
//   - everything else       -> the real export (ApiError, getChatTurnUrl,
//                              setBaseUrl, schema constants, ...)
//
// Usage, spread it FIRST so per-file overrides win:
//
//   vi.mock("@workspace/api-client-react", async () => ({
//     ...(await (await import("./api-client-mock")).baseApiClientMock()),
//     useListCategoryPhrases: () => myStub,
//   }));
//
// idleHook() covers both query and mutation shapes; components only read the
// fields relevant to the hook kind, and any hook whose data must drive the
// test belongs in the per-file overrides anyway.

import { vi } from "vitest";

export function idleHook() {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    isPending: false,
    isSuccess: false,
    status: "idle" as const,
    refetch: vi.fn(),
    mutate: vi.fn(),
    mutateAsync: vi.fn(async () => undefined),
    reset: vi.fn(),
  };
}

let cached: Record<string, unknown> | null = null;

export async function baseApiClientMock(): Promise<Record<string, unknown>> {
  if (cached) return cached;
  const actual = await vi.importActual<Record<string, unknown>>(
    "@workspace/api-client-react",
  );
  const mockModule: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    if (key.startsWith("get") && key.endsWith("QueryKey")) {
      mockModule[key] = () => [key];
    } else if (key.startsWith("use")) {
      mockModule[key] = () => idleHook();
    } else {
      mockModule[key] = actual[key];
    }
  }
  cached = mockModule;
  return mockModule;
}
