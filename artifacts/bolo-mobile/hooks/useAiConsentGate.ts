import { useEntitlements } from '@/contexts/EntitlementsContext';

/**
 * What a DOOR needs to know: whether to ask, and whether it may send.
 *
 * DELIBERATELY READS NOTHING BUT CONTEXT. It does not import the generated API
 * client and does not create a mutation. The recording of a decision lives
 * inside AiConsentGate, which mounts only when a learner is actually being
 * asked.
 *
 * That split is not tidiness. The four doors are rendered by 37 existing test
 * suites, each of which hand-mocks `@workspace/api-client-react` with an
 * explicit list of named exports. A hook here that called `useSetAiConsent`
 * crashed every one of them with "is not a function", because a hand-written
 * mock of a generated client is a second copy of the contract and none of the
 * 37 knew about a hook added today. Keeping the write out of the door's path
 * means a door costs its callers nothing new.
 *
 * Both booleans are FALSE while the entitlements snapshot is loading. A door
 * should neither ask nor send until it knows; render your normal loading state.
 */
export function useAiConsentGate() {
  const { shouldAskAiConsent, aiFeaturesAllowed, aiConsentDecision } = useEntitlements();
  return {
    /** True only for a LOADED learner who has never been asked. */
    shouldAsk: shouldAskAiConsent,
    /** True only on an explicit granted. */
    allowed: aiFeaturesAllowed,
    /** Raw three-state, for a Settings row that shows the current answer. */
    decision: aiConsentDecision,
  };
}
