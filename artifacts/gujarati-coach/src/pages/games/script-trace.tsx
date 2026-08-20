import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Redirect } from "wouter";
import { ArrowLeft, ChevronRight, RotateCcw, CheckCircle2, XCircle, Trophy, Play } from "lucide-react";
import { Link } from "wouter";
import { useEntitlements } from "@/lib/entitlements";
import { useLanguage } from "@/lib/language-context";
import { BottomNav } from "@/components/layout/bottom-nav";
import {
  MissReviewCta,
  MissReviewDialog,
  type GameMiss,
} from "@/components/game-miss-review";
import { cn } from "@/lib/utils";
import {
  LANG_CHAPTER_IDS,
  SCRIPT_TRACE_CHAPTERS,
  type TraceChapter,
  type TraceCharacter,
  type ChapterStage,
} from "@workspace/script-trace";

// ── Accuracy scoring ─────────────────────────────────────────────────────────

type Point = { x: number; y: number };

/** Sample N evenly-spaced points along a polyline. */
function samplePath(points: Point[], n: number): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array(n).fill(points[0]);

  // Total length
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segs.push(d);
    total += d;
  }

  if (total === 0) return Array(n).fill(points[0]);

  const result: Point[] = [];
  let dist = 0;
  let seg = 0;
  let segDist = 0;

  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    while (seg < segs.length - 1 && segDist + segs[seg] < target) {
      segDist += segs[seg];
      seg++;
    }
    const t = segs[seg] > 0 ? (target - segDist) / segs[seg] : 0;
    result.push({
      x: points[seg].x + t * (points[seg + 1].x - points[seg].x),
      y: points[seg].y + t * (points[seg + 1].y - points[seg].y),
    });
  }
  return result;
}

/** Parse an SVG path string into one polyline per subpath (per M command). */
function parseSvgSubpaths(d: string): Point[][] {
  const subpaths: Point[][] = [];
  let points: Point[] = [];
  const cmds = d.trim().match(/[MLQC][^MLQC]*/g) ?? [];
  let cx = 0, cy = 0;

  for (const cmd of cmds) {
    const type = cmd[0];
    const nums = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    if (type === "M") {
      if (points.length > 0) subpaths.push(points);
      points = [];
      cx = nums[0]; cy = nums[1];
      points.push({ x: cx, y: cy });
    } else if (type === "L") {
      cx = nums[0]; cy = nums[1];
      points.push({ x: cx, y: cy });
    } else if (type === "Q") {
      // Quadratic bezier — sample 20 intermediate points. Iterate on an
      // integer counter so t reaches exactly 1: accumulating `t += 0.05`
      // overshoots 1 by float error and skips the endpoint, leaving contours
      // that end in a curve unclosed (which breaks the winding test).
      const [qx1, qy1, qx2, qy2] = nums;
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        const x = (1 - t) ** 2 * cx + 2 * (1 - t) * t * qx1 + t ** 2 * qx2;
        const y = (1 - t) ** 2 * cy + 2 * (1 - t) * t * qy1 + t ** 2 * qy2;
        points.push({ x, y });
      }
      cx = qx2; cy = qy2;
    } else if (type === "C") {
      const [cx1, cy1, cx2, cy2, ex, ey] = nums;
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        const x =
          (1 - t) ** 3 * cx +
          3 * (1 - t) ** 2 * t * cx1 +
          3 * (1 - t) * t ** 2 * cx2 +
          t ** 3 * ex;
        const y =
          (1 - t) ** 3 * cy +
          3 * (1 - t) ** 2 * t * cy1 +
          3 * (1 - t) * t ** 2 * cy2 +
          t ** 3 * ey;
        points.push({ x, y });
      }
      cx = ex; cy = ey;
    }
  }

  if (points.length > 0) subpaths.push(points);
  return subpaths;
}

/**
 * Parse an SVG path into ~`samples` evenly spaced points. Samples are
 * distributed across subpaths proportionally to their length and each subpath
 * is sampled independently, so separate glyph contours never contribute
 * phantom "connector" geometry between an M boundary and the previous point.
 */
export function parseSvgPath(d: string, samples = 80): Point[] {
  const subpaths = parseSvgSubpaths(d).filter((sp) => sp.length > 1);
  if (subpaths.length === 0) return [];
  const lengths = subpaths.map((sp) => {
    let len = 0;
    for (let i = 1; i < sp.length; i++) {
      len += Math.hypot(sp[i].x - sp[i - 1].x, sp[i].y - sp[i - 1].y);
    }
    return len;
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total === 0) return [subpaths[0][0]];
  const out: Point[] = [];
  subpaths.forEach((sp, i) => {
    const n = Math.max(2, Math.round((lengths[i] / total) * samples));
    out.push(...samplePath(sp, n));
  });
  return out;
}

export const PASS_THRESHOLD = 40; // % interior coverage needed to pass

// ── Interior coverage scoring ─────────────────────────────────────────────────
//
// The old Chamfer metric compared user strokes against the *outline* of the
// filled glyph.  Font outlines are the PERIMETER of a filled shape — a stroke
// drawn naturally through the centre of a letter has high distance to the
// outline and therefore a low (wrong) score.
//
// Coverage scoring asks instead: what fraction of the character's filled
// interior did the user's strokes reach?  Drawing through the middle scores
// well; random scribbles outside the shape score poorly.

/** Cross product used by the winding-number inside test. */
function cross2(a: Point, b: Point, pt: Point): number {
  return (b.x - a.x) * (pt.y - a.y) - (pt.x - a.x) * (b.y - a.y);
}

/**
 * Winding number test over multiple polygon subpaths (nonzero fill rule,
 * matching TrueType / font-outline winding).  Returns non-zero when `pt` is
 * inside the combined shape.
 */
function windingInSubpaths(pt: Point, subpaths: Point[][]): number {
  let wn = 0;
  for (const poly of subpaths) {
    const n = poly.length;
    for (let i = 0; i < n - 1; i++) {
      const a = poly[i], b = poly[i + 1];
      if (a.y <= pt.y) {
        if (b.y > pt.y && cross2(a, b, pt) > 0) wn++;
      } else {
        if (b.y <= pt.y && cross2(a, b, pt) < 0) wn--;
      }
    }
  }
  return wn;
}

/**
 * Sample a grid of points from INSIDE the filled glyph shape using a
 * winding-number test against the parsed subpath polylines.
 * Coordinates are in the same 0-100 space as the guide SVG path.
 */
export function getInteriorPoints(svgPathD: string, gridN = 16): Point[] {
  const subpaths = parseSvgSubpaths(svgPathD).filter((sp) => sp.length > 2);
  if (subpaths.length === 0) return [];
  const allPts = subpaths.flat();
  const minX = Math.min(...allPts.map((p) => p.x));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxY = Math.max(...allPts.map((p) => p.y));
  const interior: Point[] = [];
  for (let i = 0; i <= gridN; i++) {
    for (let j = 0; j <= gridN; j++) {
      const x = minX + (maxX - minX) * (i / gridN);
      const y = minY + (maxY - minY) * (j / gridN);
      if (windingInSubpaths({ x, y }, subpaths) !== 0) interior.push({ x, y });
    }
  }
  return interior;
}

/**
 * For text-mode characters (guide = ""), use an offscreen canvas to find which
 * grid points fall on actual rendered text pixels (accurate for any Unicode char).
 * Falls back to a centre-region grid if the canvas API is unavailable.
 */
function getTextInteriorPoints(char: string, gridN = 14): Point[] {
  try {
    const offscreen = document.createElement("canvas");
    offscreen.width = 100;
    offscreen.height = 100;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return getTextFallbackPoints(gridN);
    ctx.fillStyle = "black";
    ctx.font = "bold 45px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(char, 50, 50);
    const { data } = ctx.getImageData(0, 0, 100, 100);
    const pts: Point[] = [];
    for (let i = 0; i <= gridN; i++) {
      for (let j = 0; j <= gridN; j++) {
        const px = Math.round((i / gridN) * 99);
        const py = Math.round((j / gridN) * 99);
        if (data[(py * 100 + px) * 4 + 3] > 64) {
          pts.push({ x: (i / gridN) * 100, y: (j / gridN) * 100 });
        }
      }
    }
    return pts.length > 4 ? pts : getTextFallbackPoints(gridN);
  } catch {
    return getTextFallbackPoints(gridN);
  }
}

function getTextFallbackPoints(gridN = 10): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= gridN; i++)
    for (let j = 0; j <= gridN; j++)
      pts.push({ x: 10 + (i / gridN) * 80, y: 18 + (j / gridN) * 58 });
  return pts;
}

/** In 0-100 canvas units: how close a stroke must come to "cover" a ref point. */
const COVERAGE_TOLERANCE = 9;

/**
 * Accuracy score (0-100) = coverage × precision.
 *
 * Coverage: fraction of interior reference points reached by at least one
 * user stroke point within COVERAGE_TOLERANCE — did they draw the whole
 * character?
 *
 * Precision: fraction of the drawn ink that lands on (or near) the character,
 * judged with a looser tolerance so honest wobble along the glyph edge is not
 * punished. Long tails and scribbles outside the shape pull the score down —
 * a sloppy trace can still pass, but it no longer reads as a perfect 100%.
 */
export function scoreCoverage(strokes: Point[][], referencePoints: Point[]): number {
  if (referencePoints.length === 0 || strokes.length === 0) return 0;
  const allPts = strokes.flat();
  if (allPts.length < 3) return 0;
  let covered = 0;
  outer: for (const ref of referencePoints) {
    for (const pt of allPts) {
      if (Math.hypot(pt.x - ref.x, pt.y - ref.y) < COVERAGE_TOLERANCE) {
        covered++;
        continue outer;
      }
    }
  }
  const coverage = covered / referencePoints.length;

  const strayTolerance = COVERAGE_TOLERANCE * 1.5;
  // Subsample the drawn points so precision stays cheap on long traces.
  const step = Math.max(1, Math.floor(allPts.length / 400));
  let sampled = 0;
  let onTarget = 0;
  for (let i = 0; i < allPts.length; i += step) {
    sampled++;
    const pt = allPts[i];
    for (const ref of referencePoints) {
      if (Math.hypot(pt.x - ref.x, pt.y - ref.y) < strayTolerance) {
        onTarget++;
        break;
      }
    }
  }
  const precision = sampled > 0 ? onTarget / sampled : 1;

  // Ink-spread gate: a stationary tap (or tiny scribble) concentrates all its
  // ink in one spot yet can sit within tolerance of many reference points on
  // compact or word-scale glyphs. Real writing spans the character, so scale
  // the score by how much of the reference bounding-box diagonal the drawn
  // ink spans. Honest traces span nearly the full glyph (factor 1); a tap
  // spans ~2 units and is crushed.
  let dMinX = Infinity, dMaxX = -Infinity, dMinY = Infinity, dMaxY = -Infinity;
  for (const p of allPts) {
    if (p.x < dMinX) dMinX = p.x;
    if (p.x > dMaxX) dMaxX = p.x;
    if (p.y < dMinY) dMinY = p.y;
    if (p.y > dMaxY) dMaxY = p.y;
  }
  let rMinX = Infinity, rMaxX = -Infinity, rMinY = Infinity, rMaxY = -Infinity;
  for (const p of referencePoints) {
    if (p.x < rMinX) rMinX = p.x;
    if (p.x > rMaxX) rMaxX = p.x;
    if (p.y < rMinY) rMinY = p.y;
    if (p.y > rMaxY) rMaxY = p.y;
  }
  const drawnDiag = Math.hypot(dMaxX - dMinX, dMaxY - dMinY);
  const refDiag = Math.hypot(rMaxX - rMinX, rMaxY - rMinY) || 1;
  const spread = Math.min(1, drawnDiag / (0.45 * refDiag));

  return Math.round(coverage * precision * spread * 100);
}

// ── Animation helper ───────────────────────────────────────────────────────────

// ── Pen-stroke skeleton extraction (demo animation) ───────────────────────────
//
// To demonstrate HOW to write a character the animation must follow pen
// strokes down the MIDDLE of each limb — not the glyph outline (that is the
// perimeter of the filled shape, so tracing it draws around the outside of
// the letter) and not scan lines. This is the standard handwriting-animation
// pipeline used by font-to-handwriting tools (Tegaki, MakeMeAHanzi):
//
//   1. Rasterize   — fill the glyph interior into a small binary bitmap
//   2. Skeletonize — Zhang-Suen thinning erodes it to a 1-px centerline
//   3. Trace       — walk skeleton pixels into polylines, split at junctions
//   4. Simplify    — prune tiny spurs, Ramer-Douglas-Peucker smoothing
//   5. Order       — top-left stroke first, then nearest-next; orient each
//                    stroke to start where a pen naturally would
//
// The output is the letter's actual "pen paths", animated stroke by stroke.

const SKEL_RES = 64; // base bitmap resolution across the 0-100 glyph space

/**
 * Bitmap resolution for a glyph: single letters thin cleanly at 64, but
 * multi-glyph words and multi-line sentences pack many small features into
 * the same 0-100 box — at 64px their limbs collapse below the thinning
 * resolution and the skeleton (demo animation + coverage of honest traces)
 * loses chunks. Scale resolution with contour count.
 */
function skelResFor(subpathCount: number): number {
  if (subpathCount >= 20) return 128; // multi-line sentences
  if (subpathCount >= 8) return 96; // words
  return SKEL_RES; // single letters
}
const ORIENT_X_WEIGHT = 0.35; // top-start bias with a left-start tiebreak

/** Rasterize the glyph interior into a binary res×res bitmap. */
function rasterizeGlyph(subpaths: Point[][], res: number): Uint8Array {
  const grid = new Uint8Array(res * res);
  const cell = 100 / res;
  for (let gy = 0; gy < res; gy++) {
    for (let gx = 0; gx < res; gx++) {
      const pt = { x: (gx + 0.5) * cell, y: (gy + 0.5) * cell };
      if (windingInSubpaths(pt, subpaths) !== 0) grid[gy * res + gx] = 1;
    }
  }
  return grid;
}

/** Zhang-Suen thinning: erode a binary bitmap down to its 1-px skeleton. */
function zhangSuenThin(src: Uint8Array, res: number): Uint8Array {
  const g = Uint8Array.from(src);
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= res || y >= res ? 0 : g[y * res + x];
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const del: number[] = [];
      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          if (!at(x, y)) continue;
          // Neighbours P2..P9, clockwise from north
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y);
          const p5 = at(x + 1, y + 1), p6 = at(x, y + 1), p7 = at(x - 1, y + 1);
          const p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9];
          let A = 0;
          for (let i = 0; i < 8; i++) if (!seq[i] && seq[(i + 1) % 8]) A++;
          if (A !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          }
          del.push(y * res + x);
        }
      }
      if (del.length > 0) { changed = true; for (const i of del) g[i] = 0; }
    }
  }
  return g;
}

/** Walk a 1-px skeleton bitmap into polylines (grid coords), splitting at junctions. */
function traceSkeletonPolylines(skel: Uint8Array, res: number): Point[][] {
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= res || y >= res ? 0 : skel[y * res + x];
  const N8 = [
    [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
  ] as const;
  const nbrs = (x: number, y: number): Point[] => {
    const out: Point[] = [];
    for (const [dx, dy] of N8) if (at(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
    return out;
  };
  const deg = (x: number, y: number) => nbrs(x, y).length;
  const edgeKey = (a: Point, b: Point) => {
    const i = a.y * res + a.x, j = b.y * res + b.x;
    return i < j ? i * res * res + j : j * res * res + i;
  };
  const used = new Set<number>();
  const polylines: Point[][] = [];

  const walk = (start: Point, next: Point): Point[] => {
    const line: Point[] = [start];
    let prev = start, cur = next;
    used.add(edgeKey(prev, cur));
    for (;;) {
      line.push(cur);
      if (deg(cur.x, cur.y) !== 2) break; // endpoint or junction reached
      const opts = nbrs(cur.x, cur.y).filter((p) => !(p.x === prev.x && p.y === prev.y));
      if (opts.length === 0) break;
      const nxt = opts[0];
      const k = edgeKey(cur, nxt);
      if (used.has(k)) break;
      used.add(k);
      prev = cur;
      cur = nxt;
    }
    return line;
  };

  // Walk from every endpoint (deg 1) and junction (deg ≥ 3) along unused edges
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      if (!at(x, y) || deg(x, y) === 2) continue;
      const node = { x, y };
      for (const nb of nbrs(x, y)) {
        if (!used.has(edgeKey(node, nb))) polylines.push(walk(node, nb));
      }
    }
  }
  // Pure loops (every pixel deg 2, e.g. a ring): walk from any unvisited pixel
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      if (!at(x, y) || deg(x, y) !== 2) continue;
      const start = { x, y };
      const fresh = nbrs(x, y).filter((p) => !used.has(edgeKey(start, p)));
      if (fresh.length > 0) polylines.push(walk(start, fresh[0]));
    }
  }
  return polylines;
}

/** Ramer-Douglas-Peucker polyline simplification. */
function rdpSimplify(pts: Point[], epsilon: number): Point[] {
  if (pts.length < 3) return pts;
  const first = pts[0], last = pts[pts.length - 1];
  const dx = last.x - first.x, dy = last.y - first.y;
  const norm = Math.hypot(dx, dy) || 1;
  let maxDist = 0, maxIdx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i].x - dx * pts[i].y + last.x * first.y - last.y * first.x) / norm;
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist <= epsilon) return [first, last];
  const left = rdpSimplify(pts.slice(0, maxIdx + 1), epsilon);
  const right = rdpSimplify(pts.slice(maxIdx), epsilon);
  return [...left.slice(0, -1), ...right];
}

/**
 * Loop-safe polyline simplification. Plain RDP measures distance to the
 * start→end chord; on a CLOSED loop (start ≈ end) that chord is degenerate,
 * every point measures ~0, and the whole ring collapses to a zero-length
 * segment. Split closed loops at the point farthest from the start and RDP
 * each half instead.
 */
function simplifyStroke(pts: Point[], eps: number): Point[] {
  const closed =
    pts.length > 3 &&
    Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 2;
  if (!closed) return rdpSimplify(pts, eps);
  let m = 1, best = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d > best) { best = d; m = i; }
  }
  const a = rdpSimplify(pts.slice(0, m + 1), eps);
  const b = rdpSimplify(pts.slice(m), eps);
  return [...a.slice(0, -1), ...b];
}

/** Total arc length of a polyline. */
function polylineLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** Direction (unit vector) at one end of a polyline, pointing INTO the line. */
function endDirection(pts: Point[], atStart: boolean): Point {
  const n = pts.length;
  const back = Math.min(n - 1, 3);
  const a = atStart ? pts[0] : pts[n - 1];
  const b = atStart ? pts[back] : pts[n - 1 - back];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Merge skeleton segments that continue smoothly through junctions, so the
 * pen draws long natural strokes (headline, stem, curve) instead of many
 * junction-split fragments.
 */
function mergeCollinearStrokes(lines: Point[][]): Point[][] {
  const JOIN_EPS = 3.5; // endpoints this close share a junction cluster
  const MAX_TURN_COS = -0.45; // merge only gentle continuations (travel turn ≲ 63°)
  const isLoop = (l: Point[]) =>
    Math.hypot(l[0].x - l[l.length - 1].x, l[0].y - l[l.length - 1].y) < JOIN_EPS;

  const work = lines.map((l) => [...l]);
  for (;;) {
    let bestI = -1, bestJ = -1, bestCos = 1, bestFlipI = false, bestFlipJ = false;
    for (let i = 0; i < work.length; i++) {
      if (work[i].length < 2 || isLoop(work[i])) continue;
      for (let j = i + 1; j < work.length; j++) {
        if (work[j].length < 2 || isLoop(work[j])) continue;
        for (const endI of [false, true]) {
          for (const endJ of [false, true]) {
            const pi = endI ? work[i][0] : work[i][work[i].length - 1];
            const pj = endJ ? work[j][0] : work[j][work[j].length - 1];
            if (Math.hypot(pi.x - pj.x, pi.y - pj.y) > JOIN_EPS) continue;
            // Both directions point INTO their lines: a smooth continuation
            // has them nearly opposite (cos ≈ -1).
            const di = endDirection(work[i], endI);
            const dj = endDirection(work[j], endJ);
            const cos = di.x * dj.x + di.y * dj.y;
            if (cos < bestCos) {
              bestCos = cos;
              bestI = i;
              bestJ = j;
              bestFlipI = endI; // matched at i's head → reverse i (junction at tail)
              bestFlipJ = !endJ; // matched at j's tail → reverse j (junction at head)
            }
          }
        }
      }
    }
    if (bestI < 0 || bestCos > MAX_TURN_COS) break;
    const a = bestFlipI ? [...work[bestI]].reverse() : work[bestI];
    const b = bestFlipJ ? [...work[bestJ]].reverse() : work[bestJ];
    work[bestI] = [...a, ...b.slice(1)];
    work.splice(bestJ, 1);
  }
  return work;
}

/** Orient a stroke so it starts where a pen naturally would (top-left bias). */
function orientStroke(pts: Point[]): Point[] {
  if (pts.length < 2) return pts;
  const start = pts[0], end = pts[pts.length - 1];
  // Near-closed loop → rotate so it starts at the topmost point
  if (Math.hypot(start.x - end.x, start.y - end.y) < 6) {
    let best = 0;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].y < pts[best].y || (pts[i].y === pts[best].y && pts[i].x < pts[best].x)) best = i;
    }
    return best === 0 ? pts : [...pts.slice(best), ...pts.slice(1, best + 1)];
  }
  const sScore = start.y + start.x * ORIENT_X_WEIGHT;
  const eScore = end.y + end.x * ORIENT_X_WEIGHT;
  return eScore < sScore ? [...pts].reverse() : pts;
}

/**
 * Chaikin corner-cutting smoothing. The RDP-simplified skeleton strokes are
 * angular polylines; two rounds of corner cutting turn them into the smooth
 * curves a hand actually draws, without ever leaving the hull of the original
 * points (so smoothed strokes stay inside the glyph). Endpoints are preserved
 * so stroke ordering and the start dot are unaffected.
 */
function chaikinSmooth(points: Point[], iterations = 2): Point[] {
  let pts = points;
  for (let iter = 0; iter < iterations; iter++) {
    if (pts.length < 3) return pts;
    const out: Point[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/**
 * Extract ordered pen strokes (centerline polylines, 0-100 space) from a
 * glyph outline path. Returns [] when the glyph is degenerate.
 */
export function extractStrokes(guideD: string): Point[][] {
  const subpaths = parseSvgSubpaths(guideD).filter((sp) => sp.length > 2);
  if (subpaths.length === 0) return [];
  const res = skelResFor(subpaths.length);
  const skel = zhangSuenThin(rasterizeGlyph(subpaths, res), res);
  const cell = 100 / res;
  let lines = traceSkeletonPolylines(skel, res).map((line) =>
    line.map((p) => ({ x: (p.x + 0.5) * cell, y: (p.y + 0.5) * cell })),
  );
  // Join segments that continue smoothly through junctions into long strokes.
  // Merging runs BEFORE spur pruning: the short fragments the thinning step
  // leaves at junction clusters are the bridges between collinear limbs —
  // pruning them first would leave gaps too wide to merge across.
  lines = mergeCollinearStrokes(lines);
  // Prune leftover tiny spurs (thinning artifacts) unless they are all we have
  const substantial = lines.filter((l) => polylineLength(l) >= 6);
  if (substantial.length > 0) lines = substantial;
  lines = lines.map((l) => orientStroke(simplifyStroke(l, 1.6)));

  // Degenerate-skeleton fallback: sentence-scale glyphs can squeeze letter
  // limbs into HAIRLINE strokes thinner than one raster cell. Point-sampled
  // winding then shatters the ink into isolated pixels, the tracer drops
  // them, and the "skeleton" collapses to a few tiny fragments. For such
  // hairline glyphs the outline loop IS the pen path (outline ≈ centreline
  // when strokes have no width), so trace the subpath loops directly.
  const skelLen = lines.reduce((s, l) => s + polylineLength(l), 0);
  const outlineLen = subpaths.reduce((s, sp) => s + polylineLength(sp), 0);
  if (skelLen < 20 || skelLen < 0.08 * outlineLen) {
    lines = subpaths.map((sp) => orientStroke(simplifyStroke(sp, 1.6)));
  }

  // Order strokes: most top-left start first, then greedily append the stroke
  // whose start is nearest the previous stroke's end (natural pen travel).
  const remaining = [...lines].sort(
    (a, b) => a[0].y + a[0].x * ORIENT_X_WEIGHT - (b[0].y + b[0].x * ORIENT_X_WEIGHT),
  );
  const ordered: Point[][] = [];
  let cur = remaining.shift();
  while (cur) {
    ordered.push(cur);
    const tail = cur[cur.length - 1];
    if (remaining.length === 0) break;
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = Math.hypot(remaining[i][0].x - tail.x, remaining[i][0].y - tail.y);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    cur = remaining.splice(bestIdx, 1)[0];
  }
  // Round the angular RDP polylines into the smooth curves a hand draws.
  return ordered.map((s) => chaikinSmooth(s));
}

/**
 * Session-lifetime stroke cache. Skeleton extraction at word/sentence
 * resolution (96/128) costs up to a few hundred ms; useMemo alone recomputes
 * on every remount (retry, revisit), stalling the JS thread. Keyed by guide
 * string; the full dataset would only be a few MB, a session touches far less.
 */
const guideStrokeCache = new Map<string, Point[][]>();
function strokesForGuide(guideD: string): Point[][] {
  const hit = guideStrokeCache.get(guideD);
  if (hit) return hit;
  const strokes = extractStrokes(guideD);
  guideStrokeCache.set(guideD, strokes);
  return strokes;
}

/** Per-stroke [start,end] time fractions, proportional to stroke length. */
function strokeTimeFractions(strokes: Point[][]): { start: number; end: number }[] {
  const lens = strokes.map(polylineLength);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return lens.map((len) => {
    const fr = { start: acc / total, end: (acc + len) / total };
    acc += len;
    return fr;
  });
}

/** Point at arc-distance `dist` along a polyline. */
function pointAtLength(pts: Point[], dist: number): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (seg > 0 && acc + seg >= dist) {
      const t = (dist - acc) / seg;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
      };
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}

function chaptersForLang(langCode: string): TraceChapter[] {
  const ids = LANG_CHAPTER_IDS[langCode] ?? [];
  return SCRIPT_TRACE_CHAPTERS.filter((c) => ids.includes(c.id));
}

// ── Chapter selection ─────────────────────────────────────────────────────────

const STAGE_LABELS: Record<ChapterStage, string> = {
  alphabet: "🔤 Alphabet",
  words: "📝 Words",
  sentences: "💬 Phrases",
  "full-sentences": "📖 Full Sentences",
};
const STAGE_ORDER: ChapterStage[] = ["alphabet", "words", "sentences", "full-sentences"];

function ChapterGrid({
  onSelect,
}: {
  onSelect: (chapter: TraceChapter) => void;
}) {
  const { activeLang, activeLanguage } = useLanguage();
  const chapters = chaptersForLang(activeLang);

  // Group by stage in display order
  const grouped = STAGE_ORDER.flatMap((stage) => {
    const stageChapters = chapters.filter((c) => c.stage === stage);
    return stageChapters.length > 0 ? [{ stage, chapters: stageChapters }] : [];
  });

  return (
    <div className="min-h-[100dvh] bg-background pb-nav lg:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4 lg:px-6">
          <Link href="/games">
            <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted transition-colors">
              <ArrowLeft className="h-4 w-4 text-foreground" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-extrabold leading-none tracking-tight text-foreground">
              Script Trace
            </h1>
            <p className="text-sm text-muted-foreground">
              {chapters.length > 0
                ? "Choose a chapter to practice"
                : activeLanguage?.name ?? activeLang}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-6 lg:px-6">
        {chapters.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <span className="text-3xl">✏️</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Coming soon</h2>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Script Trace for {activeLanguage?.name ?? activeLang} is on its way.
                Switch to Gujarati or Hindi to practice now.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map(({ stage, chapters: stageChapters }) => (
              <div key={stage}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {STAGE_LABELS[stage]}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {stageChapters.map((chapter) => (
                    <button
                      key={chapter.id}
                      onClick={() => onSelect(chapter)}
                      className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-all hover:border-primary/30 hover:bg-muted/40 hover:shadow-md active:scale-[0.98]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-3xl font-bold text-foreground" style={{ fontFamily: "serif", lineHeight: 1 }}>
                          {chapter.characters[0]?.char}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground">{chapter.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {chapter.characters.length} {stage === "alphabet" ? "characters" : "items"} · {chapter.scriptName} script
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

// ── Canvas tracing component ──────────────────────────────────────────────────

const ANIM_DURATION_MS = 2200;

function ScriptTraceCanvas({
  character,
  onResult,
  guidePoints,
  interiorPoints,
}: {
  character: TraceCharacter;
  onResult: (score: number, passed: boolean) => void;
  guidePoints: Point[];
  interiorPoints: Point[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawnRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);
  // All strokes the user has drawn so far (completed pen-down → pen-up segments).
  // Kept across finger/mouse lifts so multi-stroke characters work correctly.
  const allStrokesRef = useRef<Point[][]>([]);
  // Pending debounce timer: score fires 1.2 s after the last stroke ends.
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [pulseGuide, setPulseGuide] = useState(false);
  // Amber dots overlaid on uncovered regions after a failed attempt.
  const failedPointsRef = useRef<Point[] | null>(null);
  // Live coverage percentage shown below the canvas while drawing.
  const [liveCoverage, setLiveCoverage] = useState<number | null>(null);
  const lastCoverageTimeRef = useRef<number>(0);
  const PRIMARY = "#6366f1";

  // ── Stroke-order animation state ──
  // RAF progress refs
  const animFrameRef = useRef<number | null>(null);
  const animStartRef = useRef<number | null>(null);
  const animProgressRef = useRef<number | null>(0); // null = not playing
  const [isAnimating, setIsAnimating] = useState(false);

  // Sorted interior points for the demo animation dot.
  // Boustrophedon order ensures the dot sweeps continuously through the letter.
  // Pen strokes (centerline skeleton) for the demo animation, plus per-stroke
  // time fractions proportional to stroke length.
  const penStrokes = useMemo(
    () => (character.guide ? strokesForGuide(character.guide) : []),
    [character.guide],
  );
  const penStrokeFracs = useMemo(() => strokeTimeFractions(penStrokes), [penStrokes]);
  // Longer items (words/sentences have many strokes) get proportionally more
  // demo time — capped at 3× — so the pen isn't absurdly fast on phrases.
  const animDurationMs = ANIM_DURATION_MS * Math.min(3, Math.max(1, penStrokes.length / 6));

  const getPos = (e: MouseEvent | TouchEvent, rect: DOMRect): Point => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    // Snapshot refs so the rest of this function sees consistent values
    const isDrawing = isDrawingRef.current;
    const hasStrokes = allStrokesRef.current.length > 0 || isDrawing;

    ctx.clearRect(0, 0, W, H);

    // Draw guide: filled glyph path when available (guide has SVG path data),
    // or the character rendered as large text for text-mode chapters (guide="").
    if (character.guide) {
      ctx.save();
      ctx.scale(W / 100, H / 100);
      const glyph = new Path2D(character.guide);
      ctx.globalAlpha = pulseGuide ? 0.6 : 0.35;
      ctx.fillStyle = pulseGuide ? "#f59e0b" : "#64748b";
      ctx.fill(glyph, "nonzero");
      ctx.restore();
    } else {
      // Text-mode fallback: render the character(s) as large guide text.
      ctx.save();
      ctx.globalAlpha = pulseGuide ? 0.50 : 0.20;
      ctx.fillStyle = pulseGuide ? "#f59e0b" : "#64748b";
      const fontSize = Math.max(W * 0.45, 30);
      ctx.font = `bold ${fontSize}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(character.char, W / 2, H / 2);
      ctx.restore();
    }

    // ── Pen-stroke writing animation ─────────────────────────────────────────
    // The pen draws each centerline stroke in sequence: completed strokes stay
    // visible, the active stroke draws on progressively with a pen dot at its
    // tip — exactly how the letter is written by hand.
    const animT = animProgressRef.current;
    if (animT !== null && animT > 0 && penStrokes.length > 0) {
      ctx.save();
      ctx.strokeStyle = PRIMARY;
      ctx.lineWidth = W * 0.032;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.9;
      let penPos: Point | null = null;
      penStrokes.forEach((stroke, i) => {
        const { start, end } = penStrokeFracs[i];
        if (animT <= start || stroke.length < 2) return;
        const frac = Math.min((animT - start) / Math.max(end - start, 0.0001), 1);
        const targetLen = polylineLength(stroke) * frac;
        ctx.beginPath();
        ctx.moveTo((stroke[0].x / 100) * W, (stroke[0].y / 100) * H);
        let acc = 0;
        for (let j = 1; j < stroke.length && acc < targetLen; j++) {
          const seg = Math.hypot(stroke[j].x - stroke[j - 1].x, stroke[j].y - stroke[j - 1].y);
          if (acc + seg <= targetLen || seg === 0) {
            ctx.lineTo((stroke[j].x / 100) * W, (stroke[j].y / 100) * H);
          } else {
            const t = (targetLen - acc) / seg;
            const px = stroke[j - 1].x + (stroke[j].x - stroke[j - 1].x) * t;
            const py = stroke[j - 1].y + (stroke[j].y - stroke[j - 1].y) * t;
            ctx.lineTo((px / 100) * W, (py / 100) * H);
          }
          acc += seg;
        }
        ctx.stroke();
        if (frac < 1) penPos = pointAtLength(stroke, targetLen);
      });
      // Pen tip dot at the leading edge of the active stroke
      if (penPos !== null) {
        const p: Point = penPos;
        ctx.beginPath();
        ctx.arc((p.x / 100) * W, (p.y / 100) * H, W * 0.028, 0, Math.PI * 2);
        ctx.fillStyle = PRIMARY;
        ctx.globalAlpha = 1;
        ctx.fill();
      }
      ctx.restore();
    }

    // ── Text-mode "writing" animation ────────────────────────────────────────
    // Progressive left-to-right reveal so the learner watches the character
    // being drawn rather than seeing a static or pulsing placeholder.
    if (animT !== null && !character.guide && penStrokes.length === 0) {
      const fontSize = Math.max(W * 0.45, 30);
      ctx.font = `bold ${fontSize}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Compute how far across the canvas the "pen" has travelled.
      // Hold at the right edge for the last 15 % of the animation so the
      // fully-written character is visible for a moment before the guide fades.
      const revealFraction = Math.min(animT / 0.85, 1);
      const revealX = revealFraction * W;

      // Colored text revealed progressively by a left-to-right clip rect
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, revealX, H);
      ctx.clip();
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = PRIMARY;
      ctx.fillText(character.char, W / 2, H / 2);
      ctx.restore();

      // Cursor dot at the leading edge — mimics a fingertip writing the word
      if (revealFraction < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(revealX, H / 2, W * 0.028, 0, Math.PI * 2);
        ctx.fillStyle = PRIMARY;
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Failed-region dots ────────────────────────────────────────────────────
    // After a failed trace, amber dots mark the interior points the user
    // didn't cover — they can see exactly where to focus on the next attempt.
    const fp = failedPointsRef.current;
    if (fp && fp.length > 0) {
      ctx.save();
      ctx.fillStyle = "#f59e0b";
      ctx.globalAlpha = 0.60;
      for (const pt of fp) {
        ctx.beginPath();
        ctx.arc((pt.x / 100) * W, (pt.y / 100) * H, W * 0.015, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ── Start indicator ───────────────────────────────────────────────────────
    // A green dot at the approximate stroke-start position so the learner
    // knows where to put their pen. Hidden once they begin drawing.
    if (animT === null && character.guide && guidePoints.length > 0 && !hasStrokes) {
      // Start of the first pen stroke — exactly where the writing demo begins.
      // Falls back to the topmost outline point for degenerate glyphs.
      const startPt = penStrokes.length > 0
        ? penStrokes[0][0]
        : guidePoints.reduce(
            (best, p) => p.y < best.y ? p : best,
            guidePoints[0],
          );
      const cx = (startPt.x / 100) * W;
      const cy = (startPt.y / 100) * H;
      const r = W * 0.038;
      ctx.save();
      // Soft outer glow
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#22c55e";
      ctx.globalAlpha = 0.22;
      ctx.fill();
      // Main dot
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#22c55e";
      ctx.globalAlpha = 0.90;
      ctx.fill();
      // Play triangle to indicate "start here"
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 1.0;
      ctx.font = `bold ${r * 1.1}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("▶", cx + 1, cy + 1);
      ctx.restore();
    }

    // Draw all completed strokes + the current in-progress stroke.
    // Each stroke is rendered as its own independent subpath so there is no
    // connecting line drawn between the end of one stroke and the start of the
    // next (i.e. lifting the pen between strokes renders correctly).
    const allStrokes = [...allStrokesRef.current, drawnRef.current].filter(s => s.length > 1);
    if (allStrokes.length > 0) {
      ctx.save();
      ctx.strokeStyle = PRIMARY;
      ctx.lineWidth = W * 0.045;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const stroke of allStrokes) {
        ctx.beginPath();
        ctx.moveTo((stroke[0].x / 100) * W, (stroke[0].y / 100) * H);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo((stroke[i].x / 100) * W, (stroke[i].y / 100) * H);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [character.guide, character.char, pulseGuide, guidePoints, penStrokes, penStrokeFracs]);

  // Start the stroke-order animation
  const startAnim = useCallback(() => {
    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    animProgressRef.current = 0;
    animStartRef.current = null;
    setIsAnimating(true);

    const tick = (ts: number) => {
      if (animStartRef.current === null) animStartRef.current = ts;
      const elapsed = ts - animStartRef.current;
      const progress = Math.min(elapsed / animDurationMs, 1);
      animProgressRef.current = progress;
      drawCanvas();
      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        // Hold the completed trail briefly then clear
        setTimeout(() => {
          animProgressRef.current = null;
          setIsAnimating(false);
          drawCanvas();
        }, 600);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [drawCanvas, animDurationMs]);

  // Auto-play on mount
  useEffect(() => {
    startAnim();
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount (character key resets the whole component)

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas, hasDrawn, pulseGuide]);

  // Set canvas resolution
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const size = canvas.getBoundingClientRect();
      canvas.width = size.width * window.devicePixelRatio;
      canvas.height = size.height * window.devicePixelRatio;
      drawCanvas();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [drawCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stopAnim = () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
      animProgressRef.current = null;
      setIsAnimating(false);
    };

    const onStart = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      stopAnim();
      // Cancel any pending score debounce — user is adding another stroke.
      if (scoreTimerRef.current !== null) {
        clearTimeout(scoreTimerRef.current);
        scoreTimerRef.current = null;
      }
      const rect = canvas.getBoundingClientRect();
      isDrawingRef.current = true;
      drawnRef.current = [getPos(e, rect)];
      setPulseGuide(false);
      setHasDrawn(true);
      // allStrokesRef is intentionally preserved so previous strokes stay visible.
    };

    const onMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!isDrawingRef.current) return;
      const rect = canvas.getBoundingClientRect();
      drawnRef.current.push(getPos(e, rect));
      drawCanvas();
      // Throttled live coverage update (at most every 150 ms).
      const now = Date.now();
      if (now - lastCoverageTimeRef.current > 150) {
        lastCoverageTimeRef.current = now;
        const partial = [...allStrokesRef.current, [...drawnRef.current]];
        setLiveCoverage(scoreCoverage(partial, interiorPoints));
      }
    };

    const onEnd = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      // Stash the completed stroke so it stays visible when the user lifts.
      if (drawnRef.current.length >= 2) {
        allStrokesRef.current = [...allStrokesRef.current, [...drawnRef.current]];
      }
      drawnRef.current = [];
      drawCanvas();

      // Debounce: score the full accumulated drawing 1.2 s after the last lift.
      // Text-mode characters now use coverage scoring (no more auto-pass).
      if (scoreTimerRef.current !== null) clearTimeout(scoreTimerRef.current);
      scoreTimerRef.current = setTimeout(() => {
        scoreTimerRef.current = null;
        if (allStrokesRef.current.every(s => s.length < 2)) return;
        const score = scoreCoverage(allStrokesRef.current, interiorPoints);
        const passed = score >= PASS_THRESHOLD;
        setLiveCoverage(score);
        if (!passed) {
          setPulseGuide(true);
          // Mark uncovered interior points as amber dots.
          const allPts = allStrokesRef.current.flat();
          const uncovered = interiorPoints.filter(ref =>
            allPts.every(pt => Math.hypot(pt.x - ref.x, pt.y - ref.y) >= COVERAGE_TOLERANCE)
          );
          failedPointsRef.current = uncovered.length > 80
            ? uncovered.filter((_, i) => i % 2 === 0)
            : (uncovered.length > 0 ? uncovered : null);
          drawCanvas();
        } else {
          failedPointsRef.current = null;
        }
        onResult(score, passed);
      }, 1200);
    };

    canvas.addEventListener("mousedown", onStart);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onEnd);
    canvas.addEventListener("mouseleave", onEnd);
    canvas.addEventListener("touchstart", onStart, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onEnd);

    return () => {
      canvas.removeEventListener("mousedown", onStart);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onEnd);
      canvas.removeEventListener("mouseleave", onEnd);
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
      if (scoreTimerRef.current !== null) clearTimeout(scoreTimerRef.current);
    };
  }, [guidePoints, onResult, drawCanvas, interiorPoints]);

  const handleReset = () => {
    if (scoreTimerRef.current !== null) {
      clearTimeout(scoreTimerRef.current);
      scoreTimerRef.current = null;
    }
    allStrokesRef.current = [];
    drawnRef.current = [];
    setPulseGuide(false);
    setHasDrawn(false);
    failedPointsRef.current = null;
    setLiveCoverage(null);
    lastCoverageTimeRef.current = 0;
    drawCanvas();
  };

  return (
    <div className="relative flex flex-col items-center gap-4">
      {/* Character display */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-8xl font-bold text-foreground" style={{ fontFamily: "serif", lineHeight: 1.1 }}>
          {character.char}
        </span>
        <span className="text-sm text-muted-foreground font-medium">/{character.label}/</span>
      </div>

      {/* Trace hint / animation state */}
      {isAnimating ? (
        <p className="text-xs font-medium text-primary/80">
          {character.guide ? 'Watch where the pen moves…' : 'Study this shape, then trace it'}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {character.guide && !hasDrawn ? 'Start at the green dot' : 'Trace the character'}
        </p>
      )}

      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="h-64 w-64 cursor-crosshair touch-none rounded-2xl border-2 border-border bg-muted/20 sm:h-72 sm:w-72"
          style={{ imageRendering: "pixelated" }}
        />
        {!hasDrawn && !isAnimating && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-muted-foreground/60">Start tracing here</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Clear
        </button>
        <button
          onClick={startAnim}
          disabled={isAnimating}
          className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="h-3.5 w-3.5" />
          {isAnimating ? "Playing…" : "Watch again"}
        </button>
      </div>

      {/* Live coverage feedback — shown while drawing and after scoring */}
      {liveCoverage !== null && (
        <p className={`text-xs font-semibold ${liveCoverage >= PASS_THRESHOLD ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
          {liveCoverage}% accuracy{liveCoverage >= PASS_THRESHOLD ? " ✓" : ""}
        </p>
      )}
    </div>
  );
}

// ── Session screen ────────────────────────────────────────────────────────────

type SessionResult = { score: number; passed: boolean } | null;

function TraceSession({
  chapter,
  onBack,
}: {
  chapter: TraceChapter;
  onBack: () => void;
}) {
  const [charIndex, setCharIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [result, setResult] = useState<SessionResult>(null);
  const [passedSet, setPassedSet] = useState<Set<string>>(new Set());
  const [sessionDone, setSessionDone] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  // Best accuracy seen per character, so the end-of-chapter review can say how
  // close a character came instead of only that it did not pass. A character
  // the learner skipped past never lands here and reads as untraced.
  const [bestScores, setBestScores] = useState<Record<string, number>>({});

  const character = chapter.characters[charIndex];
  const guidePoints = character ? parseSvgPath(character.guide) : [];
  const interiorPoints = useMemo(
    () => character
      ? character.guide
        ? getInteriorPoints(character.guide)
        : getTextInteriorPoints(character.char)
      : [],
    [character],
  );

  const handleResult = useCallback(
    (score: number, passed: boolean) => {
      setResult({ score, passed });
      if (character) {
        setBestScores((prev) =>
          score > (prev[character.id] ?? -1) ? { ...prev, [character.id]: score } : prev,
        );
      }
      if (passed && character) {
        setPassedSet((prev) => new Set([...prev, character.id]));
        // Persist to server (fire-and-forget; don't block UX)
        fetch("/api/games/script-trace/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            chapter: chapter.id,
            characterId: character.id,
            passed: true,
            score,
          }),
        }).catch(() => {/* best-effort */});
      }
    },
    [character, chapter.id],
  );

  const handleNext = () => {
    if (charIndex >= chapter.characters.length - 1) {
      setSessionDone(true);
    } else {
      setCharIndex((i) => i + 1);
      setRetryCount(0);
      setResult(null);
    }
  };

  const handleRetry = () => {
    setResult(null);
    setRetryCount((c) => c + 1);
  };

  if (sessionDone) {
    const total = chapter.characters.length;
    const passed = passedSet.size;
    // Tracing has no wrong "answer", so a miss here is a character that never
    // reached the pass mark — worded with its own labels rather than the
    // "You said / Answer" framing the answer games use.
    const misses: GameMiss[] = chapter.characters
      .filter((c) => !passedSet.has(c.id))
      .map((c) => {
        const best = bestScores[c.id];
        return {
          prompt: c.char,
          promptSub: c.label,
          answer: best === undefined ? "not traced" : `${best} out of 100`,
          answerLabel: "Your best",
          correct: `${PASS_THRESHOLD} out of 100`,
          correctLabel: "Pass mark",
        };
      });
    const canReview = misses.length > 0;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <Trophy className="h-16 w-16 text-primary" />
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            Chapter Complete!
          </h2>
          {/* The tally itself opens the review — it is what a learner reaches
              for when they want to know WHICH characters did not pass. */}
          <button
            type="button"
            data-testid="script-trace-score-card"
            onClick={canReview ? () => setReviewOpen(true) : undefined}
            disabled={!canReview}
            aria-label={
              canReview
                ? `You passed ${passed} of ${total} characters. See what you missed.`
                : undefined
            }
            className={cn(
              "mt-2 rounded-xl px-2 py-1 text-muted-foreground",
              canReview && "hover:bg-muted transition-colors",
            )}
          >
            You passed {passed} of {total} characters in {chapter.title}.
            {canReview && (
              <span className="mt-0.5 block text-xs font-semibold text-primary">See misses</span>
            )}
          </button>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="rounded-xl border border-border bg-card px-5 py-2.5 font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Choose Chapter
          </button>
          <button
            onClick={() => {
              setCharIndex(0);
              setResult(null);
              setPassedSet(new Set());
              setBestScores({});
              setSessionDone(false);
            }}
            className="rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Replay
          </button>
        </div>
        <MissReviewCta count={misses.length} onClick={() => setReviewOpen(true)} />
        <MissReviewDialog misses={misses} open={reviewOpen} onOpenChange={setReviewOpen} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 pb-6">
      {/* Progress bar + skip-ahead */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {charIndex + 1} / {chapter.characters.length}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((charIndex) / chapter.characters.length) * 100}%` }}
          />
        </div>
        <button
          onClick={handleNext}
          aria-label="Skip this character"
          className="flex items-center gap-0.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Trace canvas */}
      {character && (
        <ScriptTraceCanvas
          key={`${chapter.id}-${charIndex}-${retryCount}`}
          character={character}
          onResult={handleResult}
          guidePoints={guidePoints}
          interiorPoints={interiorPoints}
        />
      )}

      {/* Result feedback */}
      {result && (
        <div
          className={cn(
            "rounded-2xl border p-4 text-center transition-all",
            result.passed
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
              : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
          )}
        >
          <div className="flex items-center justify-center gap-2">
            {result.passed ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-amber-600" />
            )}
            <span
              className={cn(
                "font-bold",
                result.passed ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
              )}
            >
              {result.passed ? "Great trace!" : "Keep trying!"} — {result.score}%
            </span>
          </div>
          <div className="mt-3 flex justify-center gap-3">
            {!result.passed && (
              <button
                onClick={handleNext}
                className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
              >
                {charIndex >= chapter.characters.length - 1 ? "Skip & Finish" : "Skip"}
              </button>
            )}
            <button
              onClick={result.passed ? handleNext : handleRetry}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                result.passed
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-amber-500 text-white hover:bg-amber-600",
              )}
            >
              {result.passed
                ? charIndex >= chapter.characters.length - 1
                  ? "Finish"
                  : "Next Character"
                : "Try Again"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function ScriptTracePage() {
  const { isPlus, isLoading } = useEntitlements();
  const [activeChapter, setActiveChapter] = useState<TraceChapter | null>(null);

  if (!isLoading && !isPlus) {
    return <Redirect to="/upgrade" />;
  }

  if (!activeChapter) {
    return <ChapterGrid onSelect={setActiveChapter} />;
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-4">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4 lg:px-6">
          <button
            onClick={() => setActiveChapter(null)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold leading-none tracking-tight text-foreground">
              {activeChapter.title}
            </h1>
            <p className="text-sm text-muted-foreground">{activeChapter.scriptName} script</p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col pt-6">
        <TraceSession chapter={activeChapter} onBack={() => setActiveChapter(null)} />
      </div>
    </div>
  );
}
