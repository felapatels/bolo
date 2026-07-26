import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";

/**
 * Never retry auth failures — the same request with the same (absent or
 * stale) token cannot succeed without a credential change.  Leave all other
 * status codes at the TanStack Query default of up to 3 retries.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return false;
  }
  return failureCount < 3;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
    },
  },
});
