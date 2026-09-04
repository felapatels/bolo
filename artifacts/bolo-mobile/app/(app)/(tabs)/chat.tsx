import React from 'react';
import {
  AccessibilityInfo,
  Alert,
  FlatList,
  Keyboard,
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
import { CONTENT_MAX_W, useIsWideScreen } from '@/lib/contentWidth';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useGetScenario } from '@workspace/api-client-react';
import { useAudioRecorder, useAudioRecorderState, createAudioPlayer } from 'expo-audio';
import Animated from 'react-native-reanimated';
import { HOLD_RING_BOX, HOLD_RING_REACH, holdRingBoxFor } from '@/app/(app)/(tabs)/_layout';
import { pickCantHearLine } from '@/lib/cantHearLines';
import { appear, appearDown, appearUp } from '@/lib/entrance';
import {
  getChatTurnUrl,
  getConfiguredBaseUrl,
  getConfiguredAuthToken,
  type ChatTurnMessage,
  ApiError,
} from '@workspace/api-client-react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Screen, TAB_BAR_CLEARANCE, RAISED_PARROT_CLEARANCE } from '@/components/Screen';
import { UpgradeRequiredScreen } from '@/components/UpgradeRequiredScreen';
import { SoundBars, TalkingMascot, type TalkingMascotMode } from '@/components/TalkingMascot';
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
  // Idle says NOTHING now (owner, 2026-08-28). Both idle strings were
  // instructions pointing at the on-screen bird, and the control they
  // describe is the nav button, which carries the words on its own ring.
  // Every other phase here is live feedback, not instruction, so it stays:
  // a silent three second wait with nothing on screen reads as a hang.
  if (phase === 'idle') return '';
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

/**
 * A CONTEXT THAT ALWAYS EXISTS, so reading the safe-area inset can never throw.
 *
 * Two different ways this bit back on 2026-08-28. useSafeAreaInsets() THROWS
 * when no SafeAreaProvider is mounted, which killed 36 tests in six suites the
 * moment it was added. Switching to React.useContext(SafeAreaInsetsContext)
 * then threw in a seventh, because that suite mocks
 * react-native-safe-area-context and its mock has no SafeAreaInsetsContext to
 * import, so useContext was handed undefined.
 *
 * Falling back to a locally created context fixes both and is honest about the
 * real contract: no provider means no inset, and the caller uses its floor.
 * Created once at module scope, never during render.
 */
const InsetsContext =
  SafeAreaInsetsContext ?? React.createContext<{ bottom: number } | null>(null);

export default function ChatScreen() {
  // The nav bubble and its ring are bigger on an iPad; the flank notes below
  // have to clear whichever size is drawn. See navMetrics in (tabs)/_layout.
  const isWideScreen = useIsWideScreen();
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
  /**
   * DID THIS HOLD CONTAIN ANY SPEECH AT ALL.
   *
   * Holding the button and saying nothing produced a fully formed Hindi
   * sentence on a device: "I have an apple. I am happy today. I want roti and
   * vegetables." The transcriber invents plausible speech from near-silence,
   * and none of the server's existing guards can catch it, because they look
   * for an EMPTY transcript or for the model echoing its own prompt back. This
   * was neither. It was prose.
   *
   * That is worse than a wasted turn now that chat memory distils facts from
   * what a learner says: a silent hold could write "likes apples" into what
   * Bolo remembers about a child.
   *
   * The signal does not exist server-side either. gpt-4o-transcribe and its
   * mini do not return `no_speech_prob`; that is a whisper-1 field. The only
   * place the truth is available is here, in the mic level, which this screen
   * already samples for the silence auto-stop.
   *
   * TWO REFS, NOT ONE, AND THAT IS THE WHOLE SAFETY OF IT. If metering is
   * unavailable on some platform or build, "never heard speech" and "never
   * heard anything" are indistinguishable, and a single ref would silently
   * discard every recording the learner ever made. So the discard requires
   * POSITIVE evidence: readings were seen, and none of them cleared the bar.
   */
  // Bolo's own line when a hold carried nothing. Its OWN state, not errorMsg:
  // that banner wears an alert-circle in destructive red, and a joke inside a
  // red error box reads as a failure rather than as the bird being cheeky.
  const [cantHearMsg, setCantHearMsg] = React.useState<string | null>(null);
  const heardSpeechRef = React.useRef(false);
  const sawMeteringRef = React.useRef(false);
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
    sawMeteringRef.current = true;
    const now = Date.now();
    if (metering > SILENCE_THRESHOLD_DB) {
      heardSpeechRef.current = true;
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
      setCantHearMsg(null);
      heardSpeechRef.current = false;
      sawMeteringRef.current = false;
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
    // A HOLD WITH NO SPEECH IN IT IS NOT A TURN. See heardSpeechRef: the
    // transcriber invents plausible sentences from near-silence, and the
    // server cannot tell that from a real one. Discarded here rather than sent,
    // which also spends no API call on it.
    // The condition needs POSITIVE evidence of silence, never merely the
    // absence of evidence of speech: if metering never reported at all, this
    // must not fire, or a platform without it loses every recording.
    if (sawMeteringRef.current && !heardSpeechRef.current) {
      setCantHearMsg(pickCantHearLine());
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
          const gHandle = await playBoloAudio(
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
          void playBoloAudio(gReplyAudio, gFmt, () => {
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
          const handle = await playBoloAudio(
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
        const handle = await playBoloAudio(replyAudioBase64, format, () => {
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

  // ── How big the bird may be ────────────────────────────────────────────────
  /**
   * MEASURED, NOT PICKED. On the empty state the mascot area is flex:1 with
   * justifyContent:'center', so when the bird plus its status label and hold
   * hint are taller than whatever height is left, the surplus spills EQUALLY
   * IN BOTH DIRECTIONS and the upward half lands on the bilingual hint and the
   * memory tip above. The owner sent a screenshot of exactly that on
   * 2026-08-28, and shrinking the constant from 220 to 156 did not clear it.
   *
   * A FIFTH HAND-TUNED NUMBER WOULD HAVE GONE STALE TOO. This file already
   * carries a comment admitting the chip gap was set by eye four times. The
   * height depends on the device, on how far the two lines of copy above wrap,
   * and on whether the learner owns a headwear accessory (the pagdi stands
   * well above her head), so no constant can be right everywhere.
   *
   * The box cannot depend on the bird, since it is flex:1, so measuring the
   * parent and sizing the child from it cannot loop.
   */
  /**
   * WHERE THE TOP CHROME ENDS, measured off the LANGUAGE PILL rather than the
   * title row. Absolute children sit against Screen's padding box, so anything
   * floating below the chrome needs the bottom edge of the LAST thing in it.
   *
   * Two misses before this landed. Measuring the header's height alone threw
   * away its offset and put the bird over the status bar. Measuring the header
   * at all was still wrong, because the language pill is a SIBLING BELOW it, so
   * the speaking strip landed on top of the pill: "not enough padding from top".
   */
  const [headerH, setHeaderH] = React.useState(0);
  const [mascotBoxH, setMascotBoxH] = React.useState(0);
  // Everything inside the area that is NOT the bird: status label, the gaps
  // either side of it, the hold hint on the empty state, and the area's own
  // vertical padding. Rounded up rather than down; slack here costs a slightly
  // smaller bird, while a shortfall costs covered text.
  const MASCOT_CHROME = 104;
  const MASCOT_MAX = 156;
  const MASCOT_MIN = 84;
  /**
   * SHE FLOATS AND SHRINKS ONCE A CONVERSATION STARTS (owner, 2026-08-28:
   * "bolo should truly be floating and not boxed, messages should scroll
   * beneath him", then "shrink" when asked whether to scrim behind her or get
   * out of the way).
   *
   * Empty state: she is the hero, in flow, sized to whatever the measured box
   * allows. Conversation running: she leaves the layout entirely and perches
   * top right over the transcript, which then owns the full height and slides
   * its messages under her.
   *
   * SHRINKING RATHER THAN SCRIMMING was the owner's call and it is the right
   * one. A scrim keeps text legible behind a bird that has no job to do: the
   * nav button is the microphone now, so mid-conversation she is decoration,
   * and decoration should take less room rather than defend the room it has.
   */
  const PERCH_SIZE = 76;
  const isPerched = messages.length > 0;
  const mascotSize =
    messages.length > 0
      ? PERCH_SIZE
      : mascotBoxH === 0
        ? MASCOT_MAX
        : Math.max(MASCOT_MIN, Math.min(MASCOT_MAX, Math.round(mascotBoxH - MASCOT_CHROME)));

  // ── Typing, and Bolo's voice ───────────────────────────────────────────────
  /**
   * THE TEXT INPUT IS COLLAPSED UNTIL ASKED FOR (owner, 2026-08-28: "keep type
   * a message small and collapsed. Only show the full bar and send button once
   * expanded as well as the mute bolo button"). Speaking is the point of this
   * screen and the nav button is the microphone; typing is the fallback, so it
   * takes the space of a fallback until someone reaches for it.
   */
  /**
   * WHERE THE TAB BAR'S TOP EDGE ACTUALLY IS, so the flanking notes sit on it
   * instead of under it. The bar is laid out in (tabs)/_layout.tsx as
   * bottom: Math.max(insets.bottom, 14) with height 74, so this is the same
   * arithmetic rather than a number copied across two files. A guessed 88 put
   * the notes 20pt too low on this device and the bar covered them.
   *
   * READ FROM THE CONTEXT, NOT FROM useSafeAreaInsets(). That hook THROWS when
   * no SafeAreaProvider is above it, and this screen's tests render it bare:
   * calling it took out 36 tests across six suites in one line. The context
   * returns null instead, so the fallback below covers the test renderer and
   * any surface that forgets the provider.
   */
  const insets = React.useContext(InsetsContext);
  const tabBarTop = Math.max(insets?.bottom ?? 0, 14) + 74;

  const [inputExpanded, setInputExpanded] = React.useState(false);
  const textInputRef = React.useRef<TextInput>(null);

  /**
   * MUTING BOLO IS FOR TYPED CONVERSATIONS (owner, same day: "there should be a
   * mute bolo button when type to chat is expanded in case they just want to
   * have a chat conversation"). Someone typing on a bus does not want their
   * phone talking back.
   *
   * It is a REFUSAL TO PLAY, not a volume of zero, and it goes through one
   * wrapper that every playback site calls. That matters because the phase
   * machine is driven by the onEnded callback: an audio path that silently
   * never finishes is exactly the "it says speaking forever" bug of
   * 2026-08-27. Muted, the callback fires immediately and the screen returns
   * to idle the way it would after a real reply.
   */
  const [boloMuted, setBoloMuted] = React.useState(false);
  const boloMutedRef = React.useRef(false);
  React.useEffect(() => { boloMutedRef.current = boloMuted; }, [boloMuted]);
  const playBoloAudio = React.useCallback(
    async (b64: string, fmt: string, onEnded: () => void) => {
      if (boloMutedRef.current) {
        // Hand back a handle of the same shape so callers need no branch, then
        // end the turn on the next tick rather than synchronously: a caller
        // that assigns playbackRef AFTER awaiting must not be handed a
        // finished turn before its own assignment runs.
        setTimeout(onEnded, 0);
        return { stop: () => {} } as PlaybackHandle;
      }
      return playBase64Audio(b64, fmt, onEnded);
    },
    [],
  );

  // ── Idle nudge on the quick chips ──────────────────────────────────────────
  /**
   * AFTER FIVE SECONDS OF DOING NOTHING, THE CHIP ROW SCROLLS ITSELF (owner,
   * 2026-08-28: "if someone is idle for more than 5 seconds, start scrolling
   * these"). The row runs off the right edge and nothing says so, so a learner
   * who does not think to swipe never sees more than the first two openers.
   *
   * It scrolls to the end, waits, comes back, and repeats until the learner
   * touches anything. Any interaction restarts the five second clock.
   *
   * scrollTo({ animated: true }) is the PLATFORM's scroll animation, not the
   * Animated/reanimated driver that CLAUDE.md records as dead in release
   * builds of this app, so this one does move where those do not.
   *
   * Skipped entirely under Reduce Motion: unrequested movement is exactly what
   * that setting is asking not to have.
   */
  const chipScrollRef = React.useRef<ScrollView>(null);
  const chipContentW = React.useRef(0);
  const chipViewportW = React.useRef(0);
  const chipAtEnd = React.useRef(false);
  const chipLoopRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const chipIdleRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reduceMotionOn, setReduceMotionOn] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => { if (live) setReduceMotionOn(on); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionOn);
    return () => { live = false; sub.remove(); };
  }, []);

  const stopChipLoop = React.useCallback(() => {
    if (chipLoopRef.current) { clearInterval(chipLoopRef.current); chipLoopRef.current = null; }
  }, []);

  /** Call on ANY interaction: kills the loop and restarts the five second clock. */
  const bumpChipIdle = React.useCallback(() => {
    stopChipLoop();
    if (chipIdleRef.current) clearTimeout(chipIdleRef.current);
    if (reduceMotionOn) return;
    chipIdleRef.current = setTimeout(() => {
      // Nothing to reveal if the row already fits.
      if (chipContentW.current <= chipViewportW.current + 8) return;
      // A CRAWL, NOT A JUMP (owner: "slower scroll"). scrollTo with
      // animated:true runs at the platform's own speed and cannot be slowed,
      // so this steps the offset itself, unanimated, about 33 times a second.
      // 0.35pt a step is roughly 12pt a second: fast enough to read as
      // movement, slow enough to read the chips going past.
      let x = 0;
      let dir = 1;
      chipLoopRef.current = setInterval(() => {
        const max = Math.max(0, chipContentW.current - chipViewportW.current);
        x += dir * 0.35;
        if (x >= max) { x = max; dir = -1; }
        else if (x <= 0) { x = 0; dir = 1; }
        chipScrollRef.current?.scrollTo({ x, animated: false });
      }, 30);
    }, 5000);
  }, [reduceMotionOn, stopChipLoop]);

  // Start the clock on mount, and clear both timers on unmount.
  React.useEffect(() => {
    bumpChipIdle();
    return () => {
      stopChipLoop();
      if (chipIdleRef.current) clearTimeout(chipIdleRef.current);
    };
  }, [bumpChipIdle, stopChipLoop]);

  // A new phase is the learner doing something, so it counts as interaction.
  React.useEffect(() => { bumpChipIdle(); }, [phase, bumpChipIdle]);

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

      {/* THE HEADER THE BIRD HANGS UNDER, measured as one box (build 25, owner
          on the iPad: "after a first response mascot covers the meter line").
          It was the pill row alone, and on a Free account the time bar
          renders after that row, so the perched bird landed on the bar. Plus
          accounts never show the bar, which is why it hid. */}
      <View onLayout={(e) => setHeaderH(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
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
      </View>

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
        style={[
          styles.mascotArea,
          messages.length === 0 && styles.mascotAreaFull,
          // Absolute against Screen, anchored under the MEASURED header rather
          // than a guessed offset: the header carries a safe-area inset and a
          // language chip whose height is not knowable from here.
          messages.length > 0 && {
            position: 'absolute',
            top: headerH + 6,
            right: 10,
            paddingVertical: 0,
            zIndex: 10,
          },
        ]}
        onLayout={(e) => setMascotBoxH(e.nativeEvent.layout.height)}
        accessibilityRole="button"
        accessibilityLabel={
          phase === 'recording' ? 'Release to send' : 'Hold to speak'
        }
        accessibilityHint="Hold your finger on Bolo to record, lift to send"
      >
        {/* SMALLER ON BOTH STATES, 2026-08-28, for two reasons that arrived
            together.

            The bird OVERLAPPED THE TWO LINES ABOVE IT on the empty state, with
            a screenshot to prove it: the bilingual hint and the memory tip were
            both partly behind her. Nothing here is absolutely positioned. The
            cause is that mascotAreaFull is flex:1 with justifyContent:'center',
            so once the bird plus its status label and hold hint are taller than
            the space left under the header, the surplus spills EQUALLY IN BOTH
            DIRECTIONS and the upward half lands on that copy.

            And the nav parrot is now the loud microphone (it grows on this tab,
            see BUBBLE_SIZE_FOCUSED), so the on-screen bird no longer has to
            carry that job and can give the transcript its room back. */}
        <TalkingMascot mode={mascotMode} size={mascotSize} showBars={!isPerched} />

        {/* Status label under the mascot. Absent, not blank, when idle: an
            empty Text still reserves its line height and gap. */}
        {!isPerched && getStatusLabel(phase, processingStep, messages.length > 0) !== '' && (
          <Animated.Text
            key={phase === 'processing' ? `processing-${processingStep}` : phase}
            entering={appear(appearDown(0, 250))}
            style={[styles.statusLabel, { color: colors.mutedForeground }]}
          >
            {getStatusLabel(phase, processingStep, messages.length > 0)}
          </Animated.Text>
        )}

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

        {/* Skip button — only shown while Bolo is speaking */}
        {!isPerched && phase === 'playing' && (
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

      {/* Tip card, shown while Bolo is processing a reply.
          IT HAS TO CLEAR THE PERCH (owner, 2026-09-03, off TestFlight on both
          an iPhone and an iPad: "did you know, 'got it' and bolo all overlap
          for a moment on the chat screen").
          Three things claim the band right under the header and only one of
          them is in flow. Once Bolo perches she goes ABSOLUTE at headerH + 6,
          and the speaking strip that carries "Got it! 💬" goes absolute at
          headerH + 14, so this card, which is the first in-flow element on the
          screen, was laid out underneath both of them. It shows only while
          processing, which is the same moment the strip does, so the collision
          is exactly as long as a transcription and no longer.
          The transcript below already clears her by PERCH_SIZE + 16; this
          takes the same clearance for the same reason. */}
      {phase === 'processing' && (
        <TipCard style={isPerched ? { marginTop: PERCH_SIZE + 16 } : undefined} />
      )}

      {/* THE SPEAKING CLUSTER STAYS CENTRED WHEN BOLO PERCHES (owner,
          2026-08-28: "move the voice visualizer back to center along with the
          skip button"). Status line, bars and skip were children of the mascot
          Pressable, so when she went absolute into the top right corner they
          went with her and ended up stacked in the corner under a tiny bird.

          They belong to the CONVERSATION, not to her: the bars are what Bolo is
          saying and skip is what you do about it, and both want the middle of
          the screen where a thumb and an eye already are. Only mounted while
          perched; in the empty state they still sit under the full-size bird
          where they read as part of her. */}
      {isPerched && (phase === 'playing' || getStatusLabel(phase, processingStep, true) !== '') && (
        <View
          // Left of the bird's perch, so a long label never runs under her.
          style={[styles.speakingStrip, { top: headerH + 14, right: PERCH_SIZE + 20 }]}
          pointerEvents="box-none"
        >
          {getStatusLabel(phase, processingStep, true) !== '' && (
            <Text style={[styles.statusLabel, { color: colors.mutedForeground }]}>
              {getStatusLabel(phase, processingStep, true)}
            </Text>
          )}
          {phase === 'playing' && <SoundBars />}
          {phase === 'playing' && (
            <PressableScale
              onPress={() => {
                playbackRef.current?.stop();
                playbackRef.current = null;
                setPhase('idle');
              }}
              style={[styles.skipBtn, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}
              accessibilityRole="button"
              accessibilityLabel="Skip Bolo's reply"
            >
              <Feather name="skip-forward" size={18} color={colors.mutedForeground} />
            </PressableScale>
          )}
        </View>
      )}

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
                same words.
                "Hold my belly" WAS WRONG AS OF 2026-08-28 and is now "hold the
                Bolo button below": holding the on-screen bird still records,
                but the control the app points at is the nav button, which
                carries PRESS & HOLD TO SPEAK on its own ring. */}
            {'Hi! I\'m Bolo. Hold the Bolo button below to chat in English or ' +
              (chatLanguage?.name ?? chatLang) + '. Ask me or tell me anything!'}
          </Text>
          {/* THE MEMORY DISCLOSURE LIVES HERE NOW, and it kept every word.
              It used to be its own line at the top of the screen. That line
              moved into a pill beside the nav button on 2026-08-28, and the
              full sentence does not fit a 140pt pill, so I cut it down. The
              test guarding it caught that within the hour, and its comment had
              predicted the exact failure: "a disclosure is exactly the kind of
              line that gets refactored out of an empty state by someone tidying
              layout, and nobody notices a sentence that stopped appearing."
              It is in Bolo's own voice in Bolo's own first bubble, which is
              read at the moment it matters, and the pill beside the button is
              now only the WAY TO GO AND LOOK. Both halves survive. */}
          <Text
            testID="chat-memory-tip"
            style={[styles.firstAnswerNote, { color: colors.mutedForeground, marginTop: 6, textAlign: 'left' }]}
          >
            I remember what you tell me, so we can pick up where we left off.
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
          // THE BAND UNDER THE HEADER IS HERS, NOT THE TRANSCRIPT'S (build 25,
          // owner on the iPad: "make sure this isn't happening on any ios or
          // ipad os build", with the reply bubble and the "Crafting a reply"
          // label under the bird). She used to float over the conversation,
          // with only the first message padded clear of her, so anything
          // scrolled to the top slid under her and under the status strip.
          // The viewport now starts below the band, so nothing can.
          style={[styles.transcript, { marginTop: PERCH_SIZE + 16 }]}
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

      {/* BOLO HEARD NOTHING, and says so in his own voice. Deliberately not
          the error box below: a mic that picked up silence is not a fault, and
          a red alert-circle would tell a learner they broke something when all
          they did was speak quietly. */}
      {cantHearMsg && (
        <Animated.View
          testID="chat-cant-hear"
          entering={appear(appearDown(0, 280))}
          style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="mic-off" size={16} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.foreground }]}>
            {cantHearMsg}
          </Text>
        </Animated.View>
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
          ref={chipScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickChipRow}
          keyboardShouldPersistTaps="handled"
          onLayout={(e) => { chipViewportW.current = e.nativeEvent.layout.width; }}
          onContentSizeChange={(w) => { chipContentW.current = w; }}
          // A real swipe stops the nudge; the programmatic scrolls above do not
          // fire this, which is why the flag is only set from a drag.
          onScrollBeginDrag={bumpChipIdle}
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
                bumpChipIdle();
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

      {/* THE TEXT INPUT GOES ABOVE THE NOTES, NOT BELOW THEM.
          Reported 2026-08-28 as "the type to chat is missing". It was: this row
          was the LAST child of the column, so it sat in the bottom band that the
          floating tab bar draws over, and the bar covered it completely. That
          predates this session's work; it is absent from the first screenshot
          taken here, before any of these files were touched.

          COLLAPSED BY DEFAULT. Speaking is the point of this screen and the nav
          button is the microphone, so typing gets the footprint of a fallback
          until someone reaches for it. Expanded, it gets the full bar, the send
          button and the mute toggle. */}
      {/* TAP-OUTSIDE CATCHER. Reported twice on 2026-08-28: "if i click outside
          the expanded state, it should collapse again", then "still doesn't
          collapse". The first attempt hung the collapse off the TextInput's
          onBlur, which never fires, because React Native does NOT blur an input
          when you tap somewhere else. Nothing was listening.

          So there is something to tap. It is only mounted while expanded, it
          sits UNDER the input row and the chips in the tree so both stay live,
          and it is transparent. The tab bar belongs to the navigator above this
          screen, so the Bolo button keeps working through it and a learner can
          still go straight from typing to holding to talk. */}
      {inputExpanded ? (
        <Pressable
          testID="chat-input-backdrop"
          accessible={false}
          onPress={() => {
            Keyboard.dismiss();
            setInputExpanded(false);
          }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {!inputExpanded ? (
        <View style={styles.collapsedRow}>
          <Pressable
            testID="chat-expand-input"
            accessibilityRole="button"
            accessibilityLabel="Type a message instead of speaking"
            onPress={() => {
              bumpChipIdle();
              setInputExpanded(true);
              // The row has to exist before it can take focus.
              setTimeout(() => textInputRef.current?.focus(), 0);
            }}
            style={[
              styles.collapsedPill,
              { backgroundColor: colors.primary + '12', borderColor: colors.primary + '3A' },
            ]}
          >
            <Feather
              name={textInputValue.trim() ? 'corner-down-left' : 'edit-3'}
              size={13}
              color={colors.primary}
            />
            <Text
              numberOfLines={1}
              style={[styles.collapsedPillText, { color: colors.primary }]}
            >
              {textInputValue.trim() ? textInputValue.trim() : 'Type a message'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.textInputRow, { borderTopColor: colors.border }]}>
          <TextInput
            ref={textInputRef}
            value={textInputValue}
            onChangeText={setTextInputValue}
            onSubmitEditing={() => void handleSendText()}
            returnKeyType="send"
            placeholder="Type a message…"
            placeholderTextColor={colors.mutedForeground}
            editable={phase !== 'processing' && phase !== 'recording'}
            // Collapse again only when it is empty: a half-typed message must
            // never be thrown away by a stray tap elsewhere.
            // Tapping anywhere else collapses it (owner, 2026-08-28: "if i
            // click outside the expanded state, it should collapse again").
            // Always, not only when empty: a half-typed message is kept in
            // state and the collapsed pill shows it back, so nothing is lost
            // and nothing is held invisibly.
            // Second path, not the main one: the keyboard's own dismiss
            // button blurs the field without any tap reaching the backdrop.
            onBlur={() => setInputExpanded(false)}
            style={[
              styles.textInput,
              { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.primary + '3A' },
            ]}
            blurOnSubmit={false}
          />
          {/* MUTE BOLO. Word, glyph and fill all change together, never colour
              alone, so the state is readable without relying on hue. */}
          <Pressable
            testID="chat-mute-bolo"
            accessibilityRole="switch"
            accessibilityState={{ checked: boloMuted }}
            accessibilityLabel={boloMuted ? 'Bolo is muted. Unmute Bolo.' : 'Mute Bolo'}
            onPress={() => setBoloMuted((m) => !m)}
            style={[
              styles.muteBtn,
              boloMuted
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: colors.primary + '12', borderColor: colors.primary + '3A' },
            ]}
          >
            <Feather
              name={boloMuted ? 'volume-x' : 'volume-2'}
              size={15}
              color={boloMuted ? (colors.primaryForeground ?? '#fff') : colors.primary}
            />
            <Text
              style={[
                styles.muteBtnText,
                { color: boloMuted ? (colors.primaryForeground ?? '#fff') : colors.primary },
              ]}
            >
              {boloMuted ? 'Muted' : 'Mute'}
            </Text>
          </Pressable>
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
      )}

      {/* THE TWO NOTES, EITHER SIDE OF THE RAISED NAV BUTTON (owner,
          2026-08-28: "move those messages on top down and put them in little
          containers to the left and right of the nav button under the quick
          suggestions").

          They were both at the top of the screen, where they pushed the bird
          and the transcript down and were the copy the bird then covered. The
          band between the chip row and the tab bar is already empty except for
          the ring poking up through the middle of it, so the space either side
          of that ring was going spare.

          Only on the empty state, the same gate the memory tip always had: once
          a conversation is running these are two more things between the
          learner and the thing they came to do, and they have been read.

          THE MEMORY LINE IS A DISCLOSURE, NOT A TIP, which is why it keeps its
          full sentence rather than being cut to fit. Bolo keeps notes about
          learners between sessions and many of them are children. The whole
          pill is the tap target now, so the underlined "See what I remember"
          could go without losing the way in. */}
      {/* NOT GATED ON messages OR phase. chat-bilingual-hint.test.tsx exists
          because this hint was deliberately made PERSISTENT, unlike the old
          empty-state tip that vanished the moment a pending learner bubble
          pushed messages.length past zero. My first version of this row hid it
          during recording and after the first turn, which quietly undid that. */}
      <View style={[styles.flankRow, { paddingBottom: tabBarTop + 4 }]} pointerEvents="box-none">
          <View
            style={[
              styles.flankNote,
              { backgroundColor: colors.secondary + '14', borderColor: colors.secondary + '38' },
            ]}
          >
            <Text style={[styles.flankNoteText, { color: colors.secondary }]}>
              You can respond in English or {chatLanguage?.name ?? chatLang}
            </Text>
          </View>
          {/* Clears the ring, which is HOLD_RING_BOX wide and centred. Derived,
              so it cannot go stale the way four hand-set chip gaps did. */}
          {/* The ring grows on an iPad (navMetrics), so the gap that holds the
              two notes off it has to grow with it or they slide underneath.
              styles.flankGap carries the phone width; this overrides it. */}
          <View
            style={[styles.flankGap, { width: holdRingBoxFor(isWideScreen) }]}
            pointerEvents="none"
          />
          {/* The way to go and look. The sentence it belongs to is in the
              greeting bubble; this is the half that needs a tap target, and a
              disclosure with nowhere to go is only half of one. */}
          <Pressable
            testID="chat-memory-tip-link"
            accessibilityRole="link"
            accessibilityLabel="I remember what you tell me. See what I remember."
            onPress={() => router.push('/(app)/account/memories')}
            style={[
              styles.flankNote,
              { backgroundColor: colors.primary + '14', borderColor: colors.primary + '38' },
            ]}
          >
            <Text style={[styles.flankNoteText, { color: colors.primary }]}>
              I remember what you tell me.{' '}
              <Text style={styles.flankNoteLink}>See what I remember</Text>
            </Text>
          </Pressable>
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

/**
 * HOW FAR THE CHIPS SIT ABOVE THE TAB BAR, and this is the FOURTH value.
 *
 * It was 8, then 26, then 44, each raised after somebody saw the chips resting
 * on the PRESS & HOLD ring. Derived this time rather than nudged: the ring
 * reaches HOLD_RING_REACH above the bottom of its tab slot, the bar itself is
 * 74 tall, so the ring pokes the difference above the bar's top edge and that
 * is what the chips have to clear. 44 left ten points for the label's own
 * height and its descenders, which is why it still touched on a device.
 *
 * THE NUMBER IS NOT WRITTEN DOWN HERE ANY MORE. It said 108pt, which went
 * stale on 2026-08-28 when the focused bubble grew from 58 to 68 and took the
 * reach to 118. Everything below reads the constant, so only the prose was
 * ever able to lie.
 *
 * Doubling the gap on top of the real overhang is deliberate slack: the label
 * hangs off the OUTSIDE of the ring path, so its true top is a few points
 * above the geometry, and I would rather this be loose than be tuned a fifth
 * time.
 *
 * STILL WANTS A DEVICE EYE. This is arithmetic against a floating tab bar
 * whose layout I cannot run here, and the previous three values all looked
 * right on paper too.
 */
const CHIP_GAP = 14;

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
    /**
     * CHIP_GAP, was CHIP_CLEARANCE (72pt). That clearance existed for one
     * reason: to keep this row off the PRESS & HOLD ring poking up through the
     * band below. On 2026-08-28 the two flanking notes moved into that band and
     * hold themselves off the ring with their own centre gap, so the chips are
     * no longer the thing doing the dodging and the 72pt was just a hole.
     * The old CHIP_CLEARANCE constant is deleted rather than left sitting
     * unused: it had no callers left, and a constant nothing reads is the next
     * person's red herring.
     */
    paddingBottom: CHIP_GAP,
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
    /**
     * NO BOTTOM PADDING, and removing it is what actually fixed the bird
     * covering the copy above her (owner screenshot, 2026-08-28).
     *
     * It was TAB_BAR_CLEARANCE, 132pt. That constant exists to keep the last
     * element of a SCROLL VIEW clear of the floating tab bar, and this is not
     * one: the greeting bubble and the chip row are both laid out BELOW this
     * box and already hold it off the bar, so the 132 was counted twice.
     *
     * The damage is not the wasted space, it is the direction. justifyContent
     * centres within the box MINUS the padding, so 132pt of it drove the
     * centre 66pt upward and left roughly 108pt of usable height for a bird
     * that wanted 156 plus a label plus a hint. The surplus then spilled
     * EQUALLY IN BOTH DIRECTIONS and the upward half landed on the bilingual
     * hint and the memory tip.
     *
     * PROVEN BY PUTTING THE BOXES ON THE SCREEN rather than by reading this
     * file: a translucent fill on this box and on the mascot's own showed the
     * image box starting 52pt ABOVE its parent's top edge. Two theories were
     * wrong before that probe, and shrinking the bird from 220 to 156 changed
     * nothing at all, because the bird was never the thing that was too big.
     */
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
  speakingStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9,
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
  memoryTipLink: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  flankRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    /**
     * SITS THE NOTES IN THE BAND BESIDE THE RING, not behind the bar. The
     * first version used paddingBottom 6 and the pills ran under the floating
     * tab bar, which draws over content.
     *
     * Derived, not measured by eye: TAB_BAR_CLEARANCE is how far content must
     * stay off the screen bottom to clear the bar, and the ring pokes
     * HOLD_RING_REACH - 74 above the bar's top edge (74 being the bar's own
     * height). Giving that overhang back is exactly the band the ring occupies,
     * so the notes drop into it and their bottoms land on the bar's top edge.
     */
  },
  flankGap: {
    // The ring's own width, so neither note can slide under it.
    width: HOLD_RING_BOX,
  },
  flankNote: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  collapsedRow: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    alignItems: 'flex-start',
  },
  collapsedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  collapsedPillText: { fontFamily: AppFonts.semibold, fontSize: 12 },
  muteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  muteBtnText: { fontFamily: AppFonts.semibold, fontSize: 11 },
  flankNoteText: {
    fontFamily: AppFonts.regular,
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
  },
  // Underlined so the pill reads as somewhere to go, not just a statement.
  flankNoteLink: {
    fontFamily: AppFonts.semibold,
    textDecorationLine: 'underline',
  },
  textInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    /**
     * 10, was RAISED_PARROT_CLEARANCE (66pt), and that 66 was the gap the owner
     * asked about on 2026-08-28.
     *
     * SAME BUG AS THE CHIP ROW, TWICE IN ONE SCREEN. This row used to be the
     * LAST child of the column, sitting directly under the raised parrot, so it
     * carried the clearance that kept its content off the bubble. The flanking
     * notes were moved below it the same day and now hold that band themselves,
     * which left this padding holding nothing but air.
     *
     * The lesson, since it has now cost two gaps: a clearance constant belongs
     * to whichever element is actually FLUSH against the thing being cleared.
     * Move an element and the clearance does not move with it.
     */
    paddingBottom: 10,
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
