import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Mic, Square, Volume2, Loader2, Check } from 'lucide-react';
import { SoundWavePulse } from '@/lib/motion';

// A looping, in-browser recreation of the real Bolo! practice loop:
// hear the phrase -> tap the mic -> speak out loud -> get coached.
// It's driven purely by state + framer-motion (no video/GIF asset), so it
// stays crisp on every screen and adds no download weight. The loop only runs
// while it's on screen, and collapses to a single static frame when the visitor
// prefers reduced motion.

type DemoPhrase = {
  native: string;
  romanized: string;
  english: string;
  fontFamily: string;
  score: number;
  feedback: string;
  tip: string;
};

const PHRASES: DemoPhrase[] = [
  {
    native: 'કેમ છો?',
    romanized: 'Kem cho?',
    english: 'How are you?',
    fontFamily: 'Noto Sans Gujarati',
    score: 94,
    feedback: 'Nailed it — that sounded natural and warm.',
    tip: "Keep the 'ch' nice and soft, just like that.",
  },
  {
    native: 'नमस्ते',
    romanized: 'Namaste',
    english: 'Hello',
    fontFamily: 'Noto Sans Devanagari',
    score: 88,
    feedback: 'Clear and confident — really close!',
    tip: "Hold the final 'e' a beat longer next time.",
  },
];

type Step = 'listen' | 'idle' | 'recording' | 'evaluating' | 'result';

// How long each step of the loop stays on screen (ms).
const STEP_MS: Record<Step, number> = {
  listen: 1900,
  idle: 1300,
  recording: 2500,
  evaluating: 1200,
  result: 3400,
};

const NEXT_STEP: Record<Step, Step> = {
  listen: 'idle',
  idle: 'recording',
  recording: 'evaluating',
  evaluating: 'result',
  result: 'listen',
};

const CAPTION: Record<Step, string> = {
  listen: 'Hear it first',
  idle: 'Tap, then speak',
  recording: 'Listening… stops on its own',
  evaluating: 'Coaching your pronunciation',
  result: "Here's how you did",
};

export function SpeakingDemo() {
  const reduceMotion = useReducedMotion();
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [step, setStep] = useState<Step>('listen');
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const phrase = PHRASES[phraseIndex];

  // Only animate while the demo is actually visible — saves work off-screen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Drive the loop. Reduced-motion visitors get a single static "result" frame.
  useEffect(() => {
    if (reduceMotion) {
      setStep('result');
      return;
    }
    if (!inView) return;
    const timer = setTimeout(() => {
      const next = NEXT_STEP[step];
      if (step === 'result') {
        setPhraseIndex((i) => (i + 1) % PHRASES.length);
      }
      setStep(next);
    }, STEP_MS[step]);
    return () => clearTimeout(timer);
  }, [step, inView, reduceMotion]);

  const isRecording = step === 'recording';
  const showHeard = step === 'recording' || step === 'evaluating' || step === 'result';

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-sm">
      <div className="relative rounded-[2.25rem] border border-card-border bg-white p-5 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.4)]">
        {/* faux status bar / progress like the real lesson */}
        <div className="mb-5 flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-secondary"
              initial={false}
              animate={{ width: step === 'result' ? '62%' : '48%' }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span className="text-xs font-bold text-muted-foreground">3/8</span>
        </div>

        {/* phrase card */}
        <div className="relative rounded-[1.75rem] border border-card-border bg-white px-6 pb-6 pt-8 text-center shadow-sm">
          <motion.div
            className="absolute -top-5 left-1/2 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full bg-secondary text-white shadow-lg"
            animate={
              step === 'listen' && !reduceMotion
                ? { scale: [1, 1.12, 1] }
                : { scale: 1 }
            }
            transition={{ duration: 0.9, repeat: step === 'listen' ? Infinity : 0 }}
          >
            <Volume2 className="h-5 w-5" />
          </motion.div>

          <AnimatePresence mode="wait">
            <motion.div
              key={phrase.native}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="space-y-2"
            >
              <h3
                className="text-4xl font-extrabold leading-tight tracking-tight text-foreground"
                style={{ fontFamily: phrase.fontFamily }}
              >
                {phrase.native}
              </h3>
              <p className="text-lg font-bold tracking-wide text-primary">{phrase.romanized}</p>
              <p className="text-sm font-medium text-muted-foreground">{phrase.english}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* what Bolo! heard — the transcription bubble */}
        <div className="mt-4 min-h-[3.25rem]">
          <AnimatePresence>
            {showHeard && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.3 }}
                className="flex items-center justify-end gap-2"
              >
                <span className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
                  You said
                </span>
                <span
                  className="rounded-2xl rounded-tr-sm bg-primary/10 px-4 py-2 text-lg font-bold text-primary"
                  style={{ fontFamily: phrase.fontFamily }}
                >
                  {phrase.native.replace('?', '')}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* coaching result OR the mic control */}
        <div className="mt-2 min-h-[7.5rem]">
          <AnimatePresence mode="wait">
            {step === 'result' ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="rounded-3xl border border-card-border bg-white p-5 text-center shadow-sm"
              >
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-lg font-black text-success">
                  <Check className="h-4 w-4" strokeWidth={3} />
                  Score {phrase.score}
                </div>
                <p className="text-sm font-medium leading-snug text-foreground">"{phrase.feedback}"</p>
                <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                  Tip: {phrase.tip}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="mic"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center pt-2"
              >
                <div className="relative flex h-20 w-20 items-center justify-center">
                  {isRecording && !reduceMotion && (
                    <motion.span
                      className="absolute inset-0 rounded-full bg-accent/30"
                      animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                  )}
                  <div
                    className={
                      'relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition-colors ' +
                      (isRecording ? 'bg-accent' : step === 'evaluating' ? 'bg-primary/70' : 'bg-primary')
                    }
                  >
                    {step === 'evaluating' ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : isRecording ? (
                      <Square className="h-7 w-7 fill-current" />
                    ) : (
                      <Mic className="h-9 w-9" />
                    )}
                  </div>
                </div>
                {isRecording && (
                  <SoundWavePulse className="mt-3 text-accent" size={22} />
                )}
                <p
                  className={
                    'mt-3 text-xs font-bold uppercase tracking-widest ' +
                    (isRecording ? 'text-accent' : 'text-muted-foreground')
                  }
                >
                  {CAPTION[step]}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
