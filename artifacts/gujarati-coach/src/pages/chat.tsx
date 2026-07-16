import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  useChatTurn,
  type ChatTurnMessage,
} from "@workspace/api-client-react";
import { ApiError } from "@workspace/api-client-react";
import { useVoiceRecorder } from "@workspace/integrations-openai-ai-react";
import { ArrowLeft, Globe, ChevronDown, Check, Lock, Mic, Square, SkipForward, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
import { useLanguage, nativeTextProps } from "@/lib/language-context";
import {
  useEntitlements,
  upgradeHref,
  asUpgradeRequired,
} from "@/lib/entitlements";
import { PlusPill } from "@/components/plus";

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
};

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function ChatPage() {
  const [, setLocation] = useLocation();
  const { activeLang, languages } = useLanguage();
  const { isPlus, isOneLanguage, isLanguageAllowed } = useEntitlements();
  const chatTurn = useChatTurn();
  const recorder = useVoiceRecorder();

  // Per-session chat language — does NOT change the global active language.
  const [chatLang, setChatLang] = useState<string>(activeLang);
  const chatLanguage = languages.find((l) => l.code === chatLang);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<
    number | null | undefined
  >(undefined);

  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const finishingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Warm up the mic on mount.
  useEffect(() => {
    recorder.prepare().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear conversation when language changes.
  useEffect(() => {
    setMessages([]);
    setErrorMsg(null);
    setPhase("idle");
    if (playbackRef.current) {
      playbackRef.current.pause();
      playbackRef.current = null;
    }
  }, [chatLang]);

  // Stop playback on unmount.
  useEffect(
    () => () => {
      if (playbackRef.current) {
        playbackRef.current.pause();
        playbackRef.current = null;
      }
    },
    [],
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
    setPhase("processing");
    setErrorMsg(null);

    try {
      const blob = await recorder.stopRecording();

      if (blob.size === 0) {
        setErrorMsg("We didn't capture any audio. Check your microphone and try again.");
        setPhase("error");
        finishingRef.current = false;
        return;
      }

      // Convert blob to base64.
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const audioBase64 = btoa(binary);

      const history: ChatTurnMessage[] = messages
        .slice(-HISTORY_WINDOW)
        .map((m) => ({ role: m.role === "parrot" ? "parrot" : "learner", text: m.text }));

      const result = await chatTurn.mutateAsync({
        data: { languageCode: chatLang, audioBase64, history },
      });

      setMessages((prev) => [
        ...prev,
        { role: "learner", text: result.transcript },
        { role: "parrot", text: result.replyText, englishText: result.replyEnglish },
      ]);

      if (result.secondsRemaining !== null) {
        setSecondsRemaining(result.secondsRemaining);
      } else {
        setSecondsRemaining(null);
      }

      // Play the parrot's audio reply.
      setPhase("playing");
      const audio = new Audio(
        `data:audio/${result.format || "mp3"};base64,${result.replyAudioBase64}`,
      );
      playbackRef.current = audio;
      audio.onended = () => {
        playbackRef.current = null;
        setPhase("idle");
      };
      audio.play().catch(() => {
        // Autoplay blocked — just go to idle.
        playbackRef.current = null;
        setPhase("idle");
      });
    } catch (err) {
      const upgrade = asUpgradeRequired(err);
      if (upgrade) {
        const isCap = upgrade.reason === "weekly_cap_exceeded";
        if (isCap) {
          setSecondsRemaining(0);
          setLocation(upgradeHref({ plan: "one_language" }));
          setPhase("idle");
          finishingRef.current = false;
          return;
        }
        setLocation(
          upgradeHref({
            plan: upgrade.requiredPlan === "one_language" ? "one_language" : "plus",
            lang: upgrade.reason === "language_locked" ? chatLang : undefined,
          }),
        );
        setPhase("idle");
        finishingRef.current = false;
        return;
      }

      let msg = "Something went wrong. Please try again.";
      if (err instanceof ApiError) {
        if (err.status === 502) msg = "We couldn't process that. Give it another try!";
        else if (err.status === 429) msg = "Slow down a bit! Wait a moment and try again.";
      } else if (err instanceof TypeError) {
        msg = "We couldn't reach the server. Check your connection and try again.";
      }
      setErrorMsg(msg);
      setPhase("error");
    } finally {
      finishingRef.current = false;
    }
  }, [recorder, chatTurn, chatLang, messages, setLocation]);

  const handleMicPress = async () => {
    if (phase === "recording") {
      await finishRecording();
      return;
    }

    if (phase !== "idle" && phase !== "error") return;

    // Cap check for free users.
    if (!isPlus && !isOneLanguage && secondsRemaining !== undefined && secondsRemaining !== null && secondsRemaining <= 0) {
      setLocation(upgradeHref({ plan: "one_language" }));
      return;
    }

    setErrorMsg(null);
    finishingRef.current = false;
    if (playbackRef.current) {
      playbackRef.current.pause();
      playbackRef.current = null;
    }

    try {
      await recorder.startRecording({
        onSilence: () => { void finishRecording(); },
        silenceDurationMs: 1800,
      });
      setPhase("recording");
    } catch {
      setErrorMsg("We couldn't access your microphone. Allow mic access in your browser, then try again.");
      setPhase("error");
    }
  };

  const stopPlayback = () => {
    if (playbackRef.current) {
      playbackRef.current.pause();
      playbackRef.current = null;
    }
    setPhase("idle");
  };

  const showTimeIndicator =
    !isPlus && !isOneLanguage && secondsRemaining !== undefined && secondsRemaining !== null;
  const timePercent = showTimeIndicator
    ? Math.max(0, Math.min(1, secondsRemaining! / FREE_WEEKLY_CAP_SECONDS))
    : 1;
  const capExhausted = showTimeIndicator && secondsRemaining! <= 0;

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
          <h1 className="text-lg font-black text-foreground">Chat with Bolo</h1>
        </div>

        {/* Spacer to keep title centered */}
        <div className="h-10 w-10 shrink-0" />
      </header>

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
                        setLocation(upgradeHref({ plan: "one_language", lang: lang.code }));
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

      {/* Free-tier time bar */}
      {showTimeIndicator && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.gentle}
          className="mx-4 mb-3 rounded-xl border border-card-border bg-white p-3"
        >
          <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.round(timePercent * 100)}%`,
                backgroundColor: capExhausted ? "hsl(var(--destructive))" : "hsl(var(--primary))",
              }}
            />
          </div>
          <p className="text-center text-xs font-medium text-muted-foreground">
            {capExhausted
              ? "Weekly chat time used — upgrade for unlimited"
              : `⏱ ${formatSeconds(secondsRemaining!)} of 2:00 left this week`}
          </p>
        </motion.div>
      )}

      {/* Mascot — tapping the bird starts/stops recording */}
      <button
        type="button"
        onClick={phase === "processing" || capExhausted ? undefined : phase === "playing" ? stopPlayback : handleMicPress}
        disabled={phase === "processing" || capExhausted}
        aria-label={phase === "recording" ? "Stop recording" : phase === "playing" ? "Tap to interrupt" : "Start recording"}
        className="flex flex-col items-center px-4 py-4 cursor-pointer disabled:cursor-default focus:outline-none"
      >
        <Mascot
          pose={mascotPose}
          size={148}
          idle={phase === "playing" ? "cheer" : "float"}
        />
        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={springs.snappy}
            className="mt-3 text-sm font-semibold text-muted-foreground"
          >
            {phase === "idle" && messages.length === 0
              ? "Tap Bolo to start talking"
              : phase === "idle"
                ? "Tap to talk again"
                : phase === "recording"
                  ? "Listening…"
                  : phase === "processing"
                    ? "Thinking…"
                    : phase === "playing"
                      ? "Tap to interrupt"
                      : phase === "error"
                        ? "Something went wrong"
                        : ""}
          </motion.p>
        </AnimatePresence>
      </button>

      {/* Conversation transcript */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2"
      >
        <div className="mx-auto flex max-w-lg flex-col gap-2 pb-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
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
                  return (
                    <div className="flex flex-col">
                      <span
                        style={native?.style}
                        dir={native?.dir}
                      >
                        {msg.text}
                      </span>
                      {msg.englishText && (
                        <span className="text-xs text-muted-foreground mt-1 italic">
                          {msg.englishText}
                        </span>
                      )}
                    </div>
                  );
                })() : msg.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

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

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 px-4 pb-10 pt-2">
        {/* Mic / stop button */}
        <button
          onClick={handleMicPress}
          disabled={phase === "processing" || capExhausted}
          aria-label={
            phase === "recording"
              ? "Stop recording"
              : capExhausted
                ? "Weekly chat time used"
                : "Start recording"
          }
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full shadow-[0_6px_0] transition-all active:translate-y-1.5 active:shadow-[0_0px_0] disabled:opacity-50",
            phase === "recording"
              ? "bg-destructive shadow-red-800 text-white scale-110"
              : capExhausted || phase === "processing"
                ? "bg-muted shadow-neutral-300 text-muted-foreground cursor-not-allowed"
                : "bg-primary shadow-primary/40 text-primary-foreground",
          )}
        >
          {phase === "recording" ? (
            <Square className="h-6 w-6" fill="currentColor" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </button>

        {/* Skip playback */}
        {phase === "playing" && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springs.poppy}
            onClick={stopPlayback}
            aria-label="Skip Bolo's reply"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-card-border bg-white text-muted-foreground shadow-sm transition-all hover:text-foreground active:scale-95"
          >
            <SkipForward className="h-5 w-5" />
          </motion.button>
        )}
      </div>
    </div>
  );
}
