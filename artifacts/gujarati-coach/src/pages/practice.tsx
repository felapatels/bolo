import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, Link, Redirect, useSearch, useLocation } from "wouter";
import { FlashbackLightbox } from "@/components/flashback-lightbox";
import { 
  useListCategoryPhrases, 
  useListCategorySentences,
  useListReviewPhrases,
  useListLessonGroupPhrases,
  useListCategories,
  useGetLessonGroupTestout,
  getGetLessonGroupTestoutQueryKey,
  useSubmitLessonGroupTestout,
  useGetZoneTestout,
  getGetZoneTestoutQueryKey,
  useSubmitZoneTestout,
  useSynthesizeSpeech, 
  useEvaluatePronunciation, 
  useCreateAttempt,
  getListCategoryPhrasesQueryKey,
  getListCategorySentencesQueryKey,
  getListReviewPhrasesQueryKey,
  getListLessonGroupPhrasesQueryKey,
  getListCategoryLessonGroupsQueryKey,
  getGetProgressSummaryQueryKey,
  useGetProgressSummary,
  getListRecentAttemptsQueryKey,
  getListBadgesQueryKey,
  type EarnedBadge
} from "@workspace/api-client-react";
import { ApiError } from "@workspace/api-client-react";
import { applyOptimisticTodayXp } from "@workspace/train-class";
import { useVoiceRecorder } from "@workspace/integrations-openai-ai-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Volume2, ArrowRight, Check, ChevronLeft, ChevronRight, RefreshCcw, Headphones, Settings, Sparkles } from "lucide-react";
// TEMPORARY capture mode (BRIEF 32.1 respin): remove these imports together
// with the ?mode=capture scaffolding once the calibration corpus is complete.
import {
  useGetPilotCaptureEligibility,
  getGetPilotCaptureEligibilityQueryKey,
  useDiscardLastPilotCapture,
} from "@workspace/api-client-react";
import { motion, AnimatePresence, useReducedMotion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { springs, SoundWavePulse } from "@/lib/motion";
import { prefersReducedMotion } from "@/lib/motionPrefs";
import { Confetti } from "@/components/ui/confetti";
import { BadgeUnlock } from "@/components/badge-unlock";
import { FirstWordPrimer } from "@/components/first-word-primer";
import {
  loadFirstWordPrimerSeen,
  saveFirstWordPrimerSeen,
  shouldShowFirstWordPrimer,
} from "@/lib/first-word-primer";
import { Mascot, type MascotPose } from "@/components/mascot";
import { isIosSafariWeb, markIosAudioHintShown, shouldShowIosAudioHint } from "@/lib/iosAudio";
import { cn } from "@/lib/utils";
import { prewarmMicIfGranted } from "@/lib/micPermission";
import { useLanguage, useNativeText, useSpeechCapability } from "@/lib/language-context";
import { LessonBuildingScreen, LessonErrorScreen } from "@/components/lesson-states";
import { UpgradeCard, UpgradeScreen } from "@/components/plus";
import { asUpgradeRequired, upgradeHref, upgradeHrefForDenial } from "@/lib/entitlements";
import { loadSpokenFeedback, saveSpokenFeedback } from "@/lib/spoken-feedback";
import { playBandClip, preloadBandClips, type BandClipHandle } from "@/lib/band-audio";
import { loadSilentMode, saveSilentMode } from "@/lib/silent-mode";
import { loadMeaningAudio, saveMeaningAudio, meaningSpeechText } from "@/lib/meaning-audio";
import { loadCoachVoicePref } from "@/lib/coachVoicePref";
import { track, trackOnce, ANALYTICS_EVENTS } from "@/lib/analytics";
import { XpCounter } from "@/components/XpCounter";
import { MilestoneToast } from "@/components/ui/milestone-toast";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExpressOfferMoment } from "@/components/chai-wallet";
import { webHaptic } from "@/lib/haptics";
import { BandPill, isFullCreditBand, isPassingBand, normalizeBand, type Band } from "@/components/ui/band-pill";
import { getCoachAudioElement, getFeedbackAudioElement, getMeaningAudioElement } from "@/lib/iosAudio";
import { BandLadder } from "@/components/ui/band-ladder";
import { ClampedText } from "@/components/ui/clamped-text";
import { PhraseReportButton } from "@/components/phrase-report";
import { playCue } from "@/lib/sound";
import { XpArc } from "@/components/XpArc";
import { CountUp } from "@/components/ui/count-up";
import { ChaiGlyph } from "@/components/chai-stall";
import { DailyGiftCard } from "@/components/daily-gift";
import { glyphsForLanguage } from "@/lib/scriptGlyphs";

type SessionState = "intro" | "playing_coach" | "idle" | "recording" | "evaluating" | "result" | "error" | "summary" | "compare" | "capture_saved";

// ── TEMPORARY capture mode (BRIEF 32.1 respin) ──────────────────────────────
// The pilot corpus protocol, made explicit: each phrase gets exactly 4
// attempts in this fixed order, and the banner states the current
// expectation. The labels are recorded verbatim in the R2 tee sidecar so the
// harvest reads them directly (attempt-order reconstruction is the fallback).
// Remove with the rest of the capture-mode scaffolding after the calibration
// corpus is complete.
const CAPTURE_STEPS = [
  {
    label: "native",
    title: "YOUR BEST PRONUNCIATION",
    note: "Not your language? Listen to the coach first, then give it your best.",
  },
  { label: "american_accent", title: "DELIBERATE AMERICAN ACCENT", note: null },
  { label: "subtle_error", title: "SUBTLE ERROR: change the final vowel", note: null },
  { label: "wrong_attempt", title: "WRONG WORD: say a completely different word", note: null },
] as const;

// How long the result-speak sequence waits for feedback synthesis before
// degrading to band-clip-only (Task 903). The result card never blocks.
const FEEDBACK_AUDIO_TIMEOUT_MS = 8000;

// Beat between the phrase clip and the spoken English meaning segment
// (Task 1003). Two separate audio elements with a short breath between them.
// Synthesis is pre-warmed during the phrase clip, so this constant IS the
// felt gap on cache hits and cold caches alike.
// 220ms SINCE BUILD 29, down from 400. The owner, testing 1.0.11: "so can we
// shorten the gap between word and meaning?". 400 was chosen as a speech beat
// before anyone had heard it with the synthesis latency removed; once the clip
// is pre-fetched, 400ms of true silence between a one-word phrase and "means..."
// is a long time to wait. 220 still reads as a beat rather than the two clips
// running together.
//
// THE PLAYER'S OWN START-UP SITS ON TOP OF THIS and is the real floor: writing
// the base64 out and loading it costs its own moment on a device, so the felt
// gap is always somewhat longer than this number. Cutting this below about 150
// buys very little and starts to sound like a stumble.
//
// Changed on BOTH platforms in one commit. This constant exists three times,
// and today has already cost three separate bugs from twins fixed a day apart.
const MEANING_SEGMENT_PAUSE_MS = 220;

/**
 * WHICH LINE IS BEING SPOKEN, for the swell animation (build 29, the owner:
 * "show an animation of the word enlarging on the screen when it's being
 * spoken. then the meaning be enlarged so learners can tie the visual to the
 * audio for better learning").
 *
 * Separate from SessionState's "playing_coach", which spans BOTH segments and
 * gates the buttons. Splitting that would change behaviour nobody asked to
 * change, so this is a second, narrower signal only the animation reads.
 *
 * Mobile twin: `speakingSegment` in bolo-mobile's practice screen, and
 * components/SpokenLine.tsx carries the reasoning for the transform and the
 * 1.06. Changed together, deliberately: three separate bugs on 2026-09-02 came
 * from twins fixed a day apart.
 */
type SpokenSegment = 'phrase' | 'meaning' | null;

// localStorage key that records the learner has already seen the "feedback is
// approximate" notice for a given (degraded) language, so it shows only once.
function approxNoticeKey(code: string): string {
  return `bolo.approxNoticeSeen.${code}`;
}

// Minimum clip length accepted for scoring, in seconds. Mirrors the pilot
// corpus rule (qa/pilot-pronunciation-v2.mjs MIN_CLIP_DURATION): clips under
// 0.8 s come back from the transcriber as mangled fragments and would score
// as retry, which counts against the learner. Shorter holds get the local
// didn't-catch card instead: never sent, never scored, never counted.
const MIN_CLIP_SECONDS = 0.8;
/** Zero-XP encores per phrase before the session lets it go (owner-ruled:
 *  every kind of zero counts, nocatch included, so the session always ends). */
const ZERO_XP_STRIKE_LIMIT = 3;

/** Per-phrase session tallies (Task #1040). One map, one write site:
 *  `attempts` counts EVERY take on the phrase (all bands, nocatch included)
 *  and drives the advance gate; `zeroStrikes` counts only the zero-XP takes
 *  and drives the encore release. Strikes are therefore always <= attempts,
 *  so the encore can never let a phrase go while the gate is still shut. */
type PhraseTally = { attempts: number; zeroStrikes: number };

/**
 * Confirmation copy for the three header audio toggles. A tap used to change
 * only the pill's own styling, which left a learner unsure whether it
 * registered or what it now does. State first; the consequence is spelled out
 * only when turning something ON, since "off" explains itself.
 *
 * Mirrored verbatim on mobile in
 * artifacts/bolo-mobile/app/(app)/practice/[id].tsx (TOGGLE_TOAST).
 */
const TOGGLE_TOAST = {
  phraseAudioOn: "Phrase audio on. Bolo reads each phrase first.",
  phraseAudioOff: "Phrase audio off. You speak first.",
  feedbackAloudOn: "Feedback aloud on. Your score is read out.",
  feedbackAloudOff: "Feedback aloud off.",
  meaningAloudOn: "Meaning aloud on. English after each phrase.",
  meaningAloudOff: "Meaning aloud off.",
} as const;

// Maps a pronunciation band to its CSS color (five-band ladder gradient;
// retry/nocatch keep the pre-five-band destructive fallback).
function bandCss(band: Band): string {
  if (band === "perfect") return "hsl(var(--success))";
  if (band === "great") return "hsl(var(--accent))";
  if (band === "good") return "hsl(var(--primary))";
  if (band === "almost") return "hsl(var(--muted-foreground))";
  return "hsl(var(--destructive))";
}

// Structured error card content. Copy comes verbatim from the Chunk 1
// railway-voice error copy deck; do not edit strings here without a new deck.
type EvalErrorContent = {
  title: string;
  body: string;
  /** Optional tip line rendered under the body (deck NOCATCH entry). */
  tip?: string;
  /**
   * Deck copy for the recovery action. NOT rendered on the button any more
   * (Task #1040): the result-actions row keeps constant labels in every
   * state, so the recovery button always reads "Try again". Kept because the
   * deck owns these strings and the card copy is quoted from it verbatim.
   */
  action?: string;
};

// Turns whatever the evaluation pipeline threw into deck copy for the learner.
function describeEvaluationError(error: unknown): EvalErrorContent {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      // Deck RATE LIMITED: no primary beyond dismiss; the card's single
      // button already acts as a dismiss (returns to idle), so it keeps its
      // existing label.
      return {
        title: "Catch your breath",
        body: "You've been moving fast. Take a short break; you can try this again in a few minutes.",
      };
    }
    // Deck EVALUATION FAILED: covers 502 and any other scoring API error.
    return {
      title: "Signal trouble on the line",
      body: "We couldn't check that one. Nothing wrong with what you said, just a hiccup on our end.",
      action: "Try again",
    };
  }
  if (error instanceof TypeError) {
    // fetch() rejects with a TypeError when the network is unreachable.
    // Deck NETWORK OFFLINE.
    return {
      title: "We've lost the signal",
      body: "Looks like the connection dropped. Once you're back online, we'll pick up right where you left off.",
      action: "Retry",
    };
  }
  // Deck GENERIC UNKNOWN.
  return {
    title: "A bump on the tracks",
    body: "Something went sideways on our end. It's not you. Try once more.",
    action: "Try again",
  };
}

// Zone test-out 403 guard: both zone endpoints answer { error: "zone_locked" }
// when the previous zone is neither finished nor tested out yet.
function isZoneLockedError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    typeof error.data === "object" &&
    error.data !== null &&
    (error.data as { error?: unknown }).error === "zone_locked"
  );
}

// Pulsing glow ring that appears around the parrot zone while recording.
function RecordingGlow({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion();
  if (!active) return null;
  return (
    <motion.div
      className="absolute inset-0 rounded-full pointer-events-none"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={
        reduceMotion
          ? { opacity: 1, scale: 1 }
          : {
              opacity: [0.5, 1, 0.5],
              scale: [0.97, 1.03, 0.97],
              boxShadow: [
                "0 0 0px 0px hsl(var(--accent) / 0)",
                "0 0 0px 16px hsl(var(--accent) / 0.35)",
                "0 0 0px 0px hsl(var(--accent) / 0)",
              ],
            }
      }
      transition={
        reduceMotion
          ? { duration: 0.001 }
          : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
      }
      aria-hidden="true"
    />
  );
}

/**
 * THE FLASHBACK BETWEEN STOPS (build 20, owner ruling 2026-08-29): how many
 * due phrases a finished stop brings back on the way to the next one. Three
 * or fewer is the server's free door (FLASHBACK_FREE_SIZE in learning.ts);
 * the full drill above it stays Plus. Mobile twin: app/(app)/review.tsx.
 */
export const FLASHBACK_SIZE = 3;

export default function Practice({
  mode = "category",
}: {
  mode?: "category" | "review" | "flashback";
}) {
  const { categoryId } = useParams();
  const id = parseInt(categoryId || "0", 10);
  // The flashback IS a review session in every respect but three: it asks
  // for FLASHBACK_SIZE phrases, it can be skipped, and leaving it goes on to
  // `next` (the journey by default) rather than home.
  const isFlashback = mode === "flashback";
  const isReview = mode === "review" || isFlashback;
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const flashbackNext = searchParams.get("next") || "/journey";
  const startPhraseId = searchParams.get("phrase");
  const skipMastered = searchParams.get("skipMastered") === "true";
  // The Plus-only sentence stage practices through this same session flow —
  // `?stage=sentences` swaps the phrase list for the topic's sentence list.
  const isSentences = !isReview && searchParams.get("stage") === "sentences";
  // Spec D1b: the journey map enters practice per lesson group — `?group=<id>`
  // swaps the phrase list for that group's ordered members (phrase- and
  // sentence-stage groups alike) via the lesson-group phrases endpoint.
  const groupParam = searchParams.get("group");
  const groupId = groupParam ? parseInt(groupParam, 10) : NaN;
  const isGroup = !isReview && Number.isFinite(groupId) && groupId > 0;
  // Test-out mode (journey progression dialog): the same session flow runs
  // over the server's sampled phrase set; per-phrase attempts are NOT saved.
  // The batch of evaluation tokens is judged in one shot at the end.
  const isGroupTestout = isGroup && searchParams.get("mode") === "testout";
  // Zone scope (mode=testout&scope=zone, no group param): the identical flow
  // over the zone-level sample for the route's category id. Only the phrase
  // source and the submit endpoint differ; every other isTestout behavior
  // (one take per phrase, token collection, verdict screen) is shared.
  const isZoneTestout =
    !isReview &&
    !isGroup &&
    searchParams.get("mode") === "testout" &&
    searchParams.get("scope") === "zone";
  const isTestout = isGroupTestout || isZoneTestout;
  // TEMPORARY capture mode: ?mode=capture, allowlisted users only (the server
  // checks PILOT_CAPTURE_USER_IDS). Anyone else with the param gets a normal
  // session — the flag never activates without a server-confirmed yes.
  const captureRequested = !isReview && !isTestout && searchParams.get("mode") === "capture";
  const captureEligibility = useGetPilotCaptureEligibility({
    query: {
      enabled: captureRequested,
      queryKey: getGetPilotCaptureEligibilityQueryKey(),
    },
  });
  const isCapture = captureRequested && captureEligibility.data?.eligible === true;
  // Polish mode: only practice sub-top-band phrases (POLISH_ENABLED flag required).
  // phraseIds=<csv> overrides which phrases to run; polish=1 computes the sub-top
  // set client-side from the bestBand field the server now returns per phrase.
  const phraseIdsParam = !isReview && !isTestout && !isSentences ? searchParams.get("phraseIds") : null;
  const polishMode = !isReview && !isTestout && !isSentences && searchParams.get("polish") === "1";
  const queryClient = useQueryClient();
  const { activeLang, activeLanguage } = useLanguage();
  const native = useNativeText();
  // Speech-recognition capability for the active language decides how practice
  // handles feedback: "supported" scores normally; "degraded" scores but shows
  // a one-time "feedback is approximate" notice; "unsupported" drops scoring
  // entirely for a listen-record-compare (ear-training) flow.
  const speechCapability = useSpeechCapability();
  const isUnsupported = speechCapability === "unsupported";
  const isDegraded = speechCapability === "degraded";
  const languageName = activeLanguage?.name ?? "this language";

  // Where "back" goes: the review session lives off the Home dashboard, while a
  // normal lesson belongs to its category.
  const backHref = isFlashback
    ? flashbackNext
    : isReview
      ? "/app"
      : isGroup || isZoneTestout
        ? "/journey"
        : `/learn/${id}`;
  // A finished journey stop leaves through the flashback (build 20): three
  // due phrases from earlier stops, skippable, then the journey. Everything
  // else leaves the way it always did.
  const doneHref =
    isGroup && !isTestout
      ? `/flashback?next=${encodeURIComponent("/journey")}`
      : backHref;

  const categoryQuery = useListCategoryPhrases(id, activeLang, {
    query: {
      enabled: !isReview && !isSentences && !isGroup,
      queryKey: getListCategoryPhrasesQueryKey(id, activeLang),
    },
  });
  const sentencesQuery = useListCategorySentences(id, activeLang, {
    query: {
      enabled: isSentences,
      queryKey: getListCategorySentencesQueryKey(id, activeLang),
    },
  });
  const reviewParams = isFlashback
    ? { lang: activeLang, limit: FLASHBACK_SIZE }
    : { lang: activeLang };
  const reviewQuery = useListReviewPhrases(reviewParams, {
    query: {
      enabled: isReview,
      queryKey: getListReviewPhrasesQueryKey(reviewParams),
    },
  });
  // THE FLASHBACK'S DOOR (build 23; build 22 handoff, section 4): a finished
  // journey stop asks for the three due phrases the flashback would show, so
  // the lightbox with Enter and Skip opens only onto a flashback that exists.
  // Same query the flashback itself makes, so it is warm on entry. With none
  // due the stop goes to the map; with the answer not yet in, it goes to the
  // flashback route, which steps aside when it finds nothing, as before.
  // Outside a group session this asks for exactly what the review above asks
  // for, so the last call the API client sees is still the session's own
  // (practice-flashback.test.tsx reads it back).
  const flashbackParams = isGroup && !isTestout ? { lang: activeLang, limit: FLASHBACK_SIZE } : reviewParams;
  const flashbackDue = useListReviewPhrases(flashbackParams, {
    query: {
      enabled: isGroup && !isTestout && !!activeLang,
      queryKey: getListReviewPhrasesQueryKey(flashbackParams),
    },
  });
  const [flashbackOpen, setFlashbackOpen] = useState(false);
  const [, navigate] = useLocation();
  const dueKnown = Array.isArray(flashbackDue.data);
  const dueCount = Array.isArray(flashbackDue.data) ? flashbackDue.data.length : 0;
  const groupQuery = useListLessonGroupPhrases(isGroup ? groupId : 0, {
    query: {
      enabled: isGroup && !isTestout,
      queryKey: getListLessonGroupPhrasesQueryKey(isGroup ? groupId : 0),
    },
  });
  // Test-out sessions load the server-sampled subset instead of the full
  // group list. The endpoint enforces the same entitlement and progression
  // gates as the group endpoint, so the upgrade/locked handling below applies
  // to it unchanged.
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
  const zoneTestoutQuery = useGetZoneTestout(isZoneTestout ? id : 0, activeLang, {
    query: {
      enabled: isZoneTestout,
      queryKey: getGetZoneTestoutQueryKey(isZoneTestout ? id : 0, activeLang),
    },
  });
  const activeTestoutQuery = isZoneTestout ? zoneTestoutQuery : testoutQuery;
  const {
    data: listData,
    isLoading: listLoading,
    isError: listIsError,
    error: listError,
    isFetching: listFetching,
    refetch: refetchList,
  } = isReview
    ? reviewQuery
    : isGroup
      ? groupQuery
      : isSentences
        ? sentencesQuery
        : categoryQuery;
  // The test-out sample wraps its phrases in an envelope (with sampleSize and
  // requiredCorrect), so its query cannot join the destructure above.
  const rawPhrases = isTestout ? activeTestoutQuery.data?.phrases : listData;
  // Apply phraseIds or polish filter. Filtering here means all downstream code
  // (session loop, summary) automatically operates on the filtered set.
  // Safety: when the filter would produce an empty list (e.g. all top-band),
  // fall back to the full set so the session always has something to practice.
  const phrases = useMemo(() => {
    if (!rawPhrases) return rawPhrases;
    if (phraseIdsParam) {
      const idSet = new Set(
        phraseIdsParam.split(",").map(s => parseInt(s, 10)).filter(n => !isNaN(n)),
      );
      // Only include phrase IDs that actually exist in the loaded set to prevent
      // URL injection from injecting foreign phrases.
      const filtered = rawPhrases.filter(p => idSet.has(p.id));
      return filtered.length > 0 ? filtered : rawPhrases;
    }
    if (polishMode) {
      const filtered = rawPhrases.filter(
        p => p.bestBand !== "perfect" && p.bestBand !== "great",
      );
      return filtered.length > 0 ? filtered : rawPhrases;
    }
    return rawPhrases;
  }, [rawPhrases, phraseIdsParam, polishMode]);
  const loadingPhrases = isTestout ? activeTestoutQuery.isLoading : listLoading;
  const isError = isTestout ? activeTestoutQuery.isError : listIsError;
  const error = isTestout ? activeTestoutQuery.error : listError;
  const isFetching = isTestout ? activeTestoutQuery.isFetching : listFetching;
  const refetch = isTestout ? activeTestoutQuery.refetch : refetchList;
  const testoutSampleSize = activeTestoutQuery.data?.sampleSize ?? 5;
  // 5, not 4: the pass ratio went to 1 on 2026-08-25, so the fallback has to
  // match the sample size or the copy understates what the express needs
  // in the one frame before the envelope arrives.
  const testoutRequiredCorrect = activeTestoutQuery.data?.requiredCorrect ?? 5;
  // Polish feature flag: read from the categories listing (already cached from
  // the journey map in most sessions; adds no extra network request).
  const categoriesForFlag = useListCategories({ lang: activeLang });
  const polishEnabled = categoriesForFlag.data?.some(c => c.polishEnabled) ?? false;
  const synthesize = useSynthesizeSpeech();
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
          webHaptic('success');
          queryClient.invalidateQueries({ queryKey: getListCategoryLessonGroupsQueryKey(id, activeLang) });
          queryClient.invalidateQueries({ queryKey: getListLessonGroupPhrasesQueryKey(groupId) });
        } else {
          webHaptic('warning');
        }
      },
    },
  });
  // Zone-scope judgment: the same one-shot POST shape against the zone
  // endpoint. A pass latches tested_out on every member group, so refresh the
  // category's lesson-group listing and sweep the group-phrases key family by
  // string prefix (the zone sample does not carry its member group ids).
  const submitZoneTestoutMutation = useSubmitZoneTestout({
    mutation: {
      onSuccess: (res) => {
        if (res.passed) {
          playCue('session_complete');
          webHaptic('success');
          queryClient.invalidateQueries({ queryKey: getListCategoryLessonGroupsQueryKey(id, activeLang) });
          queryClient.invalidateQueries({
            predicate: (q) => {
              const k = q.queryKey[0];
              return typeof k === "string" && k.startsWith("/api/lesson-groups/") && k.endsWith("/phrases");
            },
          });
        } else {
          webHaptic('warning');
        }
      },
    },
  });
  // The verdict screen reads whichever mutation this session's scope drives.
  const activeTestoutSubmit = isZoneTestout ? submitZoneTestoutMutation : submitTestout;
  // Server-signed evaluation tokens collected during a test-out run, keyed by
  // phrase id (a retaken phrase would overwrite, but test-out has no retakes).
  const testoutTokensRef = useRef<Record<number, string>>({});

  // TEMPORARY capture mode state: which of the 4 protocol attempts is next
  // (0-based), the last saved attempt (for "redo"), and the auto-advance
  // timer. Refs mirror values that finishRecording's useCallback closure
  // must read fresh.
  const [captureStep, setCaptureStep] = useState(0);
  const captureStepRef = useRef(0);
  const setCaptureStepBoth = (n: number) => {
    captureStepRef.current = n;
    setCaptureStep(n);
  };
  const isCaptureRef = useRef(isCapture);
  isCaptureRef.current = isCapture;
  const [lastCapture, setLastCapture] = useState<{ phraseId: number; step: number } | null>(null);
  const captureAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (captureAdvanceTimerRef.current) clearTimeout(captureAdvanceTimerRef.current);
  }, []);
  // finishRecording's timer reaches handleNext through this ref because
  // handleNext is redefined per render (it is not a useCallback).
  const handleNextRef = useRef<(() => void) | null>(null);
  const discardLastCaptureMutation = useDiscardLastPilotCapture();
  const recorder = useVoiceRecorder();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  // ── Zero-XP encore (owner rule) ───────────────────────────────────────────
  // A phrase that earns NO XP comes back at the END of the session, and keeps
  // coming back until it earns something. Three zeros of ANY kind release it
  // (owner-ruled: a nocatch burns a strike too) so a dead mic can never trap
  // the learner in a session that will not end. Queue holds phrase IDs.
  const [encoreQueue, setEncoreQueue] = useState<number[]>([]);
  // Per-phrase session tallies, keyed by phrase id: zero-XP strikes for the
  // encore, all-band attempts for the advance gate (Task #1040). One map so
  // there is exactly one write site for both.
  const [phraseTallies, setPhraseTallies] = useState<Record<number, PhraseTally>>({});
  const phraseTalliesRef = useRef<Record<number, PhraseTally>>({});
  // Once the base list is exhausted the cursor stops moving forward, so every
  // later advance must come from the queue, never from currentIndex + 1.
  const [inEncore, setInEncore] = useState(false);
  const [state, setState] = useState<SessionState>("intro");
  const [speakingSegment, setSpeakingSegment] = useState<SpokenSegment>(null);
  const [result, setResult] = useState<{ band: Band; passed: boolean; xpAwarded: number; xpBreakdown?: string | null; feedback: string; tip: string; transcript: string; transcriptRomanized: string } | null>(null);
  // Keyed by phraseId so retrying a phrase overwrites its previous entry
  // instead of appending a duplicate. The summary derives an ordered list from
  // `phrases` so phrase ordering is preserved.
  const [sessionResults, setSessionResults] = useState<Record<number, {
    phraseId: number;
    band: Band;
    xpAwarded: number;
    xpBreakdown?: string | null;
    feedback: string;
    tip: string;
    nativeScript: string;
    english: string;
  }>>({});
  // Which phrase ring is expanded in the summary (index into orderedSummaryEntries).
  const [summarySelectedIdx, setSummarySelectedIdx] = useState<number | null>(null);
  // Hotfix 3S Item 3: total session Chai from attempt-side-effect earns.
  // Each attempt response carries a server-authoritative `chaiEarned`; the
  // client sums them exactly like XP. The receipt pill renders only when > 0.
  const [sessionChai, setSessionChai] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  // Spec 1: retry-band shake (increment retriggers), XP arc overlay state.
  const [shakeKey, setShakeKey] = useState(0);
  const [xpArc, setXpArc] = useState<{
    key: number;
    amount: number;
    from: { x: number; y: number };
  } | null>(null);
  const resultPanelRef = useRef<HTMLDivElement | null>(null);
  const xpArcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (xpArcTimerRef.current) clearTimeout(xpArcTimerRef.current);
  }, []);
  const reduceMotion = useReducedMotion();
  // ── Spec D2: live input amplitude ──────────────────────────────────────
  // A single rAF loop samples recorder.getAmplitude() while recording and
  // feeds two animation bindings — the waveform bars and the mascot scale —
  // through MotionValues, never React state. React state is only touched for
  // slow-changing facts: the zero-input hint and the reduced-motion level
  // segments (which change a few times per second at most).
  const amplitudeMv = useMotionValue(0);
  const mascotScaleRaw = useTransform(amplitudeMv, (a) => 1 + Math.min(1, a) * 0.08);
  const mascotScale = useSpring(mascotScaleRaw, { stiffness: 300, damping: 22 });
  // Zero-input state: visible once >1.5s passes with near-zero amplitude
  // while recording (mic muted / wrong device), per Spec D2 rule 7.
  const [noInput, setNoInput] = useState(false);
  // One-time first-practice coach hint (P1 v2 item 6): "Hold Bolo to speak"
  // floating callout the first time a learner reaches the practice screen with
  // phrases loaded. Fires once per browser via localStorage. MUST live up here
  // with the unconditional hooks — the loading/error early returns below would
  // otherwise change the hook count between renders.
  const [showHint, setShowHint] = useState(false);
  // Re-shown (with its own copy) when a press was discarded because the
  // recorder was still acquiring the mic — the learner pressed, nothing
  // happened, and they deserve to know why and what to do instead.
  const [readyHint, setReadyHint] = useState(false);
  const readyHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashHoldHint = () => {
    setReadyHint(true);
    if (readyHintTimerRef.current) clearTimeout(readyHintTimerRef.current);
    readyHintTimerRef.current = setTimeout(() => setReadyHint(false), 3500);
  };
  useEffect(
    () => () => {
      if (readyHintTimerRef.current) clearTimeout(readyHintTimerRef.current);
    },
    [],
  );
  // Polish card dismissal state: set true when the learner taps "Skip".
  const [polishDismissed, setPolishDismissed] = useState(false);
  useEffect(() => {
    if (!phrases || phrases.length === 0) return;
    const key = "bolo.practice.hint.v1";
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 3500);
    return () => clearTimeout(t);
  }, [phrases]);
  // Reduced motion: static level indicator segments (0..5), not a waveform.
  const [levelSegments, setLevelSegments] = useState(0);
  useEffect(() => {
    if (state !== "recording") {
      amplitudeMv.set(0);
      setNoInput(false);
      setLevelSegments(0);
      return;
    }
    let raf = 0;
    let lastLoudAt = performance.now();
    const loop = () => {
      const amp = recorder.getAmplitude();
      // Re-check each frame so an OS preference change mid-recording switches
      // the animated feed <-> static meter immediately (matchMedia is cheap).
      if (!prefersReducedMotion()) {
        amplitudeMv.set(amp);
      } else {
        // Park the mascot at rest so a mid-recording switch to reduced motion
        // doesn't freeze it partially scaled.
        amplitudeMv.set(0);
        setLevelSegments(Math.min(5, Math.round(Math.min(1, amp) * 5)));
      }
      const now = performance.now();
      if (amp > 0.04) lastLoudAt = now;
      setNoInput(now - lastLoudAt > 1500);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const [newBadges, setNewBadges] = useState<EarnedBadge[]>([]);
  // THE FIRST-WORD LIGHTBOX (lib/first-word-primer.ts). While it is up the
  // score reveal and any badge the attempt unlocked wait in these refs;
  // dismissing it releases both together, score first, badge over it, so
  // the lightbox never fights the first badge celebration.
  const [firstWordPrimerOpen, setFirstWordPrimerOpen] = useState(false);
  const firstWordHoldRef = useRef(false);
  const heldRevealRef = useRef<(() => void) | null>(null);
  const heldBadgesRef = useRef<EarnedBadge[] | null>(null);
  // The language's attempt count, the "is this really their first word"
  // half of the lightbox decision. Cached by home; a fresh fetch here costs
  // nothing when it is.
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
    if (badges?.length) setNewBadges(badges);
  };
  const [evalError, setEvalError] = useState<EvalErrorContent | null>(null);
  // Chunk 1 item 4a: how the last coach playback attempt failed, if it did.
  // "play" = the browser rejected audio.play() (autoplay policy); recovery is
  // a manual tap on the speaker button, which gets a visible attention
  // treatment. "synthesis" = the audio never arrived; the deck's COACH AUDIO
  // FAILED card renders with a Play phrase button.
  const [coachAudioFailed, setCoachAudioFailed] = useState<null | "play" | "synthesis">(null);
  // Chunk 1 item 4c: one-time iOS Safari silent-switch hint, checked on the
  // first coach play attempt of this mount only.
  const [showIosHint, setShowIosHint] = useState(false);
  const iosHintCheckedRef = useRef(false);
  // When true, the attempt scored but saving progress failed — the learner
  // keeps their result and gets a gentle note instead of a silent reset.
  const [saveFailed, setSaveFailed] = useState(false);
  // M1 teaser: latest teaser progress reported by the attempts endpoint for a
  // locked language (absent entirely when the plan covers the language).
  const [teaserProgress, setTeaserProgress] = useState<{ consumed: number; limit: number } | null>(null);
  const [xpExpanded, setXpExpanded] = useState(false);

  // ── Degraded-language notice (spec 1) ────────────────────────────────────
  // Show a one-time, dismissible "feedback is approximate" heads-up the first
  // time a learner opens a recording surface in a degraded language. The seen
  // state persists per language code so it never reappears.
  const [showApproxNotice, setShowApproxNotice] = useState(false);
  useEffect(() => {
    if (!isDegraded || !activeLang) {
      setShowApproxNotice(false);
      return;
    }
    try {
      if (localStorage.getItem(approxNoticeKey(activeLang)) === "1") return;
    } catch {
      // localStorage unavailable (private mode); still show it this session.
    }
    setShowApproxNotice(true);
  }, [isDegraded, activeLang]);

  const dismissApproxNotice = () => {
    setShowApproxNotice(false);
    try {
      localStorage.setItem(approxNoticeKey(activeLang), "1");
    } catch {
      // Ignore storage failures; the notice stays dismissed for this session.
    }
  };

  // ── Unsupported-language playback (spec 2) ───────────────────────────────
  // In ear-training mode we keep the learner's recording so they can play it
  // back and compare it to the coach. Held as an object URL that is revoked
  // when replaced or on unmount to avoid leaking blobs.
  const [ownRecordingUrl, setOwnRecordingUrl] = useState<string | null>(null);
  const ownRecordingUrlRef = useRef<string | null>(null);
  const ownAudioRef = useRef<HTMLAudioElement | null>(null);
  const setOwnRecording = useCallback((blob: Blob | null) => {
    if (ownRecordingUrlRef.current) {
      URL.revokeObjectURL(ownRecordingUrlRef.current);
      ownRecordingUrlRef.current = null;
    }
    const url = blob ? URL.createObjectURL(blob) : null;
    ownRecordingUrlRef.current = url;
    setOwnRecordingUrl(url);
  }, []);
  useEffect(() => {
    return () => {
      if (ownRecordingUrlRef.current) URL.revokeObjectURL(ownRecordingUrlRef.current);
      if (ownAudioRef.current) ownAudioRef.current.pause();
    };
  }, []);

  const [silentMode, setSilentMode] = useState<boolean>(loadSilentMode);
  // Read by effects so the current value is always visible inside callbacks.
  const silentModeRef = useRef<boolean>(silentMode);

  // ── Streak & toast state ─────────────────────────────────────────────────
  // Use a ref so finishRecording (in a useCallback) always sees the current value.
  const consecutiveGoodRef = useRef(0);
  const [activeToast, setActiveToast] = useState<{ message: string; key: number } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the confetti hide-timer so it can be cancelled on unmount and never
  // fires into a torn-down component (avoids "window is not defined" in tests).
  const confettiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards so each mid-session milestone fires at most once per session.
  const halfwayToastFiredRef = useRef(false);
  const lastToastFiredRef = useRef(false);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setActiveToast(prev => ({ message, key: (prev?.key ?? 0) + 1 }));
    toastTimerRef.current = setTimeout(() => setActiveToast(null), 1800);
  }, []);

  // Clear timers on unmount so they never fire into a torn-down component.
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current);
    };
  }, []);

  const changeSilentMode = (enabled: boolean) => {
    setSilentMode(enabled);
    silentModeRef.current = enabled;
    saveSilentMode(enabled);
  };

  // Spoken feedback preference — whether the coach reads the result text aloud
  // after scoring. Mirrored in React state so the header quick-toggle applies
  // instantly without a full remount, matching the mobile quick-mute pattern.
  const [spokenFeedback, setSpokenFeedback] = useState<boolean>(loadSpokenFeedback);
  // Ref mirror so finishRecording (a useCallback) always sees the live value
  // without needing spokenFeedback in its deps and causing excess re-creation.
  const spokenFeedbackRef = useRef(spokenFeedback);
  const changeSpokenFeedback = (enabled: boolean) => {
    spokenFeedbackRef.current = enabled;
    setSpokenFeedback(enabled);
    saveSpokenFeedback(enabled);
  };

  // Meaning audio preference: whether the coach speaks the English meaning
  // right after each phrase clip. Ref mirror so the playCoach chain reads the
  // live value at play time, applying a toggle flip to the very next play
  // without a reload.
  const [meaningAudio, setMeaningAudio] = useState<boolean>(loadMeaningAudio);
  const meaningAudioPrefRef = useRef(meaningAudio);
  const changeMeaningAudio = (enabled: boolean) => {
    meaningAudioPrefRef.current = enabled;
    setMeaningAudio(enabled);
    saveMeaningAudio(enabled);
  };

  // Coach voice master gate — loaded once at mount (synchronous localStorage
  // read). When off, all Bolo speech is silent regardless of the more granular
  // spoken-feedback and meaning-audio settings below.
  const coachVoiceRef = useRef<boolean>(loadCoachVoicePref());

  // Warm up the microphone as soon as the practice session mounts, so the
  // first hold starts capturing immediately and the first syllable isn't
  // clipped — but only when permission is already granted, so first-time
  // users never see a permission prompt on page load. Their prompt fires on
  // the first hold. The hook releases the stream on unmount.
  useEffect(() => {
    return prewarmMicIfGranted(() => recorder.prepare());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const feedbackAudioRef = useRef<HTMLAudioElement | null>(null);
  // Replays reuse the first synthesized audio for a phrase: regenerating on
  // every "hear it again" sometimes yields a different (wrong) reading.
  const coachAudioCacheRef = useRef(new Map<number, { audioBase64: string; format: string }>());
  // The English meaning segment currently playing (second element in the
  // phrase, pause, meaning chain). Kept separate from audioRef so the phrase
  // clip pipeline stays untouched.
  const meaningAudioElRef = useRef<HTMLAudioElement | null>(null);
  // Per-session cache of synthesized meaning audio, parallel to
  // coachAudioCacheRef, so repeated plays never re-synthesize the meaning.
  const meaningAudioCacheRef = useRef(new Map<number, { audioBase64: string; format: string }>());
  // Pre-warmed audio for the starting phrase — kicked off when phrases first
  // load so the coach voice plays instantly instead of waiting 1–2 s for
  // gpt-audio synthesis after state flips to "playing_coach".
  const startingPhraseAudioRef = useRef<Promise<{ audioBase64: string; format: string } | null> | null>(null);
  // Pre-synthesized feedback audio — started in parallel with createAttempt
  // so the voice is ready (or nearly ready) when the result card appears.
  const feedbackAudioPendingRef = useRef<Promise<{ audioBase64: string; format: string } | null> | null>(null);
  // The instant band call-out clip playing for the current result (Task 903).
  const bandClipRef = useRef<BandClipHandle | null>(null);

  const phrase = phrases?.[currentIndex];

  // Auto-start when phrases load (jump to a specific phrase if requested)
  useEffect(() => {
    if (phrases && phrases.length > 0 && state === "intro") {
      let startIdx = 0;
      if (startPhraseId != null) {
        const idx = phrases.findIndex(p => p.id === parseInt(startPhraseId, 10));
        if (idx >= 0) startIdx = idx;
      } else if (skipMastered) {
        // Advance past already-mastered phrases so the session starts where
        // the learner actually has work to do. Falls back to index 0 if
        // every phrase is mastered (avoids an empty session).
        const firstUnmastered = phrases.findIndex(p => !p.mastered);
        if (firstUnmastered > 0) startIdx = firstUnmastered;
      } else if (isGroup && !isTestout && !polishMode && !phraseIdsParam) {
        // Task 954 + completed-station ruling: a station session ALWAYS runs
        // the first-unmastered scan — the first phrase whose bestScore is
        // null or below the 80 credit edge (the same threshold lesson-group
        // completion uses). Station status (completed / tested_out) never
        // short-circuits the scan (no status field is consulted here), and
        // the entry route cannot change the result: every route into a plain
        // station session lands in this same branch. Index 0 is the fallback
        // ONLY when the scan finds nothing — every phrase in the session at
        // 80+ (a deliberate review visit replays from phrase 1). A
        // tested-out station without per-phrase attempts is all-null, so the
        // scan itself lands on index 0. Only the starting index changes: the
        // phrase set is not filtered, and back navigation still returns to
        // the journey.
        //
        // Teaser taste sets are INERT to resume: a teaser-state caller gets
        // the fixed free taste set (rows carry `teaser` progress), which must
        // always play from the top — skipping an already-attempted free
        // phrase would shorten the taste → upsell flow.
        const isTeaserSet = phrases.some(p => p.teaser != null);
        if (!isTeaserSet) {
          const firstBelowCredit = phrases.findIndex(
            p => p.bestScore == null || p.bestScore < 80,
          );
          if (firstBelowCredit >= 0) startIdx = firstBelowCredit;
        }
      }
      if (startIdx > 0) setCurrentIndex(startIdx);

      // Pre-warm the starting phrase's audio immediately so the coach voice
      // plays as soon as state flips to "playing_coach". Without this, gpt-audio
      // synthesis (1–2 s) happens *after* the state change, leaving a window
      // where the belly button looks tappable but recordings are silently dropped.
      const startPhrase = phrases[startIdx];
      if (!silentModeRef.current && startPhrase && !coachAudioCacheRef.current.has(startPhrase.id)) {
        startingPhraseAudioRef.current = synthesize
          .mutateAsync({ data: { text: startPhrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang } })
          .then(res => { coachAudioCacheRef.current.set(startPhrase.id, res); return res; })
          .catch(() => null);
      }

      // In silent mode skip the coach voice and go straight to recording.
      setState(silentModeRef.current ? "idle" : "playing_coach");
      trackOnce(ANALYTICS_EVENTS.FIRST_PRACTICE_SESSION_STARTED, { language: activeLang });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrases, state]);

  // Prefetch the next phrase's audio while the learner is on the current one
  // so advancing feels instant. Best-effort — failures are silently swallowed.
  useEffect(() => {
    if (silentModeRef.current) return;
    const nextPhrase = phrases?.[currentIndex + 1];
    if (!nextPhrase || coachAudioCacheRef.current.has(nextPhrase.id)) return;

    let cancelled = false;
    synthesize
      .mutateAsync({ data: { text: nextPhrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang } })
      .then((res) => {
        if (!cancelled) {
          coachAudioCacheRef.current.set(nextPhrase.id, {
            audioBase64: res.audioBase64,
            format: res.format,
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, phrases]);

  // Handle coach playing
  useEffect(() => {
    if (state === "playing_coach" && phrase) {
      let cancelled = false;
      // A fresh attempt is starting; clear any stale failure surface.
      setCoachAudioFailed(null);

      // Second segment of the play chain (Task 1003): after the phrase clip
      // ends, a short pause, then the English meaning in an English voice.
      // Best-effort by design: any synthesis or playback failure here falls
      // back silently to the phrase-only behavior and never touches the
      // coachAudioFailed card. The element inherits the user-gesture blessing
      // of the play that started the chain, so no autoplay priming is needed.
      // Synthesizes (or reuses the cached) English meaning clip. Hoisted out
      // of playMeaning so playCoach can PRE-WARM it while the phrase clip is
      // still playing: on a cold cache, synthesis used to start only after
      // the phrase ended, stretching the felt gap to the network latency
      // instead of the intended MEANING_SEGMENT_PAUSE_MS beat.
      const synthMeaning = async () => {
        const cachedMeaning = meaningAudioCacheRef.current.get(phrase.id);
        if (cachedMeaning) return cachedMeaning;
        const fresh = await synthesize.mutateAsync({
          data: {
            text: meaningSpeechText(phrase.english, { sentence: isSentences }),
            languageName: "English",
            languageCode: "en",
          },
        });
        meaningAudioCacheRef.current.set(phrase.id, {
          audioBase64: fresh.audioBase64,
          format: fresh.format,
        });
        return fresh;
      };
      let meaningPrewarm: ReturnType<typeof synthMeaning> | null = null;

      const playMeaning = async () => {
        if (cancelled) return;
        // Read the preference fresh at play time so a toggle flip applies to
        // the very next play without a reload.
        if (!coachVoiceRef.current || !meaningAudioPrefRef.current || !phrase.english) {
          setState("idle");
          setSpeakingSegment(null);
          return;
        }
        try {
          // The pause and the (pre-warmed or fresh) synthesis overlap so the
          // gap between the two segments stays close to the intended beat.
          const [res] = await Promise.all([
            meaningPrewarm ?? synthMeaning(),
            new Promise((resolve) => setTimeout(resolve, MEANING_SEGMENT_PAUSE_MS)),
          ]);
          if (cancelled) return;
          // Blessed singleton: WebKit only allows this programmatic play()
          // because the same element played inside the entry gesture.
          const meaningEl = getMeaningAudioElement();
          meaningEl.src = `data:audio/${res.format};base64,${res.audioBase64}`;
          meaningAudioElRef.current = meaningEl;
          meaningEl.onended = () => {
            if (!cancelled) {
              setState("idle");
              setSpeakingSegment(null);
            }
          };
          setSpeakingSegment('meaning');
          await meaningEl.play();
        } catch {
          // Fail silent to phrase-only: the phrase clip already played in
          // full, so simply return to idle as if the meaning were off.
          if (!cancelled) {
            setState("idle");
            setSpeakingSegment(null);
          }
        }
      };

      const playCoach = async () => {
        if (!coachVoiceRef.current) { setState("idle"); return; }
        let audio: HTMLAudioElement;
        try {
          const cached = coachAudioCacheRef.current.get(phrase.id);
          // Consume any pre-warmed synthesis promise that was started when
          // phrases first loaded — avoids a redundant gpt-audio API call.
          const pendingPrewarm = !cached ? startingPhraseAudioRef.current : null;
          if (pendingPrewarm) startingPhraseAudioRef.current = null;
          const prewarm = pendingPrewarm ? await pendingPrewarm : null;
          const res = cached ?? prewarm ?? await synthesize.mutateAsync({ data: { text: phrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang } });
          coachAudioCacheRef.current.set(phrase.id, { audioBase64: res.audioBase64, format: res.format });
          if (cancelled) return;
          // Blessed singleton (never per-phrase new Audio(): a fresh element
          // carries no WebKit blessing and first-phrase autoplay regresses).
          audio = getCoachAudioElement();
          audio.src = `data:audio/${res.format};base64,${res.audioBase64}`;
          audioRef.current = audio;
          audio.onended = () => {
            if (!cancelled) setSpeakingSegment(null);
            void playMeaning();
          };
          // Pre-warm the meaning segment while the phrase clip plays so the
          // beat after it stays at ~MEANING_SEGMENT_PAUSE_MS even on a cold
          // cache. On failure the handle resets so playMeaning retries fresh
          // and keeps owning the fail-silent fallback.
          if (meaningAudioPrefRef.current && phrase.english) {
            const prewarm = synthMeaning();
            meaningPrewarm = prewarm;
            prewarm.catch(() => {
              if (meaningPrewarm === prewarm) meaningPrewarm = null;
            });
          }
        } catch (error) {
          if (!cancelled) {
            console.error("Failed to synthesize speech", error);
            // Chunk 1 item 4a, synthesis path: keep the old behavior (drop to
            // idle) and surface the deck's COACH AUDIO FAILED card.
            setCoachAudioFailed("synthesis");
            setState("idle");
          }
          return;
        }
        try {
          // THE SEGMENT FLIPS WHEN THE AUDIO STARTS, not when synthesis does.
          // The clip is fetched above and that can take a moment on a cold
          // cache; swelling the word during the wait would light up a line
          // that is not being spoken yet, which is the opposite of the point.
          setSpeakingSegment('phrase');
          await audio.play();
        } catch (error) {
          if (cancelled) return; // cleanup pause() aborts a pending play()
          setSpeakingSegment(null);
          const name = error instanceof DOMException ? error.name : "";
          if (name === "NotAllowedError" || name === "NotSupportedError") {
            // Autoplay policy rejection (Chunk 1 ruling 6): light up the
            // existing speaker button as a tap-to-hear affordance.
            setCoachAudioFailed("play");
          } else {
            console.error("Coach audio failed to play", error);
            setCoachAudioFailed("synthesis");
          }
          setState("idle");
        }
      };
      playCoach();

      return () => {
        cancelled = true;
        if (audioRef.current) {
          // The element persists (blessed singleton); drop the session's
          // handler so it can never fire on a later silent blessing play.
          audioRef.current.onended = null;
          audioRef.current.pause();
          audioRef.current = null;
        }
        if (meaningAudioElRef.current) {
          meaningAudioElRef.current.onended = null;
          meaningAudioElRef.current.pause();
          meaningAudioElRef.current = null;
        }
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, phrase?.id]);

  // Speak the result (Task 903): the band call-out plays instantly from a
  // bundled clip, then the coach's full feedback + tip follows once its
  // synthesis resolves. The result card itself is never blocked on audio.
  useEffect(() => {
    const spokenText = result
      ? [result.feedback, result.tip].filter(Boolean).join(" ")
      : "";
    // Read the setting fresh each time a result lands, so a toggle flipped on
    // the Account page applies to the very next score without a reload.
    if (state === "result" && result && spokenFeedback && coachVoiceRef.current) {
      let cancelled = false;
      // 1) Band call-out — pre-bundled audio, no synthesis wait. Correct
      // band mapping is result.band itself (nocatch gets the neutral clip).
      const clip = playBandClip(result.band);
      bandClipRef.current = clip;
      const speak = async () => {
        try {
          if (!spokenText) return;
          // 2) Full feedback — consume the pre-synthesized audio started in
          // finishRecording (parallel with createAttempt; server-side the
          // synthesis began even earlier via the eval-time prewarm). A
          // timeout guards the sequence: if synthesis is slow or failed,
          // the band clip alone plays.
          const pending = feedbackAudioPendingRef.current;
          feedbackAudioPendingRef.current = null;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const timeout = new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), FEEDBACK_AUDIO_TIMEOUT_MS);
          });
          const res = await Promise.race([
            pending ??
              synthesize
                .mutateAsync({ data: { text: spokenText } })
                .catch(() => null),
            timeout,
          ]);
          if (timer) clearTimeout(timer);
          // Sequence: let the band call-out finish before the sentence starts.
          if (clip) await clip.finished;
          if (!res || cancelled) return;
          // Blessed singleton (never per-play new Audio(): WebKit element
          // blessing, see iosAudio.ts).
          const audio = getFeedbackAudioElement();
          audio.src = `data:audio/${res.format};base64,${res.audioBase64}`;
          feedbackAudioRef.current = audio;
          await audio.play();
        } catch {
          // A missed read-aloud shouldn't interrupt practice; stay silent.
        }
      };
      speak();

      return () => {
        cancelled = true;
        bandClipRef.current?.stop();
        bandClipRef.current = null;
        if (feedbackAudioRef.current) {
          feedbackAudioRef.current.pause();
          feedbackAudioRef.current = null;
        }
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, result?.feedback, result?.tip]);

  // ── Positive hold-confirmation (Task 907, pattern from chat's Task 848) ──
  // The pointerId of the live hold gesture, or null when no hold is active.
  // Release is detected by WINDOW-level listeners installed at hold start, so
  // a pointerup the button never sees (permission prompt steals it, relayout
  // under the finger, tab switch) still ends the hold. A release while the
  // recorder is LIVE finishes and sends ("done speaking"); a release before
  // the recorder resolved (permission prompt open) discards like chat — a
  // permission grant alone must never produce an attempt or a result card.
  const activeHoldPointerRef = useRef<number | null>(null);
  // Removes the window listeners WITHOUT firing release semantics (used when
  // a new hold replaces a stale one, and on unmount so an unmount can never
  // trigger an evaluation).
  const holdCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => {
    holdCleanupRef.current?.();
  }, []);

  // Prevents a manual stop and any double-release from both firing.
  const finishingRef = useRef(false);
  // True once recorder.startRecording() has resolved — lets finishRecording
  // guard without capturing stale React state in a closure.
  const isRecordingRef = useRef(false);

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    // Guard via ref, not React state — state may still be "idle" in the closure
    // if this is called synchronously right after startRecording sets the ref.
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    finishingRef.current = true;
    // Ear-training mode never scores, so there's no "evaluating" stage — the
    // learner goes straight to a compare stage once we have their recording.
    setState(isUnsupported ? "recording" : "evaluating");
    setEvalError(null);
    setSaveFailed(false);
    try {
      const blob = await recorder.stopRecording();

      if (blob.size === 0) {
        // The recorder produced no audio at all (mic went away, recorder
        // failed). Tell the learner rather than sending an empty payload.
        // Deck NOCATCH: the recorder produced nothing usable.
        setEvalError({
          title: "Didn't catch that one",
          body: "The mic didn't pick you up clearly that time. Same phrase, one more go.",
          tip: "Get a little closer to the mic and speak at normal volume.",
        });
        setState("error");
        return;
      }

      // Unsupported language: no evaluation request is ever sent. Keep the
      // recording so the learner can play it back and compare (spec 2).
      if (isUnsupported) {
        setOwnRecording(blob);
        setState("compare");
        return;
      }

      // Min-duration guard (pilot rule, R3 class): clips under MIN_CLIP_SECONDS
      // transcribe as fragments and would be scored as retry. Route to the
      // local didn't-catch card instead; no request is sent, so the attempt
      // is never scored and never counted. Duration is read synchronously
      // after stopRecording resolves (no intervening await), per the
      // recorder's contract.
      if (recorder.getLastDurationSeconds() < MIN_CLIP_SECONDS) {
        setEvalError({
          title: "Didn't catch that one",
          body: "The mic didn't pick you up clearly that time. Same phrase, one more go.",
          tip: "Get a little closer to the mic and speak at normal volume.",
        });
        setState("error");
        return;
      }

      // Blob to base64
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const audioBase64 = btoa(binary);

      trackOnce(ANALYTICS_EVENTS.FIRST_PHRASE_ATTEMPTED, { language: activeLang });
      const evalRaw = await evaluate.mutateAsync({
        data: {
          phraseId: phrase!.id,
          targetNative: phrase!.nativeScript,
          targetRomanized: phrase!.romanized,
          targetEnglish: phrase!.english,
          languageName: activeLanguage?.name,
          audioBase64,
          mimeType: blob.type,
          // TEMPORARY capture mode: explicit protocol label for the tee
          // sidecar. The server ignores these fields for non-allowlisted
          // users, so they are inert outside the pilot.
          ...(isCaptureRef.current
            ? {
                captureLabel: CAPTURE_STEPS[captureStepRef.current]!.label,
                captureAttemptOfFour: captureStepRef.current + 1,
              }
            : {}),
        }
      });
      // Normalize defensively: a stale/mixed-version server may still emit
      // legacy band names, which would leave the ladder with no highlighted
      // rung and fall through every band branch below.
      const evalRes = { ...evalRaw, band: normalizeBand(evalRaw.band, evalRaw.score) };

      // TEMPORARY capture mode: the pipeline above (real STT, real scoring,
      // real tee) ran UNCHANGED — only the display and progress writes are
      // suppressed. No result card, no cues/confetti/XP, and no
      // createAttempt below (so no XP and no lesson progress). A brief
      // "attempt N saved" confirmation shows, then the protocol advances
      // automatically: next expectation, or next phrase after attempt 4.
      if (isCaptureRef.current) {
        const step = captureStepRef.current;
        setLastCapture({ phraseId: phrase!.id, step });
        setState("capture_saved");
        if (captureAdvanceTimerRef.current) clearTimeout(captureAdvanceTimerRef.current);
        captureAdvanceTimerRef.current = setTimeout(() => {
          if (step < CAPTURE_STEPS.length - 1) {
            setCaptureStepBoth(step + 1);
            setState("idle");
          } else {
            setCaptureStepBoth(0);
            handleNextRef.current?.();
          }
        }, 900);
        return;
      }

      setResult({
        band: evalRes.band,
        passed: evalRes.passed,
        xpAwarded: evalRes.xpAwarded,
        xpBreakdown: evalRes.xpBreakdown,
        feedback: evalRes.feedback,
        tip: evalRes.tip,
        transcript: evalRes.transcript,
        transcriptRomanized: evalRes.transcriptRomanized ?? "",
      });
      // Overwrite by phraseId so retries replace rather than duplicate.
      setSessionResults(prev => ({
        ...prev,
        [phrase!.id]: {
          phraseId: phrase!.id,
          band: evalRes.band,
          xpAwarded: evalRes.xpAwarded,
          xpBreakdown: evalRes.xpBreakdown,
          feedback: evalRes.feedback,
          tip: evalRes.tip,
          nativeScript: phrase!.nativeScript,
          english: phrase!.english,
        },
      }));

      // Zero-XP encore bookkeeping. Test-out is one take per phrase and is
      // judged as a batch, so it never queues an encore.
      if (!isTestout) {
        const encoreId = phrase!.id;
        // The single write site for this phrase's tallies. The ref mirrors
        // the state so two attempts inside one render pass cannot both read
        // the same counts (and queue the phrase twice).
        const prevTally = phraseTalliesRef.current[encoreId] ?? { attempts: 0, zeroStrikes: 0 };
        const strikes = prevTally.zeroStrikes + (evalRes.xpAwarded > 0 ? 0 : 1);
        phraseTalliesRef.current = {
          ...phraseTalliesRef.current,
          // Every take counts towards the advance gate, whatever the band.
          [encoreId]: { attempts: prevTally.attempts + 1, zeroStrikes: strikes },
        };
        setPhraseTallies(phraseTalliesRef.current);
        if (evalRes.xpAwarded > 0) {
          // Earned something: the debt is settled, even if an earlier take on
          // this phrase had already queued it. Strikes are NOT reset — they
          // are the record of what this phrase cost, not a live budget.
          setEncoreQueue(q => q.filter(id => id !== encoreId));
        } else {
          setEncoreQueue(q =>
            strikes >= ZERO_XP_STRIKE_LIMIT
              ? q.filter(id => id !== encoreId) // three goes: released
              : q.includes(encoreId)
                ? q
                : [...q, encoreId],
          );
        }
      }

      // Kick off spoken-feedback TTS in parallel with createAttempt so the
      // voice is ready (or nearly ready) when the result card appears.
      // gpt-audio synthesis takes ~1–2 s; pre-warming here cuts that delay.
      const fbText = [evalRes.feedback, evalRes.tip].filter(Boolean).join(" ");
      if (fbText && spokenFeedbackRef.current && coachVoiceRef.current) {
        feedbackAudioPendingRef.current = synthesize
          .mutateAsync({ data: { text: fbText } })
          .then(res => res)
          .catch(() => null);
      }

      // The learner has their score — show it now. Saving the attempt below
      // must never take the result away from them.
      //
      // Except once: THE FIRST-WORD LIGHTBOX goes up before the first score
      // is ever shown (owner ask, build 19), and the reveal waits behind it.
      // Judged on the cached summary AND this browser, never on either alone
      // (lib/first-word-primer.ts). Test-out is a batch, never a first word.
      const summaryAttempts = progressSummary.data?.totalAttempts;
      const primer =
        !isTestout &&
        summaryAttempts !== undefined &&
        shouldShowFirstWordPrimer({
          seenOnDevice: loadFirstWordPrimerSeen(),
          totalAttempts: summaryAttempts,
        });
      if (primer) {
        saveFirstWordPrimerSeen();
        firstWordHoldRef.current = true;
        heldRevealRef.current = () => setState("result");
        setFirstWordPrimerOpen(true);
      } else {
        setState("result");
      }
      // Web haptics — mirror the mobile practice pattern exactly.
      webHaptic('medium');
      if (isFullCreditBand(evalRes.band)) {
        webHaptic('heavy');
        setTimeout(() => webHaptic('heavy'), 140);
      }

      // Band-driven cues (Spec 1): correct on a full-credit band (legacy
      // 'nailed' group), wrong+shake on retry. nocatch is a system miss, not
      // a learner error (rule 16): no wrong cue, no shake.
      if (isFullCreditBand(evalRes.band)) {
        playCue('correct');
      } else if (evalRes.band === 'retry') {
        playCue('wrong');
        setShakeKey(k => k + 1);
      }

      // Confetti is reserved for the TOP band only.
      if (evalRes.band === 'perfect') {
        setShowConfetti(true);
        if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current);
        confettiTimeoutRef.current = setTimeout(() => setShowConfetti(false), 3000);
      }
      // XP arc: badge flies from the result panel to the XP counter. Fires
      // whenever XP was actually awarded (any passing band — the half-credit
      // group earns at the 0.5 band factor). retry/nocatch award no XP, so no arc.
      // Test-out runs record no attempt and award no XP, so no arc either.
      if (!isTestout && isPassingBand(evalRes.band) && evalRes.xpAwarded > 0) {
        if (xpArcTimerRef.current) clearTimeout(xpArcTimerRef.current);
        xpArcTimerRef.current = setTimeout(() => {
          const rect = resultPanelRef.current?.getBoundingClientRect();
          setXpArc({
            key: Date.now(),
            amount: evalRes.xpAwarded,
            from: rect
              ? { x: rect.left + rect.width / 2, y: rect.top + 24 }
              : { x: window.innerWidth / 2, y: window.innerHeight * 0.7 },
          });
        }, 250);
      }

      // Hot-streak tracking: increment consecutive good counter (any passing
      // band) using a ref so we always see the latest value inside this callback.
      const newConsec = isPassingBand(evalRes.band) ? consecutiveGoodRef.current + 1 : 0;
      consecutiveGoodRef.current = newConsec;
      if (newConsec === 3) showToast("🔥 3 in a row!");
      else if (newConsec === 5) showToast("🔥🔥 On a roll!");
      else if (newConsec === 10) showToast("🔥🔥🔥 UNSTOPPABLE!");

      if (isTestout) {
        // Test-out attempts are never saved individually. Collect the
        // server-signed token; the whole run is judged in one POST when the
        // last phrase lands (see handleNext). No XP, badges, or invalidations
        // happen here because nothing was recorded.
        testoutTokensRef.current[phrase!.id] = evalRes.evaluationToken;
      } else try {
        // Save the attempt for the signed-in user. The score/feedback are
        // carried inside the server-signed evaluation token, so the server —
        // not the client — decides what gets recorded. The response reports any
        // badges newly earned by this attempt, which the server awards exactly
        // once per (user, language) — so this celebration never replays.
        const attemptRes = await createAttempt.mutateAsync({
          data: {
            evaluationToken: evalRes.evaluationToken
          }
        });

        // Hotfix 3S Item 3: aggregate the server-reported Chai earned by this
        // attempt's side effects (today: the streak-day grant) for the
        // Session Complete receipt. Absent/zero adds nothing.
        if (attemptRes.chaiEarned) {
          setSessionChai((c) => c + attemptRes.chaiEarned!);
        }

        // Optimistic: increment todayXp immediately so the XP strip (and the
        // train class derived from it) reacts before the background refetch
        // resolves. THE one writer, shared with both mobile call sites — see
        // applyOptimisticTodayXp in @workspace/train-class.
        applyOptimisticTodayXp(queryClient, activeLang, evalRes.xpAwarded);
        // Invalidate queries so progress updates
        queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }) });
        queryClient.invalidateQueries({ queryKey: getListRecentAttemptsQueryKey({ lang: activeLang, limit: 12 }) });
        queryClient.invalidateQueries({ queryKey: getListCategoryPhrasesQueryKey(id, activeLang) });
        queryClient.invalidateQueries({ queryKey: getListCategorySentencesQueryKey(id, activeLang) });
        queryClient.invalidateQueries({ queryKey: getListReviewPhrasesQueryKey({ lang: activeLang }) });
        queryClient.invalidateQueries({ queryKey: getListBadgesQueryKey({ lang: activeLang }) });
        // Spec D1b: journey-map station states derive from attempts — refresh
        // this topic's lesson-group listing (and the group's own phrase list
        // when practicing via the map) so the map is current on return.
        queryClient.invalidateQueries({ queryKey: getListCategoryLessonGroupsQueryKey(id, activeLang) });
        if (isGroup) {
          queryClient.invalidateQueries({ queryKey: getListLessonGroupPhrasesQueryKey(groupId) });
        }

        if (attemptRes.newlyEarnedBadges.length > 0) {
          // Behind the first-word lightbox the badge waits its turn.
          if (firstWordHoldRef.current) {
            heldBadgesRef.current = attemptRes.newlyEarnedBadges;
          } else {
            setNewBadges(attemptRes.newlyEarnedBadges);
          }
        }
        // M1 teaser: the server reports teaser progress on attempts recorded
        // in a locked language. Keep the latest snapshot so the result panel
        // can pitch the upgrade the moment the last free phrase is used.
        if (attemptRes.teaser) setTeaserProgress(attemptRes.teaser);
      } catch (saveError) {
        console.error("Saving the attempt failed", saveError);
        setSaveFailed(true);
      }
    } catch (error) {
      console.error("Evaluation failed", error);
      setEvalError(describeEvaluationError(error));
      webHaptic('error');
      setState("error");
    } finally {
      finishingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, evaluate, createAttempt, queryClient, phrase, id, activeLang, activeLanguage, isUnsupported, isTestout, setOwnRecording]);

  const startRecording = async () => {
    // Barge-in (Task 907): a hold is honoured not just from idle but while
    // the example phrase plays and while a result (and its spoken feedback)
    // is on screen. Recording/evaluating are still excluded — a hold there is
    // either the live gesture itself or an in-flight evaluation.
    if (state !== "idle" && state !== "playing_coach" && state !== "result") return;
    setEvalError(null);
    if (state !== "idle") {
      // Stop whatever is playing RIGHT NOW, on the same gesture. Pausing here
      // is belt-and-braces; leaving the state also runs the playback effects'
      // cleanups, which pause + null these refs and set their `cancelled`
      // flags so a late-resolving synthesis can never start playing.
      audioRef.current?.pause();
      feedbackAudioRef.current?.pause();
      meaningAudioElRef.current?.pause();
      // Discard any pre-synthesized feedback audio so nothing resumes later.
      feedbackAudioPendingRef.current = null;
      setState("idle");
    }
    const holdPointerId = activeHoldPointerRef.current;
    try {
      // Hold-to-talk always uses manual stop — the learner releases their
      // finger to finish, so silence detection is not needed.
      await recorder.startRecording(undefined);
      // Positive hold-confirmation (chat.tsx grant-guard pattern): a
      // permission grant by itself must never produce an attempt or a result
      // card. Continue only if the exact pointer that started this press is
      // verifiably still held — otherwise (released while the prompt was
      // open, or the prompt's focus steal fired the blur release) abort and
      // discard. Nothing was captured before the recorder resolved, so there
      // is no audio to honour; the next press starts a fresh recording.
      if (holdPointerId === null || activeHoldPointerRef.current !== holdPointerId) {
        recorder.abortRecording();
        setState("idle");
        // The learner has just granted the microphone, and abortRecording
        // released the stream that grant produced. Re-warm it in the
        // background (permission is granted now, so this never prompts):
        // otherwise every later press pays a full device acquisition, a
        // normal-length click finishes before the recorder goes live, this
        // same guard discards it, and the bird looks dead for the rest of the
        // session — reloading the stop was the only cure.
        void recorder.prepare().catch(() => {});
        // ...and say so, because a discarded press is otherwise silent.
        flashHoldHint();
        return;
      }
      isRecordingRef.current = true;
      setState("recording");
    } catch {
      // Deck MIC PERMISSION DENIED. (The deck's "How to enable" primary has no
      // existing behavior to attach to; the card keeps its single recovery
      // button.)
      setEvalError({
        title: "Bolo can't hear you yet",
        body: "Speaking practice needs the microphone. Turn it on in your browser or phone settings and come back; we'll be here.",
      });
      setState("error");
    }
  };

  const handleBellyRelease = () => {
    if (isRecordingRef.current) {
      void finishRecording();
    }
    // Release before the recorder resolved (quick tap, or the permission
    // prompt stealing pointer/focus): nothing to do here. The hold is no
    // longer live, so startRecording's hold-confirmation guard aborts the
    // just-granted recorder without producing an attempt or a result card.
  };

  // Marks a hold gesture as live and installs window-level release listeners.
  // pointerup/pointercancel anywhere (and window blur, when the permission
  // prompt or a tab switch steals focus) end the hold and run the release
  // semantic — the button's own handlers are no longer trusted to see it.
  const beginHold = (pointerId: number) => {
    holdCleanupRef.current?.();
    activeHoldPointerRef.current = pointerId;
    const cleanup = () => {
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
      window.removeEventListener("blur", onBlur);
      if (activeHoldPointerRef.current === pointerId) {
        activeHoldPointerRef.current = null;
      }
      if (holdCleanupRef.current === cleanup) {
        holdCleanupRef.current = null;
      }
    };
    const onRelease = (e: PointerEvent) => {
      // Ignore other pointers (a second finger) — only this hold's release counts.
      if (e.pointerId !== undefined && e.pointerId !== pointerId) return;
      cleanup();
      handleBellyRelease();
    };
    const onBlur = () => {
      cleanup();
      handleBellyRelease();
    };
    window.addEventListener("pointerup", onRelease);
    window.addEventListener("pointercancel", onRelease);
    window.addEventListener("blur", onBlur);
    holdCleanupRef.current = cleanup;
  };

  const handleBellyPointerDown = (e: React.PointerEvent) => {
    // Warm the browser cache for the six band call-out clips on the first
    // record gesture, so the call-out plays instantly when the result lands.
    preloadBandClips();
    // Capture the pointer so pointerup fires on this element even if the
    // learner's finger drifts off it slightly.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture is unavailable in some test/jsdom environments.
    }
    beginHold(e.pointerId);
    void startRecording();
  };

  const handleErrorRetry = () => {
    setEvalError(null);
    setState("idle");
  };

  // Build the test-out submission from the collected tokens and POST it. Also
  // reused by the verdict screen's "Try again" after a transient submit error
  // (the tokens are still in hand, so no re-recording is needed).
  const submitTestoutRun = () => {
    const attempts = (phrases ?? [])
      .map(p => ({ phraseId: p.id, evaluationToken: testoutTokensRef.current[p.id] }))
      .filter((a): a is { phraseId: number; evaluationToken: string } => Boolean(a.evaluationToken));
    if (attempts.length === 0) return;
    if (isZoneTestout) {
      submitZoneTestoutMutation.mutate({ categoryId: id, data: { languageCode: activeLang, attempts } });
    } else {
      submitTestout.mutate({ id: groupId, data: { attempts } });
    }
  };

  const handleNext = () => {
    feedbackAudioPendingRef.current = null; // discard stale pre-synthesis
    setResult(null);
    setShowConfetti(false);
    setOwnRecording(null); // release any ear-training playback for this phrase
    // Encore mode jumps the cursor backwards, so once it starts, forward
    // progress must come from the queue alone or the tail of the base list
    // would replay in full.
    if (!inEncore && phrases && currentIndex < phrases.length - 1) {
      const nextIndex = currentIndex + 1;
      // Mid-session milestone toasts — fire at most once each per session.
      if (phrases.length >= 4 && nextIndex === Math.floor(phrases.length / 2) && !halfwayToastFiredRef.current) {
        halfwayToastFiredRef.current = true;
        showToast("Halfway there! 💪");
      } else if (nextIndex === phrases.length - 1 && !lastToastFiredRef.current) {
        lastToastFiredRef.current = true;
        showToast("Last one! 🦜 Finish strong!");
      }
      setCurrentIndex(c => c + 1);
      // In silent mode skip the coach voice and go straight to recording.
      setState(silentMode ? "idle" : "playing_coach");
    } else if (!isTestout && phrases && encoreQueue.length > 0) {
      // The list is done but something earned nothing. Bring the first such
      // phrase back — it keeps its place in the queue order, so several
      // zero-XP phrases return in the order they were missed.
      const [head, ...rest] = encoreQueue;
      const headIdx = phrases.findIndex(p => p.id === head);
      setEncoreQueue(rest);
      if (headIdx >= 0) {
        setInEncore(true);
        setCurrentIndex(headIdx);
        setState(silentMode ? "idle" : "playing_coach");
        showToast("One more go at this one 🎯");
        return;
      }
      // The phrase vanished from the list (filter change mid-session): fall
      // through on the next press rather than dead-ending the session.
      setState("result");
    } else if (isTestout) {
      // End of a test-out run: hand the batch to the server for judgment. The
      // verdict screen reads the mutation state directly (pending, pass,
      // fail, or a transient error with a resubmit action). The regular
      // session summary, haptics, and SESSION_COMPLETED event are skipped:
      // nothing was recorded, so there is no session to celebrate yet.
      submitTestoutRun();
      setState("summary");
    } else {
      // Fire a session-end haptic: success if any phrase passed, warning if not.
      // Mirrors the mobile done-screen haptic in the phase==='done' effect.
      const _entries = (phrases ?? []).map(p => sessionResults[p.id]).filter(Boolean);
      const _anyPassed = _entries.some(e => isPassingBand(e.band));
      webHaptic(_anyPassed ? 'success' : 'warning');
      // Celebratory sound gated on the same condition as summary confetti:
      // at least half of the phrases ended in a passing band.
      const _good = _entries.filter(e => isPassingBand(e.band)).length;
      if (_entries.length > 0 && _good * 2 >= _entries.length) {
        playCue('session_complete');
      }
      track(ANALYTICS_EVENTS.SESSION_COMPLETED, {
        language: activeLang,
        total: _entries.length,
        good: _good,
      });
      setState("summary");
    }
  };

  // TEMPORARY capture mode: keep the ref pointing at this render's handleNext
  // so the auto-advance timer never calls a stale closure.
  handleNextRef.current = handleNext;

  // TEMPORARY capture mode: "redo this attempt" for genuine fumbles — marks
  // the just-saved clip discarded in its sidecar, then repeats the SAME
  // expectation. Steps back even when the server had nothing to discard
  // (e.g. a restart forgot its in-memory pointer): the tester still redoes
  // the take, and the harvest prefers explicit labels over order anyway.
  const handleCaptureRedo = () => {
    if (!lastCapture || !phrases) return;
    discardLastCaptureMutation.mutate(undefined, {
      onSettled: () => {
        const idx = phrases.findIndex((p) => p.id === lastCapture.phraseId);
        if (idx >= 0 && idx !== currentIndex) setCurrentIndex(idx);
        setCaptureStepBoth(lastCapture.step);
        setLastCapture(null);
        setState("idle");
      },
    });
  };

  const handleRetry = () => {
    feedbackAudioPendingRef.current = null; // discard stale pre-synthesis
    setResult(null);
    setShowConfetti(false);
    setOwnRecording(null); // release any ear-training playback for this phrase
    // Return through the coach playback so the learner hears the model
    // pronunciation again before re-recording. In silent mode, skip straight
    // to idle so the mic is available immediately.
    setState(silentMode ? "idle" : "playing_coach");
  };

  const playAgain = () => {
    setCoachAudioFailed(null);
    setState("playing_coach");
  };

  // Chunk 1 item 4c: on the first coach play attempt of this mount, offer the
  // one-time iOS Safari silent-switch hint. iOS Safari web only, never the
  // native app; the storage key keeps it one-time and dismiss marks it shown
  // (per the helpers module's integration notes).
  useEffect(() => {
    if (state !== "playing_coach" || iosHintCheckedRef.current) return;
    iosHintCheckedRef.current = true;
    if (isIosSafariWeb() && shouldShowIosAudioHint()) setShowIosHint(true);
  }, [state]);

  // Ear-training mode (spec 2): replay the learner's own recording so they can
  // compare it to the coach. No evaluation is ever involved.
  const playOwnRecording = () => {
    if (!ownRecordingUrl) return;
    try {
      if (ownAudioRef.current) ownAudioRef.current.pause();
      const audio = new Audio(ownRecordingUrl);
      ownAudioRef.current = audio;
      void audio.play();
    } catch {
      // Playback is best-effort; a failure shouldn't interrupt practice.
    }
  };

  // ── Manual phrase navigation (Task #973) ────────────────────────────────
  // Moving between phrases is FREE, never attempt-gated (deliberately outside
  // the result card's advance gate, Task #1040): every scored take is stored
  // in sessionResults keyed by phrase id, and the per-phrase tallies are kept
  // the same way, so no visit order can lose progress. Navigation always lands in "idle" (never
  // "playing_coach") and fires no recording, playback, or scoring side
  // effect; the playing_coach effect's cleanup pauses any in-flight coach
  // audio when state flips away, and the spoken-feedback effect does the same
  // for result audio. Milestone toasts stay exclusive to auto-advance.
  // Test-out runs are one take per phrase, forward only, so the controls do
  // not render there and this is never called.
  const goToPhrase = (target: number) => {
    if (!phrases || target < 0 || target >= phrases.length) return;
    // Never yank the phrase out from under an in-flight take or evaluation.
    if (state === "recording" || state === "evaluating") return;
    feedbackAudioPendingRef.current = null; // discard stale pre-synthesis
    setResult(null);
    setEvalError(null);
    setShowConfetti(false);
    setOwnRecording(null); // release any ear-training playback
    setCurrentIndex(target);
    setState("idle");
  };

  // Keyboard left/right arrows mirror the on-screen prev/next controls.
  // Re-subscribed per render so the handler always closes over fresh state;
  // guards keep it inert during recording/evaluating and in test-out mode.
  useEffect(() => {
    if (isTestout) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPhrase(currentIndex - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToPhrase(currentIndex + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const upgrade = asUpgradeRequired(error);
  if (upgrade) {
    return (
      <UpgradeScreen
        backHref={backHref}
        title={
          upgrade.reason === "daily_lesson_limit"
            ? "You've hit today's free lessons"
            : upgrade.reason === "teaser_exhausted"
              ? "You've tried this language!"
              : upgrade.reason === "feature_locked"
                ? isSentences
                  ? "Full sentences are an All-Access feature"
                  : "Review is an All-Access feature"
                : "Unlock this language"
        }
        message={upgrade.message}
        upgradeHref={upgradeHrefForDenial(upgrade, activeLang)}
        showTrial={upgrade.reason === "daily_lesson_limit"}
      />
    );
  }

  if (isError) {
    return (
      <LessonErrorScreen
        backHref={backHref}
        onRetry={() => { void refetch(); }}
        isRetrying={isFetching}
        message={
          isZoneTestout && isZoneLockedError(error)
            ? "Finish the previous zone first, or test out of it."
            : undefined
        }
      />
    );
  }

  if (loadingPhrases || !phrases) {
    return (
      <LessonBuildingScreen
        languageName={activeLanguage?.name}
        backHref={backHref}
      />
    );
  }

  if (phrases.length === 0) {
    // S2 map honesty: a plain practice session with zero phrases means the
    // caller reached a stop their plan cannot see (the listing now reports
    // such groups planLocked, so this is defensive). Send them back to the
    // journey map, where the station renders locked with the Plus upsell,
    // instead of stranding them on a dead-end empty state. Review and
    // sentence sessions keep their legitimate empty states.
    if (!isReview && !isSentences) {
      return <Redirect to="/journey" replace />;
    }
    // Nothing due means no flashback: straight on, no empty screen.
    if (isFlashback) {
      return <Redirect to={flashbackNext} replace />;
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold mb-4">
          {isReview ? "Nothing to review right now." : "No sentences found here."}
        </h2>
        <Link href={backHref} className="text-primary font-bold">Go back</Link>
      </div>
    );
  }

  // Test-out verdict screen: rendered instead of the regular session summary
  // so a test-out run never shows XP totals it did not earn. The mutation
  // state drives it directly: pending, transient error (resubmit keeps the
  // collected tokens), pass (stop unlocked, Express stamp on the map), or
  // fail (encouraging copy, back to practicing via the journey).
  if (state === "summary" && isTestout) {
    const outcome = activeTestoutSubmit.data;
    const throttled = activeTestoutSubmit.error instanceof ApiError && activeTestoutSubmit.error.status === 429;
    const zoneLocked = isZoneTestout && isZoneLockedError(activeTestoutSubmit.error);
    return (
      <div className="app-surface min-h-[100dvh] flex flex-col bg-background" data-testid="testout-summary">
        <Confetti active={outcome?.passed === true} />
        <header className="mx-auto w-full max-w-2xl px-4 py-3 flex items-center shrink-0">
          <Link href="/journey" aria-label="Back to journey" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-7 h-7" />
          </Link>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12 text-center mx-auto w-full max-w-md">
          {activeTestoutSubmit.isError ? (
            <>
              <Mascot pose="tryagain" size={140} />
              <h2 className="mt-6 text-xl font-black">Couldn't check your run</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-snug">
                {zoneLocked
                  ? "Finish the previous zone first, or test out of it."
                  : throttled
                    ? "You've ridden the express recently. Catch your breath and try this stop again in a little while."
                    : "Something went wrong sending your takes. They're still saved here, so just try submitting again."}
              </p>
              <div className="mt-8 w-full space-y-3">
                {!throttled && !zoneLocked && (
                  <button
                    type="button"
                    onClick={submitTestoutRun}
                    data-testid="button-testout-resubmit"
                    className="w-full bg-primary text-primary-foreground font-black text-base py-4 rounded-2xl shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
                  >
                    Try again
                  </button>
                )}
                <Link
                  href="/journey"
                  data-testid="link-testout-journey"
                  className="block w-full bg-card text-foreground border-2 border-border font-bold text-base py-4 rounded-2xl active:scale-95 transition-all"
                >
                  Back to the journey
                </Link>
              </div>
            </>
          ) : outcome?.passed ? (
            <>
              <Mascot pose="cheer" size={140} idle="cheer" />
              <div
                className="mt-6 -rotate-6 border-4 border-success text-success font-black tracking-[0.2em] text-2xl px-4 py-1 rounded-lg"
                aria-hidden
              >
                EXPRESS
              </div>
              <h2 className="mt-4 text-xl font-black" data-testid="text-testout-passed">You tested out of this stop!</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-snug">
                You nailed {outcome.correctCount ?? testoutRequiredCorrect} of {outcome.sampleSize ?? testoutSampleSize} phrases.
                The gates are open and your ticket carries the Express stamp. Ride on!
              </p>
              <Link
                href="/journey"
                data-testid="link-testout-journey"
                className="mt-8 block w-full bg-primary text-primary-foreground font-black text-base py-4 rounded-2xl shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
              >
                Back to the journey
              </Link>
            </>
          ) : outcome ? (
            <>
              <Mascot pose="thumbsup" size={140} />
              <h2 className="mt-6 text-xl font-black" data-testid="text-testout-failed">Not this time, and that's okay</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-snug">
                You said {outcome.correctCount ?? 0} of {outcome.sampleSize ?? testoutSampleSize} phrases well; the
                express needs {outcome.requiredCorrect ?? testoutRequiredCorrect}. A little more practice and this stop
                is yours.
              </p>
              <Link
                href="/journey"
                data-testid="link-testout-keep-practicing"
                className="mt-8 block w-full bg-primary text-primary-foreground font-black text-base py-4 rounded-2xl shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
              >
                Keep practicing
              </Link>
            </>
          ) : (
            <>
              <Mascot pose="thinking" size={140} />
              <h2 className="mt-6 text-xl font-black" data-testid="text-testout-checking">Checking your run...</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-snug">
                The conductor is looking over your takes.
              </p>
            </>
          )}
        </main>
      </div>
    );
  }

  if (state === "summary") {
    // Build an ordered, deduplicated list of results: one entry per phrase,
    // in the order they appear in the phrase list. Retries have already
    // overwritten earlier attempts in the record, so we get the latest band.
    const orderedSummaryEntries = phrases
      .map(p => sessionResults[p.id])
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
    const attemptCount = orderedSummaryEntries.length;
    const totalXp = orderedSummaryEntries.reduce((a, r) => a + r.xpAwarded, 0);
    // "Perfect session" = every phrase ended full-credit (legacy 'nailed'
    // group, unchanged behavior under the five-band split).
    const isPerfect = attemptCount > 0 && orderedSummaryEntries.every(r => isFullCreditBand(r.band));
    const anyPassed = orderedSummaryEntries.some(r => isPassingBand(r.band));
    // Spec 1 gating: session confetti only when at least half of the phrases
    // ended in a passing band — never on rough sessions.
    const goodCount = orderedSummaryEntries.filter(r => isPassingBand(r.band)).length;
    const celebrateSession = attemptCount > 0 && goodCount * 2 >= attemptCount;
    return (
      <div className="app-surface min-h-screen flex flex-col bg-background p-6 mx-auto w-full max-w-xl">
        <Confetti
          active={celebrateSession}
          variant={isPerfect ? "perfect" : "default"}
          glyphs={glyphsForLanguage(activeLang)}
        />
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <Mascot pose={anyPassed ? "cheer" : "thumbsup"} size={148} idle={anyPassed ? "cheer" : "float"} />
          <motion.h1
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { delay: 0.12, type: "spring", stiffness: 260, damping: 20 }}
            className={cn(
              "text-4xl font-black",
              isPerfect ? "text-amber-500" : "text-foreground",
            )}
          >
            {isPerfect ? "PERFECT SESSION! 🏆" : anyPassed ? "Session Complete!" : "Great effort!"}
          </motion.h1>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { delay: 0.24, type: "spring", stiffness: 260, damping: 18 }}
            className={cn(
              "p-6 rounded-3xl w-full max-w-sm border shadow-sm",
              isPerfect ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" : "bg-card border-card-border",
            )}
          >
            <p className="text-muted-foreground font-medium">You practiced {attemptCount} {isSentences ? "sentences" : "phrases"}.</p>
            {/* XP earned chip */}
            {totalXp > 0 && (
              <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-950/40 px-4 py-1 text-sm font-black text-violet-600 dark:text-violet-400">
                <CountUp value={totalXp} prefix="+" suffix=" XP earned" />
              </div>
            )}

            {/* Hotfix 3S Item 3: Chai receipt — server-aggregated session
                earns, directly under the XP pill as its sibling, only when
                something was actually earned. */}
            {sessionChai > 0 && (
              <div>
                <div
                  data-testid="session-chai-pill"
                  className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/40 px-4 py-1 text-sm font-black text-amber-700 dark:text-amber-400"
                >
                  <ChaiGlyph className="h-3.5 w-3.5" />
                  <CountUp value={sessionChai} prefix="+" suffix=" Chai earned" />
                </div>
              </div>
            )}

            {/* THE DAILY GIFT, WHERE PRACTICE ENDS, and it is not an extra
                placement: the tap is the grant now (owner ruling, 2026-09-04),
                so a learner who practised and never opened the box forfeits the
                day. That forfeit is only fair if the box is unmissable, which
                means it cannot live on home alone. This is the screen the
                learner is looking at at the exact moment the day becomes
                earned.

                DIRECTLY UNDER THE CHAI PILL ABOVE, deliberately. That pill was
                the only thing that ever told anyone the day's Chai had been
                granted, and it read the `chaiEarned` the attempts path used to
                send. That grant moved into this box, so the pill will be absent
                on a normal session now; it is kept because it renders whatever
                the server sends and the server may send one again, and the box
                takes over the job it was doing.

                It renders NOTHING until the query answers with a box, so a
                session that did not earn the day shows no empty slot.
                Mobile twin: session-daily-gift in practice/[id].tsx. */}
            <div className="mx-auto mt-4 w-full max-w-sm">
              <DailyGiftCard testId="session-daily-gift" />
            </div>

            {/* XP breakdown — collapsed by default */}
            {orderedSummaryEntries.some(r => r.xpBreakdown) && (
              <div className="mt-3 text-left">
                <button
                  onClick={() => setXpExpanded(x => !x)}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  aria-expanded={xpExpanded}
                >
                  {xpExpanded ? "▲" : "▼"} XP breakdown
                </button>
                <AnimatePresence>
                  {xpExpanded && (
                    <motion.ul
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="mt-1 space-y-0.5 overflow-hidden"
                    >
                      {orderedSummaryEntries.map((r, i) => (
                        <li key={r.phraseId} className="text-xs text-muted-foreground flex justify-between gap-2">
                          <span className="truncate">{r.english}</span>
                          <span className="font-semibold whitespace-nowrap">
                            {r.xpBreakdown ?? (r.xpAwarded > 0 ? `+${r.xpAwarded} XP` : "0 XP")}
                          </span>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── Per-phrase band indicators ──────────────────────────── */}
            {orderedSummaryEntries.length > 0 && (
              <div className="mt-4 w-full">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Per-phrase results
                </p>
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
                  {orderedSummaryEntries.map((r, i) => (
                    <button
                      key={r.phraseId}
                      onClick={() => setSummarySelectedIdx(summarySelectedIdx === i ? null : i)}
                      className="flex flex-col items-center gap-0.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Phrase ${i + 1}: ${r.english}, ${r.band}`}
                      aria-expanded={summarySelectedIdx === i}
                    >
                      <span
                        className="block w-5 h-5 rounded-full mx-auto border-2 border-white/60 shadow-sm"
                        style={{ background: bandCss(r.band) }}
                        aria-hidden="true"
                      />
                      <span className="text-[9px] text-muted-foreground max-w-[56px] truncate leading-tight">
                        {r.english}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Expandable feedback panel for the selected phrase */}
                <AnimatePresence>
                  {summarySelectedIdx !== null && orderedSummaryEntries[summarySelectedIdx] && (
                    <motion.div
                      key={summarySelectedIdx}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      className="mt-3 rounded-xl border border-card-border bg-muted/50 p-3 text-left space-y-1"
                    >
                      <p className="font-bold text-sm text-foreground">
                        {orderedSummaryEntries[summarySelectedIdx].english}
                      </p>
                      {orderedSummaryEntries[summarySelectedIdx].feedback && (
                        <p className="text-sm text-muted-foreground">
                          {orderedSummaryEntries[summarySelectedIdx].feedback}
                        </p>
                      )}
                      {orderedSummaryEntries[summarySelectedIdx].tip && (
                        <p className="text-xs text-muted-foreground/75 italic">
                          {orderedSummaryEntries[summarySelectedIdx].tip}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>
        
        {/* Polish card: flag-gated, shown when POLISH_ENABLED is on and any
            phrase scored below Great this session. A single "Skip" button
            dismisses with zero friction; "Re-run" navigates to a filtered
            practice session. Never blocks the existing "Done" flow. */}
        {polishEnabled && !polishDismissed && (() => {
          const subTopPhrases = orderedSummaryEntries.filter(
            r => r.band !== "perfect" && r.band !== "great",
          );
          if (subTopPhrases.length === 0) return null;
          const polishHref = isGroup
            ? `/practice/${id}?group=${groupId}&phraseIds=${subTopPhrases.map(r => r.phraseId).join(",")}`
            : null;
          return (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.2 }}
              className="w-full rounded-2xl border border-border bg-card p-4 mb-3 text-left"
            >
              <p className="text-sm font-black text-foreground mb-1">Polish your phrases</p>
              <p className="text-xs text-muted-foreground mb-3">
                {subTopPhrases.length} phrase{subTopPhrases.length !== 1 ? "s" : ""} scored below Great -- run them again to lock in the improvement.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {subTopPhrases.map(r => (
                  <span key={r.phraseId} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium">
                    <span className="w-2 h-2 rounded-full" style={{ background: bandCss(r.band) }} aria-hidden />
                    {r.english}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                {polishHref && (
                  <Link
                    href={polishHref}
                    className="flex-1 rounded-xl bg-primary py-2.5 text-center text-sm font-black text-primary-foreground active:scale-[0.97] transition-transform"
                  >
                    Re-run these phrases
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setPolishDismissed(true)}
                  className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip
                </button>
              </div>
            </motion.div>
          );
        })()}

        {isGroup && !isTestout && dueKnown ? (
          // The lightbox's door, or straight to the map when nothing is due.
          <button
            type="button"
            data-testid="session-done"
            onClick={() => {
              if (dueCount > 0) setFlashbackOpen(true);
              else navigate("/journey");
            }}
            className="w-full bg-primary text-primary-foreground font-black text-xl py-5 rounded-2xl flex items-center justify-center shadow-[0_8px_0_hsl(var(--primary-shadow))] active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
          >
            Done
          </button>
        ) : (
          <Link
            href={doneHref}
            data-testid="session-done"
            className="w-full bg-primary text-primary-foreground font-black text-xl py-5 rounded-2xl flex items-center justify-center shadow-[0_8px_0_hsl(var(--primary-shadow))] active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
          >
            {isFlashback ? "On to the next stop" : "Done"}
          </Link>
        )}
        <FlashbackLightbox
          open={flashbackOpen}
          onEnter={() => {
            setFlashbackOpen(false);
            navigate(`/flashback?next=${encodeURIComponent("/journey")}`);
          }}
          onSkip={() => {
            setFlashbackOpen(false);
            navigate("/journey");
          }}
        />
      </div>
    );
  }

  // Bolo reacts to the moment: listening/thinking while the coach speaks or the
  // learner records, encouraging on their turn, and celebrating (or gently
  // cheering back up) once a band lands.
  const mascotPose: MascotPose =
    state === "result" && result
      ? isFullCreditBand(result.band)
        ? "cheer"
        : isPassingBand(result.band)
          ? "thumbsup"
          : result.band === "nocatch"
            ? "thinking" // system miss, not learner error (Spec 1 rule 16)
            : "tryagain"
      : state === "error"
        ? "tryagain"
        : state === "compare"
          ? "cheer" // ear-training always counts — celebrate the effort
          : state === "playing_coach" || state === "recording" || state === "evaluating"
            ? "thinking"
            : "thumbsup";

  // The belly zone is interactive whenever a hold can meaningfully record —
  // including DURING example playback and while a result (with its spoken
  // feedback) is showing: barge-in stops the audio and records on the same
  // gesture (Task 907). Only evaluating/error/summary keep it unmounted.
  const bellyActive =
    state === "idle" ||
    state === "recording" ||
    state === "playing_coach" ||
    state === "result";

  // ── Result-actions row state (Task #1040) ────────────────────────────────
  // "Finish" would lie while there is another stop ahead — the tail of the
  // base list, or a zero-XP phrase still queued for its encore.
  const hasNextStop = Boolean(
    phrases &&
      ((!inEncore && currentIndex < phrases.length - 1) ||
        (!isTestout && encoreQueue.length > 0)),
  );
  const advanceLabel = hasNextStop ? "Next phrase" : "Finish";
  const phraseAttempts = phraseTallies[phrase?.id ?? -1]?.attempts ?? 0;
  // Test-out is one take per phrase (a server-side batch rule), so the retry
  // is inactive there; the error card's retry is the recovery action.
  const retrySlotActive = state === "error" || !isTestout;
  // The error card has no band and no token: there is nothing to advance
  // from. Test-out is ungated for the same reason its retry is off.
  const advanceSlotActive =
    state !== "error" && (isTestout || isAdvanceUnlocked(result?.band, phraseAttempts));
  // Emphasis only: the recovery/retry side leads until the take is good.
  const retrySlotPrimary =
    retrySlotActive && (state === "error" || !result || !isGoodOrBetterBand(result.band));

  return (
    <div className="app-surface min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      <Confetti active={showConfetti} />
      {xpArc && (
        <XpArc
          key={xpArc.key}
          amount={xpArc.amount}
          from={xpArc.from}
          onDone={() => setXpArc(null)}
        />
      )}
      <BadgeUnlock badges={newBadges} onDismiss={() => setNewBadges([])} />
      <FirstWordPrimer open={firstWordPrimerOpen} onDismiss={dismissFirstWordPrimer} />
      
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {/* flex-wrap + the grouped pill row below: at large accessibility text
          sizes the pills outgrow one 320px row; the group then wraps to a
          second header row as a unit instead of clipping off-screen under the
          page wrapper's overflow-hidden. Normal text stays on one row. */}
      <header className="mx-auto w-full max-w-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 sm:gap-3 shrink-0">
        <Link href={backHref} className="text-muted-foreground hover:text-foreground shrink-0">
          <ArrowLeft className="w-7 h-7" />
        </Link>
        {isFlashback ? (
          <Link
            href={flashbackNext}
            data-testid="flashback-skip"
            className="shrink-0 rounded-full border border-border px-3 py-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Skip
          </Link>
        ) : null}
        <div className="flex-1">
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-secondary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${((currentIndex) / phrases.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
        <div className="font-bold text-sm text-muted-foreground shrink-0">{currentIndex + 1}/{phrases.length}</div>
        {/* A returning zero-XP phrase: the counter alone would look like the
            session went backwards, so name what is happening. */}
        {inEncore && (
          <div
            data-testid="encore-chip"
            className="shrink-0 rounded-full bg-secondary/15 px-2 py-0.5 text-[11px] font-bold text-secondary"
          >
            Another go
          </div>
        )}
        {/* Daily XP counter — compact session variant */}
        <XpCounter variant="session" />
        {/* Language chip + audio settings gear (Task 1044).
            The three audio controls used to sit here as loose pills; they now
            live behind the gear so the row has room, and the chip finally
            names the language being practised — nothing on a lesson screen
            said so before. */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
        {/* Display-only language code. Deliberately inert: no handler, no
            button role, not focusable — the language cannot be changed
            mid-lesson. The slot is fixed at three characters wide so the row
            never reflows between a two-letter code (HI) and a three-letter
            one (SAT); codes are NEVER truncated, since "sat" clipped to "SA"
            collides with Sanskrit. */}
        <span
          data-testid="lesson-language-chip"
          className="shrink-0 w-9 h-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground text-[11px] font-bold uppercase tracking-wide leading-none"
        >
          {activeLang.toUpperCase()}
          <span className="sr-only">, practising {languageName}</span>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Audio settings"
              title="Audio settings"
              data-testid="practice-settings-trigger"
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-secondary-foreground"
            >
              <Settings className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          {/* Each item keeps its own handler, preference write and
              confirmation toast exactly as it had on the pill. The pill fill
              no longer communicates state, so every item spells it out: a
              checkmark (menuitemcheckbox) plus an explicit On/Off word. */}
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Audio</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={!silentMode}
              onCheckedChange={() => {
                const next = !silentMode;
                changeSilentMode(next);
                // Toggles confirm themselves through the same MilestoneToast
                // the session milestones use, so a tap is never silent
                // (Task 1038).
                showToast(
                  next
                    ? TOGGLE_TOAST.phraseAudioOff
                    : TOGGLE_TOAST.phraseAudioOn,
                );
              }}
            >
              <span className="flex-1">Autoplay phrase</span>
              <span className="ml-auto text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {silentMode ? "Off" : "On"}
              </span>
            </DropdownMenuCheckboxItem>
            {/* Spoken Feedback — the same preference the mobile result-card
                mute writes; kept here for cross-platform parity. */}
            <DropdownMenuCheckboxItem
              checked={spokenFeedback}
              onCheckedChange={() => {
                const next = !spokenFeedback;
                changeSpokenFeedback(next);
                showToast(
                  next
                    ? TOGGLE_TOAST.feedbackAloudOn
                    : TOGGLE_TOAST.feedbackAloudOff,
                );
              }}
            >
              <span className="flex-1">Spoken feedback</span>
              <span className="ml-auto text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {spokenFeedback ? "On" : "Off"}
              </span>
            </DropdownMenuCheckboxItem>
            {/* Meaning: the English meaning spoken right after each phrase
                clip. Read fresh at play time, so a flip applies to the very
                next play (Task 1003). Disabled while the coach voice is off,
                exactly as the pill was. */}
            <DropdownMenuCheckboxItem
              checked={meaningAudio}
              disabled={!coachVoiceRef.current}
              onCheckedChange={() => {
                const next = !meaningAudio;
                changeMeaningAudio(next);
                showToast(
                  next
                    ? TOGGLE_TOAST.meaningAloudOn
                    : TOGGLE_TOAST.meaningAloudOff,
                );
              }}
            >
              <span className="flex-1">Speak meaning</span>
              <span className="ml-auto text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {meaningAudio ? "On" : "Off"}
              </span>
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 flex flex-col px-4 pb-4 min-h-0">

        {/* ── Express test-out banner: one quiet line so the learner knows the
            rules of the run (one take per phrase, pass mark). ─────────────── */}
        {isTestout && (
          <div
            data-testid="testout-banner"
            className="mb-2 shrink-0 rounded-xl border border-border bg-muted/40 px-3 py-2 text-center text-xs font-bold text-muted-foreground"
          >
            Express check: one take per phrase. Say {testoutRequiredCorrect} of {testoutSampleSize} well to skip this stop.
          </div>
        )}

        {/* ── TEMPORARY capture mode: persistent protocol banner. (The
               summary screen early-returns above, so this renders for every
               in-session state.) ───────────────────────────────────────────── */}
        {isCapture && (
          <div
            data-testid="capture-banner"
            className="mb-2 shrink-0 rounded-2xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-center"
          >
            <p className="text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Capture mode — attempt {captureStep + 1} of 4
            </p>
            <p className="mt-0.5 text-sm font-black text-foreground leading-snug">
              {CAPTURE_STEPS[captureStep]!.title}
            </p>
            {CAPTURE_STEPS[captureStep]!.note && (
              <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                {CAPTURE_STEPS[captureStep]!.note}
              </p>
            )}
            {lastCapture && state === "idle" && (
              <button
                onClick={handleCaptureRedo}
                disabled={discardLastCaptureMutation.isPending}
                data-testid="button-capture-redo"
                className="mt-1 text-xs font-bold text-amber-700 dark:text-amber-300 underline underline-offset-2 disabled:opacity-50"
              >
                Redo previous attempt
              </button>
            )}
          </div>
        )}

        {/* ── Approximate-feedback notice (degraded languages, spec 1) ────── */}
        <AnimatePresence>
          {showApproxNotice && (
            <motion.div
              key="approx-notice"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={springs.snappy}
              role="status"
              className="shrink-0 mb-2 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3"
            >
              <p className="flex-1 text-sm font-medium text-amber-900 dark:text-amber-200 leading-snug">
                Heads up: speech recognition is still learning {languageName}, so feedback may be approximate.
              </p>
              <button
                onClick={dismissApproxNotice}
                aria-label="Dismiss notice"
                className="shrink-0 text-xs font-black text-amber-700 dark:text-amber-300 rounded-lg px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
              >
                Got it
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Ear-training explainer (unsupported languages, spec 2) ──────── */}
        {isUnsupported && (
          <div
            role="status"
            className="shrink-0 mb-2 rounded-2xl border border-secondary/30 bg-secondary/10 px-4 py-3"
          >
            <p className="text-sm font-medium text-foreground leading-snug">
              Speech recognition can't hear {languageName} reliably yet, so this is ear-training practice: listen, record, and compare. It still counts!
            </p>
          </div>
        )}

        {/* ── Phrase card ─────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={phrase?.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={springs.snappy}
            className="shrink-0 bg-card rounded-2xl border border-card-border shadow-sm overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Play-again button */}
              <button
                onClick={playAgain}
                disabled={state === "recording" || state === "evaluating"}
                aria-label="Hear the phrase again"
                className={cn(
                  "shrink-0 w-11 h-11 bg-secondary text-white rounded-full flex items-center justify-center shadow-md active:scale-95 disabled:opacity-40 transition-all",
                  coachAudioFailed === "play" && "ring-4 ring-primary/50 animate-pulse",
                )}
              >
                <Volume2 className="w-5 h-5" />
              </button>

              {/* EACH LINE SWELLS WHILE IT IS THE ONE BEING SPOKEN (build 29).
                  The coach says the phrase and then its meaning, and the card
                  gave no signal which was playing, so a learner had to work it
                  out from the sound alone. This is dual coding: eye and ear
                  land on the same thing at the same moment.

                  A TRANSFORM, NEVER A FONT SIZE. Growing the type relayouts the
                  card and shoves everything under it on every play; scale costs
                  no layout. `origin-left` so a long phrase grows away from the
                  play button rather than into it.

                  motion-reduce:transform-none respects the system setting, and
                  a learner who takes that path loses nothing, because the audio
                  still says both halves. Mobile twin: components/SpokenLine.tsx,
                  changed in the same commit. */}
              <div className="flex-1 min-w-0">
                <h2
                  className={cn(
                    "text-3xl font-extrabold text-foreground leading-tight tracking-tight truncate",
                    "origin-left transition-transform duration-200 ease-out motion-reduce:transform-none",
                    speakingSegment === 'phrase' ? "scale-[1.06]" : "scale-100",
                  )}
                  style={native.style}
                  dir={native.dir}
                >
                  {phrase?.nativeScript}
                </h2>
                <p className="text-primary font-bold text-base leading-tight">{phrase?.romanized}</p>
                <p
                  className={cn(
                    "text-muted-foreground text-sm leading-tight",
                    "origin-left transition-transform duration-200 ease-out motion-reduce:transform-none",
                    speakingSegment === 'meaning' ? "scale-[1.06]" : "scale-100",
                  )}
                >
                  {phrase?.english}
                </p>
              </div>

              {/* Spec B2: quiet flag affordance — must not compete with play */}
              <PhraseReportButton phraseId={phrase?.id} />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Chunk 1 item 4c: one-time iOS silent-switch hint (copy from the
            helpers module's notes). Dismiss marks it shown for this device. */}
        {showIosHint && (
          <div className="shrink-0 mt-2 bg-card rounded-2xl p-3 border border-card-border shadow-sm flex items-start gap-3" role="status">
            <Volume2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 text-left">
              <p className="text-sm font-black text-foreground">Hearing nothing?</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Check the silent switch on the side of your iPhone and raise the volume. Bolo has things to say.
              </p>
            </div>
            <button
              onClick={() => { markIosAudioHintShown(); setShowIosHint(false); }}
              className="shrink-0 text-sm font-bold text-primary px-2 py-1 rounded-lg active:scale-95 transition-all"
            >
              Got it
            </button>
          </div>
        )}

        {/* Chunk 1 item 4a: coach audio failure surfaces (deck COACH AUDIO
            FAILED TO PLAY). Autoplay rejection gets the lighter treatment: the
            speaker button pulses and this caption points at it. */}
        {coachAudioFailed === "synthesis" && (
          <div className="shrink-0 mt-2 bg-card rounded-2xl p-3 border border-card-border shadow-sm text-center" role="alert">
            <p className="text-sm font-black text-foreground">The announcer's mic cut out</p>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">The phrase audio didn't play. Tap to hear it again.</p>
            <button
              onClick={playAgain}
              className="mt-2 inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold text-sm px-4 py-2 rounded-xl active:scale-95 transition-all"
            >
              <Volume2 className="w-4 h-4" /> Play phrase
            </button>
          </div>
        )}
        {coachAudioFailed === "play" && (
          <p className="shrink-0 mt-1 text-xs text-muted-foreground font-medium text-center" role="status">
            The phrase audio didn't play. Tap to hear it again.
          </p>
        )}

        {/* ── Parrot zone ──────────────────────────────────────────────────── */}
        {/*
          The parrot takes all remaining vertical space. The belly hit zone is
          an absolutely-positioned transparent button on the lower-center of the
          image area so the interaction feels spatially tied to the character.
        */}
        {/* When the result/error panel is up, the parrot gives back most of its
            space so score + feedback stay above the fold on small (390x844)
            viewports; it stays visible but compact. Measured with
            qa/practice-fold-probe.mjs: at 110px the Retry / Next row sat ~32px
            under the fold on a 390x844 phone, so the band is 72px, and shorter
            windows (landscape, small laptops) squeeze it further. */}
        <div
          className={cn(
            "relative flex flex-col items-center justify-center min-h-0 mt-1",
            state === "result" || state === "error"
              ? "flex-none h-[72px] shrink-0 [@media(max-height:720px)]:h-[52px]"
              : "flex-1",
          )}
        >
          {/* Parrot image */}
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Idle pulsing ring — gentle invitation; stops when recording starts.
                Reduced-motion: omitted entirely so it respects the global rule. */}
            {!reduceMotion && (
              <motion.div
                className="absolute inset-[8%] rounded-full pointer-events-none"
                animate={
                  state === "idle"
                    ? {
                        boxShadow: [
                          "0 0 0px 0px hsl(var(--primary) / 0)",
                          "0 0 0px 18px hsl(var(--primary) / 0.18)",
                          "0 0 0px 0px hsl(var(--primary) / 0)",
                        ],
                        opacity: [0.4, 1, 0.4],
                      }
                    : { boxShadow: "0 0 0px 0px hsl(var(--primary) / 0)", opacity: 0 }
                }
                transition={
                  state === "idle"
                    ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.25 }
                }
                aria-hidden="true"
              />
            )}
            {/* Recording glow ring — brighter, faster */}
            <motion.div
              className="absolute inset-[10%] rounded-full pointer-events-none"
              animate={
                state === "recording"
                  ? {
                      boxShadow: [
                        "0 0 0px 0px hsl(var(--accent) / 0)",
                        "0 0 0px 24px hsl(var(--accent) / 0.35)",
                        "0 0 0px 0px hsl(var(--accent) / 0)",
                      ],
                      opacity: [0.6, 1, 0.6],
                    }
                  : { boxShadow: "0 0 0px 0px hsl(var(--accent) / 0)", opacity: 0 }
              }
              transition={
                state === "recording"
                  ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.3 }
              }
              aria-hidden="true"
            />

            {/* Pose changes morph the rigged mascot's body parts in place —
                no keyed remount/hard swap anymore (the rig springs between
                per-part pose targets). The evaluating dim is gone with the
                spinner it used to sit behind: Bolo himself now plays that
                state, so he stays at full strength while it runs. */}
            {/* HER BOX MUST BE HER OWN SHAPE, and in the result band it was
                not. Owner's screenshot, build 29: Bolo sitting on top of the
                phrase card instead of in her band.

                <Mascot fill> pulls the sprite up by MASCOT_SKY_PCT, which is
                the sky as a fraction of the box WIDTH, because that is the
                only thing CSS resolves a margin percentage against. That is
                exact while the painted bird is as wide as her box. In the
                result state this zone becomes a DEFINITE h-[72px], so a
                w-full box is 398x72 here, `object-contain` letterboxes her
                down to 61x72, and the pull-up carries on being computed off
                the full 398. Measured in a browser: 68px of pull inside a
                72px band, which is why she cleared the band entirely and
                landed on the card above it.

                Giving the band a box with the frame's 1024:1200 aspect makes
                painted and element the same rectangle again, so the component's
                own arithmetic is exact and nothing about Mascot changes. Only
                the compact branch: the idle zone is flex-1 with an INDEFINITE
                height, where h-full falls back to the image's own size and the
                existing w-full is already correct. An aspect box there would
                have nothing to resolve against and would collapse.

                Pinned by qa/practice-band-fit.mjs. jsdom cannot see this: it
                has no layout, which is why the web suite passed throughout. */}
            <div
              className={cn(
                "h-full",
                state === "result" || state === "error"
                  ? "aspect-[1024/1200] mx-auto"
                  : "w-full",
              )}
            >
              {/* Spec D2: mascot "hears" the learner — scale rides the live
                    amplitude MotionValue (1.0–1.08) while recording. The rAF
                    loop leaves amplitudeMv at 0 under reduced motion or when
                    not recording, so this settles to scale 1 in those cases. */}
                <motion.div className="w-full h-full" style={{ scale: mascotScale }}>
                  {/* Pressed scale rides a plain CSS transform on an inner div so
                      it composes with (never fights) the amplitude MotionValue. */}
                  <div
                    className={cn(
                      "w-full h-full transition-transform duration-100",
                      state === "recording" && "scale-[0.97]",
                    )}
                  >
                    <Mascot
                      pose={mascotPose}
                      fill
                      idle={state === "result" && result?.passed ? "cheer" : "float"}
                      // Evaluating state: he zooms out small and spins while
                      // the score comes back, then zooms back in. Replaced
                      // the throbber.
                      activity={state === "evaluating" ? "evaluating" : null}
                    />
                  </div>
                </motion.div>
            </div>

            {/* One-time first-practice hint — floats above the mascot belly,
                auto-fades after 3.5s, then never shown again. Motion-safe:
                the outer div is static; only the framer child animates. */}
            <AnimatePresence>
              {(showHint || readyHint) && state === "idle" && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.94 }}
                  transition={springs.snappy}
                  className="pointer-events-none absolute top-[12%] left-1/2 -translate-x-1/2 rounded-2xl bg-primary px-4 py-2 shadow-lg"
                  aria-hidden="true"
                >
                  <p className="whitespace-nowrap text-xs font-black text-primary-foreground">
                    {readyHint ? "Mic's on. Hold Bolo while you speak 🦜" : "Hold Bolo to speak 🦜"}
                  </p>
                  {/* speech-bubble tail */}
                  <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 h-3 w-3 rotate-45 bg-primary" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hold-to-speak hit zone — covers the FULL rendered bird (head to
                feet), not just the belly. The container's box tracks the
                in-flow mascot img exactly (both are width-100% with the height
                driven by the img), so inset-0 == the bird's visual bounds.
                Task 882 addition: a belly-only inner box left the head dead to
                touches. Keep this a plain rect — border-radius also clips
                pointer hit-testing. */}
            {bellyActive && (
              <div className="absolute inset-0">
                <button
                  onPointerDown={handleBellyPointerDown}
                  disabled={!bellyActive}
                  aria-label={state === "recording" ? "Release to submit" : "Hold to speak"}
                  style={{ touchAction: "none" }}
                  className="w-full h-full bg-transparent cursor-pointer select-none focus:outline-none"
                />
              </div>
            )}

            {/* Manual prev/next phrase navigation (Task #973). Free, never
                attempt-gated. Visually secondary and absolutely positioned at
                the zone edges so the record button and waveform layout never
                shift. Edge phrases disable their button; recording and
                evaluating disable both. Hidden in test-out mode (one take per
                phrase, forward only). Rendered after the belly hit zone so
                they sit above it in the stacking order. Also hidden in
                capture mode: free navigation would desync the 4-attempt
                protocol position. */}
            {!isTestout && !isCapture && (
              <>
                <button
                  type="button"
                  onClick={() => goToPhrase(currentIndex - 1)}
                  disabled={currentIndex === 0 || state === "recording" || state === "evaluating"}
                  aria-label="Go to previous phrase"
                  data-testid="button-prev-phrase"
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full border border-border bg-card/90 text-muted-foreground flex items-center justify-center shadow-sm hover:text-foreground active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => goToPhrase(currentIndex + 1)}
                  disabled={currentIndex >= phrases.length - 1 || state === "recording" || state === "evaluating"}
                  aria-label="Go to next phrase"
                  data-testid="button-next-phrase"
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full border border-border bg-card/90 text-muted-foreground flex items-center justify-center shadow-sm hover:text-foreground active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          {/* ── Milestone toast (streak / halfway / last phrase) ────────── */}
          <MilestoneToast
            message={activeToast?.message ?? null}
            toastKey={activeToast?.key ?? null}
          />

          {/* ── Instruction label (hidden while the result panel needs the
                 vertical room; it only ever shows idle/recording copy) ────── */}
          <div
            className={cn(
              "shrink-0 h-12 flex items-center justify-center mt-1",
              (state === "result" || state === "error") && "hidden",
            )}
          >
            <AnimatePresence mode="wait">
              {state === "idle" && (
                <motion.p
                  key="hold-to-speak"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={springs.snappy}
                  className="text-center text-muted-foreground font-bold uppercase tracking-widest text-xs"
                >
                  {isUnsupported ? "Hold to record" : "Hold Bolo to speak"}
                </motion.p>
              )}
              {state === "recording" && (
                <motion.div
                  key="listening"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={springs.snappy}
                  className="flex flex-col items-center gap-1.5"
                >
                  {reduceMotion ? (
                    // Reduced motion: static level indicator (Spec D2 rule 6).
                    // Segments light up with input level; nothing loops or
                    // dances, but mic-is-working feedback stays visible.
                    <div
                      className="flex items-center gap-1"
                      role="img"
                      aria-label="Microphone level"
                    >
                      {[1, 2, 3, 4, 5].map((seg) => (
                        <span
                          key={seg}
                          className={cn(
                            "w-2 h-2 rounded-full",
                            seg <= levelSegments ? "bg-accent" : "bg-muted",
                          )}
                        />
                      ))}
                    </div>
                  ) : (
                    <SoundWavePulse
                      className="text-accent"
                      size={22}
                      bars={7}
                      amplitude={amplitudeMv}
                    />
                  )}
                  {noInput ? (
                    // Zero-input state (Spec D2 rule 7): >1.5s of near-silence
                    // while recording — most likely a muted or wrong mic.
                    <p className="text-center text-muted-foreground font-bold uppercase tracking-widest text-xs">
                      We can't hear you. Check your mic
                    </p>
                  ) : (
                    <p className="text-center text-accent font-bold uppercase tracking-widest text-xs">
                      Listening…
                    </p>
                  )}
                </motion.div>
              )}
              {state === "playing_coach" && (
                <motion.p
                  key="listen-first"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={springs.snappy}
                  className="text-center text-muted-foreground font-medium text-sm"
                >
                  Listen first…
                </motion.p>
              )}
              {state === "evaluating" && (
                <motion.p
                  key="evaluating"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={springs.snappy}
                  className="text-center text-muted-foreground font-medium text-sm"
                >
                  Scoring…
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── TEMPORARY capture mode: brief save confirmation (no scores,
               no bands, no feedback — display is suppressed by design) ───── */}
        {state === "capture_saved" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.snappy}
            data-testid="capture-saved"
            className="shrink-0 mt-2 bg-card rounded-2xl p-4 border border-card-border shadow-sm text-center"
          >
            <Check className="w-8 h-8 mx-auto text-secondary" />
            <p className="mt-1 font-black text-foreground">Attempt {captureStep + 1} saved</p>
          </motion.div>
        )}

        {/* ── Compare panel: ear-training playback + advance (spec 2) ───── */}
        {state === "compare" && (
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.bouncy}
            className="shrink-0 space-y-3 mt-2"
          >
            <div className="bg-card rounded-2xl p-4 border border-card-border shadow-sm text-center">
              <p className="text-xl font-black mb-1 text-foreground">Nice work!</p>
              <p className="text-foreground font-medium text-sm leading-snug mb-3">
                Play the phrase and your recording back to back, and listen for the difference.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={playAgain}
                  className="flex-1 bg-card text-foreground border-2 border-border font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <Volume2 className="w-5 h-5" /> Hear the phrase
                </button>
                <button
                  onClick={playOwnRecording}
                  disabled={!ownRecordingUrl}
                  className="flex-1 bg-card text-foreground border-2 border-border font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40 transition-all"
                >
                  <Headphones className="w-5 h-5" /> Hear yourself
                </button>
              </div>
            </div>
            {/* Same constant two-slot row as the result card. Ear-training
                never produces a band, so the advance gate is off here. */}
            <ResultActions
              onRetry={handleRetry}
              onAdvance={handleNext}
              advanceLabel={advanceLabel}
              retryPrimary={false}
            />
          </motion.div>
        )}

        {/* ── Bottom panel: result / error / action buttons ────────────── */}
        {(state === "result" || state === "error") && (
            <motion.div
              ref={resultPanelRef}
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springs.bouncy}
              className="shrink-0 space-y-2 mt-1"
            >
              {/* Retry-band shake: 3 horizontal cycles ≈80ms, ≤8px,
                  transform-only; retriggers via key. Never fires for nocatch. */}
              <motion.div
                key={shakeKey}
                animate={
                  shakeKey > 0 && !reduceMotion && result?.band === "retry"
                    ? { x: [0, -8, 8, -8, 8, 0] }
                    : undefined
                }
                transition={{ duration: 0.32, ease: "easeInOut" }}
              >
              {state === "error" && evalError && (
                <div
                  className="bg-card rounded-2xl p-4 border border-destructive/30 shadow-sm text-center"
                  role="alert"
                >
                  <p className="text-lg font-black mb-1 text-destructive">{evalError.title}</p>
                  <p className="text-foreground font-medium text-sm leading-snug">{evalError.body}</p>
                  {evalError.tip && (
                    <p className="mt-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-xl">Tip: {evalError.tip}</p>
                  )}
                </div>
              )}

              {state === "result" && result && (
                <div className="bg-card rounded-2xl p-3 border border-card-border shadow-sm text-center">
                  <p className={cn(
                    "text-xl font-black mb-1",
                    result.band === "perfect" ? "text-success" :
                    result.band === "great" ? "text-success" :
                    result.band === "good" ? "text-primary" :
                    result.band === "almost" ? "text-primary" :
                    "text-foreground"
                  )}>
                    {/* Headline copy is deliberately NOT BAND_LABEL: the ladder
                        keeps saying Perfect/Great/Good/Almost/Try again. The bare
                        else is the nocatch arm: a system miss is not a weak
                        attempt, so it keeps the encouraging wording. */}
                    {result.band === "perfect" ? "Peak 🗿"
                      : result.band === "great" ? "Goated 🐐"
                      : result.band === "good" ? "Fire 🔥"
                      : result.band === "almost" ? "Valid 👍"
                      : result.band === "retry" ? "Mid 😐"
                      : "Good try, keep going!"}
                  </p>
                  <div className="my-2 flex justify-center">
                    {/* Five-band ladder for scored attempts; nocatch keeps its
                        neutral pill and never shows the ladder (rule 16). */}
                    {result.band === "nocatch" ? (
                      <BandPill band={result.band} />
                    ) : (
                      <BandLadder band={result.band} />
                    )}
                  </div>
                  {/* "We heard" — raw transcript plus card-style romanized
                      form (Task 907), mirroring mobile's placement and tone.
                      The romanized line hides when the server sent none
                      (uncovered script, nocatch) or when it would just repeat
                      an already-Latin transcript. */}
                  {result.transcript && (
                    <p className="text-sm text-muted-foreground mb-1">
                      We heard: "{result.transcript}"
                    </p>
                  )}
                  {result.transcript &&
                    result.transcriptRomanized &&
                    result.transcriptRomanized.toLowerCase() !== result.transcript.toLowerCase() && (
                      <p className="text-xs text-muted-foreground mb-2">
                        "{result.transcriptRomanized}"
                      </p>
                    )}
                  {/* Clamped: the coach's feedback can run to eight lines on a
                      phone, which pushed the action buttons below the fold and
                      made the learner scroll to reach "Next" after every
                      attempt. Nothing is cut — the rest is one tap away. */}
                  <ClampedText
                    text={`"${result.feedback}"`}
                    lines={4}
                    data-testid="result-feedback"
                    className="text-foreground font-medium text-sm leading-snug mb-2"
                  />
                  {result.tip && (
                    <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-xl">Tip: {result.tip}</p>
                  )}
                  {saveFailed && (
                    <p className="mt-2 text-xs text-destructive font-medium">
                      Heads up: this attempt couldn't be saved to your progress.
                    </p>
                  )}
                  {/* Zero XP: say out loud that the phrase is coming back, or
                      that it has had its three goes and is being let go. */}
                  {!isTestout && result.xpAwarded === 0 && (
                    <p data-testid="encore-note" className="mt-2 text-xs font-medium text-muted-foreground">
                      {(phraseTallies[phrase?.id ?? -1]?.zeroStrikes ?? 0) >= ZERO_XP_STRIKE_LIMIT
                        ? "That's three goes. We'll leave this one for next time."
                        : "No XP yet, so this one comes back at the end of the session."}
                    </p>
                  )}
                </div>
              )}

              {/* M1 teaser: after the last free phrase in a locked language,
                  pitch the unlock right in the result flow. */}
              {state === "result" &&
                teaserProgress &&
                teaserProgress.consumed >= teaserProgress.limit && (
                  <UpgradeCard
                    icon={<Sparkles className="h-7 w-7" />}
                    title={`That's your free taste of ${languageName}!`}
                    description={`Unlock ${languageName}, and every other language, with All-Access.`}
                    cta="Keep learning"
                    href={upgradeHref({ plan: "plus", reason: "teaser_exhausted" })}
                    className="mt-3"
                  />
                )}
              </motion.div>

              {/* Action buttons — one row, constant order, constant labels
                  (Task #1040). Error and test-out use the same two slots as
                  every other outcome, with the impermissible side dimmed,
                  rather than collapsing to a single full-width button. The
                  error card's varied recovery wording stays in the card body
                  above; the button label never moves. */}
              <ResultActions
                onRetry={state === "error" ? handleErrorRetry : handleRetry}
                onAdvance={handleNext}
                advanceLabel={advanceLabel}
                retryPrimary={retrySlotPrimary}
                retryDisabled={!retrySlotActive}
                advanceDisabled={!advanceSlotActive}
              />

              {/* Express Multiplier offer moment (Chunk 5B). Sits BELOW the
                  action row on purpose: it is an aside, and above the buttons
                  it pushed Retry/Next further down the phone screen. Shows the
                  one-line offer when the multiplier is idle and the balance
                  covers it, a small 2x XP indicator while it runs, and nothing
                  on short balances. */}
              {state === "result" && <ExpressOfferMoment surface="result" />}
            </motion.div>
          )}
      </main>
    </div>
  );
}

const SLOT_BASE =
  "flex-1 py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:pointer-events-none";

const SLOT_PRIMARY =
  "bg-primary text-primary-foreground font-black text-base shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))]";

/**
 * The advance gate (Task #1040): is moving on offered yet on this phrase?
 * Earned by scoring good or better, or by simply having had enough goes.
 * Callers apply the state exemptions from the slot table (test-out and the
 * ear-training compare stage are ungated; the error card never advances).
 */
function isAdvanceUnlocked(band: Band | null | undefined, attempts: number): boolean {
  if (band && isGoodOrBetterBand(band)) return true;
  return attempts >= ADVANCE_ATTEMPT_LIMIT;
}

const SLOT_SECONDARY =
  "bg-card text-foreground border-2 border-border font-bold text-base active:scale-95";

/** Takes on one phrase after which advancing unlocks whatever the band
 *  (owner-ruled): a dead mic or a brutally hard phrase must never strand
 *  the learner. Deliberately the same number as the strike limit, but
 *  counting a different thing. */
const ADVANCE_ATTEMPT_LIMIT = 3;

/** "Good or better" — the earned half of the advance gate. */
function isGoodOrBetterBand(band: Band): boolean {
  return isFullCreditBand(band) || band === "good";
}

function ResultActions({
  onRetry,
  onAdvance,
  advanceLabel,
  retryPrimary,
  retryDisabled = false,
  advanceDisabled = false,
}: {
  onRetry: () => void;
  onAdvance: () => void;
  advanceLabel: string;
  /** Which slot carries the filled treatment. Position never changes. */
  retryPrimary: boolean;
  retryDisabled?: boolean;
  advanceDisabled?: boolean;
}) {
  return (
    <div className="flex gap-3" data-testid="result-actions">
      <button
        type="button"
        data-testid="try-again-button"
        onClick={onRetry}
        disabled={retryDisabled}
        aria-disabled={retryDisabled || undefined}
        className={cn(SLOT_BASE, retryPrimary ? SLOT_PRIMARY : SLOT_SECONDARY)}
      >
        <RefreshCcw className="w-5 h-5" /> Try again
      </button>
      <button
        type="button"
        data-testid="advance-button"
        onClick={onAdvance}
        disabled={advanceDisabled}
        aria-disabled={advanceDisabled || undefined}
        className={cn(SLOT_BASE, retryPrimary ? SLOT_SECONDARY : SLOT_PRIMARY)}
      >
        {advanceLabel} <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );
}
