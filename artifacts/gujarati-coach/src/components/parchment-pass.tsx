/**
 * THE PARCHMENT PASS, the web twin of bolo-mobile/components/journey/
 * ParchmentPass.tsx (build 21 there, the owner's home mockup: "make sure to
 * change the actual pass to the parchment paper look in my example, and the
 * icon landmark seeping through"; ported here 2026-08-30 on the owner's
 * "the boarding pass on web is not updated with new UX from mobile").
 *
 * The home boarding pass used to lie on the carved station board (the
 * pediment with rosettes over a framed cream panel) that the journey's zone
 * header also draws. This replaces the board, on home only, with a sheet of
 * aged paper: warm cream, darker at the edges, a soft shadow lifting it off
 * the page, a brass nameplate riding its top edge with the zone in faint ink
 * beneath, and a landmark seeping through the paper behind the words. The
 * journey's zone header keeps CarvedBoard.
 *
 * THE DRAWN SHEET, NOT THE PAINTED ONE. Mobile carries a painted parchment
 * behind a kill switch the owner turned off on sight ("revert the parchment
 * paper on boarding pass back to previous one", build 22), so the drawn sheet
 * is the pass on both platforms and the painting is not ported.
 *
 * THE LANDMARK IS DRAWN, NOT PAINTED (components/landmark.tsx): a silhouette
 * in the paper's own ink at a whisper, keyed by the city the pass prints.
 *
 * FLUID WHERE MOBILE IS FIXED. Mobile draws in points it is handed; web's
 * hero runs from a phone to a 700px desktop column, so the paper measures
 * itself (useElementSize) and redraws its tear at the measured size. Until it
 * is measured (jsdom, first paint) it draws at a phone's 358 by the minimum
 * height, stretched to fit, which on paper grain does not show.
 */
import { type CSSProperties, type ReactNode, useId, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useElementSize } from "@/hooks/use-element-size";
import { Landmark } from "@/components/landmark";
import { TICKET } from "@/lib/ticket-stock";
import { ZONE_BOARD } from "@/lib/zone-backdrops";

/** The nameplate's height; it straddles the paper's top edge by half of it. */
export const PARCHMENT_PLATE_H = 34;
/** How far below the paper's top the content starts: the plate's lower half,
 *  the zone line under it, and a breath. */
export const PARCHMENT_TOP = PARCHMENT_PLATE_H / 2 + 30;
/** The paper's side and bottom padding around its content. */
export const PARCHMENT_PAD = 16;
/** The width the tear is drawn at before the paper has been measured. */
export const PARCHMENT_DEFAULT_W = 358;

export const PARCHMENT_PAPER = {
  top: "#FBF0DC",
  mid: "#F4E2C4",
  bottom: "#EBD3AD",
  edge: "#B8946A",
  rim: "#7A5443",
  stain: "#8A6A47",
  shadow: "#3B2A1E",
  shade: "rgba(122, 84, 67, 0.16)",
} as const;

export const PARCHMENT_BRASS = {
  top: "#E8CF86",
  mid: "#D9BE72",
  bottom: "#B8953F",
  edge: "#8A6A1E",
  ink: "#3B2A1E",
} as const;

/** A small seeded generator, so the tear is the same every render. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * THE TORN OUTLINE. Walks the paper's perimeter inside a margin, a point
 * every few points, and moves each one a little in or out; the corners are
 * bitten off on a diagonal, and every so often a side takes a deeper nick.
 * Deterministic for a given size, so the tear never crawls between renders.
 * Mobile's function to the digit, so the two sheets tear alike.
 */
export function deckledPath(w: number, h: number, seed: number): string {
  const rnd = mulberry(seed);
  const m = 3; // the margin the tear lives inside, so the rim never clips
  const step = 6;
  const corner = 9 + rnd() * 5;
  const pts: Array<[number, number]> = [];
  const jitter = (big: boolean) => (rnd() - 0.5) * (big ? 5 : 2.2);
  const walk = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const big = rnd() < 0.08;
      const j = jitter(big);
      pts.push([x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j]);
    }
  };
  const L = m;
  const R = w - m;
  const T = m;
  const B = h - m;
  walk(L + corner, T, R - corner, T, 0, 1);
  walk(R - corner, T, R, T + corner, -0.7, 0.7);
  walk(R, T + corner, R, B - corner, -1, 0);
  walk(R, B - corner, R - corner, B, -0.7, -0.7);
  walk(R - corner, B, L + corner, B, 0, -1);
  walk(L + corner, B, L, B - corner, 0.7, -0.7);
  walk(L, B - corner, L, T + corner, 1, 0);
  walk(L, T + corner, L + corner, T, 0.7, 0.7);
  return (
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") +
    " Z"
  );
}

/** A few faint strokes with the paper's grain, mostly horizontal. */
export function fibrePaths(w: number, h: number, seed: number): string[] {
  const rnd = mulberry(seed);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const y = 12 + rnd() * (h - 24);
    const x0 = 10 + rnd() * (w * 0.5);
    const len = 30 + rnd() * (w * 0.4);
    const bow = (rnd() - 0.5) * 6;
    out.push(
      `M${x0.toFixed(1)} ${y.toFixed(1)} q${(len / 2).toFixed(1)} ${bow.toFixed(1)} ${len.toFixed(1)} 0`,
    );
  }
  return out;
}

/** Faint overlapping patches, lighter and darker than the sheet, the way
 *  handmade paper is never one colour. */
export function mottlePatches(
  w: number,
  h: number,
  seed: number,
): Array<{ cx: number; cy: number; rx: number; ry: number; rot: number; light: boolean; o: number }> {
  const rnd = mulberry(seed);
  const out = [];
  for (let i = 0; i < 70; i++) {
    const rx = 6 + rnd() * 16;
    out.push({
      cx: rnd() * w,
      cy: rnd() * h,
      rx,
      ry: rx * (0.7 + rnd() * 0.3),
      rot: rnd() * 180,
      light: rnd() < 0.45,
      o: 0.014 + rnd() * 0.022,
    });
  }
  return out;
}

/** Tiny age spots, a scatter of them, darker and small. */
export function frecklePoints(
  w: number,
  h: number,
  seed: number,
): Array<{ cx: number; cy: number; r: number; o: number }> {
  const rnd = mulberry(seed);
  const out = [];
  for (let i = 0; i < 26; i++) {
    out.push({
      cx: 6 + rnd() * (w - 12),
      cy: 6 + rnd() * (h - 12),
      r: 0.7 + rnd() * 1.6,
      o: 0.1 + rnd() * 0.14,
    });
  }
  return out;
}

export function ParchmentPass({
  nameplate,
  plate,
  landmark,
  minHeight,
  aspect,
  clipContent = true,
  className,
  style,
  testId,
  children,
}: {
  /** The brass plate's line, upper-cased here. */
  nameplate: string;
  /** The faint line under it, e.g. "ZONE 1". */
  plate: string;
  /** The zone's city, whose landmark seeps through the paper. */
  landmark: string | null;
  /** The paper's floor, in px; with `aspect` the paper grows past it. */
  minHeight: number;
  /** The paper's shape (width over height) once wider than the floor allows. */
  aspect?: number;
  /** Off for the length of an animation that must leave the paper. */
  clipContent?: boolean;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  children?: ReactNode;
}) {
  // The plate hangs half above the paper, so the whole sits that much lower
  // inside the box the caller gives it.
  const paperTop = PARCHMENT_PLATE_H / 2;
  const paper = useElementSize<HTMLDivElement>();
  const w = paper.width > 0 ? paper.width : PARCHMENT_DEFAULT_W;
  const h = paper.height > 0 ? paper.height : minHeight;
  const plateW = Math.min(w * 0.56, 240);
  const landmarkW = Math.min(w * 0.58, 250);
  const landmarkH = landmarkW * 0.6;
  const deckle = useMemo(() => deckledPath(w, h, 7), [w, h]);
  const fibres = useMemo(() => fibrePaths(w, h, 11), [w, h]);
  const mottle = useMemo(() => mottlePatches(w, h, 23), [w, h]);
  const freckles = useMemo(() => frecklePoints(w, h, 41), [w, h]);
  // One pass per page today, but gradient ids are document-global, so the
  // ids are scoped to the instance anyway.
  const uid = useId().replace(/:/g, "");
  const gradId = `paperGrad-${uid}`;
  const stainId = `stain-${uid}`;
  const vignetteId = `vignette-${uid}`;
  return (
    <div
      data-testid={testId}
      className={cn("relative", className)}
      style={{ paddingTop: paperTop, ...style }}
    >
      {/* THE SHEET, TORN AND WORN (owner, build 21 on mobile: "parchment paper
          doesn't have details around the edges making it look realistic").
          Not a rounded rectangle: a deckled outline walked round the paper
          with a seeded jitter, bigger bites at the corners and the odd nick
          along a side, filled with the cream gradient, with two faint stains
          and a few fibre strokes in the paper. The shadow is two offset copies
          of the same torn shape, so it too follows the tear rather than a
          box. All of it is one svg; the words sit in a box above it. */}
      <div
        ref={paper.ref}
        data-testid="parchment-paper"
        className={cn("relative w-full", clipContent ? "overflow-hidden" : "overflow-visible")}
        style={aspect === undefined ? { height: minHeight } : { minHeight, aspectRatio: aspect }}
      >
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          data-testid="parchment-sheet"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={PARCHMENT_PAPER.top} />
              <stop offset="0.55" stopColor={PARCHMENT_PAPER.mid} />
              <stop offset="1" stopColor={PARCHMENT_PAPER.bottom} />
            </linearGradient>
            <radialGradient id={stainId} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor={PARCHMENT_PAPER.stain} stopOpacity="0.1" />
              <stop offset="1" stopColor={PARCHMENT_PAPER.stain} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={vignetteId} cx="50%" cy="50%" r="72%">
              <stop offset="0.55" stopColor={PARCHMENT_PAPER.stain} stopOpacity="0" />
              <stop offset="1" stopColor={PARCHMENT_PAPER.stain} stopOpacity="0.12" />
            </radialGradient>
          </defs>
          {/* the shadow, following the tear */}
          <path d={deckle} fill={PARCHMENT_PAPER.shadow} opacity={0.1} transform="translate(0, 7)" />
          <path d={deckle} fill={PARCHMENT_PAPER.shadow} opacity={0.14} transform="translate(0, 4)" />
          {/* the paper */}
          <path d={deckle} fill={`url(#${gradId})`} />
          <path d={deckle} fill={`url(#${vignetteId})`} />
          {/* THE PAPER'S OWN IMPERFECTIONS (owner: "the actual paper should
              have features of imperfection"): a seeded mottle of faint cream
              and tan patches, then a scatter of tiny age freckles, under the
              stains and the fibres. All at a whisper, so the words stay easy. */}
          {mottle.map((m, i) => (
            <ellipse
              key={`m${i}`}
              cx={m.cx}
              cy={m.cy}
              rx={m.rx}
              ry={m.ry}
              fill={m.light ? PARCHMENT_PAPER.top : PARCHMENT_PAPER.stain}
              fillOpacity={m.o}
              transform={`rotate(${m.rot} ${m.cx} ${m.cy})`}
            />
          ))}
          {freckles.map((f, i) => (
            <ellipse
              key={`f${i}`}
              cx={f.cx}
              cy={f.cy}
              rx={f.r}
              ry={f.r * 0.8}
              fill={PARCHMENT_PAPER.stain}
              fillOpacity={f.o}
            />
          ))}
          {/* stains: one high on the left, one low on the right */}
          <ellipse cx={w * 0.22} cy={h * 0.28} rx={w * 0.16} ry={h * 0.2} fill={`url(#${stainId})`} />
          <ellipse cx={w * 0.78} cy={h * 0.76} rx={w * 0.2} ry={h * 0.18} fill={`url(#${stainId})`} />
          {/* fibres: a few faint strokes with the grain */}
          {fibres.map((d, i) => (
            <path
              key={i}
              d={d}
              stroke={PARCHMENT_PAPER.stain}
              strokeWidth={0.8}
              strokeOpacity={0.14}
              fill="none"
            />
          ))}
          {/* THE FRAY, NOT A RIM (owner: "it shouldn't have a darker border"):
              the tear is softened with a stroke of the paper's own light, so
              the edge reads as fibres catching light, never as a line. */}
          <path
            d={deckle}
            fill="none"
            stroke={PARCHMENT_PAPER.top}
            strokeWidth={2.2}
            strokeOpacity={0.7}
          />
        </svg>
        {/* The landmark, seeping through behind the words. A tenth of ink on
            the drawn sheet's flat cream. CENTRED ON THE SHEET, both ways
            (owner, 2026-08-30: "it should be center of card vertically as
            well"); it sat on the paper's foot until then. */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: landmarkW, height: landmarkH }}
        >
          <Landmark
            city={landmark}
            width={landmarkW}
            height={landmarkH}
            ink={TICKET.ink}
            paper={PARCHMENT_PAPER.mid}
            opacity={0.1}
          />
        </div>
        {/* The inner rule, set in from the tear like a ticket's. */}
        <div
          className="pointer-events-none absolute rounded-[9px] border opacity-50"
          style={{ inset: 9, borderColor: TICKET.rule }}
        />
        {/* THE WORDS, inside the paper's padding, under the plate. Absolute
            like CarvedBoard's content box, so a child's h-full is the box the
            paper leaves it and home can measure it. */}
        <div
          className={cn("absolute inset-0", clipContent ? "overflow-hidden" : "overflow-visible")}
          style={{
            paddingTop: PARCHMENT_TOP - paperTop,
            paddingLeft: PARCHMENT_PAD,
            paddingRight: PARCHMENT_PAD,
            paddingBottom: PARCHMENT_PAD - 4,
          }}
        >
          {children}
        </div>
      </div>
      {/* THE BRASS NAMEPLATE, riding the top edge. */}
      <div
        aria-hidden="true"
        data-testid="parchment-plate"
        className="pointer-events-none absolute left-1/2 top-0 flex -translate-x-1/2 items-center justify-center overflow-hidden rounded-[8px]"
        style={{
          width: plateW,
          height: PARCHMENT_PLATE_H,
          border: `1.5px solid ${PARCHMENT_BRASS.edge}`,
          backgroundImage: `linear-gradient(${PARCHMENT_BRASS.top}, ${PARCHMENT_BRASS.mid} 50%, ${PARCHMENT_BRASS.bottom})`,
          boxShadow: "0 2px 4px rgba(59, 42, 30, 0.25)",
        }}
      >
        <span
          className="pointer-events-none absolute rounded-[5px] border"
          style={{ inset: 3, borderColor: "rgba(255, 248, 220, 0.55)" }}
        />
        <span
          className="relative truncate px-3 text-[13px] font-extrabold tracking-[1.8px]"
          style={{ color: PARCHMENT_BRASS.ink }}
        >
          {nameplate.toUpperCase()}
        </span>
      </div>
      {/* The zone, faint, under the plate. */}
      <div
        data-testid="parchment-zone"
        className="pointer-events-none absolute inset-x-0 truncate text-center text-[9px] font-extrabold tracking-[1.6px]"
        style={{ top: PARCHMENT_PLATE_H + 6, color: ZONE_BOARD.inkMuted, opacity: 0.55 }}
      >
        {plate.toUpperCase()}
      </div>
    </div>
  );
}
