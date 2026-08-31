// Chunk 6B quick game: Ticket Check (script match, floor 4).
// A ticket shows the English meaning ALONE; the learner punches the matching
// native-script ticket. The romanized reading lives under the script on the
// answers, never on the question — printing it on the prompt handed over the
// pronunciation the learner is here to recognise. Selection game riding the
// frozen listen-and-pick correctness model (selectedPhraseId === phraseId).

import { useEffect, useRef, useState } from "react";
import { Check, TicketCheck as TicketIcon, X } from "lucide-react";
import { type Phrase } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { webHaptic } from "@/lib/haptics";
import { useNativeText } from "@/lib/language-context";
import { quickGameById } from "@/lib/quick-games";
import {
  QuickGameShell,
  quickShuffle,
  type QuickRoundProps,
} from "./quick-game-frame";
import { pickTargetByStroke, type GesturePoint } from "@/lib/gesture-answer";

/**
 * How far a pointer has to travel before it stops being a click and becomes a
 * swipe.
 *
 * THE CLICK IS NOT REPLACED, IT IS UNDERNEATH. The house rule Wrong Platform
 * established: a target reachable only by a gesture is not reachable by a
 * keyboard or a screen reader at all. The board only claims the gesture once
 * the pointer has MOVED, so a plain click never reaches this code and goes to
 * the ticket's own button exactly as it always did. It also means that if the
 * geometry is wrong on some viewport, the game still plays.
 */
const SLASH_SLOP = 6;

const ROUNDS = 8;
const CHOICES = 4;

type TicketQuestion = { phrase: Phrase; choices: Phrase[]; correctIdx: number };

function buildPlan(phrases: Phrase[], count: number): TicketQuestion[] {
  const plan: TicketQuestion[] = [];
  let pool = quickShuffle(phrases);
  let poolIdx = 0;
  for (let i = 0; i < count; i++) {
    if (poolIdx >= pool.length) {
      pool = quickShuffle(phrases);
      poolIdx = 0;
    }
    const phrase = pool[poolIdx++]!;
    const distractors = quickShuffle(phrases.filter((p) => p.id !== phrase.id)).slice(
      0,
      CHOICES - 1,
    );
    const choices = quickShuffle([phrase, ...distractors]);
    plan.push({ phrase, choices, correctIdx: choices.findIndex((c) => c.id === phrase.id) });
  }
  return plan;
}

function TicketCheckRound({ phrases, api }: QuickRoundProps) {
  const native = useNativeText();
  const [plan] = useState(() => buildPlan(phrases, ROUNDS));
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    setPicked(null);
  }, [api.round]);

  const q = plan[api.round];
  if (!q) return null;
  const answered = picked !== null;
  const wasCorrect = answered && picked === q.correctIdx;

  const handlePick = (idx: number) => {
    if (answered) return;
    api.lockRound();
    setPicked(idx);
    const correct = idx === q.correctIdx;
    webHaptic(correct ? "success" : "warning");
  };

  // PUNCHING THE TICKET, which is what an inspector does and what this game
  // has said in its own header since it shipped. It was a click. It is a
  // stroke across the ticket now (the owner's ruling, 2026-08-31: stop
  // building "select an answer from the following"). The question, the plan
  // and what goes to the server are all unchanged; only the hand movement is.
  //
  // POINTER EVENTS, NOT HTML5 DRAG AND DROP, the choice Wrong Platform already
  // made here and for the same reason: the latter has no usable touch story.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const stroke = useRef<GesturePoint[]>([]);
  const drawing = useRef(false);
  const [slashing, setSlashing] = useState<number | null>(null);

  /** Client coordinates into the grid's own space, where the cards are laid out. */
  const toGrid = (e: { clientX: number; clientY: number }): GesturePoint => {
    const box = gridRef.current?.getBoundingClientRect();
    return {
      x: e.clientX - (box?.left ?? 0),
      y: e.clientY - (box?.top ?? 0),
    };
  };

  const targets = () => {
    const box = gridRef.current?.getBoundingClientRect();
    if (!box || !gridRef.current) return [];
    return Array.from(gridRef.current.querySelectorAll("[data-ticket-idx]")).map(
      (el) => {
        const r = el.getBoundingClientRect();
        return {
          id: Number((el as HTMLElement).dataset.ticketIdx),
          rect: {
            x: r.left - box.left,
            y: r.top - box.top,
            width: r.width,
            height: r.height,
          },
        };
      },
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (answered) return;
    drawing.current = true;
    stroke.current = [toGrid(e)];
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || answered) return;
    const p = toGrid(e);
    const first = stroke.current[0];
    if (
      first &&
      stroke.current.length === 1 &&
      Math.abs(p.x - first.x) <= SLASH_SLOP &&
      Math.abs(p.y - first.y) <= SLASH_SLOP
    ) {
      // Still inside the slop: this is a click so far, so do not claim it.
      return;
    }
    stroke.current.push(p);
    setSlashing(pickTargetByStroke(stroke.current, targets(), "slash"));
  };

  const endStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const hit =
      stroke.current.length > 1
        ? pickTargetByStroke(stroke.current, targets(), "slash")
        : null;
    stroke.current = [];
    setSlashing(null);
    // Null is a normal outcome: they drew across empty space and have not
    // answered. Let them draw again rather than marking anything.
    if (hit !== null) handlePick(hit);
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* The ticket being checked */}
      <div className="relative mx-auto w-full max-w-sm rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-5 text-center dark:border-amber-700 dark:bg-amber-950/30">
        <TicketIcon className="mx-auto mb-2 h-6 w-6 text-amber-600" />
        <p className="text-lg font-extrabold text-foreground">{q.phrase.english}</p>
      </div>

      <div
        ref={gridRef}
        className="grid grid-cols-2 gap-3"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
      >
        {q.choices.map((choice, idx) => {
          let cardClass = "border-border bg-card hover:border-primary/40 hover:bg-primary/5";
          if (answered && idx === q.correctIdx) {
            cardClass = "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40";
          } else if (answered && !wasCorrect && idx === picked) {
            cardClass = "border-red-400 bg-red-50 dark:bg-red-950/40";
          } else if (!answered && slashing === idx) {
            // THE SWIPE IS SHOWN BY THE TICKET, NOT BY A TRAIL OVER IT. An
            // overlay spanning the board is what eats the pointer events the
            // board needs. Highlighting the target under the finger is the
            // shape Wrong Platform already proved here, and the cue is weight
            // AND colour rather than colour alone.
            cardClass = "border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30";
          }
          return (
            <button
              key={choice.id}
              data-ticket-idx={idx}
              onClick={() => handlePick(idx)}
              disabled={answered}
              className={cn(
                "relative flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-center font-semibold transition-all active:scale-[0.97]",
                cardClass,
              )}
            >
              <span style={native.style} dir={native.dir} className="text-base leading-snug text-foreground">
                {choice.nativeScript}
              </span>
              {/* Every answer carries its own reading under the script, from
                  the first look — the pairing IS the lesson, and hiding it
                  until after the pick made the choice a guess. Languages
                  without romanization render no empty slot. */}
              {choice.romanized.trim() !== "" && (
                <span className="text-xs font-medium text-muted-foreground">{choice.romanized}</span>
              )}
              {answered && idx === q.correctIdx && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {choice.english}
                </span>
              )}
              {answered && idx === q.correctIdx && (
                <span className="absolute right-2 top-2">
                  <Check className="h-4 w-4 text-emerald-600" />
                </span>
              )}
              {answered && !wasCorrect && idx === picked && (
                <span className="absolute right-2 top-2">
                  <X className="h-4 w-4 text-red-600" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Item 3: the reveal rides the house continue beat for BOTH outcomes,
          so the learner controls how long the romanized and meaning lines
          stay up (correct answers used to auto-advance after 700ms). */}
      {answered && (
        <button
          onClick={() =>
            api.submitRound({
              phraseId: q.phrase.id,
              selectedPhraseId: q.choices[picked!]!.id,
              correct: wasCorrect,
              // The ticket showed the meaning; the pick was a script card.
              review: {
                prompt: q.phrase.english,
                answer: q.choices[picked!]!.nativeScript,
                answerSub: q.choices[picked!]!.romanized.trim() || null,
                correct: q.phrase.nativeScript,
                // The reading rides under the script it belongs to rather than
                // under the English prompt, so each line reads on its own.
                correctSub: q.phrase.romanized.trim() || null,
              },
            })
          }
          data-testid="ticket-check-continue"
          className="flex items-center justify-center rounded-2xl bg-primary px-6 py-3.5 font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Tap to continue
        </button>
      )}
    </div>
  );
}

export default function TicketCheckPage() {
  const def = quickGameById("ticket-check")!;
  return (
    <QuickGameShell
      def={def}
      // "Swipe across" rather than "slash", because the word has to teach the
      // gesture to somebody who has only ever tapped. Clicking still works and
      // is deliberately not advertised: naming both would read as a choice to
      // be made rather than an instruction to follow.
      instruction="Swipe across the ticket that matches the script"
      // SILENT: the round is a script-to-script read, nothing is ever spoken.
      // Reported from a phone — the header showed a speaker button over a game
      // that has no sound to mute.
      usesAudio={false}
      totalRounds={() => ROUNDS}
      renderRound={(props) => <TicketCheckRound {...props} />}
    />
  );
}
