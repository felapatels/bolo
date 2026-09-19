import { useMutation, useQueryClient } from "@tanstack/react-query";
import { completeLastCall } from "./generated/api";
import type { CompleteLastCallBody } from "./generated/api.schemas";

/** Journey completion is participation; pronunciation mastery remains score-based. */
export function useLastCallCompletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, endReason }: CompleteLastCallBody & { id: number }) => completeLastCall(id, { endReason }),
    onSuccess: async () => {
      // Journey groups, category gates and progress must all read the saved latch.
      await queryClient.invalidateQueries();
    },
  });
}
