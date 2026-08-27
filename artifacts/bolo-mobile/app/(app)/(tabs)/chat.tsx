import React from 'react';
import {
  AccessibilityInfo,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useGetScenario } from '@workspace/api-client-react';
import { useAudioRecorder, useAudioRecorderState, createAudioPlayer } from 'expo-audio';
import Animated from 'react-native-reanimated';
import { appear, appearDown, appearUp } from '@/lib/entrance';
import {
  getChatTurnUrl,
  getConfiguredBaseUrl,
  getConfiguredAuthToken,
  type ChatTurnMessage,
  ApiError,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE, RAISED_PARROT_CLEARANCE } from '@/components/Screen';
import { UpgradeRequiredScreen } from '@/components/UpgradeRequiredScreen';
import { TalkingMascot, type TalkingMascotMode } from '@/components/TalkingMascot';
import { Mascot } from '@/components/Mascot';
import { ExpressOfferMoment } from '@/components/ExpressOfferMoment';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { asUpgradeRequired, paywallHrefForDenial } from '@/lib/entitlements';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticMedium, hapticHeavy } from '@/lib/haptics';
import {
  prepareRecordingSession,
  prepareRecorderInSession,
  ensureRecordingMode,
  stopAndReadRecording,
  hasRecordingPermission,
  playBase64Audio,
  playStreamingAudio,
  RECORDING_PRESET,
  SILENCE_THRESHOLD_DB,
  SILENCE_DURATION_MS,
  reportAudioSessionFailure,
  type PlaybackHandle,
} from '@/lib/audio';
import { loadChatHoldHintSeen, saveChatHoldHintSeen } from '@/lib/settings';
import { loadSoundPref } from '@/lib/soundPref';
import { loadCoachVoicePref } from '@/lib/coachVoicePref';
import { PressableScale } from '@/components/PressableScale';
import { TipCard } from '@/components/TipCard';
import { useChatRecording } from '@/components/ChatRecordingContext';
import { chatChipsFor } from '@/lib/chatChips';

// How many previous turns to include in each request for conversational context.
// 3 turns gives enough context for a natural exchange while keeping the LLM
// prompt small (fewer tokens → faster response).
const HISTORY_WINDOW = 3;

// Free-tier weekly cap in seconds (matches backend constant).
const FREE_WEEKLY_CAP_SECONDS = 120;

// R6 (32.1): holds shorter than this are taps, not utterances - the stop
// path aborts and discards them instead of submitting a garbage clip.
const MIN_RECORDING_MS = 300;

// Parrot squawk SFX assets, indexed by the server's squawkVariant.
const SQUAWK_ASSETS = [
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../../assets/sounds/squawk_a.mp3') as number,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../../assets/sounds/squawk_b.mp3') as number,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../../assets/sounds/squawk_c.mp3') as number,
];

/**
 * Play a squawk as a fire-and-forget intro chirp — it overlaps naturally with
 * the start of Bolo's speech rather than blocking it.
 */
function playSquawk(variant: 0 | 1 | 2): void {
  // Sound effects master gate: if the user turned off "Sound effects" in
  // Account settings, skip the chirp entirely.
  void loadSoundPref().then((on) => {
    if (!on) return;
    // keepAudioSessionActive: without it, this ~0.5 s chirp finishing while the
    // streamed reply is still buffering (buffering players do not count as
    // "playing" to expo-audio's deactivation check) tears down the audio
    // session mid-turn and degrades the reply's volume and quality. See
    // lib/audio.ts playStreamingAudio for the full seam description.
    const sfxPlayer = createAudioPlayer(SQUAWK_ASSETS[variant], {
      keepAudioSessionActive: true,
    });
    const sub = sfxPlayer.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) {
        try { sub.remove(); } catch {}
        try { sfxPlayer.remove(); } catch {}
      }
    });
    sfxPlayer.play();
  });
}

type ChatPhase =
  | 'idle'        // waiting for the learner to tap
  | 'recording'   // mic is live
  | 'processing'  // sent, waiting for the server
  | 'playing'     // reply audio is playing
  | 'error';      // something went wrong

type ChatMessage = {
  role: 'learner' | 'parrot';
  text: string;
  /** English translation of the parrot's reply, shown in small italic text below */
  englishText?: string;
  /** True while waiting for the transcript — renders as a greyed sending bubble */
  pending?: boolean;
  /**
   * Word-by-word typewriter reveal for parrot bubbles.
   * undefined = show full text (animation complete or not started).
   * A number = how many words are currently visible (animation in progress).
   */
  revealedWordCount?: number;
};

const PROCESSING_STEP_LABELS = {
  transcribing: 'Got it! 💬',
  replying: 'Crafting a reply… 🦜',
  voicing: 'Warming up my voice… 🎤',
} as const;
type ProcessingStep = keyof typeof PROCESSING_STEP_LABELS;

function getStatusLabel(
  phase: 'idle' | 'recording' | 'processing' | 'playing' | 'error',
  processingStep: ProcessingStep,
  hasMessages: boolean,
): string {
  if (phase === 'idle') return hasMessages ? 'Hold to talk again' : 'Hold Bolo to start talking';
  if (phase === 'recording') return 'Listening… release to send';
  if (phase === 'processing') return PROCESSING_STEP_LABELS[processingStep];
  if (phase === 'playing') return 'Bolo is speaking…';
  if (phase === 'error') return 'Something went wrong — hold to retry';
  return '';
}

/** Format seconds as "1:23" */
function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function ChatScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeLang, languages } = useLanguage();
  const { isPlus, isOneLanguage, isLanguageAllowed } = useEntitlements();

  // Per-session language state — does NOT change the learner's global active language.
  const [chatLang, setChatLang] = React.useState<string>(activeLang);

  // Derived from the language list for display.
  const chatLanguage = React.useMemo(
    () => languages.find((l) => l.code === chatLang),
    [languages, chatLang],
  );

  // Language picker bottom-sheet state.
  const [pickerOpen, setPickerOpen] = React.useState(false);

  // ── Scenario (zone capstone) mode ────────────────────────────────────────
  // Mobile twin of web's gujarati-coach/src/pages/chat.tsx. Web reads
  // ?scenario=<id> off the URL; expo-router gives us the same thing as a route
  // param, so /(app)/(tabs)/chat?scenario=greetings-manners is the same entry
  // point. Absent param means ordinary free chat, exactly as before.
  //
  // The server does all the work: it injects the framing and steering, gates
  // zone 2+ on Plus, detects which target phrases were spoken, and writes the
  // zone_conversation_stamp on majority completion. This screen only has to
  // pass the id along and render what comes back.
  const { scenario: scenarioParam } = useLocalSearchParams<{ scenario?: string }>();
  const scenarioId = typeof scenarioParam === 'string' && scenarioParam ? scenarioParam : undefined;
  // The chips are the learner's OWN language content, so the scene is fetched
  // per language: the same capstone in Tamil and in Gujarati is two different
  // sets of phrases. chatLang, not activeLang, because the chat language is a
  // per-session choice on this screen.
  const scenarioQuery = useGetScenario(
    scenarioId ?? '',
    { lang: chatLang },
    {
      query: {
        enabled: !!scenarioId && !!chatLang,
        queryKey: ['scenario', scenarioId ?? '', chatLang],
      },
    },
  );
  const scenario = scenarioQuery.data;

  // Which target phrases the server has confirmed the learner used, across the
  // whole session rather than per turn, and whether the scene is finished.
  const [usedPhrases, setUsedPhrases] = React.useState<Set<string>>(new Set());
  const [sceneDone, setSceneDone] = React.useState(false);
  // Chai the server actually granted for passing the capstone. 0 on a replay,
  // because the grant is idempotent per zone; the overlay shows the chip only
  // when something was really paid.
  const [capstoneChai, setCapstoneChai] = React.useState(0);

  /**
   * Folds one turn's scenario payload into session state. Both the voice and
   * the text path call this, so the two can never drift: a phrase counted on
   * one and dropped on the other is exactly the twin defect this app keeps
   * producing. Fields are optional on the response and absent entirely when no
   * scenarioId was sent, so a plain chat turn is a no-op here.
   */
  const applyScenarioTurn = React.useCallback(
    (
      phrasesUsed: string[] | undefined,
      turnSceneDone: boolean | undefined,
      tokensEarned: number | undefined,
    ) => {
      if (phrasesUsed && phrasesUsed.length > 0) {
        setUsedPhrases((prev) => new Set([...prev, ...phrasesUsed]));
      }
      if (turnSceneDone) setSceneDone(true);
      if (tokensEarned && tokensEarned > 0) setCapstoneChai(tokensEarned);
    },
    [],
  );

  // Conversation history shown in the UI (and sent to the server as context)
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [phase, setPhase] = React.useState<ChatPhase>('idle');
  const [processingStep, setProcessingStep] = React.useState<ProcessingStep>('transcribing');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Remaining weekly seconds (null = unlimited; undefined = not yet fetched)
  const [secondsRemaining, setSecondsRemaining] = React.useState<
    number | null | undefined
  >(undefined);

  // Text input value for the keyboard-based fallback.
  const [textInputValue, setTextInputValue] = React.useState<string>('');

  // If the language is unlocked after a purchase, the screen re-evaluates.
  const [upgradeRequired, setUpgradeRequired] = React.useState(false);

  // First-time hold-to-speak hint — shown until the learner presses or it
  // auto-dismisses. `null` means "not yet loaded from storage".
  const [holdHintSeen, setHoldHintSeen] = React.useState<boolean | null>(null);
  const holdHintTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    loadChatHoldHintSeen().then((seen) => {
      if (!cancelled) setHoldHintSeen(seen);
    });
    return () => { cancelled = true; };
  }, []);
  // Auto-dismiss the hint after 10 s so it never blocks the screen permanently.
  React.useEffect(() => {
    if (holdHintSeen === false) {
      holdHintTimerRef.current = setTimeout(() => {
        setHoldHintSeen(true);
        void saveChatHoldHintSeen();
      }, 10000);
    }
    return () => {
      if (holdHintTimerRef.current) clearTimeout(holdHintTimerRef.current);
    };
  }, [holdHintSeen]);
  const dismissHoldHint = React.useCallback(() => {
    if (holdHintSeen) return;
    if (holdHintTimerRef.current) clearTimeout(holdHintTimerRef.current);
    setHoldHintSeen(true);
    void saveChatHoldHintSeen();
  }, [holdHintSeen]);

  // Audio
  const recorder = useAudioRecorder(RECORDING_PRESET);
  const recorderState = useAudioRecorderState(recorder, 250);
  const playbackRef = React.useRef<PlaybackHandle | null>(null);
  const wordRevealTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionReadyRef = React.useRef(false);
  const recorderPreparedRef = React.useRef(false);
  const preparePromiseRef = React.useRef<Promise<boolean> | null>(null);
  const finishingRef = React.useRef(false);
  // Guards handleSendText against concurrent invocations (e.g. simultaneous
  // Return key + Send button tap). Separate from finishingRef so voice and
  // text turns don't interfere with each other's guard state.
  const textSendingRef = React.useRef(false);
  // True once the early `replyText` SSE event has shown Bolo's bubble for the
  // current turn — the word-reveal animation is skipped in that case, since
  // the learner has already been reading the full text during synthesis.
  const earlyReplyShownRef = React.useRef(false);
  // Incremented each time a new turn starts. handleStopRecording captures its
  // own snapshot and only applies the result if the counter still matches —
  // prevents a stale older response from overwriting a newer one when the user
  // cancels mid-flight and immediately starts again.
  const activeTurnRef = React.useRef(0);

  // Pre-fetched first-turn greeting for the current chat language.
  type GreetingData = {
    text: string;
    english: string;
    audioBase64: string;
    format: string;
    squawkVariant: 0 | 1 | 2 | null;
  };
  const greetingRef = React.useRef<GreetingData | null>(null);

  // Tracks whether the learner's finger is currently held down on the mascot.
  // Used to resolve the startup race: if pressOut fires before the async
  // recorder startup completes (phase is still idle), handleStartRecording
  // reads this ref after startup and immediately stops itself.
  const isPressingRef = React.useRef(false);

  // Tracks when the current recording started so we can send the duration to the
  // server, letting it skip the WAV-conversion step used solely for timing.
  const recordingStartTimeRef = React.useRef(0);

  // Silence auto-stop
  const silenceSinceRef = React.useRef<number | null>(null);
  const metering = recorderState?.metering;

  const scrollRef = React.useRef<ScrollView>(null);

  /** Stop any in-progress word-reveal animation immediately. */
  const clearWordReveal = React.useCallback(() => {
    if (wordRevealTimerRef.current !== null) {
      clearInterval(wordRevealTimerRef.current);
      wordRevealTimerRef.current = null;
    }
  }, []);

  // Clear conversation history and stop any playback when the chat language changes.
  React.useEffect(() => {
    clearWordReveal();
    setMessages([]);
    setErrorMsg(null);
    setPhase('idle');
    playbackRef.current?.stop();
    playbackRef.current = null;
    setUpgradeRequired(false);
    greetingRef.current = null; // invalidate cached greeting for old language
  }, [chatLang, clearWordReveal]);

  // THE CANNED GREETING IS RETIRED, 2026-08-24. Web dropped it in the same
  // change; these two files are hand-maintained twins and leaving one of them
  // still speaking it is the drift this codebase keeps paying for.
  //
  // It existed to fill the 2-3 second STT -> LLM -> TTS wait on the first turn.
  // It never sounded like Bolo: the greeting is English in all 22 languages by
  // design, every chat REPLY is in the target language, and the same voice
  // reading English defaults to General American. Measured against production
  // first, and it was NOT a misconfiguration: greeting and reply shared
  // provider, model, voice and instruction digest exactly. An explicit
  // Indian-English instruction was tried, shipped and listened to, and it was
  // still wrong. Fighting a TTS model for an accent is a bad trade for three
  // seconds of silence, so the wait is acknowledged in text instead.
  //
  // ONLY THE PREFETCH IS REMOVED. greetingRef stays null forever, so every
  // greeting branch below is unreachable. That dead path and the
  // /openai/chat-greeting route come out separately and deliberately later:
  // iOS build 420 is in App Store review and calls that route, so deleting it
  // would break the app about to be approved.

  // ── Mic warm-up ────────────────────────────────────────────────────────────
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

  // Pre-warm on mount and after each turn (return to idle). R6 (32.1): the
  // pre-warm must never be the thing that prompts for mic permission - it
  // only runs once permission is already granted. The permission prompt
  // belongs to the first real press (handleStartRecording -> prepareRecorder).
  React.useEffect(() => {
    if (phase !== 'idle') return;
    let cancelled = false;
    void (async () => {
      if (!(await hasRecordingPermission())) return;
      if (!cancelled) void prepareRecorder();
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, prepareRecorder]);

  // Clean up playback and word-reveal on unmount
  React.useEffect(
    () => () => {
      clearWordReveal();
      playbackRef.current?.stop();
    },
    [clearWordReveal],
  );

  // Tab screens stay mounted, so unmount cleanup alone isn't enough: when the
  // learner switches to another tab mid-recording or while Bolo is speaking,
  // stop the mic and playback and settle back to idle so nothing keeps running
  // (or holds the audio session) in the background.
  // The callback must stay referentially stable across re-renders: if it
  // changed with volatile state (e.g. recorderState.isRecording), React
  // Navigation would re-register the effect mid-session and run the previous
  // cleanup while the learner is still on the tab, cutting off an active turn.
  const recorderRef = React.useRef(recorder);
  recorderRef.current = recorder;
  // Tracks whether the Chat tab is currently focused so a chat turn that is
  // still in flight when the learner switches tabs can't start playing the
  // reply audio in the background once the server responds.
  const isFocusedRef = React.useRef(true);
  // Coach voice master gate: load once at mount so greeting and reply audio
  // are skipped when the user has turned it off in Account settings.
  const coachVoiceRef = React.useRef(true);
  React.useEffect(() => {
    void loadCoachVoicePref().then((v) => { coachVoiceRef.current = v; });
  }, []);
  useFocusEffect(
    React.useCallback(
      () => {
        isFocusedRef.current = true;
        return () => {
        // Runs only on actual tab blur (or unmount).
        isFocusedRef.current = false;
        if (wordRevealTimerRef.current !== null) {
          clearInterval(wordRevealTimerRef.current);
          wordRevealTimerRef.current = null;
        }
        playbackRef.current?.stop();
        playbackRef.current = null;
        try {
          void recorderRef.current.stop();
        } catch {
          // Best-effort: the recorder may already be stopped/idle.
        }
        recorderPreparedRef.current = false;
        finishingRef.current = false;
        textSendingRef.current = false;
        isPressingRef.current = false;
        silenceSinceRef.current = null;
        setPhase('idle');
        setErrorMsg(null);
        };
      },
      [],
    ),
  );

  // ── Silence auto-stop ──────────────────────────────────────────────────────
  React.useEffect(() => {
    if (phase !== 'recording') {
      silenceSinceRef.current = null;
      return;
    }
    if (typeof metering !== 'number') return;
    const now = Date.now();
    if (metering > SILENCE_THRESHOLD_DB) {
      silenceSinceRef.current = now;
      return;
    }
    if (silenceSinceRef.current == null) {
      silenceSinceRef.current = now;
      return;
    }
    if (now - silenceSinceRef.current >= SILENCE_DURATION_MS) {
      silenceSinceRef.current = null;
      void handleStopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, metering]);

  // Scroll to bottom whenever messages change
  React.useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages]);

  // ── Web virtual-keyboard inset (tablet / hybrid browsers) ──────────────
  // KeyboardAvoidingView has no effect on web — React Native Web renders it
  // as a plain View. Instead we track how much the visual viewport shrinks
  // when the soft keyboard opens (that delta IS the keyboard height) and
  // apply it as paddingBottom on the wrapper so the input row is never
  // obscured. We also scroll the transcript down so the last message stays
  // in view after the keyboard opens.
  const [webKeyboardInset, setWebKeyboardInset] = React.useState(0);
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      // window.innerHeight − (vp height + vp vertical offset) = keyboard height.
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setWebKeyboardInset(inset);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  // Scroll transcript to bottom when the keyboard opens on web.
  React.useEffect(() => {
    if (Platform.OS !== 'web' || webKeyboardInset <= 0) return;
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [webKeyboardInset]);

  // ── Recording ──────────────────────────────────────────────────────────────
  const handleStartRecording = async () => {
    const wasProcessing = phase === 'processing';
    const wasPlaying = phase === 'playing';
    if (phase !== 'idle' && phase !== 'error' && !wasProcessing && !wasPlaying) return;

    if (wasProcessing || wasPlaying) {
      // Supersede the in-flight request by bumping the turn counter; when the
      // old response arrives its turn ID will no longer match and it is dropped.
      // The playing case needs this too: with progressive voice streaming the
      // SSE turn can still be open (audioDone and reply events pending) while
      // the reply audio is already playing. Without the bump, a late reply
      // payload from the interrupted turn would still match and flip the phase
      // back to 'playing' in the middle of the new recording.
      activeTurnRef.current++;
      finishingRef.current = false;
    }

    if (wasPlaying) {
      // Learner interrupted Bolo mid-reply — stop the audio immediately and
      // proceed straight into recording without waiting for the player to finish.
      // This handles both deliberate interruptions and stuck 'playing' states
      // (e.g. when the audio player's didJustFinish event never fires).
      playbackRef.current?.stop();
      playbackRef.current = null;
    }

    // Check weekly cap before even starting
    if (!isPlus && !isOneLanguage && secondsRemaining !== undefined && secondsRemaining !== null && secondsRemaining <= 0) {
      router.push('/(app)/paywall');
      return;
    }

    setErrorMsg(null);
    finishingRef.current = false;
    playbackRef.current?.stop();
    playbackRef.current = null;

    if (!recorderPreparedRef.current) {
      const ok = await prepareRecorder();
      if (!ok) {
        if (!sessionReadyRef.current) {
          Alert.alert(
            'Microphone needed',
            'Please allow microphone access to chat with Bolo.',
          );
        } else {
          // Same copy as the catch below, deliberately. The tag is what
          // separates them: prepare came back false without throwing.
          reportAudioSessionFailure(
            'prepare_recorder',
            new Error('prepareRecorder returned false'),
            'prepare_failed',
          );
          Alert.alert('Recording failed', 'Could not start recording. Try again.');
        }
        return;
      }
    }
    try {
      await ensureRecordingMode();
      // R6 (32.1) leg 1: positive hold confirmation. A permission grant (or
      // any of the prepare/mode awaits above resolving) must never start a
      // recording by itself. Continue only if the finger is verifiably still
      // down - otherwise (released while the prompt was open, or lifted
      // during startup) tear down without recording, matching the web
      // hold-confirmation pattern.
      if (!isPressingRef.current) {
        setPhase('idle');
        return;
      }
      // R6 leg 3: re-stop playback immediately before record(). Streamed
      // reply audio can begin playing during the awaits above; the stop at
      // the top of this function is too early to catch it. (Cast: TS
      // otherwise narrows the ref to the null it was assigned pre-await,
      // even though playback callbacks can repopulate it across awaits.)
      (playbackRef.current as PlaybackHandle | null)?.stop();
      playbackRef.current = null;
      recordingStartTimeRef.current = Date.now();
      recorder.record();
      recorderPreparedRef.current = false;
      setPhase('recording');
      hapticMedium();
      // R6 leg 2: if the release landed in the record() startup window,
      // abort and DISCARD - never stop-and-submit a clip the learner did
      // not actually hold for.
      if (!isPressingRef.current) {
        void abortRecording();
      }
    } catch (err) {
      recorderPreparedRef.current = false;
      reportAudioSessionFailure('start_record', err, 'record_threw');
      Alert.alert('Recording failed', 'Could not start recording. Try again.');
    }
  };

  /**
   * R6 (32.1): discard a live recording without submitting anything - stop
   * the recorder, drop the clip, settle back to idle. Used when the hold
   * ended before recording meaningfully started (grant-after-release, a tap
   * instead of a hold, or a release inside the record() startup window).
   */
  const abortRecording = async () => {
    finishingRef.current = true;
    try {
      await recorder.stop();
    } catch {
      // Nothing to salvage - the clip is being discarded anyway.
    }
    // The recorder is consumed by stop(); every abort caller runs after
    // record() already cleared this flag, but keep the invariant local so
    // the idle pre-warm always re-prepares before the next hold.
    recorderPreparedRef.current = false;
    finishingRef.current = false;
    setPhase('idle');
  };

  const handleStopRecording = async () => {
    if (finishingRef.current) return;
    // R6 (32.1) leg 2: minimum-duration guard. A sub-300ms hold is a tap,
    // not an utterance - abort and discard instead of submitting a garbage
    // clip. (Silence auto-stop can never fire this early, so only real taps
    // land here.)
    if (Date.now() - recordingStartTimeRef.current < MIN_RECORDING_MS) {
      void abortRecording();
      return;
    }
    finishingRef.current = true;
    // Capture this turn's ID before any await — only apply the result if the
    // ID still matches when the server responds.
    const myTurn = ++activeTurnRef.current;
    earlyReplyShownRef.current = false;

    // First-turn greeting: if the greeting is prefetched and no messages exist
    // yet, show and speak it immediately while the real API call runs in the
    // background — eliminating the 2–3 s silent wait on the first press.
    const isFirstTurn = messages.length === 0;
    const greeting = greetingRef.current;
    const useGreeting = isFirstTurn && greeting !== null;

    if (!useGreeting) {
      // Normal path: show spinner + pending learner bubble right away.
      setPhase('processing');
      setProcessingStep('transcribing');
      setMessages((prev) => [
        ...prev.filter((m) => !m.pending),
        { role: 'learner', text: '', pending: true },
      ]);
    }

    let audioBase64: string;
    try {
      audioBase64 = await stopAndReadRecording(recorder);
    } catch {
      setPhase('error');
      setErrorMsg("We couldn't read that recording. Give it another try.");
      finishingRef.current = false;
      return;
    }

    // ── First-turn greeting path ─────────────────────────────────────────────
    if (useGreeting) {
      setPhase('playing');
      earlyReplyShownRef.current = true; // skip word-reveal on real reply
      hapticHeavy();
      setMessages([{
        role: 'parrot',
        text: greeting!.text,
        englishText: greeting!.english || undefined,
      }]);

      // Coordinate greeting audio with the real reply.
      let greetingEnded = false;
      let pendingPlay: (() => void) | null = null;

      const onGreetingEnded = () => {
        if (activeTurnRef.current !== myTurn) return;
        greetingEnded = true;
        if (pendingPlay) {
          pendingPlay();
          pendingPlay = null;
        } else {
          // Real reply still in flight — show brief wait indicator.
          setPhase('processing');
          setProcessingStep('voicing');
        }
      };

      // Play squawk SFX (fire-and-forget intro chirp), then greeting audio.
      playSquawk(greeting!.squawkVariant ?? 0);

      if (!coachVoiceRef.current) {
        // Coach voice off: skip greeting audio and let reply coordination
        // proceed immediately, the same way a completed clip would.
        onGreetingEnded();
      } else {
        try {
          const gHandle = await playBase64Audio(
            greeting!.audioBase64,
            greeting!.format,
            () => {
              if (playbackRef.current === gHandle) playbackRef.current = null;
              onGreetingEnded();
            },
          );
          if (activeTurnRef.current === myTurn && isFocusedRef.current) {
            playbackRef.current = gHandle;
          } else {
            gHandle.stop();
          }
        } catch {
          onGreetingEnded(); // treat play failure as "greeting ended"
        }
      }

      // Fire the real API call in the background (no streaming audio needed).
      const baseUrl = getConfiguredBaseUrl() ?? '';
      const chatUrl = `${baseUrl}${getChatTurnUrl()}`;
      const token = await getConfiguredAuthToken();
      const clientDurationSeconds = Math.max(
        0,
        (Date.now() - recordingStartTimeRef.current) / 1000,
      );

      // Use XHR for SSE (React Native / Hermes has no readable stream support).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let gReplyPayload: any = null;
      let gTranscript = '';
      let gHttpStatus = 200;
      let gRawResponse = '';

      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', chatUrl);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.setRequestHeader('Accept', 'text/event-stream');
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

          let sseBuffer = '';
          let lastLen = 0;

          const processBuffer = () => {
            const blocks = sseBuffer.split('\n\n');
            sseBuffer = blocks.pop() ?? '';
            for (const block of blocks) {
              let evt = '';
              let data = '';
              for (const line of block.split('\n')) {
                if (line.startsWith('event: ')) evt = line.slice(7).trim();
                else if (line.startsWith('data: ')) data = line.slice(6).trim();
              }
              if (!evt || !data) continue;
              if (activeTurnRef.current !== myTurn) return;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let parsed: any;
              try { parsed = JSON.parse(data); } catch { continue; }

              if (evt === 'transcript' && !gTranscript) {
                gTranscript = (parsed.transcript as string) ?? '';
                setMessages((prev) => [
                  ...prev,
                  { role: 'learner', text: gTranscript },
                ]);
                hapticMedium();
              } else if (evt === 'reply') {
                gReplyPayload = parsed;
              }
            }
          };

          xhr.onprogress = () => {
            const newChunk = xhr.responseText.slice(lastLen);
            lastLen = xhr.responseText.length;
            sseBuffer += newChunk;
            processBuffer();
          };
          xhr.onload = () => {
            gHttpStatus = xhr.status;
            gRawResponse = xhr.responseText;
            const remaining = xhr.responseText.slice(lastLen);
            if (remaining) { sseBuffer += remaining; processBuffer(); }
            resolve();
          };
          xhr.onerror = () => reject(new TypeError('Network error'));
          xhr.ontimeout = () => reject(new TypeError('Request timed out'));
          xhr.send(JSON.stringify({ languageCode: chatLang, audioBase64, mimeType: 'audio/m4a', history: [], clientDurationSeconds, ...(scenarioId ? { scenarioId } : {}) }));
        });
      } catch {
        // Network error. The greeting can finish, but the SCREEN cannot be
        // left on processing/voicing: nothing else will move it, and the
        // pre-warm effect gates on idle, so the mic stops re-warming too.
        finishingRef.current = false;
        if (activeTurnRef.current !== myTurn || !isFocusedRef.current) return;
        setPhase('error');
        setErrorMsg(
          "Bolo flew out for a mango lassi 🥭 — check your connection and try again!",
        );
        return;
      }

      if (gHttpStatus < 200 || gHttpStatus >= 300 || !gReplyPayload) {
        // A non-2xx XHR is inspected here, never thrown, so it cannot reach
        // the recorded-turn catch below. That is why this branch has to end
        // the turn itself. 402 is the common case on a Free account with a
        // locked language, and it must land on the same surfaces the
        // recorded path uses: the paywall for a weekly cap, the in-screen
        // upgrade state otherwise. gRawResponse was assigned and unread
        // until now; it carries the reason.
        finishingRef.current = false;
        if (activeTurnRef.current !== myTurn || !isFocusedRef.current) return;

        if (gHttpStatus === 402) {
          let reason: string | null = null;
          try {
            reason = JSON.parse(gRawResponse)?.reason ?? null;
          } catch {
            // A body that will not parse is still a 402; treat it as the
            // generic upgrade case rather than swallowing the turn.
          }
          if (reason === 'weekly_cap_exceeded') {
            setSecondsRemaining(0);
            router.push('/(app)/paywall');
            setPhase('idle');
            return;
          }
          setUpgradeRequired(true);
          setPhase('idle');
          return;
        }

        setPhase('error');
        if (gHttpStatus === 502) {
          setErrorMsg("Bolo couldn't catch that 🦜 — give it another try!");
        } else if (gHttpStatus === 429) {
          setErrorMsg('Slow down a bit! Wait a moment and try again.');
        } else {
          setErrorMsg('Bolo ran into a snag — hold to try again!');
        }
        return;
      }

      if (activeTurnRef.current !== myTurn || !isFocusedRef.current) {
        finishingRef.current = false;
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gP: any = gReplyPayload;
      const gReplyText = (gP.replyText as string) ?? '';
      const gReplyEnglish = (gP.replyEnglish as string) ?? '';
      const gTranscriptEnglish = (gP.transcriptEnglish as string) ?? '';
      const gReplyAudio = (gP.replyAudioBase64 as string) ?? '';
      const gFmt = (gP.format as string) || 'mp3';
      const gSquawk = gP.squawkVariant as 0 | 1 | 2 | null;
      const gSecs = gP.secondsRemaining as number | null;

      if (gSecs !== null) setSecondsRemaining(gSecs);
      else setSecondsRemaining(null);

      const showRealReply = () => {
        if (activeTurnRef.current !== myTurn || !isFocusedRef.current) return;

        // Back-fill English gloss on the learner bubble.
        if (gTranscriptEnglish) {
          setMessages((prev) =>
            prev.map((m) =>
              m.role === 'learner' && !m.pending && !m.englishText
                ? { ...m, englishText: gTranscriptEnglish }
                : m,
            ),
          );
        }

        // Add real parrot reply bubble.
        setMessages((prev) => [
          ...prev,
          { role: 'parrot', text: gReplyText, englishText: gReplyEnglish || undefined },
        ]);
        setPhase('playing');
        hapticHeavy();

        if (gSquawk !== null && gSquawk !== undefined) {
          playSquawk(gSquawk);
        }

        if (!coachVoiceRef.current || !gReplyAudio) {
          // Coach voice off, OR THE SERVER SENT NO AUDIO: either way there is
          // nothing to play, so the turn is released here rather than handed
          // to a player that can only report finishing something it never
          // started. An empty replyAudioBase64 is the exact shape behind
          // "it says speaking forever" (2026-08-27): the reply TEXT arrives,
          // the audio does not, and the old code still went to 'playing'.
          // playBase64Audio carries a watchdog for the stalls this cannot
          // predict; this branch removes the one case that is knowable up
          // front.
          if (activeTurnRef.current === myTurn) {
            setPhase('idle');
            finishingRef.current = false;
          }
        } else {
          void playBase64Audio(gReplyAudio, gFmt, () => {
            playbackRef.current = null;
            if (activeTurnRef.current === myTurn) {
              setPhase('idle');
              finishingRef.current = false;
            }
          }).then((handle) => {
            if (activeTurnRef.current === myTurn && isFocusedRef.current) {
              playbackRef.current = handle;
            } else {
              handle.stop();
              if (activeTurnRef.current === myTurn) {
                setPhase('idle');
                finishingRef.current = false;
              }
            }
          }).catch(() => {
            playbackRef.current = null;
            if (activeTurnRef.current === myTurn) {
              setPhase('idle');
              finishingRef.current = false;
            }
          });
        }
      };

      if (greetingEnded) {
        showRealReply();
      } else {
        pendingPlay = showRealReply;
        // finishingRef will be released inside showRealReply's audio onEnded
        // when the real reply finishes playing.
      }
      return;
    }
    // ── End greeting path ────────────────────────────────────────────────────

    // Build rolling history window for the server (role labels match the API)
    const history: ChatTurnMessage[] = messages
      .slice(-HISTORY_WINDOW)
      .map((m) => ({ role: m.role === 'parrot' ? 'parrot' : 'learner', text: m.text }));

    // Client-measured recording duration so the server can skip WAV conversion.
    const clientDurationSeconds = Math.max(
      0,
      (Date.now() - recordingStartTimeRef.current) / 1000,
    );

    try {
      // Build the full URL: combine configured base URL with the API path so
      // the bearer-token fetch works the same as the generated hooks.
      const baseUrl = getConfiguredBaseUrl() ?? '';
      const chatUrl = `${baseUrl}${getChatTurnUrl()}`;
      const token = await getConfiguredAuthToken();

      // SSE streaming via XMLHttpRequest. React Native / Hermes has no
      // ReadableStream support (res.body.getReader() crashes), but XHR's
      // onprogress fires as chunks land — giving us the same progressive
      // transcript-first UX that the web gets via EventSource.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let replyPayload: any = null;
      let sseError: string | null = null;
      let httpStatus = 200;
      let rawResponseText = '';

      // ── Progressive voice streaming (native only) ────────────────────────
      // RN/Hermes has no MediaSource, so SSE `audioChunk` playback is out.
      // Instead the server exposes each turn's voice as a progressive HTTP
      // audio stream (opt-in via `X-Audio-Stream: url`): an `audioStream`
      // SSE event carries a streamId, and AVPlayer/ExoPlayer pull the chunked
      // audio/mpeg response natively — playback starts as soon as the first
      // synthesized bytes land, before the full clip exists.
      const wantsStreamingVoice = Platform.OS !== 'web';
      let streamStarted = false;       // player launch attempted this turn
      let streamFailed = false;        // player launch threw
      let streamAudioDone = false;     // server confirmed a complete stream
      let streamFinishedPlaying = false; // player reached the end of the clip
      let streamHandle: PlaybackHandle | null = null;
      let streamPromise: Promise<void> | null = null;
      let squawkPlayed = false;
      let turnSquawkVariant: 0 | 1 | 2 | null = null;

      const startStreamingVoice = async (streamId: string): Promise<void> => {
        streamStarted = true;
        try {
          if (activeTurnRef.current !== myTurn || !isFocusedRef.current) return;
          // Squawk first (fire-and-forget intro), same ordering as the
          // buffered path — it overlaps the start of speech.
          if (turnSquawkVariant !== null && !squawkPlayed) {
            squawkPlayed = true;
            playSquawk(turnSquawkVariant);
          }
          if (!coachVoiceRef.current) {
            // Coach voice off: mark stream as done so the buffered fallback
            // path below also skips audio.
            streamFinishedPlaying = true;
            if (isFocusedRef.current) setPhase('idle');
          } else {
            setPhase('playing');
            hapticHeavy();
            const handle = await playStreamingAudio(
              `${chatUrl}/audio/${streamId}`,
              token ? { Authorization: `Bearer ${token}` } : {},
              () => {
                streamFinishedPlaying = true;
                if (activeTurnRef.current !== myTurn) return;
                playbackRef.current = null;
                if (isFocusedRef.current) setPhase('idle');
              },
            );
            if (activeTurnRef.current !== myTurn || !isFocusedRef.current) {
              handle.stop();
              return;
            }
            streamHandle = handle;
            playbackRef.current = handle;
          }
        } catch {
          // Launch failed — the buffered clip from the `reply` event takes over.
          streamFailed = true;
        }
      };

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', chatUrl);
        xhr.setRequestHeader('Content-Type', 'application/json');
        // Request SSE — the server streams transcript first, then reply.
        xhr.setRequestHeader('Accept', 'text/event-stream');
        // Ask for a progressive per-turn audio URL (native players only).
        if (wantsStreamingVoice) xhr.setRequestHeader('X-Audio-Stream', 'url');
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        // Accumulate partial SSE lines across onprogress calls.
        let sseBuffer = '';

        const processBuffer = () => {
          // SSE events are separated by \n\n; keep any incomplete trailing block.
          const blocks = sseBuffer.split('\n\n');
          sseBuffer = blocks.pop() ?? '';
          for (const block of blocks) {
            let eventType = '';
            let dataStr = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
            }
            if (!eventType || !dataStr) continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let parsed: any;
            try { parsed = JSON.parse(dataStr); } catch { continue; }

            // Drop events that belong to a superseded turn.
            if (activeTurnRef.current !== myTurn || !isFocusedRef.current) return;

            if (eventType === 'transcript') {
              // Transcript arrives ~1–2 s before the reply — fill the pending
              // bubble immediately so learners see what Bolo heard right away.
              const transcriptText = (parsed.transcript as string) ?? '';
              hapticMedium();
              setMessages((prev) => {
                const updated = [...prev];
                const pendingIdx = updated.findIndex((m) => m.pending);
                const learnerBubble = { role: 'learner' as const, text: transcriptText };
                if (pendingIdx >= 0) updated[pendingIdx] = learnerBubble;
                else updated.push(learnerBubble);
                return updated;
              });
              setProcessingStep('replying');
            } else if (eventType === 'transcriptEnglish') {
              // Fires right after LLM returns, before TTS — attach the English
              // subtitle to the learner bubble immediately rather than waiting
              // for the full reply payload.
              const eng = (parsed.transcriptEnglish as string) ?? '';
              if (eng) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.role === 'learner' && !m.pending && !m.englishText
                      ? { ...m, englishText: eng }
                      : m,
                  ),
                );
              }
            } else if (eventType === 'replyText') {
              // Early reply-text event — fires as soon as the LLM returns,
              // before voice synthesis. Show Bolo's bubble immediately so
              // the learner can start reading while the audio is in flight.
              const earlyText = (parsed.replyText as string) ?? '';
              const earlyEnglish = (parsed.replyEnglish as string) ?? '';
              // Capture the squawk variant now so the streaming path can play
              // the intro chirp before the `reply` payload arrives.
              const earlySquawk = parsed.squawkVariant as 0 | 1 | 2 | null | undefined;
              if (earlySquawk === 0 || earlySquawk === 1 || earlySquawk === 2) {
                turnSquawkVariant = earlySquawk;
              }
              if (earlyText) {
                earlyReplyShownRef.current = true;
                setMessages((prev) => [
                  ...prev,
                  {
                    role: 'parrot',
                    text: earlyText,
                    englishText: earlyEnglish && earlyEnglish !== earlyText ? earlyEnglish : undefined,
                  },
                ]);
              }
              setProcessingStep('voicing');
            } else if (eventType === 'audioStream') {
              // Server minted a progressive audio stream for this turn —
              // start the native player now; first chunks land ~300 ms later.
              const streamId = (parsed.streamId as string) ?? '';
              if (streamId && wantsStreamingVoice && !streamStarted) {
                streamPromise = startStreamingVoice(streamId);
              }
            } else if (eventType === 'audioDone') {
              // Commit signal: the progressive stream carried the full clip.
              // Without it, the buffered clip from `reply` takes over.
              streamAudioDone = true;
            } else if (eventType === 'reply') {
              replyPayload = parsed;
            } else if (eventType === 'error') {
              sseError = (parsed.error as string) ?? 'Something went wrong';
            }
          }
        };

        let lastLength = 0;
        xhr.onprogress = () => {
          const newChunk = xhr.responseText.slice(lastLength);
          lastLength = xhr.responseText.length;
          sseBuffer += newChunk;
          processBuffer();
        };

        xhr.onload = () => {
          httpStatus = xhr.status;
          rawResponseText = xhr.responseText;
          // Flush any remaining buffered text (handles cases where onprogress
          // didn't fire for the final chunk, or the whole body came at once).
          const remaining = xhr.responseText.slice(lastLength);
          if (remaining) { sseBuffer += remaining; processBuffer(); }
          resolve();
        };

        xhr.onerror = () => reject(new TypeError('Network error'));
        xhr.ontimeout = () => reject(new TypeError('Request timed out'));

        xhr.send(JSON.stringify({
          languageCode: chatLang,
          audioBase64,
          mimeType: 'audio/m4a',
          history,
          clientDurationSeconds,
          // The MAIN voice path. The earlier scenario work patched the
          // greeting turn beside it and missed this one, so every spoken turn
          // after the first was sent as plain chat: no steering and no phrase
          // matching, which made a capstone unfinishable by voice.
          ...(scenarioId ? { scenarioId } : {}),
        }));
      });

      // Non-2xx: server returned a plain JSON error (e.g. 400, 402, 502).
      // These fire before SSE headers are set, so the body is plain JSON.
      if (httpStatus < 200 || httpStatus >= 300) {
        let errData: unknown = null;
        try { errData = JSON.parse(rawResponseText); } catch {}
        const fakeRes = { status: httpStatus, ok: false } as Response;
        throw new ApiError(fakeRes, errData, { method: 'POST', url: chatUrl });
      }

      if (sseError) throw new Error(sseError);
      if (!replyPayload) throw new Error('No reply received');

      // If the learner left the Chat tab while the request was in flight, drop
      // the response silently — never start reply audio on another tab.
      if (!isFocusedRef.current) {
        finishingRef.current = false;
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = replyPayload;

      const transcriptText     = (payload.transcript as string) ?? '';
      const transcriptEnglish  = (payload.transcriptEnglish as string) ?? '';
      const replyText          = (payload.replyText as string) ?? '';
      const replyEnglish       = (payload.replyEnglish as string) ?? '';
      const replyAudioBase64   = (payload.replyAudioBase64 as string) ?? '';
      const format             = (payload.format as string) || 'mp3';
      const squawkVariant      = payload.squawkVariant as 0 | 1 | 2 | null;
      const secondsRemaining   = payload.secondsRemaining as number | null;
      // Scenario: fold this turn's phrase matches and completion flag in.
      // Both absent on a plain chat turn, which makes this a no-op.
      applyScenarioTurn(
        payload.phrasesUsed as string[] | undefined,
        payload.sceneDone as boolean | undefined,
        payload.tokensEarned as number | undefined,
      );

      // A newer turn started or user left — drop stale result.
      if (activeTurnRef.current !== myTurn || !isFocusedRef.current) return;

      // The transcript bubble was already filled by the SSE transcript event.
      // Now find it (or the pending bubble if SSE didn't fire progressively)
      // and attach the englishText, then push the parrot reply.
      hapticMedium();
      const replyWords = replyText.split(/\s+/).filter(Boolean);
      const isReducedMotion = await AccessibilityInfo.isReduceMotionEnabled();
      // Skip the typewriter reveal when the early replyText bubble was already
      // shown — the learner has been reading the full text during synthesis.
      const shouldAnimate =
        !isReducedMotion && replyWords.length > 1 && !earlyReplyShownRef.current;

      setMessages((prev) => {
        const updated = [...prev];
        // Find the most recent learner bubble (set by the 'transcript' SSE
        // event). We use findLastIndex so we don't accidentally match an
        // earlier turn with the same text, and we don't filter on !englishText
        // because the 'transcriptEnglish' SSE event may have already filled it.
        const pendingIdx = updated.findLastIndex((m) => m.pending || m.role === 'learner');
        // Prefer the englishText already written by the early SSE event; fall
        // back to the payload value in case the SSE event didn't arrive first.
        const existingEnglish = pendingIdx >= 0 ? (updated[pendingIdx].englishText ?? '') : '';
        const resolvedTranscriptEnglish = existingEnglish
          || (transcriptEnglish && transcriptEnglish !== transcriptText ? transcriptEnglish : '');
        const learnerBubble = {
          role: 'learner' as const,
          text: transcriptText,
          englishText: resolvedTranscriptEnglish || undefined,
        };
        if (pendingIdx >= 0) {
          updated[pendingIdx] = learnerBubble;
        } else {
          updated.push(learnerBubble);
        }
        const parrotBubble = {
          role: 'parrot' as const,
          text: replyText,
          englishText: replyEnglish && replyEnglish !== replyText ? replyEnglish : undefined,
          // Start with 0 revealed words when animating; the interval below
          // will reveal them in sync with the audio playback.
          revealedWordCount: shouldAnimate ? 0 : undefined,
        };
        // If the early replyText event already showed Bolo's bubble, finalize
        // it in place instead of appending a duplicate.
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'parrot') {
          updated[lastIdx] = parrotBubble;
        } else {
          updated.push(parrotBubble);
        }
        return updated;
      });

      setProcessingStep('replying');
      if (secondsRemaining !== null) {
        setSecondsRemaining(secondsRemaining);
      } else {
        setSecondsRemaining(null);
      }

      // Half-beat so React renders the parrot bubble before audio starts.
      await new Promise<void>((resolve) => setTimeout(resolve, 80));

      if (activeTurnRef.current !== myTurn || !isFocusedRef.current) return;

      // Start the word-reveal animation timed to the audio duration.
      // On mobile we don't have easy access to audio duration before playback,
      // so we use a fixed estimate of 350 ms per word (typical conversational pace).
      if (shouldAnimate) {
        clearWordReveal();
        const capturedTurn = myTurn;
        const msPerWord = Math.max(120, Math.min(800, Math.round(
          (replyWords.length <= 5 ? 400 : replyWords.length <= 10 ? 350 : 300),
        )));
        let revealed = 1;

        // Show first word immediately.
        setMessages((prev) =>
          prev.map((m, idx, arr) => {
            if (m.role === 'parrot' && m.revealedWordCount !== undefined && idx === arr.length - 1) {
              return { ...m, revealedWordCount: 1 };
            }
            return m;
          }),
        );

        wordRevealTimerRef.current = setInterval(() => {
          if (activeTurnRef.current !== capturedTurn) {
            if (wordRevealTimerRef.current !== null) {
              clearInterval(wordRevealTimerRef.current);
              wordRevealTimerRef.current = null;
            }
            return;
          }
          revealed++;
          if (revealed >= replyWords.length) {
            if (wordRevealTimerRef.current !== null) {
              clearInterval(wordRevealTimerRef.current);
              wordRevealTimerRef.current = null;
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.role === 'parrot' && m.revealedWordCount !== undefined
                  ? { ...m, revealedWordCount: undefined }
                  : m,
              ),
            );
          } else {
            setMessages((prev) =>
              prev.map((m, idx, arr) => {
                if (m.role === 'parrot' && m.revealedWordCount !== undefined && idx === arr.length - 1) {
                  return { ...m, revealedWordCount: revealed };
                }
                return m;
              }),
            );
          }
        }, msPerWord);
      }

      // Settle the streaming launch (if any) before deciding how to play.
      if (streamPromise) await streamPromise;
      if (activeTurnRef.current !== myTurn || !isFocusedRef.current) return;

      // Trust the progressive stream only when the server confirmed it
      // carried the complete clip (`audioDone`) AND the player launched.
      // Otherwise stop any partial stream and play the buffered clip.
      const streamingVoiceActive =
        streamStarted && !streamFailed && streamAudioDone && streamHandle !== null;

      if (streamingVoiceActive) {
        // Voice is already playing (or just finished) via the stream.
        setPhase(streamFinishedPlaying ? 'idle' : 'playing');
      } else {
        if (streamHandle !== null) {
          // Partial/untrusted stream — cut it before the buffered replay.
          (streamHandle as PlaybackHandle).stop();
          streamHandle = null;
          playbackRef.current = null;
        }
        setPhase('playing');
        if (!streamStarted) hapticHeavy();

        // Play the squawk as a fire-and-forget intro — don't await its full
        // duration before starting Bolo's voice reply. The squawk acts as a
        // brief "I'm here!" chirp that overlaps naturally with the start of
        // speech, rather than a blocker adding 1–1.5 s of silence. Skipped if
        // the streaming path already chirped this turn.
        if (squawkVariant !== null && squawkVariant !== undefined && !squawkPlayed) {
          playSquawk(squawkVariant);
        }

        if (!coachVoiceRef.current) {
          setPhase('idle');
        } else {
          const handle = await playBase64Audio(
            replyAudioBase64,
            format,
            () => {
              playbackRef.current = null;
              setPhase('idle');
            },
          );
          playbackRef.current = handle;
        }
      }
    } catch (err) {
      // A newer turn started while this one was in flight — drop this error
      // silently so it doesn't disrupt the active turn's UI state.
      // Only release finishingRef when this is still the active turn; releasing
      // it from a stale turn would allow a third concurrent invocation to start.
      if (activeTurnRef.current !== myTurn) {
        return;
      }
      finishingRef.current = false;

      // Off-tab failure: the blur cleanup already reset the screen; don't
      // surface errors or navigate while another tab is active.
      if (!isFocusedRef.current) return;

      // 402 upgrade_required — language locked or weekly cap hit
      const upgrade = asUpgradeRequired(err);
      if (upgrade) {
        const isCap = upgrade.reason === 'weekly_cap_exceeded';
        if (isCap) {
          setSecondsRemaining(0);
          router.push('/(app)/paywall');
          setPhase('idle');
          return;
        }
        setUpgradeRequired(true);
        setPhase('idle');
        return;
      }

      setPhase('error');
      if (err instanceof ApiError) {
        if ((err as { status?: number }).status === 502) {
          setErrorMsg("Bolo couldn't catch that 🦜 — give it another try!");
        } else if ((err as { status?: number }).status === 429) {
          setErrorMsg('Slow down a bit! Wait a moment and try again.');
        } else {
          setErrorMsg('Bolo ran into a snag — hold to try again!');
        }
      } else if (err instanceof TypeError) {
        setErrorMsg("Bolo flew out for a mango lassi 🥭 — check your connection and try again!");
      } else {
        setErrorMsg('Bolo ran into a snag — hold to try again!');
      }
    }
  };

  // ── Text input send ────────────────────────────────────────────────────────
  // Sends a typed message as a chat turn, bypassing audio recording entirely.
  /**
   * `override` is what a quick chip sends. It cannot go through the input's
   * state: setTextInputValue is asynchronous, so a chip that set the box and
   * then called this would read the PREVIOUS value and send the wrong thing,
   * or nothing at all on the first tap.
   */
  const handleSendText = async (override?: string) => {
    const text = (override ?? textInputValue).trim();
    if (!text) return;
    if (phase === 'processing' || phase === 'recording') return;
    // Guard against concurrent invocations (e.g. simultaneous Return key + Send button tap).
    if (textSendingRef.current) return;
    textSendingRef.current = true;

    if (!isPlus && !isOneLanguage && secondsRemaining !== undefined && secondsRemaining !== null && secondsRemaining <= 0) {
      textSendingRef.current = false;
      router.push('/(app)/paywall');
      return;
    }

    playbackRef.current?.stop();
    playbackRef.current = null;
    clearWordReveal();

    const myTurn = ++activeTurnRef.current;
    earlyReplyShownRef.current = false;
    setTextInputValue('');
    setErrorMsg(null);

    // Show the learner's bubble immediately — transcript is already known.
    setPhase('processing');
    setProcessingStep('replying');
    setMessages((prev) => [
      ...prev.filter((m) => !m.pending),
      { role: 'learner', text },
    ]);

    const history: ChatTurnMessage[] = messages
      .slice(-HISTORY_WINDOW)
      .map((m) => ({ role: m.role === 'parrot' ? 'parrot' : 'learner', text: m.text }));

    try {
      const baseUrl = getConfiguredBaseUrl() ?? '';
      const chatUrl = `${baseUrl}${getChatTurnUrl()}`;
      const token = await getConfiguredAuthToken();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let replyPayload: any = null;
      let sseError: string | null = null;
      let httpStatus = 200;
      let rawResponseText = '';

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', chatUrl);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'text/event-stream');
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        let sseBuffer = '';
        let lastLen = 0;

        const processBuffer = () => {
          const blocks = sseBuffer.split('\n\n');
          sseBuffer = blocks.pop() ?? '';
          for (const block of blocks) {
            let evt = '';
            let data = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) evt = line.slice(7).trim();
              else if (line.startsWith('data: ')) data = line.slice(6).trim();
            }
            if (!evt || !data) continue;
            if (activeTurnRef.current !== myTurn) return;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let parsed: any;
            try { parsed = JSON.parse(data); } catch { continue; }

            if (evt === 'replyText') {
              const earlyText = (parsed.replyText as string) ?? '';
              const earlyEnglish = (parsed.replyEnglish as string) ?? '';
              if (earlyText) {
                earlyReplyShownRef.current = true;
                setMessages((prev) => [
                  ...prev,
                  { role: 'parrot', text: earlyText, englishText: earlyEnglish || undefined },
                ]);
              }
              setProcessingStep('voicing');
            } else if (evt === 'reply') {
              replyPayload = parsed;
            } else if (evt === 'error') {
              sseError = (parsed.error as string) ?? 'Something went wrong';
            }
          }
        };

        xhr.onprogress = () => {
          const newChunk = xhr.responseText.slice(lastLen);
          lastLen = xhr.responseText.length;
          sseBuffer += newChunk;
          processBuffer();
        };
        xhr.onload = () => {
          httpStatus = xhr.status;
          rawResponseText = xhr.responseText;
          const remaining = xhr.responseText.slice(lastLen);
          if (remaining) { sseBuffer += remaining; processBuffer(); }
          resolve();
        };
        xhr.onerror = () => reject(new TypeError('Network error'));
        xhr.ontimeout = () => reject(new TypeError('Request timed out'));
        xhr.send(JSON.stringify({ languageCode: chatLang, textInput: text, history, ...(scenarioId ? { scenarioId } : {}) }));
      });

      if (httpStatus < 200 || httpStatus >= 300) {
        let errData: unknown = null;
        try { errData = JSON.parse(rawResponseText); } catch {}
        const fakeRes = { status: httpStatus, ok: false } as Response;
        throw new ApiError(fakeRes, errData, { method: 'POST', url: chatUrl });
      }

      if (sseError) throw new Error(sseError);
      if (!replyPayload) throw new Error('No reply received');
      if (!isFocusedRef.current || activeTurnRef.current !== myTurn) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = replyPayload;
      const replyText        = (p.replyText as string) ?? '';
      const replyEnglish     = (p.replyEnglish as string) ?? '';
      const transcriptEnglish = (p.transcriptEnglish as string) ?? '';
      const replyAudioBase64 = (p.replyAudioBase64 as string) ?? '';
      const format           = (p.format as string) || 'mp3';
      const squawkVariant    = p.squawkVariant as 0 | 1 | 2 | null;
      const remainingSecs    = p.secondsRemaining as number | null;
      // Same fold as the voice path above; one helper so the two cannot drift.
      applyScenarioTurn(
        p.phrasesUsed as string[] | undefined,
        p.sceneDone as boolean | undefined,
        p.tokensEarned as number | undefined,
      );

      if (remainingSecs !== null) setSecondsRemaining(remainingSecs);
      else setSecondsRemaining(null);

      hapticMedium();

      setMessages((prev) => {
        const updated = [...prev];
        // Back-fill English gloss on the learner bubble if the server supplied one.
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].role === 'learner') {
            if (transcriptEnglish && transcriptEnglish !== updated[i].text) {
              updated[i] = { ...updated[i], englishText: transcriptEnglish };
            }
            break;
          }
        }
        const parrotBubble = {
          role: 'parrot' as const,
          text: replyText,
          englishText: replyEnglish && replyEnglish !== replyText ? replyEnglish : undefined,
        };
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'parrot') {
          updated[lastIdx] = parrotBubble;
        } else {
          updated.push(parrotBubble);
        }
        return updated;
      });

      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      if (activeTurnRef.current !== myTurn || !isFocusedRef.current) return;

      setPhase('playing');
      hapticHeavy();

      if (squawkVariant !== null && squawkVariant !== undefined) {
        playSquawk(squawkVariant);
      }

      if (!coachVoiceRef.current) {
        if (activeTurnRef.current === myTurn) setPhase('idle');
      } else {
        const handle = await playBase64Audio(replyAudioBase64, format, () => {
          playbackRef.current = null;
          if (activeTurnRef.current === myTurn) setPhase('idle');
        });
        if (activeTurnRef.current === myTurn && isFocusedRef.current) {
          playbackRef.current = handle;
        } else {
          handle.stop();
          if (activeTurnRef.current === myTurn) setPhase('idle');
        }
      }
    } catch (err) {
      if (activeTurnRef.current !== myTurn || !isFocusedRef.current) return;

      const upgrade = asUpgradeRequired(err);
      if (upgrade) {
        setUpgradeRequired(true);
        setPhase('idle');
        return;
      }

      setPhase('error');
      if (err instanceof ApiError) {
        if ((err as { status?: number }).status === 502) {
          setErrorMsg("Bolo couldn't process that 🦜 — give it another try!");
        } else {
          setErrorMsg('Bolo ran into a snag — try again!');
        }
      } else if (err instanceof TypeError) {
        setErrorMsg("Bolo flew out for a mango lassi 🥭 — check your connection and try again!");
      } else {
        setErrorMsg('Bolo ran into a snag — try again!');
      }
    } finally {
      textSendingRef.current = false;
    }
  };

  // ── Nav-bar hold-to-talk registration ─────────────────────────────────────
  // Keep stable refs to the latest handler versions so we can register
  // wrappers once and always invoke up-to-date logic (avoids stale closures).
  const chatRecording = useChatRecording();
  const handleStartRecordingRef = React.useRef(handleStartRecording);
  handleStartRecordingRef.current = handleStartRecording;
  const handleStopRecordingRef = React.useRef(handleStopRecording);
  handleStopRecordingRef.current = handleStopRecording;
  const phaseRef2 = React.useRef(phase);
  phaseRef2.current = phase;

  React.useEffect(() => {
    chatRecording.register(
      () => {
        // Mirror what the on-screen mascot's onPressIn does:
        // set isPressingRef so the async-startup guard works correctly,
        // then start recording if in an appropriate phase.
        isPressingRef.current = true;
        dismissHoldHint();
        const currentPhase = phaseRef2.current;
        // 'playing' is intentionally included: holding the nav parrot while
        // Bolo is speaking interrupts the audio and starts a new recording,
        // exactly the same as the on-screen mascot's skip-then-record path.
        if (currentPhase === 'idle' || currentPhase === 'error' || currentPhase === 'processing' || currentPhase === 'playing') {
          void handleStartRecordingRef.current();
        }
      },
      () => {
        // Mirror what the on-screen mascot's onPressOut does.
        isPressingRef.current = false;
        if (phaseRef2.current === 'recording') {
          void handleStopRecordingRef.current();
        }
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRecording, dismissHoldHint]);

  // Keep the context's phase ref and isRecording state in sync.
  React.useEffect(() => {
    chatRecording.notifyPhase(phase);
  }, [phase, chatRecording]);

  // ── Language gate ──────────────────────────────────────────────────────────
  // Only block the whole screen if a previous turn attempt was denied (edge
  // case). Per-language locks are handled inside the picker.
  if (upgradeRequired) {
    return (
      <UpgradeRequiredScreen
        title="Unlock this language"
        message="Upgrade to All-Access to chat with Bolo in any language."
        onUpgrade={() =>
          router.push(
            paywallHrefForDenial(
              {
                error: 'upgrade_required',
                upgradeRequired: true,
                reason: 'language_locked',
                message: 'Upgrade to chat in any language.',
                feature: 'allLanguages',
                requiredPlan: 'one_language',
              },
              chatLang,
            ),
          )
        }
        onBack={() => router.push('/(app)/(tabs)')}
      />
    );
  }

  // ── Mascot mode ────────────────────────────────────────────────────────────
  const mascotMode: TalkingMascotMode =
    phase === 'recording'
      ? 'listening'
      : phase === 'playing'
        ? 'talking'
        : phase === 'processing'
          ? 'thinking'
          : 'idle';

  // ── Free-tier time indicator ───────────────────────────────────────────────
  const showTimeIndicator =
    !isPlus && !isOneLanguage && secondsRemaining !== undefined && secondsRemaining !== null;
  const timePercent =
    showTimeIndicator && secondsRemaining !== null
      ? Math.max(0, Math.min(1, secondsRemaining / FREE_WEEKLY_CAP_SECONDS))
      : 1;
  const capExhausted = showTimeIndicator && secondsRemaining !== null && secondsRemaining <= 0;

  return (
    <Screen>
      {/* Header — no back button: the screen now lives in the tab bar */}
      <View style={styles.header}>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {scenario ? scenario.title : 'Chat with Bolo'}
          </Text>
        </View>
      </View>

      {/* Scenario framing strip. Non-dismissible: it is the scene, not a tip,
          and it appears only once the metadata lands so the header never
          jumps for an ordinary chat. Twin of web's scenario-banner. */}
      {scenario ? (
        /* The scene has to be read, not glanced past. It was 12px muted text
           in a 5%-tint box, the styling this app uses for asides, so a learner
           who skims it does not know who they are talking to or why. Label,
           foreground weight, and a solid accent rule down the left edge. Web
           says the same words in the same shape. */
        <View
          testID="scenario-banner"
          style={[
            styles.scenarioBanner,
            { backgroundColor: `${colors.primary}1A`, borderColor: `${colors.primary}4D` },
          ]}
        >
          <View style={[styles.scenarioRule, { backgroundColor: colors.primary }]} />
          <View style={styles.scenarioBannerBody}>
            <Text style={[styles.scenarioBannerLabel, { color: colors.primary }]}>
              YOUR SCENE
            </Text>
            <Text style={[styles.scenarioBannerText, { color: colors.foreground }]}>
              {scenario.framingCopy}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Language pill — tap to switch chat language */}
      <View style={styles.langPillRow}>
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityLabel={`Chat language: ${chatLanguage?.name ?? chatLang}. Tap to change.`}
          style={[
            styles.langPill,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="globe" size={14} color={colors.primary} />
          <Text style={[styles.langPillText, { color: colors.foreground }]}>
            {chatLanguage?.name ?? chatLang}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Persistent bilingual hint — always visible so beginners know they
          don't have to speak only in the target language. Plain text (no
          entering animation) so it never shifts layout across chat states. */}
      <Text style={[styles.bilingualHint, { color: colors.mutedForeground }]}>
        You can respond in English or {chatLanguage?.name ?? chatLang}
      </Text>

      {/* THE MEMORY TIP. Asked for 2026-08-27 alongside the memory feature
          itself: "add a small tip on that screen saying I learn about you and
          remember things you say."
          It is not decoration. Bolo now keeps notes about a learner between
          sessions, many of these learners are children, and a thing that
          quietly remembers you without ever saying so is the wrong shape for
          a children's app. This is the disclosure, in Bolo's own voice, on
          the screen where the remembering happens.
          Only on the empty state: once a conversation is running it would be
          one more line between the learner and the thing they came to do, and
          they have already read it. */}
      {messages.length === 0 && (
        <Text
          testID="chat-memory-tip"
          style={[styles.memoryTip, { color: colors.mutedForeground }]}
        >
          I remember what you tell me, so we can pick up where we left off.
        </Text>
      )}

      {/* Free-tier time remaining bar */}
      {showTimeIndicator && (
        <Animated.View
          entering={appear(appearDown(0, 300))}
          style={[styles.timeBar, { backgroundColor: colors.muted }]}
        >
          <View
            style={[
              styles.timeBarFill,
              {
                backgroundColor: capExhausted ? (colors.destructive ?? '#EF4444') : colors.primary,
                width: `${Math.round(timePercent * 100)}%`,
              },
            ]}
          />
          <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>
            {capExhausted
              ? 'Weekly chat time used — upgrade for unlimited'
              : `⏱ ${formatSeconds(secondsRemaining!)} of 2:00 left this week`}
          </Text>
        </Animated.View>
      )}

      {/* Mascot area — hold the bird to speak, release to send */}
      <Pressable
        onPressIn={() => {
          isPressingRef.current = true;
          // Dismiss the hold-hint on first interaction.
          dismissHoldHint();
          // 'playing' included since #890: holding Bolo himself now barges in
          // exactly like the nav bird — handleStartRecording stops playback,
          // orphans the in-flight turn, and records on the same gesture.
          if (phase === 'idle' || phase === 'error' || phase === 'processing' || phase === 'playing')
            void handleStartRecording();
        }}
        onPressOut={() => {
          isPressingRef.current = false;
          // If recording is already live, stop immediately.
          // If startup is still in flight (phase still idle/error), the ref
          // flip above is enough — handleStartRecording reads it after startup
          // completes and calls handleStopRecording itself.
          if (phase === 'recording') void handleStopRecording();
        }}
        disabled={capExhausted}
        style={[styles.mascotArea, messages.length === 0 && styles.mascotAreaFull]}
        accessibilityRole="button"
        accessibilityLabel={
          phase === 'recording' ? 'Release to send' : 'Hold to speak'
        }
        accessibilityHint="Hold your finger on Bolo to record, lift to send"
      >
        <TalkingMascot mode={mascotMode} size={messages.length === 0 ? 220 : 130} />

        {/* Status label under the mascot */}
        <Animated.Text
          key={phase === 'processing' ? `processing-${processingStep}` : phase}
          entering={appear(appearDown(0, 250))}
          style={[styles.statusLabel, { color: colors.mutedForeground }]}
        >
          {getStatusLabel(phase, processingStep, messages.length > 0)}
        </Animated.Text>

        {/* Replaces the canned greeting audio, retired 2026-08-24.
            SHOWN DURING THE WAIT, not before it. Web first put this in the
            intro bubble, which is gated on an empty transcript and therefore
            vanished the moment the learner spoke — which is exactly when the
            wait starts. Gated on "Bolo has never replied" rather than on
            message count, because a pending learner bubble is pushed the
            moment recording stops, so the count is already 1 by then. */}
        {phase === 'processing' && !messages.some((m) => m.role === 'parrot') && (
          <Animated.Text
            entering={appear(appearDown(0, 250))}
            style={[styles.firstAnswerNote, { color: colors.mutedForeground }]}
          >
            My first answer takes a few seconds. After that I speak straight away.
          </Animated.Text>
        )}

        {/* Instructional hint — always visible until the first exchange so
            learners can't miss it, regardless of their AsyncStorage state. */}
        {messages.length === 0 && (
          <Animated.View
            entering={appear(appearDown(0, 320))}
            style={[styles.holdHint, { backgroundColor: colors.primary }]}
          >
            <Feather name="mic" size={13} color={colors.primaryForeground ?? '#fff'} />
            <Text style={[styles.holdHintText, { color: colors.primaryForeground ?? '#fff' }]}>
              Hold to speak · release to send
            </Text>
          </Animated.View>
        )}

        {/* Skip button — only shown while Bolo is speaking */}
        {phase === 'playing' && (
          <Animated.View entering={appear(appearDown(0, 200))} style={{ marginTop: 8 }}>
            <PressableScale
              onPress={(e) => {
                e.stopPropagation?.();
                playbackRef.current?.stop();
                playbackRef.current = null;
                setPhase('idle');
              }}
              style={[styles.skipBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Skip Bolo's reply"
            >
              <Feather name="skip-forward" size={18} color={colors.mutedForeground} />
            </PressableScale>
          </Animated.View>
        )}
      </Pressable>

      {/* Tip card — shown while Bolo is processing a reply */}
      {phase === 'processing' && <TipCard />}

      {/* KeyboardAvoidingView wraps the transcript + input row so the text
          input floats above the software keyboard on iOS and Android.
          flex:1 is only applied when messages are present so the mascot's
          own flex:1 (mascotAreaFull) continues to drive layout on the
          empty-state screen. */}
      <KeyboardAvoidingView
        testID="chat-keyboard-wrapper"
        style={[
          messages.length > 0 ? { flex: 1 } : undefined,
          // On web KeyboardAvoidingView is a no-op; pad by the visual-viewport
          // delta tracked above so the input row lifts above the soft keyboard.
          Platform.OS === 'web' && webKeyboardInset > 0
            ? { paddingBottom: webKeyboardInset }
            : undefined,
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >

      {/* Static greeting bubble — shown before the first exchange, client-side only, never sent to the API */}
      {messages.length === 0 && (
        <Animated.View
          entering={appear(appearUp(200, 320))}
          style={[
            styles.bubble,
            styles.bubbleParrot,
            // RAISED_PARROT_CLEARANCE keeps the last line of the intro text
            // above the raised parrot tab button, which pokes over the bar.
            { backgroundColor: colors.card, borderColor: colors.border, alignSelf: 'flex-start', marginHorizontal: 16, marginBottom: RAISED_PARROT_CLEARANCE },
          ]}
        >
          <Text style={[styles.bubbleText, { color: colors.foreground }]}>
            {/* Says what to DO first, then what is allowed. Web says the
                same words. */}
            {'Hi! I\'m Bolo. Hold my belly to chat in English or ' +
              (chatLanguage?.name ?? chatLang) + '. Ask me or tell me anything!'}
          </Text>
          {/* Sets the expectation before the first turn; the line under the
              status reinforces it during. Web says the same words. */}
          <Text style={[styles.firstAnswerNote, { color: colors.mutedForeground, marginTop: 6, textAlign: 'left' }]}>
            My first answer takes a few seconds. After that I speak straight away.
          </Text>
        </Animated.View>
      )}

      {/* Conversation transcript */}
      {messages.length > 0 && (
        <ScrollView
          ref={scrollRef}
          style={styles.transcript}
          contentContainerStyle={styles.transcriptContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg, i) => {
            const isAnimating = msg.role === 'parrot' && msg.revealedWordCount !== undefined;
            const displayText = isAnimating
              ? msg.text.split(/\s+/).filter(Boolean).slice(0, msg.revealedWordCount).join(' ')
              : (msg.pending ? 'Sending…' : msg.text);

            const bubbleContent = (
              <>
                <Text
                  style={[
                    styles.bubbleText,
                    {
                      color:
                        msg.role === 'learner'
                          ? colors.primaryForeground
                          : colors.foreground,
                      fontStyle: msg.pending ? 'italic' : 'normal',
                    },
                  ]}
                >
                  {displayText}
                </Text>
                {msg.englishText ? (
                  <Text
                    style={[
                      styles.bubbleEnglish,
                      {
                        color:
                          msg.role === 'learner'
                            ? (colors.primaryForeground ?? '#fff') + 'b3'
                            : colors.mutedForeground,
                      },
                    ]}
                  >
                    {msg.englishText}
                  </Text>
                ) : null}
              </>
            );

            return (
              <Animated.View
                key={i}
                entering={appear(appearUp(40, 280))}
                style={[
                  styles.bubble,
                  msg.role === 'learner'
                    ? [styles.bubbleLearner, { backgroundColor: colors.primary, opacity: msg.pending ? 0.55 : 1 }]
                    : [styles.bubbleParrot, { backgroundColor: colors.card, borderColor: colors.border }],
                ]}
              >
                {isAnimating ? (
                  // Wrap in Pressable so the learner can tap to reveal all words immediately.
                  <Pressable
                    onPress={() => {
                      clearWordReveal();
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.role === 'parrot' && m.revealedWordCount !== undefined
                            ? { ...m, revealedWordCount: undefined }
                            : m,
                        ),
                      );
                    }}
                    accessibilityLabel="Tap to reveal full text"
                    accessibilityRole="button"
                  >
                    {bubbleContent}
                  </Pressable>
                ) : bubbleContent}
              </Animated.View>
            );
          })}
        </ScrollView>
      )}

      {/* Error message */}
      {phase === 'error' && errorMsg && (
        <Animated.View
          entering={appear(appearDown(0, 280))}
          style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="alert-circle" size={16} color={colors.destructive ?? '#EF4444'} />
          <Text style={[styles.errorText, { color: colors.foreground }]}>
            {errorMsg}
          </Text>
        </Animated.View>
      )}

      {/* Scenario target-phrase chips, directly above the input so they read as
          the things left to say. A chip fills in once the SERVER reports the
          phrase used, never on a local guess: the match is a server-side
          substring check and a chip that lit optimistically would promise
          credit the stamp does not agree with. Twin of web's
          target-phrase-chips. */}
      {scenario && scenario.targetPhrases.length > 0 ? (
        <View testID="target-phrase-chips" style={styles.chipRow}>
          {scenario.targetPhrases.map((tp) => {
            const used = usedPhrases.has(tp.romanized);
            return (
              <View
                key={tp.romanized}
                testID={`phrase-chip-${tp.romanized}`}
                accessibilityLabel={`${tp.romanized}${used ? ', said' : ', not said yet'}`}
                style={[
                  styles.phraseChip,
                  used
                    ? { backgroundColor: `${colors.primary}1F`, borderColor: colors.primary }
                    : { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.phraseChipText,
                    { color: used ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {tp.romanized}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* QUICK CHIPS. Two sets: openers while the screen is empty, follow-ups
          once there is something to follow. See lib/chatChips.ts for why they
          are separate and why they are in English. Hidden while Bolo is busy,
          because a chip tapped mid-turn would queue behind the turn it is
          reacting to. */}
      {phase !== 'processing' && phase !== 'recording' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickChipRow}
          keyboardShouldPersistTaps="handled"
          // NEVER GROW (chat 11, reported off build 516: "the pills get super
          // expanded after a first response"). The KeyboardAvoidingView above
          // takes flex:1 the moment a message exists, and this ScrollView
          // absorbed the slack, which its row content container then handed
          // to the chips as height. flexGrow:0 keeps the row its own size;
          // the alignItems on quickChipRow is the second half of the fix.
          style={{ flexGrow: 0, flexShrink: 0 }}
        >
          {chatChipsFor(messages.length).map((chip) => (
            <Pressable
              key={chip}
              testID={`chat-chip-${chip}`}
              accessibilityRole="button"
              accessibilityLabel={chip}
              onPress={() => {
                void handleSendText(chip);
              }}
              style={[
                styles.quickChip,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.quickChipText, { color: colors.foreground }]}>
                {chip}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* Text input row — keyboard fallback for when speaking isn't convenient */}
      <View style={[styles.textInputRow, { borderTopColor: colors.border }]}>
        <TextInput
          value={textInputValue}
          onChangeText={setTextInputValue}
          onSubmitEditing={() => void handleSendText()}
          returnKeyType="send"
          placeholder="Type a message…"
          placeholderTextColor={colors.mutedForeground}
          editable={phase !== 'processing' && phase !== 'recording'}
          style={[
            styles.textInput,
            { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
          ]}
          blurOnSubmit={false}
        />
        {textInputValue.trim() ? (
          <Pressable
            onPress={() => void handleSendText()}
            disabled={phase === 'processing' || phase === 'recording'}
            style={[styles.sendBtn, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Feather name="send" size={18} color={colors.primaryForeground ?? '#fff'} />
          </Pressable>
        ) : null}
      </View>

      </KeyboardAvoidingView>

      {/* Language picker modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop]}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => {}}
          >
            {/* Handle bar */}
            <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Chat language
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
              Choose the language for this chat session
            </Text>

            <FlatList
              data={languages}
              keyExtractor={(item) => item.code}
              contentContainerStyle={styles.langList}
              renderItem={({ item: lang }) => {
                const selected = lang.code === chatLang;
                const locked = !isLanguageAllowed(lang.code);
                return (
                  <TouchableOpacity
                    onPress={() => {
                      if (locked) {
                        setPickerOpen(false);
                        router.push(
                          paywallHrefForDenial(
                            {
                              error: 'upgrade_required',
                              upgradeRequired: true,
                              reason: 'language_locked',
                              message: 'Upgrade to chat in any language.',
                              feature: 'allLanguages',
                              requiredPlan: 'one_language',
                            },
                            lang.code,
                          ),
                        );
                        return;
                      }
                      setChatLang(lang.code);
                      setPickerOpen(false);
                    }}
                    style={[
                      styles.langRow,
                      {
                        backgroundColor: selected
                          ? colors.primary + '15'
                          : colors.card,
                        borderColor: selected
                          ? colors.primary
                          : colors.border,
                      },
                    ]}
                    accessibilityLabel={`${lang.name}${locked ? ', locked — upgrade to unlock' : selected ? ', selected' : ''}`}
                  >
                    <View style={styles.langRowLeft}>
                      <Text
                        style={[
                          styles.langNativeName,
                          {
                            color: locked
                              ? colors.mutedForeground
                              : colors.foreground,
                            fontFamily: lang.fontFamily
                              ? undefined
                              : AppFonts.bold,
                          },
                          lang.fontFamily
                            ? { fontFamily: lang.fontFamily }
                            : {},
                        ]}
                        numberOfLines={1}
                      >
                        {lang.nativeName}
                      </Text>
                      <Text style={[styles.langEnglishName, { color: colors.mutedForeground }]}>
                        {lang.name}
                      </Text>
                    </View>
                    {selected ? (
                      <Feather name="check" size={18} color={colors.primary} />
                    ) : locked ? (
                      <Feather name="lock" size={16} color={colors.mutedForeground} />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Scenario completion. Session state, not persisted: a learner who
          revisits a zone they already stamped still gets the chat surface
          rather than this overlay, matching web. Rendered last so it covers
          the input and the language modal alike. */}
      {sceneDone ? (
        <View
          testID="scenario-completion-overlay"
          style={[styles.completionOverlay, { backgroundColor: colors.background }]}
        >
          <Mascot pose="cheer" size={160} />
          <Text style={[styles.completionTitle, { color: colors.foreground }]}>
            Zone complete!
          </Text>
          <Text style={[styles.completionBody, { color: colors.mutedForeground }]}>
            You spoke {chatLanguage?.name ?? chatLang} at the chai stall!
          </Text>
          <View style={styles.chipRowCenter}>
            <View style={[styles.xpChip, { backgroundColor: `${colors.primary}1A` }]}>
              <Text style={[styles.xpChipText, { color: colors.primary }]}>+20 XP</Text>
            </View>
            {/* Only when the server actually granted: a replay pays nothing and
                must not claim otherwise. */}
            {capstoneChai > 0 ? (
              <View
                testID="capstone-chai-chip"
                style={[styles.xpChip, { backgroundColor: 'rgba(217,164,65,0.18)' }]}
              >
                <Text style={[styles.xpChipText, { color: '#B8863B' }]}>
                  +{capstoneChai} Chai
                </Text>
              </View>
            ) : null}
          </View>
          {/* Same offer moment web shows here, after the celebration content. */}
          <ExpressOfferMoment
            surface="celebration"
            onNotice={setErrorMsg}
            style={styles.completionOffer}
          />
          <Pressable
            testID="scenario-back-to-journey"
            accessibilityRole="button"
            onPress={() => router.replace('/(app)/journey')}
            style={[styles.completionCta, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.completionCtaText, { color: colors.primaryForeground }]}>
              Back to journey
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // paddingBottom 26, was 8 (chat 11, "move the chips up"): the PRESS & HOLD
  // ring around the nav Bolo button reaches above the tab bar now, and the
  // chips sat on it.
  //
  // alignItems CENTER, NOT THE ROW DEFAULT OF STRETCH. A horizontal
  // ScrollView's content container is a ROW, so its cross axis is vertical
  // and stretch made every pill as tall as the ScrollView happened to be:
  // ~400pt lozenges the moment the transcript's flex:1 kicked in. Reported
  // off build 516.
  quickChipRow: {
    paddingHorizontal: 16,
    // 44, was 26: the ring reaches ~18pt above the button and the chips were
    // sitting ON the words. Reported on an Android device off build 518,
    // "it overlaps the pills". The ring is 94pt tall centred on a 58pt
    // bubble, so it needs (94-58)/2 = 18 of clearance over the bubble's top
    // plus the row's own breathing room.
    paddingBottom: 44,
    gap: 8,
    alignItems: 'center',
  },
  quickChip: {
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickChipText: { fontSize: 13, fontFamily: AppFonts.semibold },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 17,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPillRow: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  langPillText: {
    fontFamily: AppFonts.semibold,
    fontSize: 14,
  },
  timeBar: {
    marginHorizontal: 20,
    marginBottom: 8,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  timeBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  timeLabel: {
    fontFamily: AppFonts.regular,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  mascotArea: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  mascotAreaFull: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  statusLabel: {
    fontFamily: AppFonts.semibold,
    fontSize: 14,
  },
  // Smaller and lighter than statusLabel: it explains the status rather than
  // being one, and must not compete with it. Width-capped so it wraps to two
  // lines under the mascot instead of running to the screen edges.
  firstAnswerNote: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
    maxWidth: 260,
    textAlign: 'center',
  },
  transcript: {
    flex: 1,
    marginHorizontal: 20,
  },
  transcriptContent: {
    gap: 8,
    paddingTop: 8,
    // Clears the raised parrot tab button so the newest message is never
    // covered when scrolled to the end. Only visible at the scroll end, so a
    // filling chat gains no dead gap mid-conversation.
    paddingBottom: RAISED_PARROT_CLEARANCE,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bubbleLearner: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleParrot: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleEnglish: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
    marginTop: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    // Bottom-most element when shown — keep it clear of the raised parrot.
    marginBottom: RAISED_PARROT_CLEARANCE,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  skipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 4,
  },
  holdHintText: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
  },
  bilingualHint: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    textAlign: 'center',
    marginHorizontal: 24,
    marginBottom: 8,
  },
  memoryTip: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: 32,
  },
  textInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: RAISED_PARROT_CLEARANCE,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  textInput: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: AppFonts.regular,
    fontSize: 15,
    lineHeight: 20,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal / bottom-sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
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
  modalTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 18,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    marginBottom: 16,
  },
  langList: {
    gap: 8,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  langRowLeft: {
    flex: 1,
    minWidth: 0,
  },
  langNativeName: {
    fontSize: 16,
    fontFamily: AppFonts.bold,
  },
  langEnglishName: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    marginTop: 2,
  },

  // ── Scenario (zone capstone) mode ────────────────────────────────────────
  scenarioBanner: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  scenarioRule: {
    width: 3,
    borderRadius: 999,
    alignSelf: 'stretch',
  },
  scenarioBannerBody: {
    flex: 1,
    minWidth: 0,
  },
  scenarioBannerLabel: {
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 1.4,
    marginBottom: 3,
  },
  scenarioBannerText: {
    fontFamily: AppFonts.bold,
    fontSize: 13,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  phraseChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  phraseChipText: {
    fontFamily: AppFonts.bold,
    fontSize: 12,
  },
  completionOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 9997,
    elevation: 9997,
  },
  completionTitle: {
    marginTop: 24,
    fontFamily: AppFonts.extrabold,
    fontSize: 26,
    textAlign: 'center',
  },
  completionBody: {
    marginTop: 8,
    fontFamily: AppFonts.regular,
    fontSize: 16,
    textAlign: 'center',
  },
  chipRowCenter: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  xpChip: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  xpChipText: {
    fontFamily: AppFonts.bold,
    fontSize: 14,
  },
  completionOffer: {
    marginTop: 16,
    width: '100%',
    maxWidth: 320,
  },
  completionCta: {
    marginTop: 32,
    width: '100%',
    maxWidth: 320,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  completionCtaText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 16,
  },
});
