import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CONTENT_MAX_W } from '@/lib/contentWidth';
import { Feather } from '@expo/vector-icons';
import { ChaiGlyph } from '@/components/ChaiStall';
import * as Haptics from 'expo-haptics';
import { hapticLight, hapticMedium, hapticHeavy, hapticNotify } from '@/lib/haptics';
import { track, trackOnce, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, {
  FadeOutUp,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { BandPill, type Band } from '@/components/BandPill';
import { BandLadder } from '@/components/BandLadder';
import {
  isAdvanceUnlocked,
  isFullCreditBand,
  isGoodOrBetterBand,
  isHalfCreditBand,
  isPassingBand,
  normalizeBand,
  type PhraseTally,
} from '@/lib/ui';
import { ResultActions } from '@/components/ResultActions';
import { ExpressOfferMoment } from '@/components/ExpressOfferMoment';
import { XpCounter } from '@/components/XpCounter';
import { ChaiPill } from '@/components/SessionStats';
import { appear, appearDown, appearPlain, appearZoom, useAppearSkip } from '@/lib/entrance';
import { playBandClip, type BandClipHandle } from '@/lib/band-audio';
import {
  useListCategoryPhrases,
  useListCategorySentences,
  getListCategorySentencesQueryKey,
  useSynthesizeSpeech,
  useEvaluatePronunciation,
  useCreateAttempt,
  useGetAccount,
  getGetProgressSummaryQueryKey,
  useGetProgressSummary,
  getListRecentAttemptsQueryKey,
  getListCategoryPhrasesQueryKey,
  getListBadgesQueryKey,
  useListLessonGroupPhrases,
  getListLessonGroupPhrasesQueryKey,
  useGetLessonGroupTestout,
  getGetLessonGroupTestoutQueryKey,
  useSubmitLessonGroupTestout,
  useGetZoneTestout,
  getGetZoneTestoutQueryKey,
  useSubmitZoneTestout,
  getListCategoryLessonGroupsQueryKey,
  useListReviewPhrases,
  getListReviewPhrasesQueryKey,
  type PronunciationResult,
  type EarnedBadge,
} from '@workspace/api-client-react';
import { ApiError } from '@workspace/api-client-react';
import { applyOptimisticTodayXp } from '@workspace/train-class';
import { Screen } from '@/components/Screen';
import { BadgeUnlock } from '@/components/BadgeUnlock';
import { FirstWordPrimer } from '@/components/FirstWordPrimer';
import { FlashbackLightbox } from '@/components/FlashbackLightbox';
import {
  loadFirstWordPrimerSeen,
  saveFirstWordPrimerSeen,
  shouldShowFirstWordPrimer,
} from '@/lib/firstWordPrimer';
import { ChunkyButton } from '@/components/ChunkyButton';
import { LessonError } from '@/components/LessonError';
import { FunFactLoader } from '@/components/FunFactLoader';
import { UpgradeRequiredScreen } from '@/components/UpgradeRequiredScreen';
import { asUpgradeRequired, paywallHrefForDenial } from '@/lib/entitlements';
import { Mascot, type MascotPose } from '@/components/Mascot';
import { Confetti } from '@/components/Confetti';
import { MilestoneToast } from '@/components/MilestoneToast';
import { PhraseReportButton } from '@/components/PhraseReportButton';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import {
  prepareRecordingSession,
  prepareRecorderInSession,
  ensureRecordingMode,
  stopAndReadRecording,
  playBase64Audio,
  RECORDING_PRESET,
  SILENCE_THRESHOLD_DB,
  SILENCE_DURATION_MS,
  SPEECH_MIN_DB,
  SILENCE_DROP_DB,
  meteringToAmplitude,
  reportAudioSessionFailure,
  type PlaybackHandle,
} from '@/lib/audio';
import { Waveform } from '@/components/Waveform';
import { prefersReducedMotion } from '@/lib/motionPrefs';
import { loadSpokenFeedback, saveSpokenFeedback, loadSilentMode, saveSilentMode, loadApproxNoticeSeen, saveApproxNoticeSeen } from '@/lib/settings';
import { loadMeaningAudio, saveMeaningAudio, meaningSpeechText } from '@/lib/meaning-audio';
import { loadCoachVoicePref } from '@/lib/coachVoicePref';
import { playCue } from '@/lib/sound';
import { XpArc } from '@/components/XpArc';
import { CountUpText } from '@/components/CountUpText';
import { glyphsForLanguage } from '@/lib/scriptGlyphs';

// 'compare' is the unsupported-language stage: the learner recorded but we
// never sent an evaluation, so instead of a scored 'result' they get a
// listen-record-compare card (no band, no XP).
type Phase = 'idle' | 'recording' | 'evaluating' | 'result' | 'compare' | 'error' | 'done';

const FEEDBACK_AUDIO_TIMEOUT_MS = 8000;

// Beat between the phrase clip and the spoken English meaning (web parity:
// MEANING_SEGMENT_PAUSE_MS in gujarati-coach's practice page, Task 1003).
const MEANING_SEGMENT_PAUSE_MS = 400;
/** Zero-XP encores per phrase before the session lets it go (owner-ruled:
 *  every kind of zero counts, nocatch included, so the session always ends). */
const ZERO_XP_STRIKE_LIMIT = 3;

/**
 * Confirmation copy for the three audio toggles (silent mode and meaning in
 * the header, spoken feedback on the result card). State first; the
 * consequence is spelled out only when turning something ON, since "off"
 * explains itself.
 *
 * Mirrored verbatim on web in
 * artifacts/gujarati-coach/src/pages/practice.tsx (TOGGLE_TOAST).
 */
const TOGGLE_TOAST = {
  phraseAudioOn: 'Phrase audio on. Bolo reads each phrase first.',
  phraseAudioOff: 'Phrase audio off. You speak first.',
  feedbackAloudOn: 'Feedback aloud on. Your score is read out.',
  feedbackAloudOff: 'Feedback aloud off.',
  meaningAloudOn: 'Meaning aloud on. English after each phrase.',
  meaningAloudOff: 'Meaning aloud off.',
} as const;
const BAND_LABEL: Record<Band, string> = {
  perfect: 'Perfect',
  great: 'Great',
  good: 'Good',
  almost: 'Almost',
  retry: 'Try again',
  nocatch: "Didn't catch that",
};

// Five-band ladder gradient from brand tokens (top to bottom): success green,
// accent teal, primary indigo, muted slate, destructive red. retry keeps its
// destructive treatment; nocatch renders neutral (system miss, Spec 1 rule 16).
// NOTE: deliberately kept as a local copy mirroring review.tsx (documented
// debt — extraction is a separate task).
function bandColor(
  band: Band,
  colors: {
    success: string;
    accent: string;
    primary: string;
    mutedForeground: string;
    destructive: string;
  },
): string {
  if (band === 'perfect') return colors.success;
  if (band === 'great') return colors.accent;
  if (band === 'good') return colors.primary;
  if (band === 'almost') return colors.mutedForeground;
  if (band === 'nocatch') return colors.mutedForeground;
  return colors.destructive;
}

// ── Score trail ──────────────────────────────────────────────────────────────

/**
 * One circular dot in the score trail.
 * The current-phrase dot breathes with a gentle scale pulse.
 */
function ScoreDot({
  index,
  band,
  isCurrent,
  dotColor,
  onPress,
  isSelected,
}: {
  index: number;
  band: Band | null;
  isCurrent: boolean;
  dotColor: string;
  onPress?: () => void;
  isSelected: boolean;
}) {
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (isCurrent) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.35, { duration: 650 }),
          withTiming(0.85, { duration: 650 }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [isCurrent, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      testID={`score-dot-${index}`}
      onPress={band !== null ? onPress : undefined}
      disabled={band === null}
      hitSlop={6}
      accessibilityRole={band !== null ? 'button' : undefined}
      accessibilityLabel={band !== null ? BAND_LABEL[band] : undefined}
    >
      <Animated.View
        style={[
          styles.scoreDot,
          {
            backgroundColor: dotColor,
            borderWidth: isSelected ? 1.5 : 0,
            borderColor: '#fff',
          },
          animStyle,
        ]}
      />
    </Pressable>
  );
}

/** Row of colored dots — one per phrase — above the progress bar. */
function ScoreTrail({
  total,
  bands,
  currentIndex,
  colors,
}: {
  total: number;
  /** Keyed by phrase index; a missing key means that phrase hasn't been attempted yet. */
  bands: Record<number, Band>;
  currentIndex: number;
  colors: { success: string; accent: string; destructive: string; muted: string; primary: string; mutedForeground: string; foreground: string };
}) {
  const [tooltip, setTooltip] = React.useState<{ idx: number; band: Band } | null>(null);
  const tooltipTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipOpacity = useSharedValue(0);

  const showTooltip = React.useCallback((idx: number, band: Band) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltip({ idx, band });
    tooltipOpacity.value = withTiming(1, { duration: 150 });
    tooltipTimer.current = setTimeout(() => {
      tooltipOpacity.value = withTiming(0, { duration: 200 });
      setTimeout(() => setTooltip(null), 210);
    }, 1800);
  }, [tooltipOpacity]);

  React.useEffect(() => {
    return () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); };
  }, []);

  const tooltipStyle = useAnimatedStyle(() => ({ opacity: tooltipOpacity.value }));

  // Don't render at all until there's at least one phrase
  if (total === 0) return null;

  return (
    <View style={styles.scoreTrailOuter}>
      {tooltip !== null && (
        <Animated.Text style={[styles.scoreTrailTooltip, { color: colors.mutedForeground }, tooltipStyle]}>
          Phrase {tooltip.idx + 1}: {BAND_LABEL[tooltip.band]}
        </Animated.Text>
      )}
      <View style={styles.scoreTrailRow}>
        {Array.from({ length: total }, (_, i) => {
          const band = bands[i] ?? null;
          const isCurrent = i === currentIndex;
          const dotColor =
            band !== null
              ? bandColor(band, colors)
              : isCurrent
                ? colors.primary + '70'
                : colors.muted;
          return (
            <ScoreDot
              key={i}
              index={i}
              band={band}
              isCurrent={isCurrent}
              dotColor={dotColor}
              onPress={() => showTooltip(i, band!)}
              isSelected={tooltip?.idx === i}
            />
          );
        })}
      </View>
    </View>
  );
}

// ── Summary ring row ─────────────────────────────────────────────────────────

/**
 * Horizontally scrollable row of band indicators for the session summary.
 * Tapping an item reveals inline feedback for that phrase.
 */
function SummaryRingRow({
  list,
  bands,
  feedback,
  colors,
}: {
  list: { id: number; english: string }[];
  bands: Record<number, Band>;
  feedback: Record<number, { feedback: string; tip: string }>;
  colors: { success: string; accent: string; primary: string; destructive: string; card: string; border: string; foreground: string; mutedForeground: string; muted: string };
}) {
  const [selectedIdx, setSelectedIdx] = React.useState<number | null>(null);
  const attempted = list.filter((_, i) => bands[i] !== undefined);
  if (attempted.length === 0) return null;

  const selected = selectedIdx !== null ? {
    phrase: list[selectedIdx],
    band: bands[selectedIdx],
    fb: feedback[selectedIdx],
  } : null;

  return (
    <View style={{ width: '100%', marginTop: 20 }}>
      <Text style={[styles.summaryRingLabel, { color: colors.mutedForeground }]}>
        Per-phrase results
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.summaryRingRow}
      >
        {list.map((phrase, i) => {
          const band = bands[i];
          if (band === undefined) return null;
          const color = bandColor(band, colors);
          const isSelected = selectedIdx === i;
          return (
            <Pressable
              key={phrase.id}
              onPress={() => setSelectedIdx(isSelected ? null : i)}
              style={[
                styles.summaryRingItem,
                isSelected && { borderColor: color, borderWidth: 1.5, borderRadius: 12 },
              ]}
              accessibilityLabel={`Phrase ${i + 1}: ${phrase.english}, ${BAND_LABEL[band]}`}
              accessibilityRole="button"
            >
              <View style={[styles.summaryBandDot, { backgroundColor: color }]} />
              <Text
                style={[styles.summaryRingEng, { color: colors.mutedForeground }]}
                numberOfLines={1}
              >
                {phrase.english}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Inline feedback panel for the tapped phrase */}
      {selected && (
        <Animated.View
          entering={appearPlain()}
          style={[styles.summaryFeedbackCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.summaryFeedbackTitle, { color: colors.foreground }]}>
            {selected.phrase.english}
          </Text>
          {selected.fb?.feedback ? (
            <Text style={[styles.summaryFeedbackBody, { color: colors.mutedForeground }]}>
              {selected.fb.feedback}
            </Text>
          ) : null}
          {selected.fb?.tip ? (
            <Text style={[styles.summaryFeedbackTip, { color: colors.mutedForeground }]}>
              {selected.fb.tip}
            </Text>
          ) : null}
        </Animated.View>
      )}
    </View>
  );
}

// Turns whatever the evaluation pipeline threw into a short, actionable
// message for the learner (mirrors the web practice flow).
function describeEvaluationError(error: unknown): string {
  if (error instanceof ApiError) {
    const status = (error as { status?: number }).status;
    if (status === 502) {
      return "Bolo hit a snag 🦜. Give it another try!";
    }
    if (status === 429) {
      return "Whoa, that's a lot of practice! Wait a moment, then try again.";
    }
    return 'Something went wrong while scoring. Please try again.';
  }
  if (error instanceof TypeError) {
    // fetch() rejects with a TypeError when the network is unreachable.
    return "Bolo flew out for a mango lassi 🥭. Check your connection and try again!";
  }
  return 'Something went wrong while scoring. Please try again.';
}

// Zone test-out 403 guard (web parity): both zone endpoints answer
// { error: 'zone_locked' } when the previous zone is neither finished nor
// tested out yet (stale map, deep link). That state is permanent for this
// run, so it must read as guidance, never as a retryable transient.
function isZoneLockedError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    typeof error.data === 'object' &&
    error.data !== null &&
    (error.data as { error?: unknown }).error === 'zone_locked'
  );
}

export default function PracticeScreen() {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id, phrase: startPhraseId, stage, group, mode, scope } = useLocalSearchParams<{
    id: string;
    phrase?: string;
    stage?: string;
    group?: string;
    mode?: string;
    scope?: string;
  }>();
  const categoryId = Number(id);
  // Spec D1b-M: `?group=` scopes the session to one journey stop (lesson
  // group) — the flow is identical, only the phrase source changes.
  const groupId = Number(group);
  const isGroup = Number.isFinite(groupId) && groupId > 0;
  // Test-out mode (journey progression dialog): the same session flow runs
  // over the server's sampled phrase set; per-phrase attempts are NOT saved.
  // The batch of evaluation tokens is judged in one shot at the end.
  const isGroupTestout = isGroup && mode === 'testout';
  // Zone scope (mode=testout&scope=zone, no group param — web parity): the
  // identical flow over the zone-level sample for the route's category id.
  // Only the phrase source and the submit endpoint differ; every other
  // test-out behavior (one take per phrase, token collection, verdict
  // screen) is shared.
  const isZoneTestout = !isGroup && mode === 'testout' && scope === 'zone';
  const isTestout = isGroupTestout || isZoneTestout;
  const { activeLang, activeLanguage, speechCapability } = useLanguage();
  // THE FLASHBACK'S DOOR (build 23): a finished journey stop asks the server
  // for the three due phrases the flashback would show, so the lightbox
  // opens only onto a flashback that exists. Same query the review screen
  // makes, so it is warm by the time the learner enters. Group sessions
  // only; a test-out or a category drill never leaves through the flashback.
  const flashbackDue = useListReviewPhrases(
    { lang: activeLang, limit: 3 },
    {
      query: {
        enabled: isGroup && !isTestout && !!activeLang,
        queryKey: getListReviewPhrasesQueryKey({ lang: activeLang, limit: 3 }),
      },
    },
  );
  const [flashbackOpen, setFlashbackOpen] = React.useState(false);
  const enterFlashback = () => {
    setFlashbackOpen(false);
    router.replace({
      pathname: '/(app)/review',
      params: { flashback: '1' },
    } as Parameters<typeof router.replace>[0]);
  };
  const skipFlashback = () => {
    setFlashbackOpen(false);
    router.replace('/(app)/journey' as Parameters<typeof router.replace>[0]);
  };
  // Speech-recognition gating (server-classified, defaults to full scoring):
  //  • 'unsupported' → listen-record-compare only, never send an evaluation.
  //  • 'degraded'    → scored practice continues, plus a one-time approx notice.
  const isUnsupported = speechCapability === 'unsupported';
  const isDegraded = speechCapability === 'degraded';
  const languageName = activeLanguage?.name ?? 'this language';

  // `?stage=sentences` runs the same practice flow over the topic's Plus-only
  // sentence stage instead of its phrase list. The server enforces the gate —
  // a non-Plus deep link lands on the upgrade screen via the 402 below.
  const isSentences = stage === 'sentences';
  const phraseQuery = useListCategoryPhrases(categoryId, activeLang, {
    query: {
      enabled: !isSentences && !isGroup && !isZoneTestout,
      queryKey: getListCategoryPhrasesQueryKey(categoryId, activeLang),
    },
  });
  const sentenceQuery = useListCategorySentences(categoryId, activeLang, {
    query: {
      enabled: isSentences && !isGroup && !isZoneTestout,
      queryKey: getListCategorySentencesQueryKey(categoryId, activeLang),
    },
  });
  // Journey-stop sessions: the group endpoint returns the stop's own phrases
  // (its stage lives server-side, so `?group=` wins over `?stage=`).
  const groupQuery = useListLessonGroupPhrases(groupId, {
    query: {
      enabled: isGroup && !isTestout,
      queryKey: getListLessonGroupPhrasesQueryKey(groupId),
    },
  });
  // Test-out sessions load the server-sampled subset instead of the full
  // group list. The endpoint enforces the same entitlement gates as the group
  // endpoint, so the 402 handling below applies to it unchanged. Its data is
  // an envelope (phrases + sampleSize + requiredCorrect), so the phrase list
  // is unwrapped separately below.
  const testoutQuery = useGetLessonGroupTestout(isGroupTestout ? groupId : 0, {
    query: {
      enabled: isGroupTestout,
      queryKey: getGetLessonGroupTestoutQueryKey(isGroupTestout ? groupId : 0),
    },
  });
  // Zone-scope test-out sessions load the zone-level sample instead. The
  // envelope is identical ({ phrases, sampleSize, requiredCorrect }) and the
  // endpoint enforces the same entitlement and progression gates, so it rides
  // the exact same seam below (including the 402 upgrade screen).
  const zoneTestoutQuery = useGetZoneTestout(isZoneTestout ? categoryId : 0, activeLang, {
    query: {
      enabled: isZoneTestout,
      queryKey: getGetZoneTestoutQueryKey(isZoneTestout ? categoryId : 0, activeLang),
    },
  });
  const activeTestoutQuery = isZoneTestout ? zoneTestoutQuery : testoutQuery;
  const phrases = isTestout ? activeTestoutQuery : isGroup ? groupQuery : isSentences ? sentenceQuery : phraseQuery;
  const list = (isTestout ? activeTestoutQuery.data?.phrases : (isGroup ? groupQuery : isSentences ? sentenceQuery : phraseQuery).data) ?? [];
  const testoutSampleSize = activeTestoutQuery.data?.sampleSize ?? 5;
  // 5, not 4: the pass ratio went to 1 on 2026-08-25, so the fallback has to
  // match the sample size or the copy understates what the express needs
  // in the one frame before the envelope arrives.
  const testoutRequiredCorrect = activeTestoutQuery.data?.requiredCorrect ?? 5;

  // Read the learner's TTS voice preference so the client-side audio cache
  // key can include the voice ID. Without this, changing voice mid-session
  // still plays the old cached audio until a phrase is encountered for the
  // first time. Stale data is fine here — the account query is almost always
  // pre-fetched by an ancestor; we just need the ttsVoice field.
  const accountQuery = useGetAccount();
  const ttsVoice = accountQuery.data?.preferences.learning.ttsVoice ?? 'auto';

  const recorder = useAudioRecorder(RECORDING_PRESET);
  const synth = useSynthesizeSpeech();
  const evaluate = useEvaluatePronunciation();
  const createAttempt = useCreateAttempt();
  // Test-out judgment: one POST with the whole run's evaluation tokens. The
  // server samples, scores, and latches tested_out; the client only reports
  // pass/fail. On a pass the journey listing is refreshed so the stop unlocks
  // and the Express stamp appears on return.
  const submitTestout = useSubmitLessonGroupTestout({
    mutation: {
      onSuccess: (res) => {
        if (res.passed) {
          playCue('session_complete');
          hapticNotify(Haptics.NotificationFeedbackType.Success);
          queryClient.invalidateQueries({
            queryKey: getListCategoryLessonGroupsQueryKey(categoryId, activeLang),
          });
          queryClient.invalidateQueries({
            queryKey: getListLessonGroupPhrasesQueryKey(groupId),
          });
        } else {
          hapticNotify(Haptics.NotificationFeedbackType.Warning);
        }
      },
    },
  });
  // Zone-scope judgment (web parity): the same one-shot POST shape against
  // the zone endpoint. A pass latches tested_out on every member group, so
  // refresh the category's lesson-group listing and sweep the group-phrases
  // key family by string prefix (the zone sample does not carry its member
  // group ids).
  const submitZoneTestout = useSubmitZoneTestout({
    mutation: {
      onSuccess: (res) => {
        if (res.passed) {
          playCue('session_complete');
          hapticNotify(Haptics.NotificationFeedbackType.Success);
          queryClient.invalidateQueries({
            queryKey: getListCategoryLessonGroupsQueryKey(categoryId, activeLang),
          });
          queryClient.invalidateQueries({
            predicate: (q) => {
              const k = q.queryKey[0];
              return (
                typeof k === 'string' &&
                k.startsWith('/api/lesson-groups/') &&
                k.endsWith('/phrases')
              );
            },
          });
        } else {
          hapticNotify(Haptics.NotificationFeedbackType.Warning);
        }
      },
    },
  });
  // The verdict screen reads whichever mutation this session's scope drives.
  const activeTestoutSubmit = isZoneTestout ? submitZoneTestout : submitTestout;
  // Server-signed evaluation tokens collected during a test-out run, keyed by
  // phrase id (test-out has no retakes, so each phrase writes exactly once).
  const testoutTokensRef = React.useRef<Record<number, string>>({});

  const [index, setIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>('idle');
  // Ref mirror of phase so async callbacks can check current phase without
  // closing over a stale value — specifically to guard the auto-play flow
  // against the race where a learner taps record during the loadSilentMode()
  // await and recording starts before playCoach() would be called.
  const phaseRef = React.useRef<Phase>('idle');
  const setPhaseSync = React.useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const [result, setResult] = React.useState<PronunciationResult | null>(null);
  // Keyed by phrase index so retrying phrase N replaces that dot rather than
  // pushing a new band onto the next phrase's position.
  const [bands, setBands] = React.useState<Record<number, Band>>({});
  // Unsupported languages record no bands, so the summary count comes from the
  // set of phrase indices the learner reached the compare stage on.
  const [comparedIdx, setComparedIdx] = React.useState<Set<number>>(new Set());
  // XP data per phrase index — xp earned and optional breakdown text.
  const [xpData, setXpData] = React.useState<Record<number, { xp: number; breakdown: string | null }>>({});
  // ── Zero-XP encore (owner rule, web practice.tsx parity) ─────────────────
  // A phrase that earns NO XP comes back at the END of the session and keeps
  // coming back until it earns something. Three zeros of ANY kind release it
  // (owner-ruled: a nocatch burns a strike too) so a dead mic can never trap
  // the learner in a session that will not end. Queue holds phrase indices,
  // matching how bands/xpData/sessionFeedback are keyed.
  const [encoreQueue, setEncoreQueue] = React.useState<number[]>([]);
  // Per-phrase session tallies, keyed by list index like bands/xpData: zero-XP
  // strikes for the encore, all-band attempts for the advance gate (Task
  // #1040). One map so there is exactly one write site for both.
  const [phraseTallies, setPhraseTallies] = React.useState<Record<number, PhraseTally>>({});
  const phraseTalliesRef = React.useRef<Record<number, PhraseTally>>({});
  // Once the base list is exhausted the cursor jumps backwards, so every later
  // advance must come from the queue, never from index + 1.
  const [inEncore, setInEncore] = React.useState(false);
  // Build 34B: server-granted Chai summed across the session's attempt
  // responses for the Session Complete receipt pill (web session-chai-pill).
  const [sessionChai, setSessionChai] = React.useState(0);
  // Whether the XP breakdown panel in the summary is expanded.
  const [xpExpanded, setXpExpanded] = React.useState(false);
  // Feedback text per phrase index — used on the summary screen.
  const [sessionFeedback, setSessionFeedback] = React.useState<Record<number, { feedback: string; tip: string }>>({});
  const [coachPlaying, setCoachPlaying] = React.useState(false);
  const [selfPlaying, setSelfPlaying] = React.useState(false);
  /** The learner's own recording from the most recent attempt (base64 m4a). */
  const lastRecordingBase64Ref = React.useRef<string | null>(null);
  const selfPlaybackRef = React.useRef<PlaybackHandle | null>(null);
  /** Monotonic token — bumped on every stopSelfPlayback so post-await guards can detect staleness. */
  const selfPlayTokenRef = React.useRef(0);
  const [unlockedBadges, setUnlockedBadges] = React.useState<EarnedBadge[]>([]);
  const [celebrate, setCelebrate] = React.useState(false);

  // THE FIRST-WORD LIGHTBOX (lib/firstWordPrimer.ts). While it is up the
  // score reveal and any badge the attempt unlocked wait in these refs;
  // dismissing it releases both together, score first, badge over it, so
  // the lightbox never fights the first badge celebration.
  const [firstWordPrimerOpen, setFirstWordPrimerOpen] = React.useState(false);
  const firstWordHoldRef = React.useRef(false);
  const heldRevealRef = React.useRef<(() => void) | null>(null);
  const heldBadgesRef = React.useRef<EarnedBadge[] | null>(null);
  // The language's attempt count, the "is this really their first word"
  // half of the decision. The reminder scheduler and home keep it cached, so
  // this is a cache read in practice.
  const progressSummary = useGetProgressSummary(
    { lang: activeLang },
    { query: { enabled: !!activeLang, queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }) } },
  );
  const dismissFirstWordPrimer = () => {
    setFirstWordPrimerOpen(false);
    firstWordHoldRef.current = false;
    const reveal = heldRevealRef.current;
    heldRevealRef.current = null;
    reveal?.();
    const badges = heldBadgesRef.current;
    heldBadgesRef.current = null;
    if (badges?.length) setUnlockedBadges(badges);
  };

  // THE OUTCOME LAYOUT, build 19. Owner: "I don't want the user to have to
  // scroll down to see their feedback. Can we shrink down the word card and
  // move the feedback into the same screen view?" While a result, compare or
  // error card is up, the mascot and the word card drop to a compact size and
  // the word card's Hear it moves down into the result card beside Hear
  // yourself, so the feedback lands on the first screen. The scroll is the
  // belt to that brace, for a long feedback on a short phone: it only moves
  // when the content overflows.
  const showingOutcome = phase === 'result' || phase === 'compare' || phase === 'error';
  const scrollRef = React.useRef<ScrollView>(null);
  React.useEffect(() => {
    if (phase !== 'result' && phase !== 'compare') return;
    // After the card's entrance, so the end includes it.
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 350);
    return () => clearTimeout(t);
  }, [phase]);
  const [evalError, setEvalError] = React.useState<string | null>(null);

  // One-time "feedback is approximate" notice for degraded-recognition
  // languages. Shown the first time the learner reaches a recording surface in
  // this language, then persisted per language code so it never reappears.
  const [showApproxNotice, setShowApproxNotice] = React.useState(false);
  React.useEffect(() => {
    if (!isDegraded) return;
    let cancelled = false;
    loadApproxNoticeSeen(activeLang).then((seen) => {
      if (!cancelled && !seen) setShowApproxNotice(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isDegraded, activeLang]);
  const dismissApproxNotice = React.useCallback(() => {
    setShowApproxNotice(false);
    void saveApproxNoticeSeen(activeLang);
  }, [activeLang]);

  // ── Hot-streak & milestone toast state ──────────────────────────────────
  /** Consecutive scores ≥ 70 in this session. */
  const consecutiveGoodRef = React.useRef(0);
  /** Message shown in the MilestoneToast pill. */
  const [toastMessage, setToastMessage] = React.useState('');
  /** Increment to re-trigger the toast animation. */
  const [toastKey, setToastKey] = React.useState(0);
  /**
   * Shows a message in the same pill the session milestones use. A new key
   * replaces whatever is on screen rather than stacking a second pill, which
   * matters for the audio toggles: they sit together and get tapped in quick
   * succession.
   */
  const showToast = React.useCallback((message: string) => {
    setToastMessage(message);
    setToastKey((k) => k + 1);
  }, []);
  /** Increment to trigger a one-shot bounce on the mascot. */
  const [celebrateBounceCount, setCelebrateBounceCount] = React.useState(0);
  /** Guards so each mid-session milestone fires at most once per session. */
  const halfwayFiredRef = React.useRef(false);
  const lastPhraseFiredRef = React.useRef(false);
  // When true, the attempt scored but saving progress failed — the learner
  // keeps their result and gets a gentle note instead of a silent reset.
  const [saveFailed, setSaveFailed] = React.useState(false);

  // ── Score flash overlay ──────────────────────────────────────────────────
  /** 0–0.18 animated opacity of the full-bleed color flash after scoring. */
  const flashOpacity = useSharedValue(0);
  /** The color of the flash overlay — set before the animation fires. */
  const [flashColor, setFlashColor] = React.useState('#10B981');
  const flashOverlayStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  // ── Wrong-answer shake (Spec 1 rule: retry band only, never nocatch) ─────
  const reduceMotion = useReducedMotion();
  const shakeX = useSharedValue(0);
  const triggerShake = React.useCallback(() => {
    if (reduceMotion) return; // outcome is instant under reduced motion
    // 3 horizontal cycles ≈80ms each, ≤8px, transform-only.
    shakeX.value = withSequence(
      withTiming(-8, { duration: 40 }),
      withTiming(8, { duration: 80 }),
      withTiming(-8, { duration: 80 }),
      withTiming(8, { duration: 80 }),
      withTiming(0, { duration: 40 }),
    );
  }, [reduceMotion, shakeX]);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  // ── XP arc (Spec 1: nailed only; badge arcs from result to XP counter) ──
  const xpArcTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (xpArcTimerRef.current) clearTimeout(xpArcTimerRef.current);
    },
    [],
  );
  const [xpArc, setXpArc] = React.useState<{
    key: number;
    amount: number;
    from: { x: number; y: number };
  } | null>(null);
  const resultCardRef = React.useRef<View>(null);

  // Tracks whether the learner's finger is currently held on the record button.
  // Guards the hold-to-speak startup race: if pressOut fires before the async
  // recorder startup completes, startRecording reads this after startup and
  // immediately calls stopRecording itself.
  const isPressingRef = React.useRef(false);

  // Chevron navigation (#976): set for exactly one phrase change so the
  // auto-play effect stays silent - manual navigation must fire no coach
  // playback. The effect clears it the first time it observes it.
  const suppressAutoPlayRef = React.useRef(false);

  const celebrateTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const fireConfetti = React.useCallback((durationMs = 2600) => {
    setCelebrate(true);
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(() => setCelebrate(false), durationMs);
  }, []);
  React.useEffect(
    () => () => {
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    },
    [],
  );

  // Jump to a requested starting phrase once the list loads (a tap on a
  // phrase card passes `?phrase=`). Falls back to the start if the id isn't
  // in the list. Applied only once so mid-session refetches can't yank the
  // learner back to the starting phrase.
  const appliedStartRef = React.useRef(false);
  React.useEffect(() => {
    if (appliedStartRef.current || list.length === 0) return;
    appliedStartRef.current = true;
    let startIdx = 0;
    if (startPhraseId != null) {
      const idx = list.findIndex((p) => p.id === Number(startPhraseId));
      if (idx > 0) { startIdx = idx; setIndex(idx); }
    } else if (isGroup && !isTestout) {
      // #966 (web Task 954 parity): a station session ALWAYS resumes at the
      // first phrase whose bestScore is null or below the 80 credit edge (the
      // same threshold lesson-group completion uses). There is no query-param
      // gate: every route into a plain station session runs this same scan,
      // and station status (completed / tested_out) never short-circuits it.
      // Index 0 is the fallback only when the scan finds nothing: every
      // phrase at 80+ means a deliberate review visit replays from phrase 1,
      // and a tested-out station without per-phrase attempts is all-null so
      // the scan itself lands on index 0.
      //
      // Teaser taste sets are INERT to resume: the fixed free taste set must
      // always play from the top, or the taste-then-upsell flow shortens.
      const isTeaserSet = list.some((p) => p.teaser != null);
      if (!isTeaserSet) {
        const idx = list.findIndex(
          (p) => p.bestScore == null || p.bestScore < 80,
        );
        if (idx > 0) { startIdx = idx; setIndex(idx); }
      }
    }
    // Pre-warm the starting phrase's coach audio as soon as the list loads,
    // before playCoach() runs — gpt-audio synthesis takes 1–2 s and without
    // this the record button stays blocked (coachPlaying=true) for that whole
    // window.
    void (async () => {
      const silent = await loadSilentMode();
      if (silent) return;
      const startPhrase = list[startIdx];
      if (!startPhrase) return;
      const cacheKey = `${startPhrase.id}:${ttsVoice}`;
      if (audioCacheRef.current.has(cacheKey)) return;
      startingPhraseAudioRef.current = synth
        .mutateAsync({ data: { text: startPhrase.nativeScript, languageName: activeLanguage?.name } })
        .then((res) => {
          audioCacheRef.current.set(cacheKey, { audioBase64: res.audioBase64, format: res.format || 'mp3' });
          return res;
        })
        .catch(() => null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  const playbackRef = React.useRef<PlaybackHandle | null>(null);
  const phrase = list[index];
  const nativeProps = nativeTextStyle(activeLanguage, { bold: true });

  // Each playback attempt gets a token; stopPlayback bumps it so any TTS
  // response still in flight for an earlier phrase (or an earlier tap) is
  // discarded instead of playing over the phrase now on screen.
  const playTokenRef = React.useRef(0);

  // Feedback-voice synthesis started as soon as the evaluation returns, so
  // the result card can play it with minimal extra wait.
  const feedbackAudioRef = React.useRef<Promise<{
    audioBase64: string;
    format?: string;
  } | null> | null>(null);

  // The instant band call-out clip playing for the current result (Task 903).
  const bandClipRef = React.useRef<BandClipHandle | null>(null);

  // Pre-warmed audio for the starting phrase — kicked off when the phrase list
  // first loads so the coach voice plays instantly instead of waiting 1–2 s
  // for gpt-audio synthesis after coachPlaying flips to true (which blocks
  // the record button for the whole synthesis window).
  const startingPhraseAudioRef = React.useRef<Promise<{
    audioBase64: string;
    format?: string;
  } | null> | null>(null);

  // Spoken-feedback preference, shared with the Account screen toggle via
  // device storage. Mirrored in state so the result card's quick mute button
  // applies instantly.
  const [spokenEnabled, setSpokenEnabled] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    loadSpokenFeedback().then((enabled) => {
      if (!cancelled) setSpokenEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Coach voice master gate: when off, all Bolo speech is silent regardless
  // of the more granular spoken-feedback and meaning-audio settings below.
  const [coachVoiceEnabled, setCoachVoiceEnabled] = React.useState(true);
  const coachVoiceRef = React.useRef(true);
  React.useEffect(() => {
    let cancelled = false;
    loadCoachVoicePref().then((enabled) => {
      if (!cancelled) {
        coachVoiceRef.current = enabled;
        setCoachVoiceEnabled(enabled);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Silent-mode preference — mirrored in state so the practice-header quick
  // toggle (web parity) applies instantly without reloading the phrase.
  const [silentModeUI, setSilentModeUI] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    loadSilentMode().then((v) => {
      if (!cancelled) setSilentModeUI(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const toggleSilentModeUI = React.useCallback(() => {
    const next = !silentModeUI;
    setSilentModeUI(next);
    void saveSilentMode(next);
    // Confirm the tap in words (web parity, Task 1038): the pill styling alone
    // never said what just changed.
    showToast(next ? TOGGLE_TOAST.phraseAudioOff : TOGGLE_TOAST.phraseAudioOn);
  }, [silentModeUI, showToast]);

  // Meaning-aloud preference (web Task 1003 parity): the English meaning is
  // spoken right after each phrase clip. Mirrored in state for the header
  // toggle. The ref starts null (unknown) because AsyncStorage is async,
  // unlike the web's synchronous localStorage read: the first play awaits the
  // stored value through readMeaningPref so a saved "off" is never raced by
  // an optimistic default, and every later read is synchronous. The ref is
  // read fresh at each step of the play chain so a toggle flip applies to the
  // very next segment without waiting for a re-render.
  const [meaningAudioUI, setMeaningAudioUI] = React.useState(true);
  const meaningPrefRef = React.useRef<boolean | null>(null);
  const readMeaningPref = React.useCallback(async () => {
    if (meaningPrefRef.current === null) {
      meaningPrefRef.current = await loadMeaningAudio();
    }
    return meaningPrefRef.current;
  }, []);
  React.useEffect(() => {
    let cancelled = false;
    loadMeaningAudio().then((enabled) => {
      if (cancelled) return;
      if (meaningPrefRef.current === null) meaningPrefRef.current = enabled;
      setMeaningAudioUI(meaningPrefRef.current);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const toggleMeaningAudioUI = React.useCallback(() => {
    const next = !meaningAudioUI;
    setMeaningAudioUI(next);
    meaningPrefRef.current = next;
    void saveMeaningAudio(next);
    showToast(next ? TOGGLE_TOAST.meaningAloudOn : TOGGLE_TOAST.meaningAloudOff);
  }, [meaningAudioUI, showToast]);

  const stopPlayback = React.useCallback(() => {
    playTokenRef.current += 1;
    playbackRef.current?.stop();
    playbackRef.current = null;
    setCoachPlaying(false);
  }, []);

  const stopSelfPlayback = React.useCallback(() => {
    // Bump the token so any in-flight playSelf awaiting the handle discards it.
    selfPlayTokenRef.current += 1;
    selfPlaybackRef.current?.stop();
    selfPlaybackRef.current = null;
    setSelfPlaying(false);
  }, []);

  const playSelf = React.useCallback(async () => {
    const b64 = lastRecordingBase64Ref.current;
    if (!b64) return;
    // Toggle: if a handle is already live, stop it.
    // Use the ref (always current) not the `selfPlaying` state (stale in closure).
    if (selfPlaybackRef.current) {
      stopSelfPlayback();
      return;
    }
    // Stop coach audio so both don't overlap.
    stopPlayback();
    setSelfPlaying(true);
    const myToken = ++selfPlayTokenRef.current;
    try {
      const handle = await playBase64Audio(b64, 'm4a', () => {
        // Natural end of playback — clear state only if we're still the active play.
        if (selfPlayTokenRef.current === myToken) {
          selfPlaybackRef.current = null;
          setSelfPlaying(false);
        }
      });
      // Guard: stopSelfPlayback may have been called while we awaited the handle.
      if (selfPlayTokenRef.current !== myToken) {
        handle.stop();
        return;
      }
      selfPlaybackRef.current = handle;
    } catch {
      if (selfPlayTokenRef.current === myToken) setSelfPlaying(false);
    }
  }, [stopPlayback, stopSelfPlayback]);

  const toggleSpokenFeedback = React.useCallback(() => {
    const nextEnabled = !spokenEnabled;
    setSpokenEnabled(nextEnabled);
    void saveSpokenFeedback(nextEnabled);
    // Muting mid-readout should silence the coach immediately.
    if (!nextEnabled) stopPlayback();
    showToast(
      nextEnabled
        ? TOGGLE_TOAST.feedbackAloudOn
        : TOGGLE_TOAST.feedbackAloudOff,
    );
  }, [spokenEnabled, stopPlayback, showToast]);

  // Replays reuse the first synthesized audio for a phrase: regenerating on
  // every tap sometimes yields a different (wrong) reading from the TTS model.
  // The key is `${phrase.id}:${ttsVoice}` so a mid-session voice change
  // automatically busts the old cached clip — the new voice is fetched fresh
  // for the very next play rather than waiting for a phrase the user hasn't
  // heard yet.
  const audioCacheRef = React.useRef(
    new Map<string, { audioBase64: string; format: string }>(),
  );

  // Per-session cache for the synthesized English meaning clips, keyed by
  // phrase id alone: the meaning segment always speaks English, so the
  // coach-voice cache key shape above does not apply. Web parity:
  // meaningAudioCacheRef in gujarati-coach's practice page (Task 1003).
  const meaningCacheRef = React.useRef(
    new Map<number, { audioBase64: string; format: string }>(),
  );

  /**
   * SYNTHESISE THE MEANING WHEN THE CARD APPEARS, NOT WHEN PLAY IS PRESSED.
   *
   * The owner on TestFlight 1.0.11: "There is a large gap between the native
   * word being spoken, and the means Line".
   *
   * The beat itself is only MEANING_SEGMENT_PAUSE_MS, 400ms, and playCoach
   * already pre-warms the clip and overlaps that pause with the synthesis. But
   * the pre-warm starts when playback starts, so it can only hide as much
   * latency as the phrase clip is LONG. A short word plus a cold English TTS
   * round trip leaves the rest of that round trip as silence, and a single word
   * is exactly the case where the phrase clip is shortest. It is worst on the
   * first play of each phrase, which is the play that matters.
   *
   * The cache is in-memory and per phrase id, so the whole cost is paid once.
   * Moving it here spends the seconds a learner takes to look at the card
   * before pressing listen, which is time the app was throwing away.
   *
   * Deliberately quiet: a failure here changes nothing, because playCoach
   * still synthesises on demand and still fails silent to phrase-only.
   */
  React.useEffect(() => {
    if (!phrase?.english) return;
    if (!meaningPrefRef.current) return;
    if (meaningCacheRef.current.has(phrase.id)) return;
    let cancelled = false;
    void (async () => {
      try {
        const fresh = await synth.mutateAsync({
          data: {
            text: meaningSpeechText(phrase.english!, { sentence: isSentences }),
            languageName: 'English',
            languageCode: 'en',
          },
        });
        if (cancelled) return;
        meaningCacheRef.current.set(phrase.id, {
          audioBase64: fresh.audioBase64,
          format: fresh.format || 'mp3',
        });
      } catch {
        // Silent: playCoach synthesises on demand and fails silent already.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase?.id, phrase?.english, isSentences]);

  const playCoach = React.useCallback(async () => {
    if (!phrase) return;
    if (!coachVoiceRef.current) return; // Coach voice master gate
    stopPlayback();
    const token = playTokenRef.current;
    try {
      setCoachPlaying(true);
      const cacheKey = `${phrase.id}:${ttsVoice}`;
      const cached = audioCacheRef.current.get(cacheKey);
      // Consume any pre-warmed synthesis promise started when the list loaded.
      const pendingPrewarm = !cached ? startingPhraseAudioRef.current : null;
      if (pendingPrewarm) startingPhraseAudioRef.current = null;
      const prewarm = pendingPrewarm ? await pendingPrewarm : null;
      const res =
        cached ??
        prewarm ??
        (await synth.mutateAsync({
          data: {
            text: phrase.nativeScript,
            languageName: activeLanguage?.name,
          },
        }));
      if (!res) { if (token === playTokenRef.current) setCoachPlaying(false); return; }
      audioCacheRef.current.set(cacheKey, {
        audioBase64: res.audioBase64,
        format: res.format || 'mp3',
      });
      // The learner may have moved on (or re-tapped) while we waited for the
      // audio — this response belongs to the old word, so drop it silently.
      if (token !== playTokenRef.current) return;
      // Second segment of the play chain (web Task 1003 parity): after the
      // phrase clip ends, a short pause, then the English meaning in an
      // English voice. Best-effort by design: any synthesis or playback
      // failure here falls back silently to the phrase-only behavior.
      const synthMeaning = async () => {
        const cachedMeaning = meaningCacheRef.current.get(phrase.id);
        if (cachedMeaning) return cachedMeaning;
        const fresh = await synth.mutateAsync({
          data: {
            text: meaningSpeechText(phrase.english, { sentence: isSentences }),
            languageName: 'English',
            languageCode: 'en',
          },
        });
        const entry = {
          audioBase64: fresh.audioBase64,
          format: fresh.format || 'mp3',
        };
        meaningCacheRef.current.set(phrase.id, entry);
        return entry;
      };
      // Pre-warm the meaning clip while the phrase clip plays so the beat
      // after it stays near MEANING_SEGMENT_PAUSE_MS even on a cold cache. On
      // failure the handle resets so playMeaning retries fresh and keeps
      // owning the fail-silent fallback.
      let meaningPrewarm: ReturnType<typeof synthMeaning> | null = null;
      const meaningOn = await readMeaningPref();
      if (token !== playTokenRef.current) return;
      if (meaningOn && phrase.english) {
        const prewarm = synthMeaning();
        meaningPrewarm = prewarm;
        prewarm.catch(() => {
          if (meaningPrewarm === prewarm) meaningPrewarm = null;
        });
      }
      const playMeaning = async () => {
        if (token !== playTokenRef.current) return;
        // Read the preference fresh at play time so a toggle flip applies to
        // the very next play without a reload (web parity).
        if (!meaningPrefRef.current || !phrase.english) {
          setCoachPlaying(false);
          return;
        }
        try {
          // The pause and the (pre-warmed or fresh) synthesis overlap so the
          // gap between the two segments stays close to the intended beat.
          const [meaningRes] = await Promise.all([
            meaningPrewarm ?? synthMeaning(),
            new Promise((resolve) =>
              setTimeout(resolve, MEANING_SEGMENT_PAUSE_MS),
            ),
          ]);
          if (token !== playTokenRef.current) return;
          playbackRef.current = await playBase64Audio(
            meaningRes.audioBase64,
            meaningRes.format || 'mp3',
            () => {
              if (token === playTokenRef.current) setCoachPlaying(false);
            },
          );
          if (token !== playTokenRef.current) {
            playbackRef.current?.stop();
            playbackRef.current = null;
          }
        } catch {
          // Fail silent to phrase-only: the phrase clip already played in
          // full, so simply drop back as if the meaning were off.
          if (token === playTokenRef.current) setCoachPlaying(false);
        }
      };
      const onCoachDone = () => {
        // coachPlaying (and the disabled listen buttons) span the meaning
        // segment too, matching the web's playing_coach state span.
        void playMeaning();
      };
      playbackRef.current = await playBase64Audio(
        res.audioBase64,
        res.format || 'mp3',
        onCoachDone,
      );
      if (token !== playTokenRef.current) {
        playbackRef.current?.stop();
        playbackRef.current = null;
        return;
      }
    } catch {
      if (token === playTokenRef.current) setCoachPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase?.id, activeLanguage?.name, ttsVoice, isSentences]);

  // Auto-play the coach model once when a new phrase appears, unless the
  // learner has opted into silent mode (they prefer to read the phrase and
  // start recording without hearing the coach first). In auto-stop mode,
  // recording begins on its own once coach playback finishes (see onCoachDone).
  React.useEffect(() => {
    if (!phrase) return;
    // Chevron navigation (#976) lands silently in idle: suppress the one
    // auto-play this phrase change would fire. Manual "Hear it" still works,
    // and the next auto-advance plays the coach as usual.
    if (suppressAutoPlayRef.current) {
      suppressAutoPlayRef.current = false;
      return () => {
        stopPlayback();
      };
    }
    let cancelled = false;
    void (async () => {
      const silent = await loadSilentMode();
      if (cancelled) return;
      // Guard against the race where the learner tapped record during the
      // async loadSilentMode() call: if phase is no longer idle, don't
      // start coach playback over an in-progress or completed recording.
      if (phaseRef.current !== 'idle') return;
      if (!silent) playCoach();
    })();
    return () => {
      cancelled = true;
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase?.id]);

  // Prefetch the next phrase's coach audio while the learner is still working
  // on the current one, so advancing to it feels instant. Skipped in silent
  // mode (no audio will be needed) and when the cache already has it.
  // ttsVoice is included so a voice change re-prefetches the upcoming phrase
  // in the new voice rather than serving a stale clip.
  React.useEffect(() => {
    let cancelled = false;
    const upcoming = list[index + 1];
    if (!upcoming) return;
    void (async () => {
      const silent = await loadSilentMode();
      if (cancelled || silent) return;
      const upcomingKey = `${upcoming.id}:${ttsVoice}`;
      if (audioCacheRef.current.has(upcomingKey)) return;
      try {
        const res = await synth.mutateAsync({
          data: {
            text: upcoming.nativeScript,
            languageName: activeLanguage?.name,
          },
        });
        if (cancelled) return;
        audioCacheRef.current.set(upcomingKey, {
          audioBase64: res.audioBase64,
          format: res.format || 'mp3',
        });
      } catch {
        // Best-effort — playCoach will synthesize on demand if this fails.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, list.length, activeLanguage?.name, ttsVoice]);

  React.useEffect(() => () => stopPlayback(), [stopPlayback]);
  React.useEffect(() => () => stopSelfPlayback(), [stopSelfPlayback]);

  // Read the coach's feedback + tip aloud when a score lands (mirrors the web
  // practice flow). The device-local "Spoken feedback" preference is read
  // fresh each time, so a toggle flipped on the Account screen applies to the
  // very next score. The playback token guards staleness: moving on, retrying,
  // or replaying the phrase bumps it and this audio is dropped or stopped.
  // Read the coach's feedback + tip aloud when a score lands, in the same
  // coach voice as the model phrase. Synthesis was kicked off the moment the
  // evaluation returned (see stopRecording), so by the time the card is on
  // screen the audio is usually ready or nearly so. The playback token guards
  // staleness: moving on, retrying, or muting bumps it and this audio is
  // dropped or stopped.
  React.useEffect(() => {
    if (phase !== 'result' || !result) return;
    if (!spokenEnabled || !coachVoiceEnabled) return;
    stopPlayback();
    const token = playTokenRef.current;
    // 1) Band call-out (Task 903) — bundled clip, starts effectively
    // instantly; plays even when no feedback synthesis is pending. The
    // nocatch band gets the neutral clip.
    const clip = playBandClip(result.band);
    bandClipRef.current = clip;
    const pending = feedbackAudioRef.current;
    void (async () => {
      try {
        // 2) Full feedback — usually already resolving (kicked at eval time
        // client-side, and even earlier server-side). A timeout guards the
        // sequence: slow or failed synthesis degrades to band-clip-only.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), FEEDBACK_AUDIO_TIMEOUT_MS);
        });
        const res = pending ? await Promise.race([pending, timeout]) : null;
        if (timer) clearTimeout(timer);
        // Sequence: let the band call-out finish before the sentence starts.
        if (clip) await clip.finished;
        if (!res) return;
        if (token !== playTokenRef.current) return;
        playbackRef.current = await playBase64Audio(
          res.audioBase64,
          res.format || 'mp3',
          () => {},
        );
        if (token !== playTokenRef.current) {
          playbackRef.current?.stop();
          playbackRef.current = null;
        }
      } catch {
        // A missed read-aloud shouldn't interrupt practice; stay silent.
      }
    })();
    return () => {
      bandClipRef.current?.stop();
      bandClipRef.current = null;
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result, spokenEnabled, coachVoiceEnabled]);

  // Celebrate finishing a whole session with a longer confetti shower — but
  // only when the session went well: at least half of the phrases ended in a
  // passing band (Spec 1 gating; confetti must not fire on rough sessions).
  // If every phrase ended full-credit (legacy 'nailed' group), fire a heavy
  // haptic for the perfect moment.
  React.useEffect(() => {
    if (phase === 'done') {
      const vals = Object.values(bands);
      const good = vals.filter((b) => isPassingBand(b)).length;
      if (vals.length > 0 && good * 2 >= vals.length) {
        // The celebratory sound is gated on the same condition as confetti:
        // a rough session gets neither.
        playCue('session_complete');
        fireConfetti(4000);
      }
      if (vals.length > 0 && vals.every((b) => isFullCreditBand(b))) {
        hapticHeavy();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, fireConfetti]);

  // Warm up recording ahead of the tap: request permission + audio session
  // once, and run the recorder's prepare step whenever we're back in the idle
  // phase, so tapping record starts capturing immediately (no clipped first
  // syllable). Permission denial here is silent — the tap handler surfaces
  // the existing alert.
  const sessionReadyRef = React.useRef(false);
  const recorderPreparedRef = React.useRef(false);
  // A tap can land while the idle-phase warm-up is still in flight; share the
  // same prepare promise so we never double-prepare the recorder.
  const preparePromiseRef = React.useRef<Promise<boolean> | null>(null);
  const prepareRecorder = React.useCallback((): Promise<boolean> => {
    if (preparePromiseRef.current) return preparePromiseRef.current;
    const run = async (): Promise<boolean> => {
      try {
        if (!sessionReadyRef.current) {
          const ok = await prepareRecordingSession();
          if (!ok) return false;
          sessionReadyRef.current = true;
        }
        if (!recorderPreparedRef.current) {
          // Serialized with audio-mode flips: the native prepare re-asserts
          // the playAndRecord category, which must not land mid-playback.
          await prepareRecorderInSession(recorder);
          recorderPreparedRef.current = true;
        }
        return true;
      } catch (err) {
        // Bound, not swallowed. Which half threw is readable from the flag:
        // the session step sets it before the recorder step runs.
        reportAudioSessionFailure(
          sessionReadyRef.current ? 'prepare_recorder' : 'prepare_session',
          err,
        );
        return false;
      } finally {
        preparePromiseRef.current = null;
      }
    };
    preparePromiseRef.current = run();
    return preparePromiseRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder]);

  React.useEffect(() => {
    if (phase === 'idle') {
      void prepareRecorder();
    }
  }, [phase, prepareRecorder]);

  // First-ever practice session on this install (trackOnce dedupes).
  React.useEffect(() => {
    if (list.length > 0) {
      void trackOnce(ANALYTICS_EVENTS.FIRST_PRACTICE_SESSION_STARTED, { language: activeLang });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length > 0]);

  // --- Silence auto-stop ---
  // A continuous stretch of quiet (metering stays below the threshold) ends
  // the recording on its own — a safety net so the learner never has to
  // release and re-hold if they paused too long mid-phrase.
  // The learner's hold-gesture release is still the primary stop action.
  // 60ms poll (Spec D2): tight enough for a live waveform; the silence
  // auto-stop below is wall-clock based (Date.now() countdown against
  // adaptive dB thresholds), so polling faster only adds samples — it never
  // shifts the auto-stop timing.
  const recorderState = useAudioRecorderState(recorder, 60);
  const silenceSinceRef = React.useRef<number | null>(null);
  // Loudest level heard this recording; the silence threshold adapts to it so
  // ordinary room tone (often above a fixed floor on phone mics) can't keep
  // resetting the countdown forever.
  const peakDbRef = React.useRef(-160);
  const metering = recorderState?.metering;

  // ── Spec D2: live amplitude ────────────────────────────────────────────
  // dBFS → 0..1 via meteringToAmplitude, into a Reanimated shared value so
  // the waveform bars and mascot scale animate on the UI thread — no React
  // state per frame. React state is only used for slow-changing facts: the
  // zero-input hint and the reduced-motion level segments.
  const liveAmp = useSharedValue(0);
  const [ampLevel, setAmpLevel] = React.useState(0);
  const [noInput, setNoInput] = React.useState(false);
  const lastLoudAtRef = React.useRef(0);
  React.useEffect(() => {
    if (phase !== 'recording') {
      liveAmp.value = withTiming(0, { duration: 120 });
      setAmpLevel(0);
      setNoInput(false);
      lastLoudAtRef.current = 0;
      return;
    }
    if (typeof metering !== 'number') return;
    const amp = meteringToAmplitude(metering);
    liveAmp.value = withTiming(amp, { duration: 80 });
    if (prefersReducedMotion()) {
      // Static level indicator input; coarse so it rarely re-renders.
      setAmpLevel(Math.round(amp * 5) / 5);
    }
    const now = Date.now();
    if (lastLoudAtRef.current === 0) lastLoudAtRef.current = now;
    if (amp > 0.08) lastLoudAtRef.current = now;
    // Zero-input state: >1.5s of near-zero amplitude while recording.
    setNoInput(now - lastLoudAtRef.current > 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, metering]);

  // Spec D2: mascot "hears" the learner — scale rides the live amplitude
  // (1.0–1.08) on the UI thread. Disabled under reduced motion (rule 10,
  // via motionPrefs); liveAmp resets to 0 outside recording so the mascot
  // settles back to scale 1 on its own.
  const mascotAmpDisabled = prefersReducedMotion();
  const mascotAmpStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: mascotAmpDisabled
          ? 1
          : 1 + Math.min(1, Math.max(0, liveAmp.value)) * 0.08,
      },
    ],
  }));

  React.useEffect(() => {
    if (phase !== 'recording') {
      silenceSinceRef.current = null;
      peakDbRef.current = -160;
      return;
    }
    if (typeof metering !== 'number') return;
    const now = Date.now();
    if (metering > peakDbRef.current) peakDbRef.current = metering;
    // Don't arm auto-stop until the learner has actually said something —
    // otherwise ambient quiet before speaking would end the take early.
    if (peakDbRef.current < SPEECH_MIN_DB) {
      silenceSinceRef.current = null;
      return;
    }
    const threshold = Math.max(
      SILENCE_THRESHOLD_DB,
      peakDbRef.current - SILENCE_DROP_DB,
    );
    if (metering > threshold) {
      // Heard something — restart the silence countdown.
      silenceSinceRef.current = now;
      return;
    }
    if (silenceSinceRef.current == null) {
      silenceSinceRef.current = now;
      return;
    }
    if (now - silenceSinceRef.current >= SILENCE_DURATION_MS) {
      silenceSinceRef.current = null;
      void stopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, metering, recorderState]);

  // Prevents a manual stop and an auto-stop from both firing.
  const finishingRef = React.useRef(false);

  const startRecording = async () => {
    if (phase !== 'idle') return;
    stopPlayback();
    setEvalError(null);
    // Not-yet-prepared edge case (e.g. permission was denied on load, or
    // prepare is still in flight): prepare now, then start.
    if (!recorderPreparedRef.current) {
      const ok = await prepareRecorder();
      if (!ok) {
        if (!sessionReadyRef.current) {
          Alert.alert(
            'Microphone needed',
            'Please allow microphone access to practice speaking.',
          );
        } else {
          // Same copy as the catch below, deliberately. The tag is what
          // separates them: prepare came back false without throwing.
          reportAudioSessionFailure(
            'prepare_recorder',
            new Error('prepareRecorder returned false'),
            'prepare_failed',
          );
          Alert.alert(
            'Recording failed',
            'Could not start recording. Try again.',
          );
        }
        return;
      }
    }
    try {
      // Coach playback flips iOS to playback-only mode for speaker routing;
      // re-assert recording mode (fast category switch, not the heavy
      // permission/prepare path) so capture actually starts.
      await ensureRecordingMode();
      recorder.record();
      // The prepared recorder is consumed by this recording; the idle-phase
      // effect re-prepares for the next one.
      recorderPreparedRef.current = false;
      // Only show "recording" once capture has actually started.
      setPhaseSync('recording');
      hapticMedium();
      // Guard: if the finger was lifted while async startup was in flight,
      // stop immediately so recording never outlasts the hold gesture.
      if (!isPressingRef.current) {
        void stopRecording();
      }
    } catch (err) {
      recorderPreparedRef.current = false;
      reportAudioSessionFailure('start_record', err, 'record_threw');
      Alert.alert('Recording failed', 'Could not start recording. Try again.');
    }
  };

  const stopRecording = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setPhaseSync('evaluating');
    setEvalError(null);
    setSaveFailed(false);
    try {
      const audioBase64 = await stopAndReadRecording(recorder);
      // Stash the raw recording so the result/compare card can play it back.
      lastRecordingBase64Ref.current = audioBase64;

      // Unsupported language: recognition can't hear it reliably, so we never
      // send an evaluation. Move straight to the compare stage — no score,
      // no band, no XP — where the learner listens, records, and compares.
      if (isUnsupported) {
        setComparedIdx((prev) => {
          const nextSet = new Set(prev);
          nextSet.add(index);
          return nextSet;
        });
        setPhaseSync('compare');
        finishingRef.current = false;
        return;
      }

      void trackOnce(ANALYTICS_EVENTS.FIRST_PHRASE_ATTEMPTED, { language: activeLang });
      const resRaw = await evaluate.mutateAsync({
        data: {
          phraseId: phrase.id,
          targetNative: phrase.nativeScript,
          targetRomanized: phrase.romanized,
          targetEnglish: phrase.english,
          languageName: activeLanguage?.name,
          audioBase64,
          mimeType: 'audio/m4a',
        },
      });
      // Normalize defensively: a stale/mixed-version server may still emit
      // legacy band names, which would leave the ladder with no highlighted
      // rung and fall through every band branch below.
      const res = { ...resRaw, band: normalizeBand(resRaw.band, resRaw.score) };
      // Kick off feedback-voice synthesis NOW, in parallel with rendering the
      // result card and saving the attempt, so the coach's voice (the same
      // bubbly TTS voice as the model phrase) starts with minimal delay.
      const spokenText = [res.feedback, res.tip].filter(Boolean).join(' ');
      feedbackAudioRef.current =
        spokenText && spokenEnabled
          ? synth
              .mutateAsync({ data: { text: spokenText } })
              .catch(() => null)
          : null;
      setResult(res);
      setBands((prev) => ({ ...prev, [index]: res.band }));
      // Accumulate across retries: the server writes an xp_ledger row per
      // attempt, so the session chip must sum every award, not just the last
      // take per phrase (which would under-report vs the ledger).
      setXpData((prev) => ({
        ...prev,
        [index]: {
          xp: (prev[index]?.xp ?? 0) + res.xpAwarded,
          breakdown: res.xpBreakdown ?? null,
        },
      }));
      setSessionFeedback((prev) => ({ ...prev, [index]: { feedback: res.feedback, tip: res.tip } }));
      // THE FIRST-WORD LIGHTBOX goes up before the first score is ever shown
      // (owner ask, build 19), and the reveal waits behind it. Judged on the
      // cached summary AND this device, never on either alone
      // (lib/firstWordPrimer.ts). Test-out is a batch, never a first word.
      const summaryAttempts = progressSummary.data?.totalAttempts;
      const primer =
        !isTestout &&
        summaryAttempts !== undefined &&
        shouldShowFirstWordPrimer({
          seenOnDevice: await loadFirstWordPrimerSeen(),
          totalAttempts: summaryAttempts,
        });
      if (primer) {
        void saveFirstWordPrimerSeen();
        firstWordHoldRef.current = true;
        heldRevealRef.current = () => setPhaseSync('result');
        setFirstWordPrimerOpen(true);
      } else {
        setPhaseSync('result');
      }

      // Zero-XP encore bookkeeping. Test-out is one take per phrase and is
      // judged as a batch, so it never queues an encore.
      if (!isTestout) {
        const encoreIdx = index;
        // The single write site for this phrase's tallies. The ref mirrors
        // the state so two attempts inside one render pass cannot both read
        // the same counts (and queue the phrase twice).
        const prevTally = phraseTalliesRef.current[encoreIdx] ?? { attempts: 0, zeroStrikes: 0 };
        const strikes = prevTally.zeroStrikes + (res.xpAwarded > 0 ? 0 : 1);
        phraseTalliesRef.current = {
          ...phraseTalliesRef.current,
          // Every take counts towards the advance gate, whatever the band.
          [encoreIdx]: { attempts: prevTally.attempts + 1, zeroStrikes: strikes },
        };
        setPhraseTallies(phraseTalliesRef.current);
        if (res.xpAwarded > 0) {
          // Earned something: the debt is settled, even if an earlier take on
          // this phrase had already queued it. Strikes are NOT reset — they
          // are the record of what this phrase cost, not a live budget.
          setEncoreQueue((q) => q.filter((i) => i !== encoreIdx));
        } else {
          setEncoreQueue((q) =>
            strikes >= ZERO_XP_STRIKE_LIMIT
              ? q.filter((i) => i !== encoreIdx) // three goes: released
              : q.includes(encoreIdx)
                ? q
                : [...q, encoreIdx],
          );
        }
      }

      // Full-bleed color flash keyed to the five-band ladder color (green for
      // perfect through red for retry). Nocatch is a system miss, not a
      // learner error (Spec 1 rule 16): nothing negative may fire, so the
      // flash is skipped entirely, exactly like haptics, the wrong-cue sound,
      // and the card shake already skip it.
      if (res.band !== 'nocatch') {
        const fColor = bandColor(res.band, colors);
        setFlashColor(fColor);
        flashOpacity.value = withSequence(
          withTiming(0.18, { duration: 150 }),
          withTiming(0, { duration: 250 }),
        );
      }

      // ── Hot-streak tracking ──────────────────────────────────────────────
      if (isPassingBand(res.band)) {
        consecutiveGoodRef.current += 1;
        const streak = consecutiveGoodRef.current;
        if (streak === 3 || streak === 5 || streak === 10) {
          const msg =
            streak === 3
              ? '🔥 3 in a row!'
              : streak === 5
                ? '🔥🔥 On a roll!'
                : '🔥🔥🔥 UNSTOPPABLE!';
          setToastMessage(msg);
          setToastKey((k) => k + 1);
          setCelebrateBounceCount((c) => c + 1);
        }
      } else {
        consecutiveGoodRef.current = 0;
      }

      // Band-driven feedback: full-credit bands (legacy 'nailed' group)
      // celebrate, half-credit bands get a gentle tap (passing-adjacent, not
      // a failure), retry warns. nocatch is a system miss, not a learner
      // error (Spec 1 rule 16): no negative haptic, no wrong cue, no shake.
      if (isFullCreditBand(res.band)) {
        hapticNotify(Haptics.NotificationFeedbackType.Success);
        playCue('correct');
      } else if (isHalfCreditBand(res.band)) {
        hapticLight();
      } else if (res.band === 'retry') {
        hapticNotify(Haptics.NotificationFeedbackType.Warning);
        playCue('wrong');
        triggerShake();
      }

      // Bigger reward for the TOP band only: confetti rains and an extra
      // celebratory haptic fires.
      if (res.band === 'perfect') {
        fireConfetti();
        setTimeout(() => hapticHeavy(), 140);
      }
      // XP arc fires whenever XP was actually awarded (any passing band —
      // the half-credit group earns at the 0.5 band factor, so the counter
      // moves and the arc connects the result to it). retry/nocatch award no XP.
      // Test-out runs record no attempt and award no XP, so no arc either.
      if (!isTestout && isPassingBand(res.band) && res.xpAwarded > 0) {
        // Measure where the result card lands, then launch the arc from it.
        if (xpArcTimerRef.current) clearTimeout(xpArcTimerRef.current);
        xpArcTimerRef.current = setTimeout(() => {
          resultCardRef.current?.measureInWindow((x, y, w) => {
            setXpArc({
              key: Date.now(),
              amount: res.xpAwarded,
              from: { x: x + w / 2, y: y + 20 },
            });
          });
        }, 250);
      }

      // The learner has their score — saving the attempt below must never
      // take the result away from them or silently reset the screen.
      if (isTestout) {
        // Test-out attempts are never saved individually. Collect the
        // server-signed token; the whole run is judged in one POST when the
        // last phrase lands (see next()). No XP, badges, or invalidations
        // happen here because nothing was recorded.
        const currentPhrase = list[index];
        if (currentPhrase) testoutTokensRef.current[currentPhrase.id] = res.evaluationToken;
      } else try {
        // Record the attempt using the server-signed token only.
        const attempt = await createAttempt.mutateAsync({
          data: { evaluationToken: res.evaluationToken },
        });
        // Optimistic: increment todayXp immediately so the XP strip (and the
        // train class derived from it) reacts before the background refetch
        // resolves. THE one writer, shared with web practice and review —
        // see applyOptimisticTodayXp in @workspace/train-class.
        applyOptimisticTodayXp(queryClient, activeLang, res.xpAwarded);
        queryClient.invalidateQueries({
          queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }),
        });
        queryClient.invalidateQueries({
          queryKey: getListRecentAttemptsQueryKey({ lang: activeLang }),
        });
        queryClient.invalidateQueries({
          queryKey: getListCategoryPhrasesQueryKey(categoryId, activeLang),
        });
        queryClient.invalidateQueries({
          queryKey: getListCategorySentencesQueryKey(categoryId, activeLang),
        });
        // Journey-stop sessions must also refresh the group's own phrase list
        // (mirrors web practice: it invalidates exactly this key) so the
        // journey map's mastered counts and unlock states move.
        if (isGroup) {
          queryClient.invalidateQueries({
            queryKey: getListLessonGroupPhrasesQueryKey(groupId),
          });
        }
        queryClient.invalidateQueries({
          queryKey: getListBadgesQueryKey({ lang: activeLang }),
        });

        // Celebrate any badges this attempt unlocked (server-authoritative list).
        // Behind the first-word lightbox the badge waits its turn.
        if (attempt.newlyEarnedBadges?.length) {
          if (firstWordHoldRef.current) {
            heldBadgesRef.current = attempt.newlyEarnedBadges;
          } else {
            setUnlockedBadges(attempt.newlyEarnedBadges);
          }
        }
        // Chai receipt: chaiEarned is optional and only present when > 0
        // (streak-day grant is the only attempt-side earn today).
        const chai = attempt.chaiEarned ?? 0;
        if (chai > 0) setSessionChai((c) => c + chai);
      } catch {
        setSaveFailed(true);
      }
    } catch (error) {
      // Scoring failed — show a visible, in-context error state with a retry
      // action instead of a fleeting alert or a silent reset to idle.
      setEvalError(describeEvaluationError(error));
      setPhaseSync('error');
      hapticNotify(Haptics.NotificationFeedbackType.Error);
    } finally {
      finishingRef.current = false;
    }
  };

  const next = () => {
    // Belt and braces: cut any in-flight feedback readout immediately.
    stopPlayback();
    stopSelfPlayback();
    lastRecordingBase64Ref.current = null;
    feedbackAudioRef.current = null;
    setResult(null);
    setSaveFailed(false);
    // Encore mode jumps the cursor backwards, so once it starts, forward
    // progress must come from the queue alone or the tail of the list would
    // replay in full.
    if (!inEncore && index + 1 < list.length) {
      const nextIdx = index + 1;
      // Mid-session milestone toasts — fire at the halfway phrase and the last phrase.
      if (!halfwayFiredRef.current && nextIdx === Math.floor(list.length / 2) && list.length > 2) {
        halfwayFiredRef.current = true;
        setToastMessage('Halfway there! 💪');
        setToastKey((k) => k + 1);
      } else if (!lastPhraseFiredRef.current && nextIdx === list.length - 1 && list.length > 1) {
        lastPhraseFiredRef.current = true;
        setToastMessage('Last one! 🦜 Finish strong!');
        setToastKey((k) => k + 1);
      }
      setIndex((i) => i + 1);
      setPhaseSync('idle');
    } else if (!isTestout && encoreQueue.length > 0) {
      // The list is done but something earned nothing. Bring the first such
      // phrase back — queue order means several zero-XP phrases return in the
      // order they were missed.
      const [head, ...rest] = encoreQueue;
      setEncoreQueue(rest);
      setInEncore(true);
      setIndex(head);
      setPhaseSync('idle');
      setToastMessage('One more go at this one 🎯');
      setToastKey((k) => k + 1);
    } else if (isTestout) {
      // End of a test-out run: hand the batch to the server for judgment. The
      // verdict screen reads the mutation state directly (pending, pass,
      // fail, or a transient error with a resubmit action). The regular done
      // screen and SESSION_COMPLETED event are skipped: nothing was recorded,
      // so there is no session to celebrate yet.
      submitTestoutRun();
      setPhaseSync('done');
    } else {
      track(ANALYTICS_EVENTS.SESSION_COMPLETED, {
        language: activeLang,
        total: list.length,
      });
      setPhaseSync('done');
    }
  };

  // Build the test-out submission from the collected tokens and POST it. Also
  // reused by the verdict screen's "Try again" after a transient submit error
  // (the tokens are still in hand, so no re-recording is needed).
  const submitTestoutRun = () => {
    const attempts = list
      .map((p) => ({ phraseId: p.id, evaluationToken: testoutTokensRef.current[p.id] }))
      .filter((a): a is { phraseId: number; evaluationToken: string } => Boolean(a.evaluationToken));
    if (attempts.length === 0) return;
    if (isZoneTestout) {
      submitZoneTestout.mutate({ categoryId, data: { languageCode: activeLang, attempts } });
    } else {
      submitTestout.mutate({ id: groupId, data: { attempts } });
    }
  };

  const tryAgain = () => {
    stopSelfPlayback();
    lastRecordingBase64Ref.current = null;
    feedbackAudioRef.current = null;
    setResult(null);
    setSaveFailed(false);
    setPhaseSync('idle');
    // Replay the coach model so the learner hears it again before re-recording,
    // unless silent mode is on. In auto-stop mode, recording begins on its own
    // once playback finishes (see onCoachDone). Guard with phaseRef: if the
    // learner taps record during the async read, don't overlay playback.
    void (async () => {
      const silent = await loadSilentMode();
      if (phaseRef.current !== 'idle') return;
      if (!silent) playCoach();
    })();
  };

  // ── Manual phrase navigation (#976, web Task #973 parity) ───────────────
  // Moving between phrases is FREE, never attempt-gated: bands, xpData, and
  // session feedback are keyed by phrase index, so no visit order can lose
  // progress. Navigation always lands in idle and fires no recording,
  // playback, or scoring side effect - the auto-play effect is suppressed for
  // this one phrase change, and the result-audio effect's cleanup already
  // stops any in-flight readout when phase flips away. Milestone toasts stay
  // exclusive to auto-advance (next()). Test-out is one take per phrase,
  // forward only: the chevrons do not render there and this is never called.
  const goToPhrase = (target: number) => {
    if (target < 0 || target >= list.length) return;
    // Never yank the phrase out from under an in-flight take or evaluation.
    if (phase === 'recording' || phase === 'evaluating') return;
    suppressAutoPlayRef.current = true;
    stopPlayback();
    stopSelfPlayback();
    lastRecordingBase64Ref.current = null;
    feedbackAudioRef.current = null;
    setResult(null);
    setEvalError(null);
    setSaveFailed(false);
    setIndex(target);
    setPhaseSync('idle');
  };

  // Leaving the error card returns to the mic, ready to record again.
  const retryAfterError = () => {
    setEvalError(null);
    setPhaseSync('idle');
  };

  // --- Loading / error / empty ---
  if (phrases.isLoading) {
    return (
      <Screen>
        <FunFactLoader color={colors.primary} style={{ marginTop: 80 }} />
      </Screen>
    );
  }
  // A 402 means "upgrade required", not a generation failure — send the
  // learner to the paywall, mirroring the web UpgradeScreen. Any other failure
  // (e.g. a 502 when AI generation fails) is retry-able because nothing broken
  // was cached.
  const upgrade = asUpgradeRequired(phrases.error);
  if (upgrade) {
    return (
      <UpgradeRequiredScreen
        title={
          upgrade.reason === 'daily_lesson_limit'
            ? "You've hit today's free lessons"
            : upgrade.reason === 'feature_locked'
              ? 'Full sentences are an All-Access feature'
              : 'Unlock this language'
        }
        message={upgrade.message}
        onUpgrade={() => router.push(paywallHrefForDenial(upgrade, activeLang))}
        onBack={() => router.back()}
        showTrial={upgrade.reason === 'daily_lesson_limit'}
      />
    );
  }
  // Spec D1b-M: a stale journey map (or a shared deep link) can point at a
  // stop the server considers locked. The group endpoint's 403
  // lesson_group_locked is an expected state, not a failure — show the
  // locked-stop card and send the learner back, never the error screen.
  const groupLocked =
    isGroup &&
    phrases.error instanceof ApiError &&
    phrases.error.status === 403 &&
    (phrases.error.data as { error?: string } | null)?.error === 'lesson_group_locked';
  if (groupLocked) {
    return (
      <Screen>
        <View style={styles.lockedStopWrap}>
          <View style={[styles.lockedStopCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="lock" size={28} color={colors.mutedForeground} />
            <Text style={[styles.lockedStopTitle, { color: colors.foreground }]}>
              This stop is still locked
            </Text>
            <Text style={[styles.lockedStopBody, { color: colors.mutedForeground }]}>
              Finish the stop before it to board here — the line runs station
              by station.
            </Text>
            <ChunkyButton title="Back to the map" onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    );
  }
  if (phrases.isError) {
    return (
      <LessonError
        onRetry={() => phrases.refetch()}
        isRetrying={phrases.isFetching}
        onBack={() => router.back()}
        message={
          isZoneTestout && isZoneLockedError(phrases.error)
            ? 'Finish the previous zone first, or test out of it.'
            : undefined
        }
      />
    );
  }
  if (list.length === 0) {
    // S2 map honesty: a plain practice session with zero phrases means the
    // caller reached a stop their plan cannot see (the listing now reports
    // such groups planLocked, so this is defensive). Send them back to the
    // journey map, where the station renders locked with the Plus upsell,
    // instead of stranding them on a dead-end empty state. Sentence sessions
    // keep their legitimate empty state.
    if (!isSentences) {
      return <Redirect href="/(app)/journey" />;
    }
    return (
      <Screen>
        <PracticeHeader onClose={() => router.back()} label="Practice" />
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          No sentences to practice here yet.
        </Text>
      </Screen>
    );
  }

  // --- Summary ---
  // Test-out verdict screen: rendered instead of the regular done screen so a
  // test-out run never shows XP totals it did not earn. The mutation state
  // drives it directly: pending, transient error (resubmit keeps the collected
  // tokens), pass (stop unlocked, Express stamp on the map), or fail
  // (encouraging copy, back to practicing via the journey).
  if (phase === 'done' && isTestout) {
    const outcome = activeTestoutSubmit.data;
    const throttled = activeTestoutSubmit.error instanceof ApiError && activeTestoutSubmit.error.status === 429;
    const zoneLocked = isZoneTestout && isZoneLockedError(activeTestoutSubmit.error);
    return (
      <Screen>
        <PracticeHeader onClose={() => router.back()} label="Express check" />
        <View style={styles.summaryWrap} testID="testout-summary">
          {activeTestoutSubmit.isError ? (
            <>
              <Mascot pose="tryagain" size={148} motion="none" />
              <Text style={[styles.summaryTitle, { color: colors.foreground }]}>
                Couldn't check your run
              </Text>
              <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>
                {zoneLocked
                  ? 'Finish the previous zone first, or test out of it.'
                  : throttled
                    ? "You've ridden the express recently. Catch your breath and try this stop again in a little while."
                    : "Something went wrong sending your takes. They're still saved here, so just try submitting again."}
              </Text>
              {!throttled && !zoneLocked && (
                <ChunkyButton
                  title="Try again"
                  icon="refresh-cw"
                  onPress={submitTestoutRun}
                  style={{ width: '100%', marginTop: 28 }}
                  testID="testout-resubmit-button"
                />
              )}
              <Pressable
                onPress={() => router.back()}
                accessibilityRole="button"
                testID="testout-back-journey"
                style={[styles.testoutSecondaryBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.testoutSecondaryText, { color: colors.foreground }]}>
                  Back to the journey
                </Text>
              </Pressable>
            </>
          ) : outcome?.passed ? (
            <>
              <Animated.View entering={appear(appearZoom(0))}>
                <Mascot pose="cheer" size={168} motion="bounce" />
              </Animated.View>
              <View style={styles.testoutStamp} aria-hidden>
                <Text style={styles.testoutStampText}>EXPRESS</Text>
              </View>
              <Text style={[styles.summaryTitle, { color: colors.foreground }]} testID="testout-passed-title">
                You tested out of this stop!
              </Text>
              <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>
                You nailed {outcome.correctCount ?? testoutRequiredCorrect} of{' '}
                {outcome.sampleSize ?? testoutSampleSize} phrases. The gates are open and your ticket
                carries the Express stamp. Ride on!
              </Text>
              <ChunkyButton
                title="Back to the journey"
                icon="map"
                onPress={() => router.back()}
                style={{ width: '100%', marginTop: 28 }}
                testID="testout-journey-button"
              />
            </>
          ) : outcome ? (
            <>
              <Mascot pose="thumbsup" size={148} motion="none" />
              <Text style={[styles.summaryTitle, { color: colors.foreground }]} testID="testout-failed-title">
                Not this time, and that's okay
              </Text>
              <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>
                You said {outcome.correctCount ?? 0} of {outcome.sampleSize ?? testoutSampleSize} phrases
                well; the express needs {outcome.requiredCorrect ?? testoutRequiredCorrect}. A little more
                practice and this stop is yours.
              </Text>
              <ChunkyButton
                title="Keep practicing"
                icon="map"
                onPress={() => router.back()}
                style={{ width: '100%', marginTop: 28 }}
                testID="testout-keep-practicing-button"
              />
            </>
          ) : (
            <>
              <Mascot pose="thinking" size={148} motion="float" />
              <Text style={[styles.summaryTitle, { color: colors.foreground }]} testID="testout-checking-title">
                Checking your run...
              </Text>
              <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>
                The conductor is looking over your takes.
              </Text>
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            </>
          )}
        </View>
      </Screen>
    );
  }

  if (phase === 'done') {
    const bandVals = Object.values(bands);
    const totalXp = Object.values(xpData).reduce((sum, d) => sum + d.xp, 0);
    // "Perfect session" = every phrase ended full-credit (legacy 'nailed'
    // group, unchanged behavior under the five-band split).
    const isPerfect = bandVals.length > 0 && bandVals.every((b) => isFullCreditBand(b));
    const anyPassed = bandVals.some((b) => isPassingBand(b));
    // Unsupported languages score nothing; the count comes from the ear-training
    // compare stages the learner completed.
    const practicedCount = isUnsupported ? comparedIdx.size : bandVals.length;
    return (
      <Screen>
        <PracticeHeader onClose={() => router.back()} label="All done!" />
        <View style={styles.summaryWrap}>
          <Animated.View entering={appear(appearZoom(0))}>
            <Mascot pose="cheer" size={168} motion="bounce" />
          </Animated.View>
          <Animated.Text
            entering={skipEnter ? undefined : appearDown(120)}
            style={[
              styles.summaryTitle,
              isPerfect ? { color: '#D97706' } : { color: colors.foreground },
            ]}
          >
            {isUnsupported
              ? 'Nice practice! 🎧'
              : isPerfect
                ? 'PERFECT SESSION! 🏆'
                : anyPassed
                  ? 'Session complete!'
                  : 'Great effort!'}
          </Animated.Text>
          <Animated.Text
            entering={skipEnter ? undefined : appearDown(240)}
            style={[styles.summarySub, { color: colors.mutedForeground }]}
          >
            You practiced {practicedCount}{' '}
            {isSentences
              ? practicedCount === 1
                ? 'sentence'
                : 'sentences'
              : practicedCount === 1
                ? 'phrase'
                : 'phrases'}.
          </Animated.Text>
          {/* Band trail — lets learners review each phrase's result at a glance */}
          {Object.keys(bands).length > 0 && (
            <Animated.View
              entering={skipEnter ? undefined : appearDown(360)}
              style={styles.summaryTrailWrap}
            >
              <Text style={[styles.summaryTrailLabel, { color: colors.mutedForeground }]}>
                Tap a dot to review
              </Text>
              <ScoreTrail
                total={list.length}
                bands={bands}
                currentIndex={-1}
                colors={colors}
              />
            </Animated.View>
          )}
          {/* XP earned chip */}
          {totalXp > 0 && (
            <Animated.View
              entering={skipEnter ? undefined : appearDown(480)}
              style={[
                styles.xpChip,
                { backgroundColor: `${'#7C3AED'}18`, borderColor: '#7C3AED' },
              ]}
            >
              <CountUpText
                value={totalXp}
                prefix="+"
                suffix=" XP"
                style={[styles.xpChipText, { color: '#7C3AED' }]}
              />
            </Animated.View>
          )}
          {/* Chai earned receipt (Build 34B): mirrors the web session-chai-pill
              under the XP pill, shown only when the session actually granted
              Chai (chaiEarned summed from attempt responses). */}
          {sessionChai > 0 && (
            <Animated.View
              entering={skipEnter ? undefined : appearDown(540)}
              testID="session-chai-pill"
              style={[
                styles.xpChip,
                { backgroundColor: `${'#D97706'}18`, borderColor: '#D97706' },
              ]}
            >
              <ChaiGlyph size={16} style={{ marginRight: 6 }} />
              <CountUpText
                value={sessionChai}
                prefix="+"
                suffix=" Chai earned"
                style={[styles.xpChipText, { color: '#D97706' }]}
              />
            </Animated.View>
          )}
          {/* XP breakdown — collapsed by default */}
          {Object.values(xpData).some((d) => d.breakdown) && (
            <Pressable
              onPress={() => setXpExpanded((x) => !x)}
              style={styles.xpBreakdownToggle}
              accessibilityRole="button"
            >
              <Text style={[styles.xpBreakdownLabel, { color: colors.mutedForeground }]}>
                {xpExpanded ? '▲ XP breakdown' : '▼ XP breakdown'}
              </Text>
            </Pressable>
          )}
          {xpExpanded && (
            <Animated.View
              entering={appearPlain()}
              style={[styles.xpBreakdownCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              {list.map((phrase, i) => {
                const d = xpData[i];
                if (!d) return null;
                return (
                  <View key={phrase.id} style={styles.xpBreakdownRow}>
                    <Text style={[styles.xpBreakdownPhrase, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {phrase.english}
                    </Text>
                    <Text style={[styles.xpBreakdownValue, { color: colors.foreground }]}>
                      {d.breakdown ?? (d.xp > 0 ? `+${d.xp} XP` : '0 XP')}
                    </Text>
                  </View>
                );
              })}
            </Animated.View>
          )}
          {/* Per-phrase band indicators — tap any to see its feedback */}
          <SummaryRingRow
            list={list}
            bands={bands}
            feedback={sessionFeedback}
            colors={colors}
          />
          {/* A finished journey stop leaves through the flashback (build 20,
              owner ruling): three due phrases from earlier stops, skippable,
              then back to the map. This screen REPLACES itself with the
              flashback so its back lands on the journey, between stops.
              Any other session leaves for home the way it always did. */}
          {/* THE LIGHTBOX BEFORE THE FLASHBACK (build 23; build 22 handoff,
              section 4): with due phrases known, the stop opens a lightbox
              with Enter and Skip rather than replacing itself straight into
              the flashback; with none due, or the answer not yet in, it
              goes on as before, and the review screen still steps aside
              when it finds nothing. */}
          <ChunkyButton
            title={isGroup && !isTestout ? 'On to the next stop' : 'Back to home'}
            icon={isGroup && !isTestout ? 'arrow-right' : 'home'}
            onPress={() => {
              if (isGroup && !isTestout) {
                const due = flashbackDue.data;
                if (Array.isArray(due) && due.length > 0) {
                  setFlashbackOpen(true);
                } else if (Array.isArray(due)) {
                  router.replace('/(app)/journey' as Parameters<typeof router.replace>[0]);
                } else {
                  router.replace({
                    pathname: '/(app)/review',
                    params: { flashback: '1' },
                  } as Parameters<typeof router.replace>[0]);
                }
              } else {
                router.replace('/(app)/(tabs)');
              }
            }}
            style={{ width: '100%', marginTop: 28 }}
          />
          <FlashbackLightbox visible={flashbackOpen} onEnter={enterFlashback} onSkip={skipFlashback} />
        </View>
        {celebrate ? (
          <Confetti
            variant={isPerfect ? 'perfect' : 'default'}
            glyphs={glyphsForLanguage(activeLang)}
          />
        ) : null}
        <BadgeUnlock
          badges={unlockedBadges}
          onDismiss={() => setUnlockedBadges([])}
        />
      </Screen>
    );
  }

  // --- Practice card ---
  const progress =
    ((index + (phase === 'result' || phase === 'compare' ? 1 : 0)) / list.length) * 100;

  // Bolo reacts to the moment: listening while you record, cheering a big win,
  // encouraging a good attempt, and gently nudging after a miss.
  const mascotPose: MascotPose =
    phase === 'recording' || phase === 'evaluating'
      ? 'thinking'
      : phase === 'error'
        ? 'tryagain'
        : phase === 'compare'
          ? 'thumbsup' // ear-training practice always "counts" — never blame
          : phase === 'result' && result
            ? isFullCreditBand(result.band)
              ? 'cheer'
              : isHalfCreditBand(result.band)
                ? 'thumbsup'
                : result.band === 'nocatch'
                  ? 'thinking' // system miss, not learner error (Spec 1 rule 16)
                  : 'tryagain'
            : 'wave';
  // Evaluating is Bolo's job, not a throbber's: he zooms out small and spins
  // while the score comes back, then zooms back in (build 36 — the
  // ActivityIndicator that used to sit inside the record button is gone).
  // "Finish" would lie while a zero-XP phrase is still queued to come back.
  const hasNextStop = index + 1 < list.length || (!isTestout && encoreQueue.length > 0);

  // ── Result-actions row state (Task #1040) ────────────────────────────────
  // Test-out is one take per phrase (a server-side batch rule), so the retry
  // is inactive there; the error card's retry IS the recovery action.
  const retrySlotActive = phase === 'error' || !isTestout;
  // The error card has no band and no token: there is nothing to advance
  // from. Test-out and the ear-training compare stage are ungated (compare
  // never produces a band at all).
  const advanceSlotActive =
    phase !== 'error' &&
    (isTestout ||
      phase === 'compare' ||
      isAdvanceUnlocked(result?.band, phraseTallies[index]?.attempts ?? 0));
  // Emphasis only, never position: the recovery/retry side leads until the
  // take is good.
  const retrySlotPrimary =
    retrySlotActive &&
    (phase === 'error' ||
      (phase === 'result' && (!result || !isGoodOrBetterBand(result.band))));
  const mascotMotion =
    phase === 'evaluating'
      ? 'working'
      : phase === 'recording'
        ? 'sway'
        : phase === 'result' && result && isFullCreditBand(result.band)
          ? 'bounce'
          : 'float';

  return (
    <Screen>
      <PracticeHeader
        onClose={() => router.back()}
        label={
          // A returning zero-XP phrase: the counter alone would look like the
          // session went backwards, so name what is happening.
          inEncore ? `${index + 1} of ${list.length} · another go` : `${index + 1} of ${list.length}`
        }
        silentMode={silentModeUI}
        onToggleSilentMode={toggleSilentModeUI}
        meaningAudio={meaningAudioUI}
        onToggleMeaningAudio={toggleMeaningAudioUI}
        meaningAudioDisabled={!coachVoiceEnabled}
        // The result-card mute and this menu item are two doors onto ONE
        // state: both read spokenEnabled and both write through
        // toggleSpokenFeedback, so a change in either shows in the other.
        spokenFeedback={spokenEnabled}
        onToggleSpokenFeedback={toggleSpokenFeedback}
        languageCode={activeLang}
      />
      {/* Express test-out banner: one quiet line so the learner knows the
          rules of the run (one take per phrase, pass mark). */}
      {isTestout && (
        <View
          testID="testout-banner"
          style={[styles.testoutBanner, { backgroundColor: colors.muted, borderColor: colors.border }]}
        >
          <Text style={[styles.testoutBannerText, { color: colors.mutedForeground }]}>
            Express check: one take per phrase. Say {testoutRequiredCorrect} of {testoutSampleSize} well to skip this stop.
          </Text>
        </View>
      )}
      <View style={styles.progressOuter}>
        <ScoreTrail
          total={list.length}
          bands={bands}
          currentIndex={index}
          colors={colors}
        />
        <View style={[styles.progressBg, { backgroundColor: colors.muted }]}>
          <View
            style={{
              width: `${progress}%`,
              height: '100%',
              backgroundColor: colors.primary,
              borderRadius: 999,
            }}
          />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Reacting mascot */}
        <View style={styles.mascotRow}>
          {/* Manual prev/next phrase navigation (#976, web Task #973 parity).
              Free, never attempt-gated. Absolutely positioned at the row
              edges so the mascot, record button, and waveform never shift.
              Edge phrases disable their button; recording and evaluating
              disable both. Hidden in test-out mode (one take per phrase,
              forward only). */}
          {!isTestout && (
            <>
              <Pressable
                onPress={() => goToPhrase(index - 1)}
                disabled={index === 0 || phase === 'recording' || phase === 'evaluating'}
                accessibilityRole="button"
                accessibilityLabel="Go to previous phrase"
                hitSlop={8}
                testID="button-prev-phrase"
                style={[
                  styles.phraseNavBtn,
                  styles.phraseNavLeft,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  (index === 0 || phase === 'recording' || phase === 'evaluating') &&
                    styles.phraseNavDisabled,
                ]}
              >
                <Feather name="chevron-left" size={22} color={colors.mutedForeground} />
              </Pressable>
              <Pressable
                onPress={() => goToPhrase(index + 1)}
                disabled={index >= list.length - 1 || phase === 'recording' || phase === 'evaluating'}
                accessibilityRole="button"
                accessibilityLabel="Go to next phrase"
                hitSlop={8}
                testID="button-next-phrase"
                style={[
                  styles.phraseNavBtn,
                  styles.phraseNavRight,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  (index >= list.length - 1 || phase === 'recording' || phase === 'evaluating') &&
                    styles.phraseNavDisabled,
                ]}
              >
                <Feather name="chevron-right" size={22} color={colors.mutedForeground} />
              </Pressable>
            </>
          )}
          <Animated.View style={mascotAmpStyle}>
            <Mascot
              pose={mascotPose}
              size={showingOutcome ? 72 : 104}
              motion={mascotMotion}
              entering
              celebrateBounce={celebrateBounceCount}
            />
          </Animated.View>
        </View>

        {/* Phrase card — keyed so entering/exiting fires on phrase change */}
        <Animated.View
          key={phrase.id}
          entering={skipEnter ? undefined : appearPlain()}
          exiting={FadeOutUp.duration(200)}
          style={[
            styles.phraseCard,
            showingOutcome && styles.phraseCardCompact,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text
            style={[
              nativeProps,
              styles.phraseNative,
              showingOutcome && styles.phraseNativeCompact,
              { color: colors.foreground },
            ]}
          >
            {phrase.nativeScript}
          </Text>
          <Text
            style={[
              styles.phraseRoman,
              showingOutcome && styles.phraseRomanCompact,
              { color: colors.secondary },
            ]}
          >
            {phrase.romanized}
          </Text>
          <Text
            style={[
              styles.phraseEng,
              showingOutcome && styles.phraseEngCompact,
              { color: colors.mutedForeground },
            ]}
          >
            {phrase.english}
          </Text>

          {/* Hear it lives down in the result card while a score is up (and
              the compare card carries its own Play target); here it would
              only push the feedback further down. */}
          {phase === 'result' || phase === 'compare' ? null : (
          <View style={styles.listenRow}>
            <Pressable
              onPress={() => {
                playCoach();
              }}
              disabled={coachPlaying}
              accessibilityLabel={coachPlaying ? 'Listening to coach' : 'Listen to coach'}
              style={[styles.listenBtn, { borderColor: colors.border }]}
            >
              <Feather
                name={coachPlaying ? 'volume-2' : 'play'}
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.listenText, { color: colors.primary }]}>
                {coachPlaying ? 'Listening...' : 'Hear it'}
              </Text>
            </Pressable>
            {/* Spec B2: quiet flag affordance — must not compete with play */}
            <PhraseReportButton
              phraseId={phrase.id}
              onReported={() => {
                setToastMessage("Thanks, we'll check it");
                setToastKey((k) => k + 1);
              }}
            />
          </View>
          )}
        </Animated.View>

        {phrase.hint && phase !== 'result' && phase !== 'compare' ? (
          <View style={styles.hintRow}>
            <Feather name="info" size={14} color={colors.mutedForeground} />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {phrase.hint}
            </Text>
          </View>
        ) : null}

        {/* Degraded recognition: one-time, dismissible "feedback is
            approximate" heads-up. Scored practice continues unchanged. */}
        {isDegraded && showApproxNotice ? (
          <View
            testID="approx-notice"
            accessibilityRole="alert"
            style={[
              styles.noticeCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="info" size={16} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.foreground }]}>
              Heads up: speech recognition is still learning {languageName}, so
              feedback may be approximate.
            </Text>
            <Pressable
              onPress={dismissApproxNotice}
              accessibilityRole="button"
              accessibilityLabel="Dismiss notice"
              hitSlop={10}
              testID="approx-notice-dismiss"
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ) : null}

        {/* Unsupported recognition: listen-record-compare card. No band, no
            score, no XP — supportive ear-training copy only. */}
        {phase === 'compare' ? (
          <Animated.View
            entering={appearPlain()}
            testID="compare-card"
            style={[
              styles.resultCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.gradeLabel, { color: colors.primary }]}>
              Nice, you recorded it! 🎧
            </Text>
            <Text style={[styles.feedback, { color: colors.foreground }]}>
              Speech recognition can't hear {languageName} reliably yet, so this
              is ear-training practice: listen, record, and compare. It still
              counts!
            </Text>

            <Pressable
              onPress={() => playCoach()}
              disabled={coachPlaying}
              accessibilityRole="button"
              accessibilityLabel={coachPlaying ? 'Listening to coach' : 'Play the target phrase'}
              testID="compare-play-target"
              style={[styles.listenBtn, { borderColor: colors.border, marginTop: 12 }]}
            >
              <Feather
                name={coachPlaying ? 'volume-2' : 'play'}
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.listenText, { color: colors.primary }]}>
                {coachPlaying ? 'Listening...' : 'Play target'}
              </Text>
            </Pressable>

            <Pressable
              onPress={playSelf}
              accessibilityRole="button"
              accessibilityLabel={selfPlaying ? 'Stop playback' : 'Hear yourself'}
              testID="hear-yourself-button"
              style={[
                styles.hearSelfBtn,
                {
                  borderColor: selfPlaying ? colors.primary : colors.border,
                  backgroundColor: selfPlaying ? `${colors.primary}14` : 'transparent',
                },
              ]}
            >
              <Feather
                name={selfPlaying ? 'pause' : 'mic'}
                size={15}
                color={selfPlaying ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.hearSelfText,
                  { color: selfPlaying ? colors.primary : colors.mutedForeground },
                ]}
              >
                {selfPlaying ? 'Playing...' : 'Hear yourself'}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Scoring error */}
        {phase === 'error' && evalError ? (
          <View
            accessibilityRole="alert"
            testID="eval-error-card"
            style={[
              styles.resultCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.destructive,
              },
            ]}
          >
            <Text style={[styles.errorTitle, { color: colors.destructive }]}>
              Oops, that didn't work
            </Text>
            <Text style={[styles.feedback, { color: colors.foreground }]}>
              {evalError}
            </Text>
          </View>
        ) : null}

        {/* Result */}
        {phase === 'result' && result ? (
          <Animated.View
            ref={resultCardRef}
            entering={appearPlain()}
            style={[
              styles.resultCard,
              {
                backgroundColor: `${bandColor(result.band, colors)}12`,
                borderColor: bandColor(result.band, colors),
              },
              shakeStyle,
            ]}
          >
            {/* Grade label row */}
            <Text
              style={[styles.gradeLabel, { color: bandColor(result.band, colors) }]}
            >
            {/* Headline copy is deliberately NOT BAND_LABEL: the ladder keeps
                saying Perfect/Great/Good/Almost/Try again. The bare else is the
                nocatch arm: a system miss is not a weak attempt, so it keeps
                the encouraging wording. Mirrored verbatim in review.tsx. */}
            {result.band === 'perfect'
                ? 'Peak 🗿'
                : result.band === 'great'
                  ? 'Goated 🐐'
                  : result.band === 'good'
                    ? 'Fire 🔥'
                    : result.band === 'almost'
                      ? 'Valid 👍'
                      : result.band === 'retry'
                        ? 'Mid 😐'
                        : 'Good try, keep going!'}
            </Text>

            {/* Five-band ladder for scored attempts; nocatch keeps its
                neutral pill below and never shows the ladder (rule 16). */}
            {result.band !== 'nocatch' ? <BandLadder band={result.band} /> : null}

            <View style={styles.resultTop}>
              {result.band === 'nocatch' ? <BandPill band={result.band} /> : null}
              <Pressable
                onPress={toggleSpokenFeedback}
                accessibilityRole="button"
                accessibilityLabel={
                  spokenEnabled
                    ? 'Turn off spoken feedback'
                    : 'Turn on spoken feedback'
                }
                hitSlop={12}
                style={styles.muteBtn}
                testID="spoken-feedback-quick-toggle"
              >
                <Feather
                  name={spokenEnabled ? 'volume-2' : 'volume-x'}
                  size={22}
                  color={
                    spokenEnabled
                      ? bandColor(result.band, colors)
                      : colors.mutedForeground
                  }
                />
              </Pressable>
              {isFullCreditBand(result.band) ? (
                <Feather
                  name="check-circle"
                  size={40}
                  color={bandColor(result.band, colors)}
                />
              ) : isHalfCreditBand(result.band) ? (
                // Half credit is not a failure — neutral icon, band-colored, no retry affordance here
                // (the "Record again" button below still offers the retry).
                <Feather
                  name="thumbs-up"
                  size={40}
                  color={bandColor(result.band, colors)}
                />
              ) : (
                <Pressable
                  onPress={tryAgain}
                  accessibilityRole="button"
                  accessibilityLabel="Try this phrase again"
                  hitSlop={12}
                  style={styles.resultRetryIcon}
                  testID="result-retry-icon"
                >
                  <Feather
                    name="refresh-cw"
                    size={40}
                    // nocatch is a system miss, not a learner error: keep the
                    // retry affordance but drop the destructive red so it
                    // doesn't read as blame.
                    color={
                      result.band === 'nocatch'
                        ? colors.mutedForeground
                        : bandColor(result.band, colors)
                    }
                  />
                </Pressable>
              )}
            </View>
            {result.transcript ? (
              <Text style={[styles.heard, { color: colors.foreground }]}>
                We heard: "{result.transcript}"
              </Text>
            ) : null}
            {/* Card-style romanized form of the transcript (Task 907). The
                server sends "" for scripts it cannot romanize cleanly and on
                nocatch, and an already-Latin transcript would just repeat —
                hide the line in both cases. */}
            {result.transcript &&
            result.transcriptRomanized &&
            result.transcriptRomanized.toLowerCase() !==
              result.transcript.toLowerCase() ? (
              <Text style={[styles.heardRomanized, { color: colors.mutedForeground }]}>
                "{result.transcriptRomanized}"
              </Text>
            ) : null}
            {result.feedback ? (
              <Text style={[styles.feedback, { color: colors.foreground }]}>
                {result.feedback}
              </Text>
            ) : null}
            {result.tip ? (
              <View style={[styles.tipBox, { backgroundColor: colors.card }]}>
                <Feather name="zap" size={14} color={colors.accent} />
                <Text style={[styles.tip, { color: colors.mutedForeground }]}>
                  {result.tip}
                </Text>
              </View>
            ) : null}
            {saveFailed ? (
              <Text style={[styles.saveFailed, { color: colors.destructive }]}>
                Heads up: this attempt couldn't be saved to your progress.
              </Text>
            ) : null}
            {/* Zero XP: say out loud that the phrase is coming back, or that
                it has had its three goes and is being let go. */}
            {!isTestout && result.xpAwarded === 0 ? (
              <Text
                testID="encore-note"
                style={[styles.encoreNote, { color: colors.mutedForeground }]}
              >
                {(phraseTallies[index]?.zeroStrikes ?? 0) >= ZERO_XP_STRIKE_LIMIT
                  ? "That's three goes. We'll leave this one for next time."
                  : 'No XP yet, so this one comes back at the end of the session.'}
              </Text>
            ) : null}
            {/* Hear yourself — always shown so learners can compare their
                voice to the coach model. Not affected by spoken-feedback mute.
                Build 19: Hear it sits beside it, moved down from the word
                card so the two halves of the comparison share a row. */}
            <View style={styles.resultAudioRow}>
            <Pressable
              onPress={() => {
                playCoach();
              }}
              disabled={coachPlaying}
              accessibilityRole="button"
              accessibilityLabel={coachPlaying ? 'Listening to coach' : 'Listen to coach'}
              testID="result-hear-it"
              style={[styles.hearSelfBtn, styles.resultAudioBtn, { borderColor: colors.border }]}
            >
              <Feather
                name={coachPlaying ? 'volume-2' : 'play'}
                size={15}
                color={colors.primary}
              />
              <Text style={[styles.hearSelfText, { color: colors.primary }]}>
                {coachPlaying ? 'Listening...' : 'Hear it'}
              </Text>
            </Pressable>
            <Pressable
              onPress={playSelf}
              accessibilityRole="button"
              accessibilityLabel={selfPlaying ? 'Stop playback' : 'Hear yourself'}
              testID="hear-yourself-button"
              style={[
                styles.hearSelfBtn,
                styles.resultAudioBtn,
                {
                  borderColor: selfPlaying
                    ? bandColor(result.band, colors)
                    : colors.border,
                  backgroundColor: selfPlaying
                    ? `${bandColor(result.band, colors)}14`
                    : 'transparent',
                },
              ]}
            >
              <Feather
                name={selfPlaying ? 'pause' : 'mic'}
                size={15}
                color={selfPlaying ? bandColor(result.band, colors) : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.hearSelfText,
                  {
                    color: selfPlaying
                      ? bandColor(result.band, colors)
                      : colors.mutedForeground,
                  },
                ]}
              >
                {selfPlaying ? 'Playing...' : 'Hear yourself'}
              </Text>
            </Pressable>
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* Controls */}
      <View style={[styles.controls, { backgroundColor: colors.background }]}>
        {phase === 'result' || phase === 'compare' || phase === 'error' ? (
          /* One row, constant order, constant labels (Task #1040). Error and
             test-out use the same two slots as every other outcome, with the
             impermissible side dimmed, rather than collapsing to a single
             full-width button. */
          <ResultActions
            onRetry={phase === 'error' ? retryAfterError : tryAgain}
            onAdvance={next}
            advanceLabel={hasNextStop ? 'Next phrase' : 'Finish'}
            retryPrimary={retrySlotPrimary}
            retryDisabled={!retrySlotActive}
            advanceDisabled={!advanceSlotActive}
          />
        ) : (
          <RecordButton
            phase={phase}
            unsupported={isUnsupported}
            onPressIn={() => {
              isPressingRef.current = true;
              if (phase === 'idle') void startRecording();
            }}
            onPressOut={() => {
              isPressingRef.current = false;
              if (phase === 'recording') void stopRecording();
            }}
            amplitude={liveAmp}
            ampLevel={ampLevel}
            noInput={noInput}
          />
        )}
        {/* Express Multiplier offer moment. BELOW the action row on
            purpose: it is an aside, and above the buttons it pushes
            Retry and Next further down the phone screen. */}
        {phase === 'result' && (
          <ExpressOfferMoment surface="result" onNotice={showToast} />
        )}
      </View>
      {/* Score flash overlay: full-bleed color pulse after each scored attempt */}
      <Animated.View
        pointerEvents="none"
        testID="score-flash-overlay"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: flashColor, zIndex: 50 },
          flashOverlayStyle,
        ]}
      />
      {celebrate ? <Confetti /> : null}
      {xpArc ? (
        <XpArc
          key={xpArc.key}
          amount={xpArc.amount}
          from={xpArc.from}
          onDone={() => setXpArc(null)}
        />
      ) : null}
      <BadgeUnlock
        badges={unlockedBadges}
        onDismiss={() => setUnlockedBadges([])}
      />
      <FirstWordPrimer visible={firstWordPrimerOpen} onDismiss={dismissFirstWordPrimer} />
      <MilestoneToast
        message={toastMessage}
        toastKey={toastKey}
        backgroundColor="#312E81"
        color="#FFFFFF"
      />
    </Screen>
  );
}

/**
 * One row of the audio settings sheet: a text label, the state in words, and a
 * checkmark. The label is the whole point of the menu — the two header toggles
 * this replaced were icon-only, so nothing told a learner them apart.
 */
function AudioSettingRow({
  label,
  enabled,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  enabled: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: enabled, disabled: !!disabled }}
      accessibilityLabel={label}
      testID={testID}
      style={[
        styles.settingRow,
        {
          backgroundColor: colors.card,
          borderColor: enabled ? colors.secondary : colors.border,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Text style={[styles.settingLabel, { color: colors.foreground }]}>
        {label}
      </Text>
      <View style={styles.settingRight}>
        <Text
          style={[
            styles.settingState,
            { color: enabled ? colors.secondary : colors.mutedForeground },
          ]}
        >
          {enabled ? 'On' : 'Off'}
        </Text>
        <Feather
          name={enabled ? 'check-circle' : 'circle'}
          size={18}
          color={enabled ? colors.secondary : colors.mutedForeground}
        />
      </View>
    </Pressable>
  );
}

function PracticeHeader({
  onClose,
  label,
  silentMode,
  onToggleSilentMode,
  meaningAudio,
  onToggleMeaningAudio,
  meaningAudioDisabled,
  spokenFeedback,
  onToggleSpokenFeedback,
  languageCode,
}: {
  onClose: () => void;
  label: string;
  /** When provided, shows the audio settings gear on the right. Phrase audio
   *  (silent mode inverted) is the first item in that menu. */
  silentMode?: boolean;
  onToggleSilentMode?: () => void;
  /** Meaning-aloud: the English meaning spoken after each phrase clip
   *  (web Task 1003 parity). Second item in the menu. */
  meaningAudio?: boolean;
  onToggleMeaningAudio?: () => void;
  /** When true, visibly disables the meaning item (coach voice is off). */
  meaningAudioDisabled?: boolean;
  /** Spoken feedback: the score read aloud. The SAME state the result-card
   *  mute owns — this is a second entry point to it, never a second copy. */
  spokenFeedback?: boolean;
  onToggleSpokenFeedback?: () => void;
  /** Active language code, shown as an inert uppercase chip left of the gear. */
  languageCode?: string;
}) {
  const colors = useColors();
  const [menuOpen, setMenuOpen] = React.useState(false);
  // The gear only exists where the toggles do: the loading / express / summary
  // header variants pass none of them and keep their bare row.
  const hasSettings = onToggleSilentMode !== undefined;
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Close practice"
        onPress={onClose}
        style={[styles.closeBtn, { backgroundColor: colors.card }]}
      >
        <Feather name="x" size={22} color={colors.foreground} />
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
        <Text style={[styles.headerLabel, { color: colors.foreground }]}>
          {label}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <XpCounter variant="session" />
          <ChaiPill compact />
        </View>
      </View>
      {hasSettings && languageCode ? (
        // Display-only language code. Deliberately inert: no press handler and
        // no role that implies interactivity — the language cannot be changed
        // mid-lesson. The slot is a fixed three-character width so the row
        // never reflows between HI and SAT; codes are NEVER truncated ("sat"
        // clipped to "SA" would collide with Sanskrit).
        <View
          testID="lesson-language-chip"
          style={[styles.langChip, { backgroundColor: colors.card }]}
        >
          <Text style={[styles.langChipText, { color: colors.mutedForeground }]}>
            {languageCode.toUpperCase()}
          </Text>
        </View>
      ) : null}
      {hasSettings ? (
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Audio settings"
          hitSlop={8}
          testID="practice-settings-trigger"
          style={[styles.closeBtn, { backgroundColor: colors.card }]}
        >
          <Feather name="settings" size={20} color={colors.mutedForeground} />
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
      {/* House pattern: a Modal styled as a bottom sheet (same shape as the
          chat language picker and the phrase report sheet). onRequestClose is
          what wires the Android back gesture; the backdrop Pressable closes on
          an outside tap; every item closes on select. */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          accessibilityLabel="Close audio settings"
          testID="practice-settings-backdrop"
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            style={[
              styles.modalSheet,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
            onPress={() => {}}
          >
            <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Audio
            </Text>
            <View style={styles.settingList}>
              <AudioSettingRow
                label="Autoplay phrase"
                enabled={!silentMode}
                testID="setting-phrase-audio"
                onPress={() => {
                  setMenuOpen(false);
                  onToggleSilentMode?.();
                }}
              />
              <AudioSettingRow
                label="Spoken feedback"
                enabled={!!spokenFeedback}
                testID="setting-spoken-feedback"
                onPress={() => {
                  setMenuOpen(false);
                  onToggleSpokenFeedback?.();
                }}
              />
              <AudioSettingRow
                label="Speak meaning"
                enabled={!!meaningAudio}
                disabled={meaningAudioDisabled}
                testID="setting-meaning-audio"
                onPress={() => {
                  setMenuOpen(false);
                  onToggleMeaningAudio?.();
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}


function RecordButton({
  phase,
  unsupported,
  onPressIn,
  onPressOut,
  amplitude,
  ampLevel,
  noInput,
}: {
  phase: Phase;
  /** Unsupported languages record without scoring, so the hint copy changes. */
  unsupported?: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  amplitude: SharedValue<number>;
  ampLevel: number;
  noInput: boolean;
}) {
  const colors = useColors();
  const pulse = useSharedValue(0);
  // 0 = idle/recording (primary), 1 = evaluating (amber)
  const ringPhaseVal = useSharedValue(0);

  React.useEffect(() => {
    if (phase === 'recording') {
      pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    } else {
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [phase, pulse]);

  React.useEffect(() => {
    if (phase === 'evaluating') {
      ringPhaseVal.value = withSpring(1, { damping: 14, stiffness: 180 });
    } else {
      ringPhaseVal.value = withTiming(0, { duration: 300 });
    }
  }, [phase, ringPhaseVal]);

  const primaryColor = colors.primary;
  const amberColor = '#F59E0B';

  const ringStyle = useAnimatedStyle(() => {
    const ringBg = interpolateColor(
      ringPhaseVal.value,
      [0, 1],
      [primaryColor, amberColor],
    );
    return {
      transform: [{ scale: 1 + pulse.value * 0.25 }],
      opacity: 0.35 - pulse.value * 0.25,
      backgroundColor: ringBg,
    };
  });

  const evaluating = phase === 'evaluating';
  const recording = phase === 'recording';
  // Barge-in (#913, web Task 907 parity): the mic stays live while the coach
  // is speaking — a hold stops the audio and records on the same gesture
  // (startRecording calls stopPlayback first). Only evaluation blocks the
  // button, since there is nothing to record against mid-score.
  const blocked = evaluating;

  return (
    <View style={styles.recordWrap}>
      <View style={styles.recordCenter}>
        <Animated.View
          style={[
            styles.pulseRing,
            ringStyle,
          ]}
        />
        <Pressable
          disabled={blocked}
          testID="record-button"
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Stop recording' : 'Hold to record'}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={[
            styles.recordBtn,
            { backgroundColor: recording ? colors.accent : colors.primary },
          ]}
        >
          {/* No throbber here: the hanging mascot carries the evaluating
              state (build 36). The button keeps its icon, dimmed, so the
              circle never empties or shifts under a finger. */}
          <Feather
            name={recording ? 'square' : 'mic'}
            size={34}
            color="#fff"
            style={evaluating ? styles.recordIconEvaluating : undefined}
          />
        </Pressable>
      </View>
      {/* Spec D2: live waveform — only while actually recording. The slot
          keeps its height in every phase so the button never shifts under a
          holding finger when recording starts (frame-stability contract). */}
      <View style={styles.waveSlot} testID="waveform-slot">
        {recording ? (
          <Waveform amplitude={amplitude} level={ampLevel} height={22} />
        ) : null}
      </View>
      <View style={styles.hintSlot} testID="record-hint-slot">
        <Text style={[styles.recordHint, { color: colors.mutedForeground }]}>
          {evaluating
            ? unsupported
              ? 'Saving your recording...'
              : 'Scoring your pronunciation...'
            : recording
              ? noInput
                ? "We can't hear you - check your mic"
                : unsupported
                  ? 'Release to compare'
                  : 'Release to score'
              : 'Hold and say it out loud'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockedStopWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lockedStopCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  lockedStopTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    textAlign: 'center',
  },
  lockedStopBody: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: { fontFamily: AppFonts.bold, fontSize: 16 },
  // Fixed three-character slot so switching between HI and SAT never reflows
  // the header row.
  langChip: {
    width: 40,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  langChipText: { fontFamily: AppFonts.bold, fontSize: 12, letterSpacing: 0.5 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    // Capped to the content column on an iPad; the full width on a phone (build 25).
    width: '100%',
    maxWidth: CONTENT_MAX_W,
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontFamily: AppFonts.bold, fontSize: 18, marginBottom: 12 },
  settingList: { gap: 8 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  settingLabel: { fontFamily: AppFonts.semibold, fontSize: 16 },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingState: { fontFamily: AppFonts.bold, fontSize: 13 },
  progressOuter: { paddingHorizontal: 20, paddingBottom: 8 },
  progressBg: { height: 8, borderRadius: 999, overflow: 'hidden' },
  scoreTrailOuter: { marginBottom: 8 },
  scoreTrailTooltip: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  scoreTrailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  scoreDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  body: { padding: 20, paddingBottom: 24 },
  mascotRow: { alignItems: 'center', marginBottom: 4 },
  // #976 chevrons: absolute at the row edges - zero layout shift for the
  // mascot, record button, and waveform. Disabled state dims via opacity
  // (the Pressable disabled prop also reports it to accessibility).
  phraseNavBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  phraseNavLeft: { left: 0 },
  phraseNavRight: { right: 0 },
  phraseNavDisabled: { opacity: 0.3 },
  phraseCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
  },
  phraseNative: { fontSize: 40, textAlign: 'center', lineHeight: 56 },
  phraseRoman: {
    fontFamily: AppFonts.bold,
    fontSize: 20,
    marginTop: 14,
    textAlign: 'center',
  },
  phraseEng: {
    fontFamily: AppFonts.regular,
    fontSize: 16,
    marginTop: 6,
    textAlign: 'center',
  },
  // The outcome layout (build 19): the word card at roughly half its height
  // while a result is up, so the feedback lands on the first screen.
  phraseCardCompact: { padding: 14, paddingHorizontal: 16 },
  phraseNativeCompact: { fontSize: 28, lineHeight: 40 },
  phraseRomanCompact: { fontSize: 15, marginTop: 4 },
  phraseEngCompact: { fontSize: 13, marginTop: 2 },
  listenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 20,
  },
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  listenText: { fontFamily: AppFonts.bold, fontSize: 15 },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 8,
  },
  hint: { fontFamily: AppFonts.regular, fontSize: 13, flex: 1 },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  noticeText: { fontFamily: AppFonts.regular, fontSize: 13, flex: 1, lineHeight: 19 },
  resultCard: {
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 20,
  },
  gradeLabel: {
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    marginBottom: 8,
  },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultLabel: { fontFamily: AppFonts.semibold, fontSize: 14 },
  resultScore: { fontFamily: AppFonts.extrabold, fontSize: 44, marginTop: 2 },
  resultScoreMax: { fontFamily: AppFonts.bold, fontSize: 18 },
  heard: {
    fontFamily: AppFonts.semibold,
    fontSize: 15,
    marginTop: 12,
    fontStyle: 'italic',
  },
  heardRomanized: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    marginTop: 2,
    fontStyle: 'italic',
  },
  feedback: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  tipBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  tip: { fontFamily: AppFonts.regular, fontSize: 14, flex: 1, lineHeight: 20 },
  controls: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  muteBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    marginRight: 8,
  },
  resultRetryIcon: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordWrap: { alignItems: 'center', gap: 14 },
  recordCenter: { alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  recordBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Evaluating: the button is disabled and the hanging mascot carries the
  // state, so the icon just steps back rather than being swapped for a
  // throbber (which sat visibly off-centre on iOS).
  recordIconEvaluating: { opacity: 0.45 },
  // Frame-stability contract: waveform and hint render in reserved fixed-
  // height slots so phase changes never move the record button mid-hold.
  waveSlot: { height: 22, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  hintSlot: { height: 40, alignSelf: 'stretch', alignItems: 'center' },
  recordHint: { fontFamily: AppFonts.semibold, fontSize: 15, lineHeight: 20, textAlign: 'center' },
  errorTitle: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  saveFailed: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: 12 },
  encoreNote: { fontFamily: AppFonts.semibold, fontSize: 12, marginTop: 10, textAlign: 'center' },
  hearSelfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 18,
    marginTop: 16,
    alignSelf: 'flex-start',
  },
  // Hear it and Hear yourself share a row in the result card (build 19).
  resultAudioRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  resultAudioBtn: { marginTop: 0 },
  hearSelfText: { fontFamily: AppFonts.semibold, fontSize: 14 },

  note: {
    fontFamily: AppFonts.regular,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 60,
  },
  summaryWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 20 },
  // Express test-out: in-run rules banner and verdict-screen pieces.
  testoutBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  testoutBannerText: {
    fontFamily: AppFonts.bold,
    fontSize: 12,
    textAlign: 'center',
  },
  testoutStamp: {
    marginTop: 20,
    borderWidth: 4,
    borderColor: '#16A34A',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 4,
    transform: [{ rotate: '-6deg' }],
  },
  testoutStampText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 24,
    letterSpacing: 4,
    color: '#16A34A',
  },
  testoutSecondaryBtn: {
    width: '100%',
    marginTop: 12,
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  testoutSecondaryText: {
    fontFamily: AppFonts.bold,
    fontSize: 15,
  },
  trophy: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  summaryTitle: { fontFamily: AppFonts.extrabold, fontSize: 26, marginTop: 24 },
  summarySub: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
  },
  avgCard: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  avgLabel: { fontFamily: AppFonts.semibold, fontSize: 14 },
  avgValue: { fontFamily: AppFonts.extrabold, fontSize: 52, marginTop: 4 },
  xpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    marginTop: 12,
  },
  xpChipText: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  summaryTrailWrap: { alignItems: 'center', marginTop: 20, gap: 6 },
  summaryTrailLabel: { fontFamily: AppFonts.regular, fontSize: 12 },
  resultScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },

  // ── Summary ring row ────────────────────────────────────────────────────
  summaryRingLabel: {
    fontFamily: AppFonts.semibold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 10,
  },
  summaryRingRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 4,
  },
  summaryRingItem: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  summaryBandDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  xpBreakdownToggle: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  xpBreakdownLabel: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
  },
  xpBreakdownCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    marginTop: 4,
  },
  xpBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  xpBreakdownPhrase: {
    flex: 1,
    fontFamily: AppFonts.regular,
    fontSize: 12,
  },
  xpBreakdownValue: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
  },
  summaryRingEng: {
    fontFamily: AppFonts.regular,
    fontSize: 9,
    maxWidth: 52,
    textAlign: 'center',
  },
  summaryFeedbackCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  summaryFeedbackTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 14,
  },
  summaryFeedbackBody: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  summaryFeedbackTip: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
    opacity: 0.75,
  },
});
