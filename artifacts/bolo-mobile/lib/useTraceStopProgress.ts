// Which characters a learner has already traced, for the journey map's tracing
// stop.
//
// The web twin of this file is artifacts/gujarati-coach/src/lib/
// useTraceStopProgress.ts and the two must stay the same shape. The RULE itself
// is in lib/script-trace (traceStopStatus, traceStopCopy), so neither client
// owns it and neither can drift on what a stop's status means; all that is
// duplicated here is the fetch, because the two apps have no shared component
// layer at all (CLAUDE.md, "hand-maintained twins").
//
// FIXED HOOK ARITY, deliberately. A language studies 3 or 4 chapters, and hooks
// cannot be called conditionally, so all four are called and the tail is
// disabled. Same shape the journey screen already uses for its six zone
// queries.
import { useMemo } from 'react';
import {
  getGetScriptTraceProgressQueryKey,
  useGetScriptTraceProgress,
} from '@workspace/api-client-react';
import { traceChaptersFor } from '@workspace/script-trace';

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
      { chapter: chapter ?? '' },
      // The endpoint is open to every plan since the free taste landed, but a
      // network failure here is still not worth retrying or surfacing: an empty
      // set reads as "nothing traced yet", which is the right default.
      {
        query: {
          enabled: Boolean(chapter),
          retry: false,
          queryKey: getGetScriptTraceProgressQueryKey({ chapter: chapter ?? '' }),
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
  }, [queries.map((q) => q.dataUpdatedAt).join(',')]);

  return {
    passedCharacterIds,
    isLoading: queries.some((q, i) => Boolean(slots[i]) && q.isLoading),
  };
}
