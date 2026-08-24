/**
 * THE EMERGENCY, and the game behind it.
 *
 * TWO WAYS IN, and they are different experiences from the same screen.
 *
 *   FROM THE JOURNEY, at ?journey=1&zone=N. The alarm flashes, the film plays,
 *   and five phrases from that zone follow. This is an INTERRUPTION: it was not
 *   asked for, the first showing cannot be skipped, and nothing on the map
 *   announces it.
 *
 *   FROM THE GAMES HUB, with no zone. The learner came looking for it, so they
 *   pick a length first and there is no film and no alarm. Interrupting
 *   somebody who navigated here on purpose would be a joke that only works
 *   once.
 *
 * WHY ONE SCREEN RATHER THAN TWO. The game is identical, and the two halves of
 * a duplicated game drift apart exactly as fast as web and mobile do. The
 * branch is four lines; a second copy would be four hundred.
 *
 * THE RULES ARE NOT IN THIS FILE. Everything about the clock, the buy-back and
 * the run length lives in @workspace/emergency so the phone runs the same game
 * rather than a lookalike. This file owns the clock's ticking and nothing else.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, RotateCcw, Timer, Zap } from "lucide-react";
import {
  useListCategoryPhrases,
  getListCategoryPhrasesQueryKey,
} from "@workspace/api-client-react";
import {
  startDrill,
  tickDrill,
  answerDrill,
  drillScore,
  buildDrill,
  hasEmergency,
  emergencyFilmPath,
  DRILL_START_MS,
  DRILL_QUESTIONS,
  DRILL_LENGTHS,
  DRILL_CHAI_REWARD,
  EMERGENCY_COPY,
  EMERGENCY_ALARM_MS,
  type DrillState,
  type DrillQuestion,
} from "@workspace/emergency";
import {
  hasSeenEmergency,
  markEmergencySeen,
  hasPassedEmergency,
  markEmergencyPassed,
} from "@/lib/emergency-progress";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { BottomNav } from "@/components/layout/bottom-nav";
import { webHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type Phase = "picker" | "alarm" | "film" | "game" | "end";

function useEmergencyParams(): { journey: number; zone: number; fromJourney: boolean } {
  const search = useSearch();
  return useMemo(() => {
    const p = new URLSearchParams(search);
    const j = Number(p.get("journey"));
    const z = Number(p.get("zone"));
    const fromJourney = Number.isInteger(j) && j > 0 && Number.isInteger(z) && z > 0;
    return { journey: fromJourney ? j : 1, zone: fromJourney ? z : 1, fromJourney };
  }, [search]);
}

/* ─── The interrupt ─────────────────────────────────────────────────────── */

/**
 * The word EMERGENCY, flashing, before anything else is on screen.
 *
 * Asked for in exactly those terms: "I want the word Emergency flashing before
 * the video plays to interrupt the player." It is not a loading screen and must
 * never be used as one; it is the thing that makes the film an interruption
 * rather than a cutscene.
 *
 * STEPPED, not eased. A smooth pulse reads as decoration. A hard on-off at two
 * a second reads as a warning light, which is the whole point.
 */
function Alarm() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
      {!reduceMotion && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-1/2 bg-gradient-to-b from-transparent via-red-600/25 to-transparent"
          initial={{ y: "-100%" }}
          animate={{ y: "200%" }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
        />
      )}
      <div className="text-center">
        <motion.p
          data-testid="emergency-alarm"
          className="text-[clamp(2rem,11vw,3.4rem)] font-black uppercase leading-none tracking-[0.16em] text-red-500"
          style={{ textShadow: "0 0 40px rgba(224,52,44,.6)" }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: [1, 1, 0.12, 0.12] }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.55, repeat: Infinity, times: [0, 0.49, 0.5, 1] }
          }
        >
          {EMERGENCY_COPY.alarm}
        </motion.p>
        <p className="mt-3 text-sm font-bold uppercase tracking-[0.06em] text-muted-foreground">
          {EMERGENCY_COPY.alarmSub}
        </p>
      </div>
    </div>
  );
}

/* ─── The page ──────────────────────────────────────────────────────────── */

export default function EmergencyPage() {
  const { journey, zone, fromJourney } = useEmergencyParams();
  const { activeLang } = useLanguage();
  const native = useNativeText();
  const [, navigate] = useLocation();
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>(fromJourney ? "alarm" : "picker");
  const [drill, setDrill] = useState<DrillState>(() => startDrill(DRILL_QUESTIONS));
  const [questions, setQuestions] = useState<DrillQuestion[]>([]);
  const [locked, setLocked] = useState<number | null>(null);
  const [canSkip, setCanSkip] = useState(() => hasSeenEmergency(journey, zone));

  // Zone N is category N. The journey map, the storybook and this all read the
  // same ladder, which is why a zone is a number here rather than a slug.
  const phraseQuery = useListCategoryPhrases(zone, activeLang, {
    query: { queryKey: getListCategoryPhrasesQueryKey(zone, activeLang) },
  });
  const pool = useMemo(
    () =>
      (phraseQuery.data ?? []).map((p) => ({
        nativeScript: p.nativeScript,
        romanized: p.romanized,
        concept: p.english,
      })),
    [phraseQuery.data],
  );

  /* ── the clock ─────────────────────────────────────────────────────────
     The reducer is pure and the caller owns the clock, so this effect is the
     entire difference between the web game and the phone one. Elapsed is
     measured rather than assumed, which is what stops a throttled tab from
     quietly surviving: it just hands over a bigger number on the next frame. */
  const lastRef = useRef(0);
  useEffect(() => {
    if (phase !== "game" || drill.status !== "running") return;
    let raf = 0;
    lastRef.current = performance.now();
    const step = (now: number) => {
      const elapsed = now - lastRef.current;
      lastRef.current = now;
      setDrill((d) => (d.status === "running" ? tickDrill(d, elapsed) : d));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, drill.status]);

  useEffect(() => {
    if (drill.status === "running" || phase !== "game") return;
    if (drill.status === "won" && fromJourney) markEmergencyPassed(journey, zone);
    setPhase("end");
  }, [drill.status, phase, fromJourney, journey, zone]);

  // The alarm holds, then the film starts. A timeout rather than an animation
  // callback because the alarm loops forever by design: it has no natural end
  // to hang this on, and giving it one would make it a spinner.
  useEffect(() => {
    if (phase !== "alarm") return;
    const t = window.setTimeout(() => setPhase("film"), EMERGENCY_ALARM_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const begin = useCallback(
    (total: number) => {
      const built = buildDrill(pool, journey * 100 + zone, total);
      setQuestions(built);
      setDrill(startDrill(built.length || total));
      setLocked(null);
      setPhase("game");
    },
    [pool, journey, zone],
  );

  const answer = useCallback(
    (k: number) => {
      if (locked !== null || drill.status !== "running") return;
      const q = questions[drill.index];
      if (!q) return;
      const right = k === q.answer;
      setLocked(k);
      webHaptic(right ? "success" : "warning");
      // A beat on the chosen card before moving, so the learner sees WHICH one
      // was right. Short enough that it never feels like the clock stopped for
      // them, because it has not: the reducer keeps draining underneath.
      window.setTimeout(() => {
        setLocked(null);
        setDrill((d) => answerDrill(d, right));
      }, 330);
    },
    [locked, drill.status, drill.index, questions],
  );

  const filmSrc = `${import.meta.env.BASE_URL}${emergencyFilmPath(journey, zone)}`;

  // A zone with no film has no Emergency. Nothing flashes and nothing is
  // half-played: the learner is put back on the map as though it was never
  // planned. This is the fallback and it is why the manifest is compiled in.
  useEffect(() => {
    if (fromJourney && !hasEmergency(journey, zone)) navigate("/journey");
  }, [fromJourney, journey, zone, navigate]);

  const q = questions[drill.index];
  const pct = Math.max(0, drill.msLeft / DRILL_START_MS);

  return (
    <div className="flex min-h-screen flex-col bg-background pb-20">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={fromJourney ? "/journey" : "/games"}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-extrabold leading-tight">Beat the train</h1>
            <p className="text-xs text-muted-foreground">
              {fromJourney ? EMERGENCY_COPY.running : "Answer before it goes through"}
            </p>
          </div>
        </div>

        {/* PICKER, hub only. */}
        {phase === "picker" && (
          <div className="flex flex-col gap-3" data-testid="emergency-picker">
            <p className="text-sm text-muted-foreground">How many phrases?</p>
            {DRILL_LENGTHS.map((n) => (
              <button
                key={n}
                type="button"
                data-testid={`emergency-length-${n}`}
                onClick={() => begin(n)}
                className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary"
              >
                <span className="text-lg font-extrabold">{n}</span>
                <span className="text-xs text-muted-foreground">
                  {n === 5 ? "A quick one" : n === 10 ? "A proper run" : "Endurance"}
                </span>
              </button>
            ))}
            {pool.length > 0 && pool.length < 20 && (
              <p className="text-xs text-muted-foreground">
                This topic has {pool.length} phrases, so a longer run will be shorter
                than you picked.
              </p>
            )}
          </div>
        )}

        {(phase === "alarm" || phase === "film") && (
          <div className="relative mx-auto aspect-[9/16] w-full max-h-[62vh] overflow-hidden rounded-2xl border border-border bg-black">
            {phase === "alarm" && <Alarm />}
            {phase === "film" && (
              <>
                <video
                  data-testid="emergency-film"
                  src={filmSrc}
                  autoPlay
                  playsInline
                  className="h-full w-full object-cover"
                  onEnded={() => {
                    markEmergencySeen(journey, zone);
                    setCanSkip(true);
                    begin(DRILL_QUESTIONS);
                  }}
                  // A film that will not play must not strand the learner in an
                  // interruption they cannot leave. Straight to the game.
                  onError={() => begin(DRILL_QUESTIONS)}
                />
                <button
                  type="button"
                  data-testid="emergency-skip"
                  disabled={!canSkip}
                  onClick={() => begin(DRILL_QUESTIONS)}
                  className="absolute bottom-3 right-3 rounded-full border border-white/35 bg-black/60 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm disabled:opacity-35"
                >
                  Skip
                </button>
              </>
            )}
          </div>
        )}

        {phase === "game" && (
          <div className="flex flex-col gap-4" data-testid="emergency-game">
            <div className="flex items-baseline justify-between text-[11px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
              <span>{EMERGENCY_COPY.running}</span>
              <span className="tabular-nums" data-testid="emergency-clock">
                {(drill.msLeft / 1000).toFixed(1)}s
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full border border-border bg-black">
              <div
                data-testid="emergency-bar"
                className="h-full origin-left bg-gradient-to-r from-red-500 to-amber-400"
                style={{
                  transform: `scaleX(${pct})`,
                  transition: reduceMotion ? "none" : "transform 120ms linear",
                }}
              />
            </div>

            {q && (
              <>
                <p className="pt-2 text-2xl font-extrabold">Say &ldquo;{q.prompt}&rdquo;</p>
                <div className="flex flex-col gap-2">
                  {q.options.map((o, k) => (
                    <button
                      key={`${o.concept}-${k}`}
                      type="button"
                      data-testid={`emergency-option-${k}`}
                      onClick={() => answer(k)}
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-2xl border px-4 py-3 text-left transition-colors",
                        locked === null && "border-border bg-card hover:border-primary",
                        locked === k && k === q.answer && "border-green-500 bg-green-500/15",
                        locked === k && k !== q.answer && "border-red-500 bg-red-500/15",
                        locked !== null && locked !== k && "border-border bg-card opacity-60",
                      )}
                    >
                      {/* SCRIPT AND ROMANIZATION TOGETHER, asked for directly:
                          "native script should have english romanization shown
                          as well for 3 choices". Under pressure a script the
                          learner cannot yet read at a glance is a coin toss,
                          and a coin toss is not a drill. */}
                      <span style={native.style} dir={native.dir} className="text-lg leading-snug">
                        {o.nativeScript}
                      </span>
                      {o.romanized.trim() !== "" && (
                        <span className="text-xs text-muted-foreground">{o.romanized}</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-1.5 pt-1">
              {Array.from({ length: drill.total }, (_, n) => (
                <span
                  key={n}
                  className={cn(
                    "h-1 w-6 rounded-full",
                    drill.marks[n] === true && "bg-green-500",
                    drill.marks[n] === false && "bg-red-500",
                    drill.marks[n] === undefined && "bg-border",
                  )}
                />
              ))}
            </div>
          </div>
        )}

        {phase === "end" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center" data-testid="emergency-end">
            {drill.status === "won" ? (
              <Zap className="h-9 w-9 text-green-500" />
            ) : (
              <Timer className="h-9 w-9 text-red-500" />
            )}
            <div>
              <h2 className="text-2xl font-extrabold">
                {drill.status === "won" ? EMERGENCY_COPY.won.title : EMERGENCY_COPY.lost.title}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                {drill.status === "won" ? EMERGENCY_COPY.won.body : EMERGENCY_COPY.lost.body}
              </p>
              <p className="mt-2 text-sm font-semibold">
                {drillScore(drill)} of {drill.total} right
              </p>
            </div>
            {drill.status === "won" && fromJourney && (
              <span className="rounded-full border border-amber-400 px-4 py-1.5 text-sm font-bold text-amber-500">
                +{DRILL_CHAI_REWARD} Chai
              </span>
            )}
            {/* REPLAY, asked for directly. From the journey it is offered
                because they have just passed it; from the hub it is simply the
                game they came for. */}
            <button
              type="button"
              data-testid="emergency-replay"
              onClick={() => (fromJourney ? begin(DRILL_QUESTIONS) : setPhase("picker"))}
              className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-white"
            >
              <RotateCcw className="h-4 w-4" />
              Run it again
            </button>
            <Link
              href={fromJourney ? "/journey" : "/games"}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              {fromJourney ? "Back to the map" : "Back to Games"}
            </Link>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

/** Exported for the journey, which must not send a learner to a dead film. */
export { hasPassedEmergency };
