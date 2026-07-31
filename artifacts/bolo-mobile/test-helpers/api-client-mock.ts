/**
 * Shared idle-safe defaults for every @workspace/api-client-react hook.
 *
 * Convention (mandatory for all new screen tests):
 *   jest.mock('@workspace/api-client-react', () => {
 *     const { apiClientMockDefaults } = require('../test-helpers/api-client-mock');
 *     return {
 *       ...apiClientMockDefaults,
 *       // override only the hooks this test file actually exercises
 *     };
 *   });
 *
 * TYPE ENFORCEMENT
 * The `satisfies Record<MockableKey, unknown>` annotation below makes the
 * TypeScript compiler reject this file the moment a new hook is exported from
 * @workspace/api-client-react but not listed here. Because this file is NOT
 * inside __tests__/ it IS included in the mobile tsconfig typecheck. A
 * missing entry is a build error, not a silent runtime undefined.
 * To add a new hook: add one entry here and every test file gets it via the
 * spread.
 */

import type * as ApiClientReact from "@workspace/api-client-react";

type _AllExports = typeof ApiClientReact;

/** All use-hook names, get*QueryKey helpers, and ApiError from the client. */
type MockableKey = {
  [K in keyof _AllExports]: K extends
    | `use${string}`
    | `get${string}QueryKey`
    | "ApiError"
    ? K
    : never;
}[keyof _AllExports];

// ---------------------------------------------------------------------------
// Idle-safe value builders
// ---------------------------------------------------------------------------

const noop = () => {};
const asyncNoop = () => Promise.resolve(undefined as never);

/** Default idle query result -- data is absent, nothing is loading. */
const idleQuery = () => ({
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  isFetching: false,
  refetch: noop,
});

/** Default idle mutation result -- nothing pending, nothing errored. */
const idleMutation = () => ({
  mutate: noop,
  mutateAsync: asyncNoop,
  isPending: false,
  isError: false,
  error: null,
  data: undefined,
  reset: noop,
});

/** Simple ApiError stand-in. Tests that need instanceof checks should override. */
class ApiErrorDefault extends Error {
  status: number;
  data: unknown;
  constructor(message = "ApiError", data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = 0;
    this.data = data;
  }
}

// ---------------------------------------------------------------------------
// Exported defaults
// Every key in MockableKey must be present or TypeScript rejects this file.
// ---------------------------------------------------------------------------

export const apiClientMockDefaults = {
  // --- ApiError ---
  ApiError: ApiErrorDefault,

  // --- Query hooks ---
  useGetAccount: idleQuery,
  useGetAccountSubscription: idleQuery,
  useGetDailyQuiz: idleQuery,
  useGetEntitlements: idleQuery,
  useGetFamily: idleQuery,
  useGetFriendsLeaderboard: idleQuery,
  useGetLessonGroupTestout: idleQuery,
  useGetPhrase: idleQuery,
  useGetProgressAnalytics: idleQuery,
  /** Purposely a slim shape -- most tests assert only data + isLoading. */
  useGetProgressSummary: () => ({ data: undefined, isLoading: false }),
  useGetScenario: idleQuery,
  useGetScriptTraceProgress: idleQuery,
  useHealthCheck: idleQuery,
  useListBadges: idleQuery,
  useListCategories: idleQuery,
  /** Returns an empty lessonGroups array so practice screens don't show a loader by default. */
  useListCategoryLessonGroups: () => ({
    data: { lessonGroups: [] as unknown[] },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: noop,
  }),
  useListCategoryPhrases: idleQuery,
  useListCategorySentences: idleQuery,
  useListFriends: idleQuery,
  useListIncomingFriendRequests: idleQuery,
  useListLanguages: idleQuery,
  useListLessonGroupPhrases: idleQuery,
  useListOutgoingFriendRequests: idleQuery,
  useListRecentAttempts: idleQuery,
  useListReviewPhrases: idleQuery,
  useListTtsVoices: idleQuery,
  useListZoneStamps: idleQuery,
  useSearchFriendByEmail: idleQuery,

  // --- Mutation hooks ---
  useAcceptFriendRequest: idleMutation,
  useAcceptRetentionOffer: idleMutation,
  useAddCategoryPhrases: idleMutation,
  useCancelAccountSubscription: idleMutation,
  useChatTurn: idleMutation,
  useCompleteDailyQuiz: idleMutation,
  useCreateAttempt: idleMutation,
  useCreateFamilyInvite: idleMutation,
  useDeclineFriendRequest: idleMutation,
  useDeleteAccount: idleMutation,
  useEvaluatePronunciation: idleMutation,
  useGeneratePhrase: idleMutation,
  useJoinFamily: idleMutation,
  useLeaveFamily: idleMutation,
  usePauseAccountSubscription: idleMutation,
  useRecordGameSession: idleMutation,
  useRecordScriptTraceProgress: idleMutation,
  useRegenerateFamilyCode: idleMutation,
  useRemoveFamilyMember: idleMutation,
  useRemoveFriend: idleMutation,
  useReportPhrase: idleMutation,
  useResumeAccountSubscription: idleMutation,
  useRevokeFamilyInvite: idleMutation,
  useSendFriendInvite: idleMutation,
  useSendFriendRequest: idleMutation,
  useSetChosenLanguage: idleMutation,
  useSubmitContactForm: idleMutation,
  useSubmitLessonGroupTestout: idleMutation,
  useSynthesizeSpeech: idleMutation,
  useUnpauseAccountSubscription: idleMutation,
  useUpdateAccountPreferences: idleMutation,
  useUpdateAccountProfile: idleMutation,

  // --- QueryKey helpers ---
  getGetAccountQueryKey: () => ["account"] as const,
  getGetAccountSubscriptionQueryKey: () => ["account-subscription"] as const,
  getGetDailyQuizQueryKey: () => ["daily-quiz"] as const,
  getGetEntitlementsQueryKey: () => ["entitlements"] as const,
  getGetFamilyQueryKey: () => ["family"] as const,
  getGetFriendsLeaderboardQueryKey: () => ["friends-leaderboard"] as const,
  getGetLessonGroupTestoutQueryKey: () => ["lesson-group-testout"] as const,
  getGetPhraseQueryKey: () => ["phrase"] as const,
  getGetProgressAnalyticsQueryKey: () => ["progress-analytics"] as const,
  getGetProgressSummaryQueryKey: () => ["progress-summary"] as const,
  getGetScenarioQueryKey: () => ["scenario"] as const,
  getGetScriptTraceProgressQueryKey: () => ["script-trace-progress"] as const,
  getHealthCheckQueryKey: () => ["health-check"] as const,
  getListBadgesQueryKey: () => ["badges"] as const,
  getListCategoriesQueryKey: () => ["categories"] as const,
  getListCategoryLessonGroupsQueryKey: () =>
    ["category-lesson-groups"] as const,
  getListCategoryPhrasesQueryKey: () => ["category-phrases"] as const,
  getListCategorySentencesQueryKey: () => ["category-sentences"] as const,
  getListFriendsQueryKey: () => ["friends"] as const,
  getListIncomingFriendRequestsQueryKey: () =>
    ["incoming-friend-requests"] as const,
  getListLanguagesQueryKey: () => ["languages"] as const,
  getListLessonGroupPhrasesQueryKey: (...args: unknown[]) =>
    ["lesson-group-phrases", ...args] as unknown[],
  getListOutgoingFriendRequestsQueryKey: () =>
    ["outgoing-friend-requests"] as const,
  getListRecentAttemptsQueryKey: () => ["recent-attempts"] as const,
  getListReviewPhrasesQueryKey: () => ["review-phrases"] as const,
  getListTtsVoicesQueryKey: () => ["tts-voices"] as const,
  getListZoneStampsQueryKey: () => ["zone-stamps"] as const,
  getSearchFriendByEmailQueryKey: () => ["search-friend-by-email"] as const,
} satisfies Record<MockableKey, unknown>;
