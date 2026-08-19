import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";

/**
 * Never retry ANY 4xx, a client error is deterministic: the same request
 * cannot succeed without something else changing first (credentials, plan,
 * input), so retrying only delays settling. In particular a locked-language
 * 402 on /progress/summary must reach the UI immediately so home can render
 * the showroom/upgrade state instead of spinning through retries. Network
 * failures and 5xx keep the TanStack Query default of up to 3 retries;
 * manual refetch (e.g. the stats banner's Try again) is unaffected.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
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
