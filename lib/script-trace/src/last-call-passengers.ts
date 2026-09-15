// LAST CALL'S PASSENGERS: who stands at the door, where their sign is, and
// how a line of text is fitted onto it.
//
// Art pass, 2026-09-14. The placeholder emoji faces were replaced by six
// painted cut-outs, each holding a blank cream sign. The sign's inner blank
// rectangle was measured once, off the art, as fractions of the image, and the
// English (or, in the preview, the native script) is drawn inside it so it
// reads as printed on the card.
//
// WHY HERE AND NOT IN EACH APP. The two screens (bolo-mobile
// app/(app)/(tabs)/games/last-call.tsx, gujarati-coach
// src/pages/games/last-call.tsx) are hand-kept twins. A sign rectangle typed
// twice is a sign rectangle that drifts the day one piece of art is redrawn,
// and a passenger rotation written twice gives the same phrase a different
// face on each platform. So the data, the rotation and the fitter live once.
// What does NOT live here is anything platform-shaped: mobile maps an id to a
// require() of assets/games/last-call/passenger-<id>.webp, web to the public
// URL /games/last-call/passenger-<id>.webp, and each measures text its own way.
//
// Import-free, like the rest of this package.

export type LastCallPassengerId =
  | "grandmother"
  | "student"
  | "businessman"
  | "schoolgirl"
  | "farmer"
  | "mother";

/** A rectangle as fractions (0..1) of the passenger image's width and height. */
export interface LastCallSignBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LastCallPassenger {
  id: LastCallPassengerId;
  /** Plain name, for tests and debugging. The art itself is decorative. */
  label: string;
  /** Intrinsic pixel size of the cut-out, for its aspect ratio. */
  width: number;
  height: number;
  /** The sign's inner blank area, inside its printed border. */
  sign: LastCallSignBox;
}

/**
 * The rotation order. Values copied from the art pass's passengers.json
 * (2026-09-14); if a cut-out is regenerated, re-measure its sign and update
 * the row here, and both apps follow.
 */
export const LAST_CALL_PASSENGERS: readonly LastCallPassenger[] = [
  { id: "grandmother", label: "Grandmother", width: 649, height: 900, sign: { x: 0.3433, y: 0.4992, w: 0.2685, h: 0.15 } },
  { id: "student", label: "Student", width: 580, height: 900, sign: { x: 0.2488, y: 0.4793, w: 0.4662, h: 0.1695 } },
  { id: "businessman", label: "Businessman", width: 471, height: 900, sign: { x: 0.1205, y: 0.4176, w: 0.7336, h: 0.2318 } },
  { id: "schoolgirl", label: "Schoolgirl", width: 584, height: 900, sign: { x: 0.1946, y: 0.446, w: 0.4564, h: 0.2027 } },
  { id: "farmer", label: "Farmer", width: 529, height: 900, sign: { x: 0.2969, y: 0.4917, w: 0.3987, h: 0.158 } },
  { id: "mother", label: "Mother", width: 593, height: 900, sign: { x: 0.0825, y: 0.4, w: 0.5459, h: 0.2489 } },
];

/**
 * Give every phrase a passenger, once, for the life of a round.
 *
 * STABLE: a phrase keeps its face from the preview into the recall round and
 * back again after a miss re-queues it, because the learner is meant to
 * recognise "the farmer's line". So this runs once, on the round's opening
 * orders, and the screen holds the result.
 *
 * NO TWO IDENTICAL IN A ROW, in either order the learner watches: the preview
 * walks `previewOrder`, the recall queue starts as `recallOrder`, and a missed
 * passenger rejoins behind the last one, so the recall order's last and first
 * are neighbours too. Each phrase takes the next passenger in the rotation
 * that none of its already-assigned neighbours wears. A phrase has at most
 * four such neighbours and there are six passengers, so a free one always
 * exists. (Re-queues after several misses can still bring two faces together;
 * nothing that assigns once can prevent that, and a face that changed after a
 * miss would be the worse bug.)
 */
export function assignLastCallPassengers(
  previewOrder: readonly number[],
  recallOrder: readonly number[] = previewOrder,
): Map<number, LastCallPassengerId> {
  const out = new Map<number, LastCallPassengerId>();
  const neighbours = new Map<number, Set<number>>();
  const link = (a: number | undefined, b: number | undefined) => {
    if (a === undefined || b === undefined || a === b) return;
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    if (!neighbours.has(b)) neighbours.set(b, new Set());
    neighbours.get(a)!.add(b);
    neighbours.get(b)!.add(a);
  };
  for (let i = 1; i < previewOrder.length; i++) link(previewOrder[i - 1], previewOrder[i]);
  for (let i = 1; i < recallOrder.length; i++) link(recallOrder[i - 1], recallOrder[i]);
  if (recallOrder.length > 2) link(recallOrder[recallOrder.length - 1], recallOrder[0]);

  const n = LAST_CALL_PASSENGERS.length;
  recallOrder.forEach((phraseId, index) => {
    if (out.has(phraseId)) return;
    const taken = new Set<LastCallPassengerId>();
    for (const other of neighbours.get(phraseId) ?? []) {
      const face = out.get(other);
      if (face) taken.add(face);
    }
    for (let step = 0; step < n; step++) {
      const candidate = LAST_CALL_PASSENGERS[(index + step) % n]!.id;
      if (!taken.has(candidate)) {
        out.set(phraseId, candidate);
        return;
      }
    }
    out.set(phraseId, LAST_CALL_PASSENGERS[index % n]!.id);
  });
  // A phrase in the preview but somehow absent from the recall order still
  // needs a face; the round never produces one, but a screen must not crash.
  previewOrder.forEach((phraseId, index) => {
    if (!out.has(phraseId)) out.set(phraseId, LAST_CALL_PASSENGERS[index % n]!.id);
  });
  return out;
}

export function lastCallPassengerById(id: LastCallPassengerId): LastCallPassenger {
  return LAST_CALL_PASSENGERS.find((p) => p.id === id) ?? LAST_CALL_PASSENGERS[0]!;
}

/** The doorway film's intrinsic size. Both apps draw it with cover-fit. */
export const LAST_CALL_FILM_PX = { width: 1080, height: 1920 } as const;

/** Where a figure stands: the door, or one of the two visible queue places. */
export type LastCallSlot = "door" | "queue1" | "queue2";

export interface LastCallFigureBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Horizontal centre and bottom edge, the two numbers a walk animates between. */
  cx: number;
  bottom: number;
  opacity: number;
}

/**
 * Where the art pass left room, in the FILM's own fractions. The clear stretch
 * of platform in front of the door is roughly x 30..70%, y 55..80%, and the
 * carriage steps begin at about y 75.5% (measured off frame 0). The door
 * figure's bottom edge sits just below that line so the waist-up cut reads as
 * standing at the step. The queue waits further back (higher in the frame,
 * smaller) and to the right, where the platform opens out, overlapping the
 * door figure's shoulder so the three read as one line.
 */
const SLOT_FILM: Record<LastCallSlot, { fx: number; fy: number; scale: number; opacity: number }> = {
  door: { fx: 0.5, fy: 0.765, scale: 1, opacity: 1 },
  queue1: { fx: 0.78, fy: 0.705, scale: 0.66, opacity: 0.8 },
  queue2: { fx: 0.9, fy: 0.675, scale: 0.52, opacity: 0.6 },
};
/** The door figure's height as a share of the stage: the brief's 45..55%, middle. */
const DOOR_HEIGHT_SHARE = 0.5;
/** A wide cut-out on a narrow stage is shrunk until it leaves this much width. */
const DOOR_MAX_WIDTH_SHARE = 0.92;

/**
 * A figure's box, in stage points, for a stage `stageW` x `stageH` that shows
 * the film cover-fitted. Pure arithmetic so web and mobile put every passenger
 * on the same spot of the same painted platform.
 */
export function lastCallFigureBox(
  slot: LastCallSlot,
  passenger: LastCallPassenger,
  stageW: number,
  stageH: number,
): LastCallFigureBox {
  const s = Math.max(stageW / LAST_CALL_FILM_PX.width, stageH / LAST_CALL_FILM_PX.height);
  const filmW = LAST_CALL_FILM_PX.width * s;
  const filmH = LAST_CALL_FILM_PX.height * s;
  const offX = (stageW - filmW) / 2;
  const offY = (stageH - filmH) / 2;
  const place = SLOT_FILM[slot];
  const aspect = passenger.width / passenger.height;
  let height = stageH * DOOR_HEIGHT_SHARE * place.scale;
  const maxW = stageW * DOOR_MAX_WIDTH_SHARE * place.scale;
  if (height * aspect > maxW) height = maxW / aspect;
  const width = height * aspect;
  const cx = offX + place.fx * filmW;
  // A very tall stage crops the film's foot away; never stand anyone below
  // the bottom tenth, where the speak control lives.
  const bottom = Math.min(offY + place.fy * filmH, stageH * 0.9);
  return { left: cx - width / 2, top: bottom - height, width, height, cx, bottom, opacity: place.opacity };
}

/**
 * A rough width, in px, of `text` set at `fontSize` in a heavy sans such as
 * Inter ExtraBold. For a platform that cannot measure before it draws (React
 * Native). It errs WIDE on purpose, so a guess that is off shrinks the text a
 * size too far rather than spilling it off the card; mobile also keeps RN's
 * own adjustsFontSizeToFit behind it as a net. Non-Latin letters count as a
 * generous 0.62em each, which over-counts the combining marks of Indic scripts
 * and so, again, errs small.
 */
export function estimateSignTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    if (ch === " ") em += 0.27;
    else if ("iljI.,;:'!|()[]’".includes(ch)) em += 0.31;
    else if ("mwMW@".includes(ch)) em += 0.92;
    else if (ch >= "A" && ch <= "Z") em += 0.7;
    else if (ch >= "0" && ch <= "9") em += 0.62;
    else if (ch.charCodeAt(0) < 0x250) em += 0.58;
    else em += 0.62;
  }
  return em * fontSize;
}

export interface SignTextFit {
  fontSize: number;
  /** The greedy word-wrap the fit was judged on. */
  lines: string[];
  /** False when even `minFontSize` could not fit; the caller clips. */
  fits: boolean;
}

/**
 * The largest font size, stepping down by 1, at which `text` word-wraps into
 * `maxLines` lines that fit `boxWidth` x `boxHeight`. Words are never broken
 * mid-word: a single word wider than the card means a smaller size, which is
 * how a printed sign would be set.
 *
 * `measure` is the platform's ruler: web passes a canvas measureText in the
 * real font, mobile passes estimateSignTextWidth.
 */
export function fitSignText(
  text: string,
  boxWidth: number,
  boxHeight: number,
  measure: (s: string, fontSize: number) => number,
  opts: { maxFontSize: number; minFontSize: number; lineHeight: number; maxLines: number },
): SignTextFit {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wrap = (size: number): string[] | null => {
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (measure(word, size) > boxWidth) return null;
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size) <= boxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const max = Math.max(opts.minFontSize, Math.floor(opts.maxFontSize));
  for (let size = max; size >= opts.minFontSize; size--) {
    const lines = wrap(size);
    if (!lines) continue;
    if (lines.length <= opts.maxLines && lines.length * size * opts.lineHeight <= boxHeight) {
      return { fontSize: size, lines, fits: true };
    }
  }
  return { fontSize: opts.minFontSize, lines: wrap(opts.minFontSize) ?? [text], fits: false };
}
