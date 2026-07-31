import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  getChatTurnUrl,
  useGetScenario,
  type ChatTurnMessage,
} from "@workspace/api-client-react";
import { useVoiceRecorder } from "@workspace/integrations-openai-ai-react";
import { ArrowLeft, Globe, ChevronDown, Check, Lock, Mic, Square, SkipForward, AlertCircle, Loader2, Send } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { springs } from "@/lib/motion";
import { Mascot } from "@/components/mascot";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { prewarmMicIfGranted } from "@/lib/micPermission";
import { useLanguage, nativeTextProps } from "@/lib/language-context";
import {
  useEntitlements,
  upgradeHref,
  asUpgradeRequired,
} from "@/lib/entitlements";
import { PlusPill } from "@/components/plus";
import { ChatTipCard } from "@/components/chat-tip-card";
import { webHaptic } from "@/lib/haptics";

// How many previous turns to include in each request.
const HISTORY_WINDOW = 6;
// Free-tier weekly cap in seconds.
const FREE_WEEKLY_CAP_SECONDS = 120;

type ChatPhase =
  | "idle"
  | "recording"
  | "processing"
  | "playing"
  | "error";

type ChatMessage = {
  role: "learner" | "parrot";
  text: string;
  englishText?: string;
  /** True while we're waiting for the transcript — renders as a greyed sending bubble */
  pending?: boolean;
  /** True when the turn errored after the transcript arrived. Shows a retry control. */
  failed?: boolean;
  /**
   * Word-by-word typewriter reveal for parrot bubbles.
   * undefined = show full text (animation complete or not started).
   * A number = how many words are currently revealed (animation in progress).
   */
  revealedWordCount?: number;
};

/** Human-readable labels for each phase, shown under the mascot. */
const PROCESSING_STEP_LABELS = {
  transcribing: "Got it! 💬",
  replying: "Crafting a reply… 🦜",
  voicing: "Warming up my voice… 🎤",
} as const;
type ProcessingStep = keyof typeof PROCESSING_STEP_LABELS;

function getStatusLabel(
  phase: ChatMessage["role"] | "idle" | "recording" | "processing" | "playing" | "error",
  processingStep: ProcessingStep,
  hasMessages: boolean,
): string {
  if (phase === "idle") return hasMessages ? "Hold to talk again" : "Hold Bolo to speak";
  if (phase === "recording") return "Release to send";
  if (phase === "processing") return PROCESSING_STEP_LABELS[processingStep];
  if (phase === "playing") return "Almost ready… 🎵";
  if (phase === "error") return "Something went wrong";
  return "";
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function ChatPage() {
  const [, setLocation] = useLocation();
  // Parse ?scenario=<id> from the URL to enable scenario (capstone) mode.
  const searchStr = useSearch();
  const scenarioId = new URLSearchParams(searchStr).get("scenario") ?? undefined;
  const { activeLang, languages } = useLanguage();
  const { isPlus, isOneLanguage, isLanguageAllowed } = useEntitlements();
  const recorder = useVoiceRecorder();
  const prefersReducedMotion = useReducedMotion();

  // Scenario metadata (title, framing copy, target phrases) — fetched only
  // when a scenarioId is present in the URL. Steering instructions are
  // server-only; this endpoint returns the client-safe subset.
  const scenarioQuery = useGetScenario(scenarioId ?? "", {
    query: { enabled: !!scenarioId, queryKey: ["scenario", scenarioId ?? ""] },
  });
  const scenario = scenarioQuery.data;

  // Per-session chat language — does NOT change the global active language.
  const [chatLang, setChatLang] = useState<string>(activeLang);
  const chatLanguage = languages.find((l) => l.code === chatLang);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("transcribing");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<
    number | null | undefined
  >(undefined);
  const [textInputValue, setTextInputValue] = useState<string>("");
  // Scenario mode state: accumulated romanized phrases the learner has used
  // across all turns, and whether Bolo has signalled the scene is complete.
  const [usedPhrases, setUsedPhrases] = useState<Set<string>>(new Set());
  const [sceneDone, setSceneDone] = useState(false);

  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const wordRevealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishingRef = useRef(false);
  // Guards sendTextTurn against concurrent invocations (e.g. simultaneous
  // Enter key + Send button tap). Separate from finishingRef so voice and
  // text turns don't interfere with each other's guard state.
  const textSendingRef = useRef(false);
  // True once the early `replyText` SSE event has shown Bolo's bubble for the
  // current turn — the word-reveal animation is skipped in that case, since
  // the learner has already been reading the full text during synthesis.
  const earlyReplyShownRef = useRef(false);
  // Incremented each time a new turn starts. finishRecording captures its own
  // snapshot at invocation time and only applies the result if the counter
  // still matches — this prevents a stale older response from overwriting a
  // newer one when the user cancels mid-flight and immediately starts again.
  const activeTurnRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  // AbortController for the in-flight chat fetch — aborted at the start of
  // each new turn and on unmount so stale connections drop immediately.
  const abortControllerRef = useRef<AbortController | null>(null);
  // The audio blob from the most recent recording, retained so a failed turn
  // can be retried without re-recording.
  const currentBlobRef = useRef<Blob | null>(null);
  // When set by handleRetry, finishRecording uses this blob instead of
  // calling recorder.stopRecording() again.
  const retryBlobRef = useRef<Blob | null>(null);
  // Positive hold-confirmation (mic-grant guard). The pointer id of the
  // press currently holding the mic button, or null when no hold is live.
  // startRecording continues into recording after the mic resolves ONLY if
  // this exact pointer is verifiably still down; a permission grant with no
  // live hold discards through the abort path and the page stays idle.
  // Window-level pointerup/pointercancel/blur fallbacks end the hold even
  // when the button never sees the release (the browser's permission prompt
  // can steal focus/pointer, swallowing the button's pointerup).
  const activeHoldPointerRef = useRef<number | null>(null);
  const endHoldCleanupRef = useRef<(() => void) | null>(null);

  const beginHold = useCallback((pointerId: number) => {
    // Replace any stale hold + listeners from a previous press.
    endHoldCleanupRef.current?.();
    activeHoldPointerRef.current = pointerId;
    const endHold = (e?: PointerEvent) => {
      if (e && e.pointerId !== pointerId) return;
      activeHoldPointerRef.current = null;
      window.removeEventListener("pointerup", endHold);
      window.removeEventListener("pointercancel", endHold);
      window.removeEventListener("blur", onBlur);
      endHoldCleanupRef.current = null;
    };
    const onBlur = () => endHold();
    window.addEventListener("pointerup", endHold);
    window.addEventListener("pointercancel", endHold);
    window.addEventListener("blur", onBlur);
    endHoldCleanupRef.current = () => endHold();
  }, []);

  useEffect(() => () => { endHoldCleanupRef.current?.(); }, []);

  // Pre-fetched first-turn greeting for the active chat language. Populated on
  // mount and whenever chatLang changes. Stored in a ref so reads never trigger
  // re-renders and the value is always current inside finishRecording.
  type GreetingData = {
    text: string;
    english: string;
    audioBase64: string;
    format: string;
    squawkVariant: 0 | 1 | 2 | null;
  };
  const greetingRef = useRef<GreetingData | null>(null);

  // ── iOS/WebKit audio unlock ─────────────────────────────────────────────
  // Every iPhone browser (Safari, Chrome, Firefox — all share WebKit) only
  // allows .play() on an <audio> element that has previously started playing
  // inside a real user gesture. Bolo's reply audio starts seconds AFTER the
  // tap (once STT→LLM→TTS finishes), so a fresh `new Audio()` created at that
  // point is silently blocked (NotAllowedError) — captions appear, no voice.
  // Fix: keep two persistent elements (voice + squawk SFX), "bless" them by
  // playing a 50 ms silent clip during the gesture that starts a turn, and
  // route every later playback through the blessed elements.
  const SILENT_WAV =
    "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";
  const voicePoolRef = useRef<HTMLAudioElement | null>(null);
  const sfxPoolRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);

  /** Reuse a pooled (gesture-blessed) element for a new clip. */
  const acquireAudio = useCallback(
    (pool: { current: HTMLAudioElement | null }, src: string): HTMLAudioElement => {
      let el = pool.current;
      if (!el) {
        el = new Audio();
        pool.current = el;
      }
      try {
        el.pause();
      } catch {
        // Detached or disposed element — ignore.
      }
      el.onended = null;
      el.onerror = null;
      el.onplay = null;
      el.src = src;
      return el;
    },
    [],
  );

  /** Must run synchronously inside a user gesture (tap / click / keydown). */
  const unlockAudioPlayback = useCallback(() => {
    if (audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    for (const pool of [voicePoolRef, sfxPoolRef]) {
      if (!pool.current) pool.current = new Audio();
      const el = pool.current;
      el.src = SILENT_WAV;
      el.play().catch(() => {
        // Best-effort: desktop browsers don't need the unlock at all.
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warm up the mic on mount — but only when permission is already granted,
  // so first-time users never see a permission prompt on page load. Their
  // prompt fires on the first record press instead.
  useEffect(() => {
    return prewarmMicIfGranted(() => recorder.prepare());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Stop any in-progress word-reveal animation immediately. */
  const clearWordReveal = useCallback(() => {
    if (wordRevealTimerRef.current !== null) {
      clearInterval(wordRevealTimerRef.current);
      wordRevealTimerRef.current = null;
    }
  }, []);

  /**
   * Stops and releases whatever audio element is currently in playbackRef.
   * Safe to call when the ref is null or the element is already disposed.
   * All reply-playback paths call this before assigning a new element so no
   * audio is ever orphaned.
   */
  const stopCurrentPlayback = useCallback(() => {
    const el = playbackRef.current;
    if (!el) return;
    try {
      el.pause();
      el.onended = null;
      el.onerror = null;
      el.onplay = null;
      el.currentTime = 0;
    } catch {
      // Detached or already-disposed element — ignore.
    }
    playbackRef.current = null;
  }, []);

  // Clear conversation when language changes.
  useEffect(() => {
    clearWordReveal();
    setMessages([]);
    setErrorMsg(null);
    setPhase("idle");
    greetingRef.current = null; // invalidate cached greeting for old language
    if (playbackRef.current) {
      playbackRef.current.pause();
      playbackRef.current = null;
    }
  }, [chatLang, clearWordReveal]);

  // Pre-fetch the first-turn greeting audio for the active chat language so it
  // is always ready by the time the learner first presses Bolo's belly.
  useEffect(() => {
    let cancelled = false;
    const fetchGreeting = async () => {
      try {
        const res = await fetch(
          `/api/openai/chat-greeting?languageCode=${encodeURIComponent(chatLang)}`,
          { credentials: "include" },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as GreetingData;
        if (!cancelled && data.audioBase64) {
          greetingRef.current = data;
        }
      } catch {
        // Non-fatal: first turn falls back to normal flow
      }
    };
    void fetchGreeting();
    return () => { cancelled = true; };
  }, [chatLang]);

  // Stop playback, word-reveal, and any in-flight request on unmount.
  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      clearWordReveal();
      if (playbackRef.current) {
        playbackRef.current.pause();
        playbackRef.current = null;
      }
    },
    [clearWordReveal],
  );

  // Scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;

    // Abort any in-flight turn and arm a fresh controller for this one.
    // The signal is passed to both fetch calls so an interrupted turn drops
    // its connection immediately.
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Capture this turn's ID before any await — only apply the result if the
    // ID still matches when the server responds.
    const myTurn = ++activeTurnRef.current;
    earlyReplyShownRef.current = false;
    setErrorMsg(null);

    // If a retry blob was staged by handleRetry, use it instead of recording
    // a new clip so the same audio is sent without re-recording.
    const retryBlob = retryBlobRef.current;
    retryBlobRef.current = null;
    const isRetry = retryBlob !== null;

    // First-turn greeting: if the greeting is prefetched and this is the very
    // first turn, show and speak it immediately while the real API call runs
    // in the background — eliminating the 2–3 s blank wait.
    const isFirstTurn = messages.length === 0;
    const greeting = greetingRef.current;
    const useGreeting = isFirstTurn && greeting !== null;

    if (!useGreeting) {
      // Normal path: show a spinner and pending learner bubble right away.
      // Web haptic mirrors the mobile hapticMedium() fired on recording stop.
      webHaptic('medium');
      setPhase("processing");
      setProcessingStep("transcribing");
      if (!isRetry) {
        setMessages((prev) => [
          ...prev.filter((m) => !m.pending),
          { role: "learner", text: "", pending: true },
        ]);
      }
      // Retry: handleRetry already restored the failed bubble to pending.
    }

    // ── Streaming voice playback (MSE) ────────────────────────────────────
    // When the server streams `audioChunk` SSE events, MP3 bytes are appended
    // to a MediaSource-backed <audio> element so Bolo's voice starts playing
    // before synthesis finishes. Browsers without MSE MP3 support (e.g.
    // Safari) leave `stream` null and play the full clip from the final
    // `reply` event exactly as before.
    type StreamPlayer = {
      audio: HTMLAudioElement;
      mediaSource: MediaSource;
      sourceBuffer: SourceBuffer | null;
      queue: Uint8Array[];
      /** All chunks received AND appended; safe to endOfStream. */
      done: boolean;
      /** Playback has been kicked off (possibly gated behind the squawk SFX). */
      started: boolean;
      /** Playback finished naturally. */
      ended: boolean;
      failed: boolean;
      squawkVariant: 0 | 1 | 2 | null;
      /** Drains the queue into the SourceBuffer; set once sourceopen wiring exists. */
      pump: () => void;
    };
    let stream: StreamPlayer | null = null;

    const canStreamAudio = () =>
      typeof MediaSource !== "undefined" && MediaSource.isTypeSupported("audio/mpeg");

    const teardownStream = () => {
      if (!stream) return;
      stream.failed = true;
      stream.audio.pause();
      if (playbackRef.current === stream.audio) playbackRef.current = null;
      stream = null;
    };

    const createStreamPlayer = (squawkVariant: 0 | 1 | 2 | null): StreamPlayer | null => {
      if (!canStreamAudio()) return null;
      const mediaSource = new MediaSource();
      const audio = new Audio();
      audio.src = URL.createObjectURL(mediaSource);
      const s: StreamPlayer = {
        audio,
        mediaSource,
        sourceBuffer: null,
        queue: [],
        done: false,
        started: false,
        ended: false,
        failed: false,
        squawkVariant,
        pump: () => {},
      };
      const pump = () => {
        if (s.failed || !s.sourceBuffer || s.sourceBuffer.updating) return;
        const next = s.queue.shift();
        if (next) {
          try {
            s.sourceBuffer.appendBuffer(next as BufferSource);
          } catch {
            s.failed = true;
          }
        } else if (s.done && s.mediaSource.readyState === "open") {
          try { s.mediaSource.endOfStream(); } catch { /* already ended */ }
        }
      };
      mediaSource.addEventListener("sourceopen", () => {
        if (s.failed) return;
        try {
          s.sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
          s.sourceBuffer.addEventListener("updateend", pump);
          s.sourceBuffer.addEventListener("error", () => { s.failed = true; });
          pump();
        } catch {
          s.failed = true;
        }
      });
      s.pump = pump;
      return s;
    };

    const streamPushChunk = (s: StreamPlayer, bytes: Uint8Array) => {
      s.queue.push(bytes);
      s.pump();
    };

    const base64ToBytes = (b64: string): Uint8Array => {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    };

    // Kick off audible playback of the streaming element, preceded by the
    // squawk SFX when Bolo's reply included a squawk token — same ordering as
    // the buffered path.
    const startStreamPlayback = (s: StreamPlayer) => {
      if (s.started || s.failed) return;
      s.started = true;
      // Web haptic mirrors hapticHeavy() fired when Bolo's voice stream begins.
      webHaptic('heavy');
      setPhase("playing");
      const play = () => {
        if (s.failed || activeTurnRef.current !== myTurn) return;
        console.log('[audio] play path=stream');
        stopCurrentPlayback();
        playbackRef.current = s.audio;
        s.audio.onended = () => {
          s.ended = true;
          if (playbackRef.current === s.audio) playbackRef.current = null;
          if (activeTurnRef.current === myTurn) setPhase("idle");
        };
        s.audio.onerror = () => { s.failed = true; };
        s.audio.play().catch(() => { s.failed = true; });
      };
      if (s.squawkVariant !== null && s.squawkVariant !== undefined) {
        const sfxFile = ["squawk_a", "squawk_b", "squawk_c"][s.squawkVariant];
        const sfx = acquireAudio(sfxPoolRef, `/gujarati-coach/sounds/${sfxFile}.mp3`);
        // One-shot guard: whichever of onended / onerror / play().catch fires
        // first wins; subsequent callbacks are silently dropped.
        let sfxFired = false;
        const oncePlay = () => {
          if (sfxFired) { console.log('[audio] duplicate blocked path=stream'); return; }
          sfxFired = true;
          play();
        };
        sfx.onended = oncePlay;
        sfx.onerror = oncePlay;
        sfx.play().catch(oncePlay);
      } else {
        play();
      }
    };

    // Tracks whether a transcript SSE event arrived before any error; used in
    // the catch block to decide between a failed bubble and a removed bubble.
    let transcriptForCatch = "";

    try {
      const blob = isRetry ? retryBlob! : await recorder.stopRecording();
      // Read the wall-clock duration immediately after stopRecording with no
      // intervening await so a concurrent recording cannot overwrite the value.
      const wallClockDuration = recorder.getLastDurationSeconds();

      if (!isRetry) {
        if (blob.size === 0) {
          setErrorMsg("We didn't capture any audio. Check your microphone and try again.");
          setPhase("error");
          finishingRef.current = false;
          return;
        }

        // Duration gate: wall-clock elapsed time supplied by the recorder.
        // Threshold = 0.25 s — wall-clock includes button-press/release overhead
        // that decoded audio length does not, and a single short word ("haan",
        // "ek") can be under 400 ms of speech. The value is always finite so the
        // gate always evaluates; no skip-on-Infinity behaviour needed.
        if (wallClockDuration < 0.25) {
          console.log(`[stt] skipped reason=too_short duration=${wallClockDuration.toFixed(3)}s`);
          setMessages((prev) => prev.filter((m) => !m.pending));
          setErrorMsg("Didn't catch that — hold the button a little longer and try again.");
          setPhase("idle");
          finishingRef.current = false;
          return;
        }

        // Size floor: reject containers whose byte length is too small to hold
        // real audio frames. A WebM blob can carry valid EBML headers but zero
        // encoded frames; duration alone does not reliably catch that case.
        if (blob.size < 2048) {
          console.log(`[stt] skipped reason=too_small size=${blob.size}`);
          setMessages((prev) => prev.filter((m) => !m.pending));
          setErrorMsg("Didn't catch that — hold the button a little longer and try again.");
          setPhase("idle");
          finishingRef.current = false;
          return;
        }
      }

      // Store blob so a failed turn can be retried without re-recording.
      currentBlobRef.current = blob;

      // Convert blob to base64.
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const audioBase64 = btoa(binary);
      const audioMimeType = blob.type || undefined;

      // ── First-turn greeting path ───────────────────────────────────────────
      // Show Bolo's pre-synthesized welcome message immediately, eliminating
      // the 2–3 s blank wait while STT→LLM→TTS completes. The real API call
      // runs concurrently; its reply queues to play the moment the greeting ends.
      if (useGreeting) {
        // Inject the greeting bubble instantly — no spinner.
        setPhase("playing");
        earlyReplyShownRef.current = true; // skip word-reveal on real reply
        setMessages([{
          role: "parrot",
          text: greeting!.text,
          englishText: greeting!.english || undefined,
        }]);

        // Coordinate greeting audio with the real reply that arrives later.
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
            setPhase("processing");
            setProcessingStep("voicing");
          }
        };

        // Play greeting audio (squawk SFX intro, then the voice clip).
        const greetingAudio = acquireAudio(voicePoolRef, `data:audio/${greeting!.format};base64,${greeting!.audioBase64}`);
        playbackRef.current = greetingAudio;
        greetingAudio.onended = onGreetingEnded;
        greetingAudio.onerror = () => onGreetingEnded();

        const startGreetingAudio = () => {
          if (activeTurnRef.current !== myTurn) return;
          greetingAudio.play().catch((e) => {
            console.log('[audio] play blocked path=greeting', (e as Error)?.name);
            onGreetingEnded();
          });
        };

        const gSfxIdx = greeting!.squawkVariant ?? 0;
        const gSfxFile = ["squawk_a", "squawk_b", "squawk_c"][gSfxIdx];
        const gSfx = acquireAudio(sfxPoolRef, `/gujarati-coach/sounds/${gSfxFile}.mp3`);
        gSfx.onended = startGreetingAudio;
        gSfx.onerror = startGreetingAudio;
        gSfx.play().catch(startGreetingAudio);

        // Fire the real API call (no streaming audio — we just need the reply).
        const chatUrl = getChatTurnUrl();
        const gRes = await fetch(chatUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
          body: JSON.stringify({ languageCode: chatLang, audioBase64, mimeType: audioMimeType, clientDurationSeconds: wallClockDuration, history: [] }),
          signal: abortController.signal,
        });

        if (!gRes.ok) {
          const gErrBody = await gRes.text().catch(() => "");
          throw new Error(`Chat API responded with ${gRes.status}: ${gErrBody.slice(0, 200)}`);
        }
        if (!gRes.body) {
          throw new Error("Chat API response contained no body");
        }

        // Parse SSE events from the real chat call.
        const gReader = gRes.body.getReader();
        const gDecoder = new TextDecoder();
        let gSseBuffer = "";
        let transcriptAdded = false;

        gOuter: while (true) {
          const { done, value } = await gReader.read();
          if (done) break;
          if (activeTurnRef.current !== myTurn) { gReader.cancel().catch(() => {}); return; }
          gSseBuffer += gDecoder.decode(value, { stream: true });
          const gParts = gSseBuffer.split("\n\n");
          gSseBuffer = gParts.pop() ?? "";

          for (const part of gParts) {
            let evtName = "message";
            let dataStr = "";
            for (const line of part.split("\n")) {
              if (line.startsWith("event: ")) evtName = line.slice(7).trim();
              else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
            }
            if (!dataStr) continue;
            if (activeTurnRef.current !== myTurn) { gReader.cancel().catch(() => {}); return; }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const gPayload = JSON.parse(dataStr) as any;

            if (evtName === "transcript" && !transcriptAdded) {
              // Add learner bubble below the greeting bubble.
              transcriptAdded = true;
              const t = (gPayload.transcript as string) ?? "";
              transcriptForCatch = t;
              setMessages((prev) => [...prev, { role: "learner", text: t }]);
            } else if (evtName === "reply") {
              // Server rejected transcript — no parrot reply. Let the greeting
              // audio finish naturally, then return to idle with a retry message.
              if (gPayload.noSpeech) {
                const handleNoSpeech = () => {
                  if (activeTurnRef.current === myTurn) {
                    setPhase("idle");
                    setErrorMsg("I didn't catch that — please try again!");
                  }
                };
                if (greetingEnded) {
                  handleNoSpeech();
                } else {
                  pendingPlay = handleNoSpeech;
                }
                break gOuter;
              }

              const rText = (gPayload.replyText as string) ?? "";
              const rEnglish = (gPayload.replyEnglish as string) ?? "";
              const rTranscriptEnglish = (gPayload.transcriptEnglish as string) ?? "";
              const rAudio = (gPayload.replyAudioBase64 as string) ?? "";
              const rFmt = (gPayload.format as string) || "mp3";
              const rSquawk = gPayload.squawkVariant as 0 | 1 | 2 | null;
              const rSecs = gPayload.secondsRemaining as number | null;

              if (rSecs !== null) setSecondsRemaining(rSecs);
              else setSecondsRemaining(null);

              const showRealReply = () => {
                if (activeTurnRef.current !== myTurn) return;
                // Back-fill English gloss on the learner bubble.
                if (rTranscriptEnglish) {
                  setMessages((prev) => {
                    const u = [...prev];
                    for (let i = u.length - 1; i >= 0; i--) {
                      if (u[i].role === "learner") {
                        if (rTranscriptEnglish !== u[i].text) {
                          u[i] = { ...u[i], englishText: rTranscriptEnglish };
                        }
                        break;
                      }
                    }
                    return u;
                  });
                }
                // Add real parrot reply bubble.
                setMessages((prev) => [
                  ...prev,
                  { role: "parrot", text: rText, englishText: rEnglish || undefined },
                ]);
                setPhase("playing");
                const playRealAudio = () => {
                  if (activeTurnRef.current !== myTurn) return;
                  console.log('[audio] play path=reply');
                  stopCurrentPlayback();
                  const ra = acquireAudio(voicePoolRef, `data:audio/${rFmt};base64,${rAudio}`);
                  playbackRef.current = ra;
                  ra.onended = () => {
                    if (playbackRef.current === ra) playbackRef.current = null;
                    if (activeTurnRef.current === myTurn) setPhase("idle");
                  };
                  ra.play().catch((e) => {
                    console.log('[audio] play blocked path=reply', (e as Error)?.name);
                    if (playbackRef.current === ra) playbackRef.current = null;
                    if (activeTurnRef.current === myTurn) setPhase("idle");
                  });
                };
                if (rSquawk !== null && rSquawk !== undefined) {
                  const rSfxFile = ["squawk_a", "squawk_b", "squawk_c"][rSquawk];
                  const rSfx = acquireAudio(sfxPoolRef, `/gujarati-coach/sounds/${rSfxFile}.mp3`);
                  let rSfxFired = false;
                  const onceRealAudio = () => {
                    if (rSfxFired) { console.log('[audio] duplicate blocked path=reply'); return; }
                    rSfxFired = true;
                    playRealAudio();
                  };
                  rSfx.onended = onceRealAudio;
                  rSfx.onerror = onceRealAudio;
                  rSfx.play().catch(onceRealAudio);
                } else {
                  playRealAudio();
                }
              };

              if (greetingEnded) {
                showRealReply();
              } else {
                pendingPlay = showRealReply;
              }
              break gOuter;
            } else if (evtName === "error") {
              // Real reply failed — greeting already plays; just let it end.
              break gOuter;
            }
          }
        }
        // Function returns here; finally block releases finishingRef.
        currentBlobRef.current = null;
        abortControllerRef.current = null;
        return;
      }
      // ── End greeting path ─────────────────────────────────────────────────

      const history: ChatTurnMessage[] = messages
        .filter((m) => !m.pending && !m.failed)
        .slice(-HISTORY_WINDOW)
        .map((m) => ({ role: m.role === "parrot" ? "parrot" : "learner", text: m.text }));

      // POST with Accept: text/event-stream to get the two-event SSE stream:
      //   1. `transcript` — fires after Whisper STT (~1 s), shows learner bubble early.
      //   2. `reply`      — fires after LLM+TTS, carries audio + parrot text.
      const chatUrl = getChatTurnUrl();
      const res = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
          // Opt in to chunked voice streaming (audioChunk SSE events) — only
          // requested when this browser can actually play a partial MP3 via
          // MediaSource, so unsupported browsers don't download audio twice.
          ...(typeof MediaSource !== "undefined" && MediaSource.isTypeSupported("audio/mpeg")
            ? { "X-Audio-Stream": "1" }
            : {}),
        },
        body: JSON.stringify({ languageCode: chatLang, audioBase64, mimeType: audioMimeType, clientDurationSeconds: wallClockDuration, history, ...(scenarioId ? { scenarioId } : {}) }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Chat API responded with ${res.status}: ${body.slice(0, 200)}`);
      }
      if (!res.body) {
        throw new Error("Chat API response contained no body");
      }

      // Read the SSE stream line-by-line.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });

        // Events are delimited by double newlines.
        const parts = sseBuffer.split("\n\n");
        sseBuffer = parts.pop() ?? "";

        for (const part of parts) {
          let eventName = "message";
          let dataStr = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) eventName = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payload = JSON.parse(dataStr) as any;

          if (eventName === "transcript") {
            const transcriptText = (payload.transcript as string) ?? "";
            // A newer turn started while this one was in flight — drop stale result.
            if (activeTurnRef.current !== myTurn) {
              reader.cancel().catch(() => {});
              return;
            }
            // Record transcript so the catch block can mark the bubble failed
            // rather than removing it if this turn errors after this point.
            transcriptForCatch = transcriptText;
            // Replace the pending bubble with the real transcript text.
            // English gloss will be back-filled on the reply event.
            setMessages((prev) => {
              const pendingIdx = prev.findIndex((m) => m.pending);
              if (pendingIdx >= 0) {
                const updated = [...prev];
                updated[pendingIdx] = { role: "learner", text: transcriptText };
                return updated;
              }
              return [...prev, { role: "learner", text: transcriptText }];
            });
            setProcessingStep("replying");

          } else if (eventName === "replyText") {
            // Early reply-text event — fires as soon as the LLM returns,
            // before voice synthesis. Show Bolo's bubble immediately (greyed
            // "pending" style) so the learner can start reading while the
            // audio is still being synthesized.
            if (activeTurnRef.current !== myTurn) {
              reader.cancel().catch(() => {});
              return;
            }
            const earlyText = (payload.replyText as string) ?? "";
            const earlyEnglish = (payload.replyEnglish as string) ?? "";
            if (earlyText) {
              earlyReplyShownRef.current = true;
              setMessages((prev) => [
                ...prev,
                {
                  role: "parrot",
                  text: earlyText,
                  englishText: earlyEnglish || undefined,
                  pending: true,
                },
              ]);
            }
            setProcessingStep("voicing");
            // Prepare the streaming voice player now that the squawk variant
            // is known — audio chunks will start arriving next.
            const variant = (payload.squawkVariant ?? null) as 0 | 1 | 2 | null;
            stream = createStreamPlayer(variant);

          } else if (eventName === "audioChunk") {
            if (activeTurnRef.current !== myTurn) {
              teardownStream();
              reader.cancel().catch(() => {});
              return;
            }
            if (stream && !stream.failed) {
              try {
                streamPushChunk(stream, base64ToBytes((payload.chunk as string) ?? ""));
                // Begin playback on the first chunk — the rest keep buffering
                // while the clip is already audible.
                startStreamPlayback(stream);
              } catch {
                teardownStream();
              }
            }

          } else if (eventName === "audioDone") {
            if (stream && !stream.failed) {
              stream.done = true;
              stream.pump();
            }

          } else if (eventName === "reply") {
            // A newer turn started while LLM+TTS was in flight — drop stale result.
            if (activeTurnRef.current !== myTurn) {
              teardownStream();
              reader.cancel().catch(() => {});
              return;
            }

            // Server rejected the transcript (silent recording / prompt echo).
            // Remove the pending bubble and show a friendly retry message.
            if (payload.noSpeech) {
              teardownStream();
              setMessages((prev) => prev.filter((m) => !m.pending));
              setErrorMsg("I didn't catch that — please try again!");
              setPhase("idle");
              break outer;
            }

            const replyText = (payload.replyText as string) ?? "";
            const replyEnglish = (payload.replyEnglish as string) ?? "";
            const transcriptEnglish = (payload.transcriptEnglish as string) ?? "";
            const replyAudioBase64 = (payload.replyAudioBase64 as string) ?? "";
            const format = (payload.format as string) || "mp3";
            const squawkVariant = payload.squawkVariant as 0 | 1 | 2 | null;
            const secondsRemaining = payload.secondsRemaining as number | null;
            // Scenario: accumulate used phrases and scene-done flag.
            const turnPhrasesUsed = (payload.phrasesUsed as string[] | undefined) ?? [];
            const turnSceneDone = (payload.sceneDone as boolean | undefined) ?? false;
            if (turnPhrasesUsed.length > 0) {
              setUsedPhrases(prev => new Set([...prev, ...turnPhrasesUsed]));
            }
            if (turnSceneDone) setSceneDone(true);

            const replyWords = replyText.split(/\s+/).filter(Boolean);
            // Skip the typewriter reveal when the early replyText bubble was
            // already shown — the learner has been reading the full text.
            const shouldAnimate =
              !prefersReducedMotion && replyWords.length > 1 && !earlyReplyShownRef.current;

            setMessages((prev) => {
              const updated = [...prev];
              // Back-fill the English gloss on the learner bubble we already showed
              // on the transcript event — transcriptEnglish only comes from the LLM.
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].role === "learner") {
                  if (transcriptEnglish && transcriptEnglish !== updated[i].text) {
                    updated[i] = { ...updated[i], englishText: transcriptEnglish };
                  }
                  break;
                }
              }
              const parrotBubble = {
                role: "parrot" as const,
                text: replyText,
                englishText: replyEnglish,
                // Start with 0 revealed words when animating so the bubble
                // appears first (giving Devanagari/Nastaliq readers a moment
                // to orient), then words reveal in sync with the audio.
                revealedWordCount: shouldAnimate ? 0 : undefined,
              };
              // If the early replyText event already showed a pending parrot
              // bubble, finalize it in place instead of appending a duplicate.
              const lastIdx = updated.length - 1;
              if (lastIdx >= 0 && updated[lastIdx].role === "parrot" && updated[lastIdx].pending) {
                updated[lastIdx] = parrotBubble;
                return updated;
              }
              return [...updated, parrotBubble];
            });

            if (secondsRemaining !== null) {
              setSecondsRemaining(secondsRemaining);
            } else {
              setSecondsRemaining(null);
            }

            // Let React render the parrot bubble before audio starts — learners
            // reading scripts like Devanagari or Nastaliq get a half-beat to
            // find their place before the audio begins.
            await new Promise<void>((resolve) => setTimeout(resolve, 80));

            // Start the word-reveal animation timed to the audio duration.
            if (shouldAnimate && activeTurnRef.current === myTurn) {
              clearWordReveal();
              const capturedTurn = myTurn;

              // Probe the audio element for its duration so we can pace reveals.
              const getAudioDuration = (): Promise<number> =>
                new Promise((resolve) => {
                  const probe = new Audio(`data:audio/${format};base64,${replyAudioBase64}`);
                  probe.addEventListener("loadedmetadata", () => resolve(probe.duration), { once: true });
                  // Fallback: assume ~400 ms per word if metadata never fires.
                  probe.addEventListener("error", () => resolve(replyWords.length * 0.4), { once: true });
                  probe.load();
                });

              getAudioDuration().then((duration) => {
                if (activeTurnRef.current !== capturedTurn) return;
                const msPerWord = Math.max(100, Math.min(900, (duration * 1000) / replyWords.length));
                let revealed = 1;

                // Show the first word immediately.
                setMessages((prev) =>
                  prev.map((m, idx, arr) => {
                    if (m.role === "parrot" && m.revealedWordCount !== undefined && idx === arr.length - 1) {
                      return { ...m, revealedWordCount: 1 };
                    }
                    return m;
                  }),
                );

                wordRevealTimerRef.current = setInterval(() => {
                  if (activeTurnRef.current !== capturedTurn) {
                    clearWordReveal();
                    return;
                  }
                  revealed++;
                  if (revealed >= replyWords.length) {
                    clearWordReveal();
                    // Animation complete — drop revealedWordCount so the full
                    // text renders without special handling.
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.role === "parrot" && m.revealedWordCount !== undefined
                          ? { ...m, revealedWordCount: undefined }
                          : m,
                      ),
                    );
                  } else {
                    setMessages((prev) =>
                      prev.map((m, idx, arr) => {
                        if (m.role === "parrot" && m.revealedWordCount !== undefined && idx === arr.length - 1) {
                          return { ...m, revealedWordCount: revealed };
                        }
                        return m;
                      }),
                    );
                  }
                }, msPerWord);
              });
            }

            // A newer turn may have started during the await — drop stale result.
            if (activeTurnRef.current !== myTurn) {
              teardownStream();
              reader.cancel().catch(() => {});
              return;
            }

            // If the streaming player handled this turn's voice (all chunks
            // received and playing/played), don't start a second playback of
            // the full clip — just keep the phase coherent with where the
            // streamed audio actually is.
            if (stream && stream.started && stream.done && !stream.failed) {
              setPhase(stream.ended ? "idle" : "playing");
              break outer; // reply is the final event
            }
            // Streaming unsupported, failed, or the server fell back to
            // buffered synthesis — discard any partial stream and play the
            // complete clip exactly as before.
            teardownStream();

            // Play the parrot's audio reply (preceded by a squawk SFX when
            // Bolo included a squawk token).
            setPhase("playing");

            const playReply = () => {
              console.log('[audio] play path=reply');
              stopCurrentPlayback();
              const audio = acquireAudio(voicePoolRef, `data:audio/${format};base64,${replyAudioBase64}`);
              playbackRef.current = audio;
              audio.onended = () => { playbackRef.current = null; setPhase("idle"); };
              audio.play().catch((e) => {
                console.log('[audio] play blocked path=reply', (e as Error)?.name);
                playbackRef.current = null;
                setPhase("idle");
              });
            };

            if (squawkVariant !== null && squawkVariant !== undefined) {
              const sfxFile = ["squawk_a", "squawk_b", "squawk_c"][squawkVariant];
              const sfx = acquireAudio(sfxPoolRef, `/gujarati-coach/sounds/${sfxFile}.mp3`);
              let sfxFired = false;
              const onceReply = () => {
                if (sfxFired) { console.log('[audio] duplicate blocked path=reply'); return; }
                sfxFired = true;
                playReply();
              };
              sfx.onended = onceReply;
              sfx.onerror = onceReply;
              sfx.play().catch(onceReply);
            } else {
              playReply();
            }
            break outer; // reply is the final event

          } else if (eventName === "error") {
            throw new Error((payload.error as string) || "Chat turn failed");
          }
        }
      }
      // Turn completed successfully.
      currentBlobRef.current = null;
      abortControllerRef.current = null;
    } catch (err) {
      // Stop any half-played streaming audio before surfacing the error.
      teardownStream();

      const isAbort = err instanceof Error && err.name === "AbortError";

      // Resolve the pending learner bubble: if a transcript arrived before the
      // failure, convert it to a failed bubble (shows a retry control);
      // otherwise remove it entirely.
      const resolvePendingBubble = () => {
        setMessages((prev) => {
          if (transcriptForCatch) {
            for (let bi = prev.length - 1; bi >= 0; bi--) {
              if (prev[bi].role === "learner" && !prev[bi].failed) {
                return prev.map((m, idx) => idx === bi ? { ...m, failed: true } : m);
              }
            }
            return prev;
          }
          return prev.filter((m) => !m.pending);
        });
      };

      // A newer turn started — drop this error silently.
      if (activeTurnRef.current !== myTurn) {
        resolvePendingBubble();
        finishingRef.current = false;
        return;
      }

      // Intentional abort (new turn started or component unmounted) — silent.
      if (isAbort) {
        resolvePendingBubble();
        setPhase("idle");
        finishingRef.current = false;
        return;
      }

      resolvePendingBubble();

      const upgrade = asUpgradeRequired(err);
      if (upgrade) {
        const isCap = upgrade.reason === "weekly_cap_exceeded";
        if (isCap) {
          setSecondsRemaining(0);
          setLocation(upgradeHref({ plan: "plus" }));
          setPhase("idle");
          finishingRef.current = false;
          return;
        }
        setLocation(
          upgradeHref({
            plan: "plus",
            reason: upgrade.reason ?? null,
          }),
        );
        setPhase("idle");
        finishingRef.current = false;
        return;
      }

      let msg = "Bolo ran into a snag — hold to try again!";
      if (err instanceof TypeError) {
        msg = "Bolo flew out for a mango lassi 🥭 — check your connection and try again!";
      } else if (err instanceof Error && /Chat API responded with 502/.test(err.message)) {
        msg = "Bolo couldn't catch that 🦜 — give it another try!";
      } else if (err instanceof Error && /Chat API responded with 429/.test(err.message)) {
        msg = "Slow down a bit! Wait a moment and try again.";
      }
      setErrorMsg(msg);
      setPhase("error");
    } finally {
      // Only release the guard when this is still the active turn. A stale
      // turn releasing it while the active turn is in flight would allow a
      // third concurrent invocation to start.
      if (activeTurnRef.current === myTurn) {
        finishingRef.current = false;
      }
    }
  }, [recorder, chatLang, messages, setLocation, clearWordReveal, prefersReducedMotion, stopCurrentPlayback, acquireAudio]);

  const showTimeIndicator =
    !isPlus && !isOneLanguage && secondsRemaining !== undefined && secondsRemaining !== null;
  const timePercent = showTimeIndicator
    ? Math.max(0, Math.min(1, secondsRemaining! / FREE_WEEKLY_CAP_SECONDS))
    : 1;
  const capExhausted = showTimeIndicator && secondsRemaining! <= 0;

  const stopPlayback = useCallback(() => {
    stopCurrentPlayback();
    setPhase("idle");
  }, [stopCurrentPlayback]);

  // Retry a failed turn by re-submitting the stored audio blob without
  // re-recording. The failed bubble is restored to pending in-place so the
  // conversation order is preserved.
  const handleRetry = useCallback((messageIndex: number) => {
    unlockAudioPlayback(); // retry click is a gesture — bless audio elements
    const blob = currentBlobRef.current;
    if (!blob) return; // no blob available — user must re-record
    retryBlobRef.current = blob;
    setMessages((prev) => prev.map((m, i) =>
      i === messageIndex ? { ...m, failed: undefined, pending: true, text: "" } : m,
    ));
    finishingRef.current = false;
    void finishRecording();
  }, [finishRecording, unlockAudioPlayback]);

  const startRecording = useCallback(async () => {
    // Cap check for free users.
    if (!isPlus && !isOneLanguage && secondsRemaining !== undefined && secondsRemaining !== null && secondsRemaining <= 0) {
      setLocation(upgradeHref({ plan: "plus" }));
      return;
    }

    setErrorMsg(null);
    finishingRef.current = false;
    // Capture which pointer initiated this press. On grant-resolve we
    // continue only if that exact pointer is verifiably still held.
    const holdPointerId = activeHoldPointerRef.current;
    if (playbackRef.current) {
      playbackRef.current.pause();
      playbackRef.current = null;
    }

    try {
      await recorder.startRecording({
        onSilence: () => { void finishRecording(); },
        silenceDurationMs: 1800,
      });
      // Positive hold-confirmation: a permission grant by itself must never
      // start a recording. Continue only if the exact pointer that started
      // this press is verifiably still held — otherwise (released while the
      // prompt was open, release swallowed by the prompt stealing focus, or
      // no live press at all) discard, release the mic, stay idle.
      if (holdPointerId === null || activeHoldPointerRef.current !== holdPointerId) {
        recorder.abortRecording();
        setPhase("idle");
        return;
      }
      setPhase("recording");
    } catch {
      setErrorMsg("We couldn't access your microphone. Allow mic access in your browser, then try again.");
      setPhase("error");
    }
  }, [isPlus, isOneLanguage, secondsRemaining, recorder, finishRecording, setLocation]);

  // Send a typed message as a chat turn, bypassing audio recording entirely.
  const sendTextTurn = useCallback(async () => {
    // Called synchronously from the Send click / Enter keydown — bless the
    // pooled audio elements while gesture context is still live (iOS/WebKit).
    unlockAudioPlayback();
    const text = textInputValue.trim();
    if (!text) return;
    if (phase === "processing" || phase === "recording") return;
    // Guard against concurrent invocations (e.g. simultaneous Enter + Send tap).
    if (textSendingRef.current) return;
    textSendingRef.current = true;

    // Abort any in-flight voice turn before starting this text turn.
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Stop any in-progress playback or word-reveal.
    if (playbackRef.current) {
      playbackRef.current.pause();
      playbackRef.current = null;
    }
    clearWordReveal();

    const myTurn = ++activeTurnRef.current;
    earlyReplyShownRef.current = false;
    setErrorMsg(null);
    setTextInputValue("");

    // Show the learner bubble immediately — no "Sending…" pending state needed
    // for text (the transcript is already known).
    // Web haptic mirrors hapticMedium() fired on voice/text message send.
    webHaptic('medium');
    setPhase("processing");
    setProcessingStep("replying");
    setMessages((prev) => [
      ...prev.filter((m) => !m.pending),
      { role: "learner", text },
    ]);

    const history: ChatTurnMessage[] = messages
      .filter((m) => !m.pending && !m.failed)
      .slice(-HISTORY_WINDOW)
      .map((m) => ({ role: m.role === "parrot" ? "parrot" : "learner", text: m.text }));

    try {
      const chatUrl = getChatTurnUrl();
      const res = await fetch(chatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
        body: JSON.stringify({ languageCode: chatLang, textInput: text, history, ...(scenarioId ? { scenarioId } : {}) }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Chat API responded with ${res.status}: ${body.slice(0, 200)}`);
      }
      if (!res.body) {
        throw new Error("Chat API response contained no body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (activeTurnRef.current !== myTurn) { reader.cancel().catch(() => {}); return; }
        sseBuffer += decoder.decode(value, { stream: true });

        const parts = sseBuffer.split("\n\n");
        sseBuffer = parts.pop() ?? "";

        for (const part of parts) {
          let eventName = "message";
          let dataStr = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) eventName = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;
          if (activeTurnRef.current !== myTurn) { reader.cancel().catch(() => {}); return; }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payload = JSON.parse(dataStr) as any;

          if (eventName === "transcript") {
            // Server echoes back our text — bubble already shown, skip.
          } else if (eventName === "replyText") {
            const earlyText = (payload.replyText as string) ?? "";
            const earlyEnglish = (payload.replyEnglish as string) ?? "";
            if (earlyText) {
              earlyReplyShownRef.current = true;
              setMessages((prev) => [
                ...prev,
                { role: "parrot", text: earlyText, englishText: earlyEnglish || undefined, pending: true },
              ]);
            }
            setProcessingStep("voicing");
          } else if (eventName === "reply") {
            if (activeTurnRef.current !== myTurn) { reader.cancel().catch(() => {}); return; }

            const replyText = (payload.replyText as string) ?? "";
            const replyEnglish = (payload.replyEnglish as string) ?? "";
            const transcriptEnglish = (payload.transcriptEnglish as string) ?? "";
            const replyAudioBase64 = (payload.replyAudioBase64 as string) ?? "";
            const format = (payload.format as string) || "mp3";
            const squawkVariant = payload.squawkVariant as 0 | 1 | 2 | null;
            const remainingSecs = payload.secondsRemaining as number | null;
            // Scenario: accumulate used phrases and scene-done flag.
            const textTurnPhrasesUsed = (payload.phrasesUsed as string[] | undefined) ?? [];
            const textTurnSceneDone = (payload.sceneDone as boolean | undefined) ?? false;
            if (textTurnPhrasesUsed.length > 0) {
              setUsedPhrases(prev => new Set([...prev, ...textTurnPhrasesUsed]));
            }
            if (textTurnSceneDone) setSceneDone(true);

            if (remainingSecs !== null) setSecondsRemaining(remainingSecs);
            else setSecondsRemaining(null);

            setMessages((prev) => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].role === "learner") {
                  if (transcriptEnglish && transcriptEnglish !== updated[i].text) {
                    updated[i] = { ...updated[i], englishText: transcriptEnglish };
                  }
                  break;
                }
              }
              const parrotBubble = {
                role: "parrot" as const,
                text: replyText,
                englishText: replyEnglish || undefined,
              };
              const lastIdx = updated.length - 1;
              if (lastIdx >= 0 && updated[lastIdx].role === "parrot" && updated[lastIdx].pending) {
                updated[lastIdx] = parrotBubble;
              } else {
                updated.push(parrotBubble);
              }
              return updated;
            });

            await new Promise<void>((resolve) => setTimeout(resolve, 80));
            if (activeTurnRef.current !== myTurn) { reader.cancel().catch(() => {}); return; }

            setPhase("playing");
            const playReply = () => {
              if (activeTurnRef.current !== myTurn) return;
              console.log('[audio] play path=reply');
              stopCurrentPlayback();
              const audio = acquireAudio(voicePoolRef, `data:audio/${format};base64,${replyAudioBase64}`);
              playbackRef.current = audio;
              audio.onended = () => { playbackRef.current = null; setPhase("idle"); };
              audio.play().catch((e) => {
                console.log('[audio] play blocked path=reply', (e as Error)?.name);
                playbackRef.current = null;
                setPhase("idle");
              });
            };
            if (squawkVariant !== null && squawkVariant !== undefined) {
              const sfxFile = ["squawk_a", "squawk_b", "squawk_c"][squawkVariant];
              const sfx = acquireAudio(sfxPoolRef, `/gujarati-coach/sounds/${sfxFile}.mp3`);
              let sfxFired = false;
              const onceReply = () => {
                if (sfxFired) { console.log('[audio] duplicate blocked path=reply'); return; }
                sfxFired = true;
                playReply();
              };
              sfx.onended = onceReply;
              sfx.onerror = onceReply;
              sfx.play().catch(onceReply);
            } else {
              playReply();
            }
            break outer;
          } else if (eventName === "error") {
            throw new Error((payload.error as string) || "Chat turn failed");
          }
        }
      }
      // Turn completed successfully.
      abortControllerRef.current = null;
    } catch (err) {
      if (activeTurnRef.current !== myTurn) return;

      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) {
        setPhase("idle");
        return;
      }

      const upgrade = asUpgradeRequired(err);
      if (upgrade) {
        setLocation(
          upgradeHref({
            plan: "plus",
            reason: upgrade.reason ?? null,
          }),
        );
        setPhase("idle");
        return;
      }

      let msg = "Bolo ran into a snag — try again!";
      if (err instanceof TypeError) msg = "Bolo flew out for a mango lassi 🥭 — check your connection and try again!";
      setErrorMsg(msg);
      setPhase("error");
    } finally {
      textSendingRef.current = false;
    }
  }, [textInputValue, phase, chatLang, messages, clearWordReveal, setLocation, stopCurrentPlayback, acquireAudio, unlockAudioPlayback]);

  const handleMicPointerDown = useCallback((e: React.PointerEvent) => {
    // Bless the pooled audio elements while we're inside a real gesture —
    // required on iOS/WebKit for the reply audio that plays seconds later.
    unlockAudioPlayback();
    if (capExhausted) return;
    e.preventDefault(); // suppress context menu on long-press
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (phase === "playing") {
      stopPlayback();
      return; // don't start recording on the same gesture
    }

    if (phase === "processing") {
      // Supersede the in-flight request by bumping the turn counter; when the
      // old response arrives its turn ID will no longer match and it is dropped.
      clearWordReveal();
      activeTurnRef.current++;
      finishingRef.current = false;
      beginHold(e.pointerId);
      void startRecording();
      return;
    }

    if (phase === "idle" || phase === "error") {
      clearWordReveal();
      beginHold(e.pointerId);
      void startRecording();
    }
  }, [phase, capExhausted, startRecording, stopPlayback, clearWordReveal, unlockAudioPlayback, beginHold]);

  const handleMicPointerUp = useCallback(() => {
    // Ending the hold itself is handled by the window-level listeners
    // beginHold installed (they see this same pointerup as it bubbles), so a
    // release the button never receives is also covered (blur fallback).
    if (phase === "recording") {
      void finishRecording();
    }
  }, [phase, finishRecording]);

  const mascotPose =
    phase === "recording"
      ? "wave"
      : phase === "playing"
        ? "cheer"
        : phase === "processing"
          ? "thinking"
          : phase === "error"
            ? "tryagain"
            : messages.length > 0
              ? "thumbsup"
              : "wave";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 pt-6 pb-3">
        <Link
          href="/app"
          aria-label="Go back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-card-border bg-white shadow-sm transition-all hover:shadow active:scale-95"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </Link>

        <div className="flex-1 text-center">
          <h1 className="text-lg font-black text-foreground">
            {scenario ? scenario.title : "Talk to Bolo"}
          </h1>
        </div>

        {/* Spacer to keep title centered */}
        <div className="h-10 w-10 shrink-0" />
      </header>

      {/* Scenario banner: non-dismissible framing strip when in scenario mode.
          Shown below the header once the scenario metadata loads. */}
      {scenario && (
        <div
          className="mx-4 mb-1 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2"
          data-testid="scenario-banner"
        >
          <p className="text-xs text-muted-foreground leading-relaxed">
            {scenario.framingCopy}
          </p>
        </div>
      )}

      {/* Language picker pill */}
      <div className="flex justify-center pb-3">
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-2xl border border-card-border bg-white px-4 py-2 shadow-[0_4px_0_rgba(0,0,0,0.08)] text-sm font-bold transition-all active:translate-y-1 active:shadow-none"
              title="Change chat language"
            >
              <Globe className="h-4 w-4 text-primary" />
              <span className="text-foreground">{chatLanguage?.name ?? chatLang}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Chat language</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground -mt-2 mb-2">
              Choose the language for this chat session only.
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto pr-1 -mr-1">
              {languages.map((lang) => {
                const native = nativeTextProps(lang);
                const selected = lang.code === chatLang;
                const locked = !isLanguageAllowed(lang.code);
                return (
                  <button
                    key={lang.code}
                    onClick={() => {
                      if (locked) {
                        setPickerOpen(false);
                        setLocation(upgradeHref({ plan: "plus" }));
                        return;
                      }
                      setChatLang(lang.code);
                      setPickerOpen(false);
                    }}
                    className={cn(
                      "relative flex items-center justify-between gap-2 rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98]",
                      selected
                        ? "border-primary bg-primary/5"
                        : locked
                          ? "border-card-border bg-muted/40 hover:border-primary/40"
                          : "border-card-border bg-white hover:border-primary/40",
                    )}
                  >
                    <div className="min-w-0">
                      <span
                        className={cn(
                          "block text-xl font-bold",
                          native.isNastaliq ? "overflow-visible" : "leading-tight truncate",
                          locked ? "text-muted-foreground" : "text-foreground",
                        )}
                        style={native.style}
                        dir={native.dir}
                      >
                        {lang.nativeName}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <span className="truncate">{lang.name}</span>
                        {locked && <PlusPill />}
                      </span>
                    </div>
                    {selected ? (
                      <Check className="h-5 w-5 shrink-0 text-primary" />
                    ) : locked ? (
                      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Persistent bilingual hint — always visible so beginners know they
          don't have to speak only in the target language. Plain text (no
          animation wrapper) so it never shifts layout across chat states. */}
      <p className="px-4 pb-3 text-center text-xs text-muted-foreground">
        You can respond in English or {chatLanguage?.name ?? chatLang}
      </p>

      {/* Free-tier time bar */}
      {showTimeIndicator && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.gentle}
          className={cn(
            "mx-4 mb-3 rounded-xl border bg-white p-3",
            capExhausted
              ? "border-destructive/40 bg-destructive/5"
              : timePercent < 0.25
                ? "border-amber-300 bg-amber-50"
                : "border-card-border",
          )}
        >
          {capExhausted ? (
            /* ── zero state: inline All-Access prompt ──────────────────── */
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black text-destructive">Chat time used up for this week</p>
                <p className="text-[11px] text-muted-foreground">
                  2 free minutes reset each week
                </p>
              </div>
              <Link
                href={upgradeHref({ plan: "plus", reason: "chat_cap" })}
                className="shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-black text-white active:scale-95 transition-transform"
              >
                Go All-Access
              </Link>
            </div>
          ) : (
            /* ── active state: labeled allowance bar ───────────────────── */
            <>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-black text-foreground">
                  2 free chat minutes each week
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-semibold tabular-nums",
                    timePercent < 0.25 ? "text-amber-600" : "text-muted-foreground",
                  )}
                >
                  {formatSeconds(secondsRemaining!)} left
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.round(timePercent * 100)}%`,
                    backgroundColor:
                      timePercent < 0.25
                        ? "hsl(38 92% 50%)"
                        : "hsl(var(--primary))",
                  }}
                />
              </div>
              {timePercent < 0.25 && (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-amber-700">Running low — resets next week</p>
                  <Link
                    href={upgradeHref({ plan: "plus", reason: "chat_cap_low" })}
                    className="shrink-0 text-[11px] font-black text-primary active:underline"
                  >
                    Go All-Access ↗
                  </Link>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}

      {/* Mascot — hold to speak, release to send */}
      <button
        type="button"
        onPointerDown={handleMicPointerDown}
        onPointerUp={handleMicPointerUp}
        onPointerCancel={handleMicPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        disabled={capExhausted}
        aria-label={phase === "recording" ? "Release to send" : phase === "playing" ? "Tap to interrupt" : "Hold to speak"}
        className="flex flex-col items-center px-4 py-4 cursor-pointer disabled:cursor-default focus:outline-none select-none touch-none"
      >
        {/* Idle pulsing ring + pressed-state scale wrapper */}
        <div className="relative flex items-center justify-center">
          {/* Idle invitation ring — reduced-motion aware */}
          {!prefersReducedMotion && !capExhausted && (
            <motion.div
              className="absolute inset-0 rounded-full pointer-events-none"
              animate={
                phase === "idle"
                  ? {
                      boxShadow: [
                        "0 0 0px 0px hsl(var(--primary) / 0)",
                        "0 0 0px 20px hsl(var(--primary) / 0.18)",
                        "0 0 0px 0px hsl(var(--primary) / 0)",
                      ],
                      opacity: [0.4, 1, 0.4],
                    }
                  : { boxShadow: "0 0 0px 0px hsl(var(--primary) / 0)", opacity: 0 }
              }
              transition={
                phase === "idle"
                  ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.25 }
              }
              aria-hidden="true"
            />
          )}
          {/* Pressed-state scale — plain CSS transform, no stacked motion.div */}
          <div
            className={cn(
              "transition-transform duration-100",
              phase === "recording" && "scale-[0.96]",
            )}
          >
            <Mascot
              pose={mascotPose}
              size={148}
              idle={phase === "playing" ? "cheer" : "float"}
              // Micro-personality: beak-sync to Bolo's voice while it plays,
              // lean in attentively while the learner is recording.
              activity={
                phase === "playing" ? "talking" : phase === "recording" ? "listening" : null
              }
              talkAudioRef={playbackRef}
            />
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={phase === "processing" ? `processing-${processingStep}` : phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={springs.snappy}
            className="mt-3 text-sm font-semibold text-muted-foreground"
          >
            {getStatusLabel(phase, processingStep, messages.length > 0)}
          </motion.p>
        </AnimatePresence>
        <AnimatePresence>
          {messages.length === 0 && phase === "idle" && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springs.gentle}
              className="mt-1 text-xs text-muted-foreground text-center"
            >
              Hold to speak · release when done
            </motion.p>
          )}
        </AnimatePresence>
      </button>

      {/* Tip card — shown while Bolo is processing a reply */}
      <AnimatePresence>
        {phase === "processing" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={springs.gentle}
          >
            <ChatTipCard />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conversation transcript */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2"
      >
        <div className="mx-auto flex max-w-lg flex-col gap-2 pb-4">
          {/* Static greeting bubble — shown before the first exchange, never sent to the API */}
          <AnimatePresence>
            {messages.length === 0 && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ ...springs.snappy, delay: 0.1 }}
                  className="max-w-[80%] self-start rounded-2xl rounded-bl-sm border border-card-border bg-white px-4 py-2.5 text-sm leading-relaxed text-foreground"
                >
                  I'm Bolo — your feathered conversation buddy! Hold my belly and let's chat in English or {chatLanguage?.name ?? chatLang}!
                </motion.div>
              </>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: (msg.pending || msg.failed) ? 0.7 : 1, y: 0 }}
                transition={{ ...springs.snappy, delay: 0.04 }}
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  msg.role === "learner"
                    ? "self-end rounded-br-sm bg-primary text-primary-foreground"
                    : "self-start rounded-bl-sm border border-card-border bg-white text-foreground",
                )}
              >
                {msg.role === "parrot" ? (() => {
                  const native = chatLanguage ? nativeTextProps(chatLanguage) : null;
                  const isAnimating = msg.revealedWordCount !== undefined;
                  const displayText = isAnimating
                    ? msg.text.split(/\s+/).filter(Boolean).slice(0, msg.revealedWordCount).join(" ")
                    : msg.text;
                  return (
                    <div
                      className={cn("flex flex-col", isAnimating && "cursor-pointer select-none")}
                      onClick={isAnimating ? () => {
                        clearWordReveal();
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.role === "parrot" && m.revealedWordCount !== undefined
                              ? { ...m, revealedWordCount: undefined }
                              : m,
                          ),
                        );
                      } : undefined}
                      title={isAnimating ? "Tap to show full text" : undefined}
                    >
                      <span style={native?.style} dir={native?.dir}>
                        {displayText}
                        {isAnimating && (
                          <span className="ml-0.5 inline-block w-0.5 h-[1em] bg-foreground/50 align-middle animate-pulse" aria-hidden="true" />
                        )}
                      </span>
                      {msg.englishText && !isAnimating && (
                        <span className="text-xs text-muted-foreground mt-1 italic">
                          {msg.englishText}
                        </span>
                      )}
                    </div>
                  );
                })() : (
                  <div className="flex items-center gap-2">
                    {msg.pending ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-70" />
                    ) : null}
                    <div className="flex flex-col min-w-0">
                      <span>{msg.pending ? "Sending…" : msg.text}</span>
                      {msg.englishText && (
                        <span className="text-xs text-primary-foreground/70 mt-1 italic">
                          {msg.englishText}
                        </span>
                      )}
                      {msg.failed && (
                        <button
                          type="button"
                          onClick={() => handleRetry(i)}
                          className="mt-1 self-start text-xs underline underline-offset-2 opacity-80 hover:opacity-100 focus:outline-none"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Scenario target-phrase chips: shown in scenario mode above the input.
          Each chip displays the romanized phrase and turns green once the
          server reports it used (phrasesUsed in any turn's reply payload). */}
      {scenario && scenario.targetPhrases && scenario.targetPhrases.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2" data-testid="target-phrase-chips">
          {scenario.targetPhrases.map((tp) => {
            const used = usedPhrases.has(tp.romanized);
            return (
              <span
                key={tp.romanized}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
                  used
                    ? "border-green-400 bg-green-100 text-green-700"
                    : "border-border bg-white text-muted-foreground",
                )}
                data-testid={`phrase-chip-${tp.romanized}`}
              >
                {tp.romanized}
              </span>
            );
          })}
        </div>
      )}

      {/* Error message */}
      <AnimatePresence>
        {phase === "error" && errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={springs.snappy}
            className="mx-4 mb-3 flex items-center gap-2 rounded-xl border border-card-border bg-white p-3"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-foreground">{errorMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls — text input + mic button side by side */}
      <div className="flex items-center gap-2 px-4 pb-10 pt-2">
        {/* Text input */}
        <input
          type="text"
          value={textInputValue}
          onChange={(e) => setTextInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendTextTurn();
            }
          }}
          placeholder="Type a message…"
          disabled={phase === "processing" || phase === "recording"}
          aria-label="Type a message to Bolo"
          className="flex-1 min-w-0 rounded-full border border-card-border bg-white px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
        />

        {/* Mic / stop button */}
        <button
          onPointerDown={handleMicPointerDown}
          onPointerUp={handleMicPointerUp}
          onPointerCancel={handleMicPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          disabled={capExhausted}
          aria-label={
            phase === "recording"
              ? "Release to send"
              : capExhausted
                ? "Weekly chat time used"
                : "Hold to speak"
          }
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-[0_4px_0] transition-all active:translate-y-1 active:shadow-[0_0px_0] disabled:opacity-50 select-none touch-none",
            phase === "recording"
              ? "bg-destructive shadow-red-800 text-white scale-110"
              : capExhausted || phase === "processing"
                ? "bg-muted shadow-neutral-300 text-muted-foreground cursor-not-allowed"
                : "bg-primary shadow-primary/40 text-primary-foreground",
          )}
        >
          {phase === "recording" ? (
            <Square className="h-5 w-5" fill="currentColor" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </button>

        {/* Send button — visible when there's typed text */}
        <AnimatePresence>
          {textInputValue.trim() && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={springs.poppy}
              onClick={() => void sendTextTurn()}
              disabled={phase === "processing" || phase === "recording"}
              aria-label="Send message"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary shadow-[0_4px_0] shadow-primary/40 text-primary-foreground transition-all active:translate-y-1 active:shadow-[0_0px_0] disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Skip playback */}
        {phase === "playing" && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springs.poppy}
            onClick={stopPlayback}
            aria-label="Skip Bolo's reply"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-card-border bg-white text-muted-foreground shadow-sm transition-all hover:text-foreground active:scale-95"
          >
            <SkipForward className="h-5 w-5" />
          </motion.button>
        )}
      </div>
      {/* Scenario completion overlay: shown once when the server signals
          sceneDone=true. Full-screen; Bolo in cheer pose; XP chip; "Back
          to journey" CTA. A revisit with an existing stamp still shows
          the chat surface (overlay is session state, not persisted). */}
      {sceneDone && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm px-6 text-center"
          data-testid="scenario-completion-overlay"
        >
          <Mascot pose="cheer" idle="cheer" size={160} />
          <h2 className="mt-6 text-2xl font-black text-foreground leading-tight">
            Zone complete!
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            You spoke {chatLanguage?.name ?? chatLang} at the chai stall!
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary">
            +20 XP
          </div>
          <Link
            href="/app"
            className="mt-8 flex w-full max-w-xs items-center justify-center rounded-2xl bg-primary py-4 text-base font-black text-primary-foreground shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
          >
            Back to journey
          </Link>
        </div>
      )}
    </div>
  );
}
