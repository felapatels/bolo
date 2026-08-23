// Which characters a learner has already traced, for the journey map's tracing
// stop.
//
// WHY IT LIVES HERE AND NOT IN THE PAGE. journey.tsx is 2500 lines and the
// mobile twin will need exactly this; keeping the fetch behind one hook means
// the phone can copy a hook rather than re-derive the rule. The rule ITSELF is
// in lib/script-trace (traceStopStatus), so neither client owns it.
//
// FIXED HOOK ARITY, deliberately. A language studies 3 or 4 chapters, and hooks
// cannot be called conditionally, so all four are called and the tail is
// disabled. This is the same shape journey.tsx already uses for its six zone
// queries.
import { useMemo } from "react";
import {
  getGetScriptTraceProgressQueryKey,
  useGetScriptTraceProgress,
} from "@workspace/api-client-react";
import { traceChaptersFor } from "@workspace/script-trace";

/** The most chapters any language studies today. Asserted by a test. */
const MAX_CHAPTERS = 4;

type ProgressRow = { characterId: string; passed: boolean };

export function useTraceStopProgress(languageCode: string): {
  passedCharacterIds: Set<string>;
  isLoading: boolean;
} {
  const chapters = traceChaptersFor(languageCode);
  const slots = Array.from({ length: MAX_CHAPTERS }, (_, i) => chapters[i]);

  /* eslint-disable react-hooks/rules-of-hooks -- fixed arity, see the note above. */
  const queries = slots.map((chapter) =>
    useGetScriptTraceProgress(
      { chapter: chapter ?? "" },
      // Plus-only endpoint: a non-Plus learner gets a 402, which is not an
      // error worth retrying or surfacing. An empty set reads as "nothing
      // traced yet", which is exactly right for somebody who cannot trace.
      {
        query: {
          enabled: Boolean(chapter),
          retry: false,
          queryKey: getGetScriptTraceProgressQueryKey({ chapter: chapter ?? "" }),
        },
      },
    ),
  );
  /* eslint-enable react-hooks/rules-of-hooks */

  const passedCharacterIds = useMemo(() => {
    const out = new Set<string>();
    for (const q of queries) {
      for (const row of (q.data as ProgressRow[] | undefined) ?? []) {
        if (row.passed) out.add(row.characterId);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the data refs are what matter.
  }, [queries.map((q) => q.dataUpdatedAt).join(",")]);

  return {
    passedCharacterIds,
    isLoading: queries.some((q, i) => Boolean(slots[i]) && q.isLoading),
  };
}
