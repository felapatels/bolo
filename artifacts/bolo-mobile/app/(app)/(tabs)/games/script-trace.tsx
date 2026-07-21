import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import {
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  SCRIPT_TRACE_CHAPTERS,
  type TraceChapter,
  type TraceCharacter,
  type ChapterStage,
} from '@/lib/game-data/script-trace-chapters';
import Svg, {
  Path as SvgPath,
  Text as SvgText,
  Circle as SvgCircle,
  Rect as SvgRect,
  Defs,
  ClipPath,
} from 'react-native-svg';
import { recordScriptTraceProgress } from '@workspace/api-client-react';

// ── Accuracy scoring ──────────────────────────────────────────────────────────

type Point = { x: number; y: number };

function samplePath(points: Point[], n: number): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array(n).fill(points[0]);
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    segs.push(d);
    total += d;
  }
  if (total === 0) return Array(n).fill(points[0]);
  const result: Point[] = [];
  let segDist = 0;
  let seg = 0;
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

// Parse an SVG path string into one polyline per subpath (per M command).
function parseSvgSubpaths(d: string): Point[][] {
  const subpaths: Point[][] = [];
  let points: Point[] = [];
  const cmds = d.trim().match(/[MLQC][^MLQC]*/g) ?? [];
  let cx = 0,
    cy = 0;
  for (const cmd of cmds) {
    const type = cmd[0];
    const nums = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (type === 'M') {
      if (points.length > 0) subpaths.push(points);
      points = [];
      cx = nums[0];
      cy = nums[1];
      points.push({ x: cx, y: cy });
    } else if (type === 'L') {
      cx = nums[0];
      cy = nums[1];
      points.push({ x: cx, y: cy });
    } else if (type === 'Q') {
      const [qx1, qy1, qx2, qy2] = nums;
      for (let t = 0; t <= 1; t += 0.05) {
        points.push({
          x: (1 - t) ** 2 * cx + 2 * (1 - t) * t * qx1 + t ** 2 * qx2,
          y: (1 - t) ** 2 * cy + 2 * (1 - t) * t * qy1 + t ** 2 * qy2,
        });
      }
      cx = qx2;
      cy = qy2;
    } else if (type === 'C') {
      const [cx1, cy1, cx2, cy2, ex, ey] = nums;
      for (let t = 0; t <= 1; t += 0.05) {
        points.push({
          x:
            (1 - t) ** 3 * cx +
            3 * (1 - t) ** 2 * t * cx1 +
            3 * (1 - t) * t ** 2 * cx2 +
            t ** 3 * ex,
          y:
            (1 - t) ** 3 * cy +
            3 * (1 - t) ** 2 * t * cy1 +
            3 * (1 - t) * t ** 2 * cy2 +
            t ** 3 * ey,
        });
      }
      cx = ex;
      cy = ey;
    }
  }
  if (points.length > 0) subpaths.push(points);
  return subpaths;
}

// Parse an SVG path into ~`samples` evenly spaced points. Samples are
// distributed across subpaths proportionally to their length and each subpath
// is sampled independently, so separate glyph contours never contribute
// phantom "connector" geometry between an M boundary and the previous point.
function parseSvgPath(d: string, samples = 80): Point[] {
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
function getInteriorPoints(svgPathD: string, gridN = 16): Point[] {
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
 * For text-mode characters (guide = ""), approximate the reference region as
 * a centre-weighted grid covering where the character text is rendered.
 * (SvgText baseline at 70 %, fontSize 55 % → cap-top ≈ 18 % of canvas height.)
 */
function getTextReferencePoints(gridN = 10): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= gridN; i++) {
    for (let j = 0; j <= gridN; j++) {
      pts.push({
        x: 10 + (i / gridN) * 80,  // 10–90 % of canvas width
        y: 18 + (j / gridN) * 58,  // 18–76 % (cap-top → baseline)
      });
    }
  }
  return pts;
}

/** In 0-100 canvas units: how close a stroke must come to "cover" a ref point. */
const COVERAGE_TOLERANCE = 9;

/**
 * Coverage score (0-100): fraction of interior reference points reached by
 * at least one user stroke point within COVERAGE_TOLERANCE.
 */
function scoreCoverage(strokes: Point[][], referencePoints: Point[]): number {
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
  return Math.round((covered / referencePoints.length) * 100);
}

// Convert an array of points to an SVG path string for live drawing.
function pointsToPath(points: Point[], size: number): string {
  if (points.length < 2) return '';
  const scale = size / 100;
  const [first, ...rest] = points;
  const start = `M ${first.x * scale},${first.y * scale}`;
  const lines = rest.map((p) => `L ${p.x * scale},${p.y * scale}`).join(' ');
  return `${start} ${lines}`;
}

const CANVAS_SIZE = Math.min(Dimensions.get('window').width - 48, 300);
const PASS_THRESHOLD = 40; // % interior coverage needed to pass
const ANIM_DURATION_MS = 2200;

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

const SKEL_RES = 64; // bitmap resolution across the 0-100 glyph space
const ORIENT_X_WEIGHT = 0.35; // top-start bias with a left-start tiebreak

/** Rasterize the glyph interior into a binary SKEL_RES×SKEL_RES bitmap. */
function rasterizeGlyph(subpaths: Point[][]): Uint8Array {
  const grid = new Uint8Array(SKEL_RES * SKEL_RES);
  const cell = 100 / SKEL_RES;
  for (let gy = 0; gy < SKEL_RES; gy++) {
    for (let gx = 0; gx < SKEL_RES; gx++) {
      const pt = { x: (gx + 0.5) * cell, y: (gy + 0.5) * cell };
      if (windingInSubpaths(pt, subpaths) !== 0) grid[gy * SKEL_RES + gx] = 1;
    }
  }
  return grid;
}

/** Zhang-Suen thinning: erode a binary bitmap down to its 1-px skeleton. */
function zhangSuenThin(src: Uint8Array): Uint8Array {
  const g = Uint8Array.from(src);
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= SKEL_RES || y >= SKEL_RES ? 0 : g[y * SKEL_RES + x];
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const del: number[] = [];
      for (let y = 0; y < SKEL_RES; y++) {
        for (let x = 0; x < SKEL_RES; x++) {
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
          del.push(y * SKEL_RES + x);
        }
      }
      if (del.length > 0) { changed = true; for (const i of del) g[i] = 0; }
    }
  }
  return g;
}

/** Walk a 1-px skeleton bitmap into polylines (grid coords), splitting at junctions. */
function traceSkeletonPolylines(skel: Uint8Array): Point[][] {
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= SKEL_RES || y >= SKEL_RES ? 0 : skel[y * SKEL_RES + x];
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
    const i = a.y * SKEL_RES + a.x, j = b.y * SKEL_RES + b.x;
    return i < j ? i * SKEL_RES * SKEL_RES + j : j * SKEL_RES * SKEL_RES + i;
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
  for (let y = 0; y < SKEL_RES; y++) {
    for (let x = 0; x < SKEL_RES; x++) {
      if (!at(x, y) || deg(x, y) === 2) continue;
      const node = { x, y };
      for (const nb of nbrs(x, y)) {
        if (!used.has(edgeKey(node, nb))) polylines.push(walk(node, nb));
      }
    }
  }
  // Pure loops (every pixel deg 2, e.g. a ring): walk from any unvisited pixel
  for (let y = 0; y < SKEL_RES; y++) {
    for (let x = 0; x < SKEL_RES; x++) {
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
 * Extract ordered pen strokes (centerline polylines, 0-100 space) from a
 * glyph outline path. Returns [] when the glyph is degenerate.
 */
function extractStrokes(guideD: string): Point[][] {
  const subpaths = parseSvgSubpaths(guideD).filter((sp) => sp.length > 2);
  if (subpaths.length === 0) return [];
  const skel = zhangSuenThin(rasterizeGlyph(subpaths));
  const cell = 100 / SKEL_RES;
  let lines = traceSkeletonPolylines(skel).map((line) =>
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
  lines = lines.map((l) => orientStroke(rdpSimplify(l, 1.6)));

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
  return ordered;
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

/** Convert a stroke polyline to an SVG path "d" string. */
function strokeToPathD(pts: Point[]): string {
  if (pts.length === 0) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
  return d;
}

// ── Language → chapter mapping ────────────────────────────────────────────────

/** Maps a language code to the Script Trace chapter IDs for its script. */
const LANG_CHAPTER_IDS: Record<string, string[]> = {
  // Gujarati
  gu:  ['gujarati-vowels', 'gujarati-consonants', 'gujarati-words', 'gujarati-sentences'],
  // Devanagari script languages
  hi:  ['hindi-vowels', 'hindi-consonants', 'hindi-words', 'hindi-sentences'],
  mr:  ['hindi-vowels', 'hindi-consonants', 'hindi-words', 'hindi-sentences'],
  ne:  ['hindi-vowels', 'hindi-consonants', 'hindi-words', 'hindi-sentences'],
  sa:  ['hindi-vowels', 'hindi-consonants', 'hindi-words', 'hindi-sentences'],
  mai: ['hindi-vowels', 'hindi-consonants', 'hindi-words', 'hindi-sentences'],
  kok: ['hindi-vowels', 'hindi-consonants', 'hindi-words', 'hindi-sentences'],
  doi: ['hindi-vowels', 'hindi-consonants', 'hindi-words', 'hindi-sentences'],
  brx: ['hindi-vowels', 'hindi-consonants', 'hindi-words', 'hindi-sentences'],
  // Bengali / Assamese
  bn:  ['bengali-vowels', 'bengali-consonants', 'bengali-words', 'bengali-sentences'],
  as:  ['bengali-vowels', 'bengali-consonants', 'bengali-words', 'bengali-sentences'],
  // Punjabi / Gurmukhi
  pa:  ['gurmukhi-vowels', 'gurmukhi-consonants', 'gurmukhi-words', 'gurmukhi-sentences'],
  // Odia
  or:  ['odia-vowels', 'odia-consonants', 'odia-words', 'odia-sentences'],
  // Tamil
  ta:  ['tamil-vowels', 'tamil-consonants', 'tamil-words', 'tamil-sentences'],
  // Telugu
  te:  ['telugu-vowels', 'telugu-consonants', 'telugu-words', 'telugu-sentences'],
  // Kannada
  kn:  ['kannada-vowels', 'kannada-consonants', 'kannada-words', 'kannada-sentences'],
  // Malayalam
  ml:  ['malayalam-vowels', 'malayalam-consonants', 'malayalam-words', 'malayalam-sentences'],
  // Urdu / Sindhi / Kashmiri (Nastaliq)
  ur:  ['urdu-letters', 'urdu-words', 'urdu-sentences'],
  sd:  ['urdu-letters', 'sindhi-additional', 'urdu-words', 'urdu-sentences'],
  ks:  ['urdu-letters', 'kashmiri-additional', 'urdu-words', 'urdu-sentences'],
  // Santali / Ol Chiki
  sat: ['olchiki-vowels', 'olchiki-consonants', 'olchiki-words', 'olchiki-sentences'],
  // Meitei / Meitei Mayek
  mni: ['meitei-letters', 'meitei-words', 'meitei-sentences'],
};

function chaptersForLang(langCode: string): TraceChapter[] {
  const ids = LANG_CHAPTER_IDS[langCode] ?? [];
  return SCRIPT_TRACE_CHAPTERS.filter((c) => ids.includes(c.id));
}

// ── Chapter selection ─────────────────────────────────────────────────────────

const STAGE_LABELS: Record<ChapterStage, string> = {
  alphabet: '🔤 Alphabet',
  words: '📝 Words',
  sentences: '💬 Phrases',
  'full-sentences': '📖 Full Sentences',
};
const STAGE_ORDER: ChapterStage[] = ['alphabet', 'words', 'sentences', 'full-sentences'];

function ChapterGrid({ onSelect }: { onSelect: (chapter: TraceChapter) => void }) {
  const colors = useColors();
  const router = useRouter();
  const { activeLang, activeLanguage } = useLanguage();
  const chapters = chaptersForLang(activeLang);

  // Group by stage in display order
  const grouped = STAGE_ORDER.flatMap((stage) => {
    const stageChapters = chapters.filter((c) => c.stage === stage);
    return stageChapters.length > 0 ? [{ stage, chapters: stageChapters }] : [];
  });

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Script Trace</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {chapters.length > 0 ? 'Choose a chapter' : activeLanguage?.name ?? activeLang}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.chapterList}
        showsVerticalScrollIndicator={false}
      >
        {chapters.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="edit-3" size={40} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Coming soon
            </Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              Script Trace for {activeLanguage?.name ?? activeLang} is on its way.
              {'\n'}Try switching to Gujarati or Hindi to practise now.
            </Text>
          </View>
        ) : (
          grouped.map(({ stage, chapters: stageChapters }) => (
            <View key={stage}>
              <Text style={[styles.stageHeader, { color: colors.mutedForeground }]}>
                {STAGE_LABELS[stage]}
              </Text>
              {stageChapters.map((chapter) => (
                <TouchableOpacity
                  key={chapter.id}
                  onPress={() => onSelect(chapter)}
                  style={[
                    styles.chapterCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chapterChar, { color: colors.foreground }]}>
                    {chapter.characters[0]?.char}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.chapterTitle, { color: colors.foreground }]}>
                      {chapter.title}
                    </Text>
                    <Text style={[styles.chapterMeta, { color: colors.mutedForeground }]}>
                      {chapter.characters.length} {stage === 'alphabet' ? 'characters' : 'items'} · {chapter.scriptName} script
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

// ── Canvas tracing ────────────────────────────────────────────────────────────

function TraceCanvas({
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
  const colors = useColors();
  const [drawnPath, setDrawnPath] = useState('');
  // Controls whether the guide pulses amber on a failed trace.
  const [guidePulsed, setGuidePulsed] = useState(false);
  const drawnRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);
  // All strokes the user has drawn so far (completed pen-down → pen-up segments).
  // Kept across finger lifts so multi-stroke characters work correctly.
  const allStrokesRef = useRef<Point[][]>([]);
  // Pending debounce: score fires 1.2 s after the last finger lift.
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Amber dots for uncovered interior regions shown after a failed attempt.
  const [failedPoints, setFailedPoints] = useState<Point[] | null>(null);
  // Live coverage % shown below the canvas while drawing.
  const [liveCoverage, setLiveCoverage] = useState<number | null>(null);
  const lastCoverageTimeRef = useRef<number>(0);

  // ── Stroke-order animation state ──
  const animFrameRef = useRef<number | null>(null);
  const animStartRef = useRef<number | null>(null);
  // progress: null = not playing, 0–1 = playing
  const [animProgress, setAnimProgress] = useState<number | null>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  // Speed: 1 = normal (ANIM_DURATION_MS), 0.5 = slow (2× longer)
  const animSpeedRef = useRef<number>(1);
  const [animSpeed, setAnimSpeed] = useState<1 | 0.5>(1);

  // Pen strokes (centerline skeleton) for the demo animation, plus per-stroke
  // path strings, lengths, and time fractions proportional to stroke length.
  const penStrokes = React.useMemo(
    () => (character.guide ? extractStrokes(character.guide) : []),
    [character.guide],
  );
  const penStrokeFracs = React.useMemo(() => strokeTimeFractions(penStrokes), [penStrokes]);
  const penStrokeDs = React.useMemo(() => penStrokes.map(strokeToPathD), [penStrokes]);
  const penStrokeLens = React.useMemo(() => penStrokes.map(polylineLength), [penStrokes]);

  const startAnim = useCallback(() => {
    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    animStartRef.current = null;
    setAnimProgress(0);
    setIsAnimating(true);

    const duration = ANIM_DURATION_MS / animSpeedRef.current;

    const tick = (ts: number) => {
      if (animStartRef.current === null) animStartRef.current = ts;
      const elapsed = ts - animStartRef.current;
      const progress = Math.min(elapsed / duration, 1);
      setAnimProgress(progress);
      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        // Hold the completed trail briefly then clear
        setTimeout(() => {
          setAnimProgress(null);
          setIsAnimating(false);
        }, 600);
        animFrameRef.current = null;
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const toggleSpeed = useCallback(() => {
    const next: 1 | 0.5 = animSpeedRef.current === 1 ? 0.5 : 1;
    animSpeedRef.current = next;
    setAnimSpeed(next);
    // Restart the animation at the new speed if it's currently playing
    if (isAnimating) startAnim();
  }, [isAnimating, startAnim]);

  // Auto-play on mount; clean up animation frame and any pending score timer on unmount.
  useEffect(() => {
    startAnim();
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      if (scoreTimerRef.current !== null) clearTimeout(scoreTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guide is a font-accurate glyph outline in a 0-100 viewBox; render the raw
  // path data and scale it to the canvas so separate contours stay separate.
  const guideScale = CANVAS_SIZE / 100;

  // Amber pulse: show for 600ms then revert.
  const triggerPulse = useCallback(() => {
    setGuidePulsed(true);
    setTimeout(() => setGuidePulsed(false), 600);
  }, []);

  // Helpers: build the combined SVG path string for all strokes visible so far.
  // Each stroke is a separate M…L subpath so no line connects across pen-lifts.
  const buildAllPath = (extraStroke?: Point[]) => {
    const segs = allStrokesRef.current
      .map(s => s.length >= 2 ? pointsToPath(s, CANVAS_SIZE) : '')
      .filter(Boolean);
    if (extraStroke && extraStroke.length >= 2) {
      segs.push(pointsToPath(extraStroke, CANVAS_SIZE));
    }
    return segs.join(' ');
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => {
      // Cancel any pending score debounce — user is adding another stroke.
      if (scoreTimerRef.current !== null) {
        clearTimeout(scoreTimerRef.current);
        scoreTimerRef.current = null;
      }
      // Stop stroke-order animation when user starts drawing.
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
      setAnimProgress(null);
      setIsAnimating(false);

      isDrawingRef.current = true;
      drawnRef.current = [
        { x: (e.x / CANVAS_SIZE) * 100, y: (e.y / CANVAS_SIZE) * 100 },
      ];
      setGuidePulsed(false);
      // Note: drawnPath and allStrokesRef are intentionally preserved so all
      // previous strokes remain visible as the user adds the new one.
    })
    .onUpdate((e) => {
      if (!isDrawingRef.current) return;
      drawnRef.current.push({
        x: (e.x / CANVAS_SIZE) * 100,
        y: (e.y / CANVAS_SIZE) * 100,
      });
      // Re-render: all completed strokes + current in-progress stroke.
      setDrawnPath(buildAllPath(drawnRef.current));
      // Throttled live coverage update (at most every 150 ms).
      const now = Date.now();
      if (now - lastCoverageTimeRef.current > 150) {
        lastCoverageTimeRef.current = now;
        const partial = [...allStrokesRef.current, [...drawnRef.current]];
        setLiveCoverage(scoreCoverage(partial, interiorPoints));
      }
    })
    .onFinalize(() => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      // Stash the completed stroke so it stays visible when the finger lifts.
      if (drawnRef.current.length >= 2) {
        allStrokesRef.current = [...allStrokesRef.current, [...drawnRef.current]];
      }
      drawnRef.current = [];
      setDrawnPath(buildAllPath());

      // Debounce: score the full accumulated drawing 1.2 s after the last lift.
      // If the user touches down again before the timer fires, onBegin cancels
      // it — so the score only triggers when they're genuinely done drawing.
      // Text-mode characters use the same coverage scoring (no more auto-pass).
      scoreTimerRef.current = setTimeout(() => {
        scoreTimerRef.current = null;
        if (allStrokesRef.current.every(s => s.length < 2)) return;
        const score = scoreCoverage(allStrokesRef.current, interiorPoints);
        const passed = score >= PASS_THRESHOLD;
        setLiveCoverage(score);
        if (!passed) {
          triggerPulse();
          // Mark the uncovered interior points as amber dots.
          const allPts = allStrokesRef.current.flat();
          const uncovered = interiorPoints.filter(ref =>
            allPts.every(pt => Math.hypot(pt.x - ref.x, pt.y - ref.y) >= COVERAGE_TOLERANCE)
          );
          const toShow = uncovered.length > 80 ? uncovered.filter((_, i) => i % 2 === 0) : uncovered;
          setFailedPoints(toShow.length > 0 ? toShow : null);
        } else {
          setFailedPoints(null);
        }
        onResult(score, passed);
      }, 1200);
    });

  const handleClear = () => {
    if (scoreTimerRef.current !== null) {
      clearTimeout(scoreTimerRef.current);
      scoreTimerRef.current = null;
    }
    allStrokesRef.current = [];
    drawnRef.current = [];
    setDrawnPath('');
    setGuidePulsed(false);
    setFailedPoints(null);
    setLiveCoverage(null);
    lastCoverageTimeRef.current = 0;
  };


  return (
    <View style={styles.canvasSection}>
      {/* Character display */}
      <View style={styles.charDisplay}>
        <Text style={[styles.bigChar, { color: colors.foreground }]}>
          {character.char}
        </Text>
        <Text style={[styles.charLabel, { color: colors.mutedForeground }]}>
          /{character.label}/
        </Text>
      </View>

      {isAnimating ? (
        <Text style={[styles.traceHint, { color: colors.primary }]}>
          {character.guide ? 'Watch where the pen moves…' : 'Study this shape, then trace it'}
        </Text>
      ) : (
        <Text style={[styles.traceHint, { color: colors.mutedForeground }]}>
          {character.guide && !drawnPath ? 'Start at the green dot' : 'Trace the character'}
        </Text>
      )}

      {/* SVG canvas with gesture detector */}
      <GestureDetector gesture={pan}>
        <View
          style={[
            styles.canvas,
            {
              borderColor: colors.border,
              backgroundColor: colors.muted + '30',
            },
          ]}
        >
          <Svg width={CANVAS_SIZE} height={CANVAS_SIZE}>
            {/* Guide: filled glyph path when available, or character text for text-mode.
                fillRule="nonzero" matches TrueType winding conventions so
                enclosed counters (holes in letters) render correctly. */}
            {character.guide ? (
              <SvgPath
                d={character.guide}
                scale={guideScale}
                fill={guidePulsed ? '#f59e0b' : colors.mutedForeground}
                fillOpacity={guidePulsed ? 0.6 : 0.35}
                fillRule="nonzero"
                stroke="none"
              />
            ) : (
              <SvgText
                x={CANVAS_SIZE / 2}
                y={CANVAS_SIZE * 0.70}
                fontSize={CANVAS_SIZE * 0.55}
                textAnchor="middle"
                fill={guidePulsed ? '#f59e0b' : colors.mutedForeground}
                fillOpacity={guidePulsed ? 0.5 : 0.20}
                fontFamily="serif"
              >
                {character.char}
              </SvgText>
            )}

            {/* Pen-stroke writing animation: the pen draws each centerline
                stroke in sequence — completed strokes stay visible, the active
                stroke draws on progressively (dashoffset) with a pen dot at
                its tip, exactly how the letter is written by hand. */}
            {animProgress !== null && character.guide && penStrokes.length > 0 && (() => {
              const t = animProgress ?? 0;
              const els: React.ReactNode[] = [];
              let penPos: Point | null = null;
              penStrokes.forEach((stroke, i) => {
                const { start, end } = penStrokeFracs[i];
                if (t <= start || stroke.length < 2) return;
                const frac = Math.min((t - start) / Math.max(end - start, 0.0001), 1);
                const len = penStrokeLens[i];
                els.push(
                  <SvgPath
                    key={`pen-${i}`}
                    d={penStrokeDs[i]}
                    scale={guideScale}
                    fill="none"
                    stroke={colors.primary}
                    strokeWidth={3.2}
                    strokeOpacity={0.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={`${len}`}
                    strokeDashoffset={len * (1 - frac)}
                  />,
                );
                if (frac < 1) penPos = pointAtLength(stroke, len * frac);
              });
              if (penPos !== null) {
                const p: Point = penPos;
                els.push(
                  <SvgCircle
                    key="pen-tip"
                    cx={p.x * guideScale}
                    cy={p.y * guideScale}
                    r={CANVAS_SIZE * 0.028}
                    fill={colors.primary}
                  />,
                );
              }
              return els;
            })()}

            {/* Text-mode "writing" animation: progressive left-to-right clip reveal
                with a cursor dot at the leading edge, mimicking a finger writing. */}
            {animProgress !== null && !character.guide && (() => {
              const clipId = 'trace-write-reveal';
              // Hold fully revealed for the last 15 % so the word is visible briefly.
              const revealFraction = Math.min(animProgress / 0.85, 1);
              const revealX = revealFraction * CANVAS_SIZE;
              // Vertical centre of the text (baseline at 70 %, fontSize 55 %)
              const cursorY = CANVAS_SIZE * 0.42;
              return (
                <>
                  <Defs>
                    <ClipPath id={clipId}>
                      <SvgRect x={0} y={0} width={revealX} height={CANVAS_SIZE} />
                    </ClipPath>
                  </Defs>
                  {/* Colored text progressively revealed by the clip */}
                  <SvgText
                    x={CANVAS_SIZE / 2}
                    y={CANVAS_SIZE * 0.70}
                    fontSize={CANVAS_SIZE * 0.55}
                    textAnchor="middle"
                    fill={colors.primary}
                    fillOpacity={0.82}
                    fontFamily="serif"
                    clipPath={`url(#${clipId})`}
                  >
                    {character.char}
                  </SvgText>
                  {/* Cursor dot at the leading edge */}
                  {revealFraction < 1 && (
                    <SvgCircle
                      cx={revealX}
                      cy={cursorY}
                      r={CANVAS_SIZE * 0.028}
                      fill={colors.primary}
                      fillOpacity={0.92}
                    />
                  )}
                </>
              );
            })()}

            {/* Start indicator: green dot at the approximate writing start.
                Shown after animation ends, disappears once the user draws. */}
            {animProgress === null && character.guide && guidePoints.length > 0 && !drawnPath && (() => {
              // Start of the first pen stroke — exactly where the writing demo
              // begins. Falls back to the topmost outline point for degenerate
              // glyphs (most Indian scripts begin at the top of the character).
              const startPt = penStrokes.length > 0
                ? penStrokes[0][0]
                : guidePoints.reduce(
                    (best: { x: number; y: number }, p: { x: number; y: number }) =>
                      p.y < best.y ? p : best,
                    guidePoints[0],
                  );
              const cx = startPt.x * guideScale;
              const cy = startPt.y * guideScale;
              const r = CANVAS_SIZE * 0.038;
              return (
                <>
                  <SvgCircle cx={cx} cy={cy} r={r * 1.5} fill="#22c55e" fillOpacity={0.22} />
                  <SvgCircle cx={cx} cy={cy} r={r} fill="#22c55e" fillOpacity={0.90} />
                </>
              );
            })()}

            {/* User's traced path */}
            {drawnPath ? (
              <SvgPath
                d={drawnPath}
                stroke={colors.primary}
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ) : null}

            {/* Missed-region dots: amber circles on uncovered interior points
                after a failed attempt — shows exactly where to focus next. */}
            {failedPoints && failedPoints.map((pt, i) => (
              <SvgCircle
                key={`fp-${i}`}
                cx={pt.x * guideScale}
                cy={pt.y * guideScale}
                r={CANVAS_SIZE * 0.016}
                fill="#f59e0b"
                fillOpacity={0.65}
              />
            ))}
          </Svg>
        </View>
      </GestureDetector>

      {/* Controls */}
      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={handleClear}
          style={[
            styles.controlBtn,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
          activeOpacity={0.7}
        >
          <Feather name="rotate-ccw" size={14} color={colors.mutedForeground} />
          <Text style={[styles.controlText, { color: colors.mutedForeground }]}>
            Clear
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={startAnim}
          disabled={isAnimating}
          style={[
            styles.controlBtn,
            {
              borderColor: colors.primary + '60',
              backgroundColor: colors.primary + '18',
              opacity: isAnimating ? 0.4 : 1,
            },
          ]}
          activeOpacity={0.7}
        >
          <Feather name="play" size={14} color={colors.primary} />
          <Text style={[styles.controlText, { color: colors.primary }]}>
            {isAnimating ? 'Playing…' : 'Watch again'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={toggleSpeed}
          style={[
            styles.controlBtn,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
          activeOpacity={0.7}
        >
          <Feather name="clock" size={14} color={colors.mutedForeground} />
          <Text style={[styles.controlText, { color: colors.mutedForeground }]}>
            {animSpeed === 1 ? '1×' : '½×'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Live coverage feedback — shown while drawing and after scoring */}
      {liveCoverage !== null && (
        <Text style={[styles.traceHint, {
          color: liveCoverage >= PASS_THRESHOLD ? '#22c55e' : colors.mutedForeground,
          fontFamily: AppFonts.semibold,
        }]}>
          {liveCoverage}% covered{liveCoverage >= PASS_THRESHOLD ? ' ✓' : ''}
        </Text>
      )}
    </View>
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
  const colors = useColors();
  const [charIndex, setCharIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [result, setResult] = useState<SessionResult>(null);
  const [passedSet, setPassedSet] = useState<Set<string>>(new Set());
  const [sessionDone, setSessionDone] = useState(false);

  const character = chapter.characters[charIndex];
  const guidePoints = React.useMemo(
    () => (character ? parseSvgPath(character.guide) : []),
    [character],
  );
  const interiorPoints = React.useMemo(
    () => (character
      ? character.guide
        ? getInteriorPoints(character.guide)
        : getTextReferencePoints()
      : []),
    [character],
  );

  const handleResult = useCallback(
    (score: number, passed: boolean) => {
      setResult({ score, passed });
      if (passed && character) {
        setPassedSet((prev) => new Set([...prev, character.id]));
        // Persist via the generated API client — it uses customFetch which
        // applies the configured base URL and auth token automatically, so this
        // works both on web and native without a hard-coded '/api' prefix.
        recordScriptTraceProgress({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          chapter: chapter.id as any,
          characterId: character.id,
          passed: true,
          score,
        }).catch(() => {
          /* best-effort: don't block UX on network errors */
        });
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
    return (
      <View style={styles.doneContainer}>
        <Feather name="award" size={64} color={colors.primary} />
        <Text style={[styles.doneTitle, { color: colors.foreground }]}>
          Chapter Complete!
        </Text>
        <Text style={[styles.doneSubtitle, { color: colors.mutedForeground }]}>
          You passed {passed} of {total} characters in {chapter.title}.
        </Text>
        <View style={styles.doneButtons}>
          <TouchableOpacity
            onPress={onBack}
            style={[
              styles.btn,
              { borderColor: colors.border, backgroundColor: colors.card },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnText, { color: colors.foreground }]}>
              Chapters
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setCharIndex(0);
              setResult(null);
              setPassedSet(new Set());
              setSessionDone(false);
            }}
            style={[styles.btn, { backgroundColor: colors.primary }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnText, { color: '#fff' }]}>Replay</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.session}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Progress bar */}
      <View style={styles.progressRow}>
        <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
          {charIndex + 1} / {chapter.characters.length}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.primary,
                width: `${(charIndex / chapter.characters.length) * 100}%`,
              },
            ]}
          />
        </View>
      </View>

      {/* Trace canvas */}
      {character && (
        <TraceCanvas
          key={`${chapter.id}-${charIndex}-${retryCount}`}
          character={character}
          onResult={handleResult}
          guidePoints={guidePoints}
          interiorPoints={interiorPoints}
        />
      )}

      {/* Result feedback */}
      {result && (
        <Animated.View
          style={[
            styles.resultCard,
            {
              backgroundColor: result.passed
                ? colors.primary + '18'
                : '#f59e0b18',
              borderColor: result.passed
                ? colors.primary + '40'
                : '#f59e0b40',
            },
          ]}
        >
          <Feather
            name={result.passed ? 'check-circle' : 'x-circle'}
            size={20}
            color={result.passed ? colors.primary : '#f59e0b'}
          />
          <Text
            style={[
              styles.resultText,
              { color: result.passed ? colors.primary : '#f59e0b' },
            ]}
          >
            {result.passed ? 'Great trace!' : 'Keep trying!'} — {result.score}%
          </Text>
          <View style={styles.resultButtons}>
            {!result.passed && (
              <TouchableOpacity
                onPress={handleRetry}
                style={[
                  styles.btn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnText, { color: colors.foreground }]}>
                  Retry
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={result.passed ? handleNext : handleRetry}
              style={[
                styles.btn,
                {
                  backgroundColor: result.passed
                    ? colors.primary
                    : '#f59e0b',
                },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: '#fff' }]}>
                {result.passed
                  ? charIndex >= chapter.characters.length - 1
                    ? 'Finish'
                    : 'Next'
                  : 'Try Again'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}

// ── Screen root ───────────────────────────────────────────────────────────────

export default function ScriptTraceScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isPlus, isLoading } = useEntitlements();
  const [activeChapter, setActiveChapter] = useState<TraceChapter | null>(null);

  React.useEffect(() => {
    if (!isLoading && !isPlus) {
      router.replace('/(app)/paywall');
    }
  }, [isLoading, isPlus, router]);

  // While entitlements load, show the chapter grid immediately (static data).
  // The useEffect above will redirect non-Plus users once loading finishes.
  if (!isPlus && !isLoading) return null;

  if (!activeChapter) {
    return <ChapterGrid onSelect={setActiveChapter} />;
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => setActiveChapter(null)}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {activeChapter.title}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {activeChapter.scriptName} script
          </Text>
        </View>
      </View>

      <TraceSession
        chapter={activeChapter}
        onBack={() => setActiveChapter(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: AppFonts.bold, fontSize: 18 },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 1 },
  chapterList: { paddingHorizontal: 16, paddingBottom: TAB_BAR_CLEARANCE, gap: 10 },
  chapterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  chapterChar: { fontFamily: 'serif', fontSize: 36, width: 48, textAlign: 'center' },
  chapterTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  chapterMeta: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 80 },
  emptyTitle: { fontFamily: AppFonts.bold, fontSize: 20, marginTop: 16, textAlign: 'center' },
  emptyBody: { fontFamily: AppFonts.regular, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 22 },
  session: { paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE, gap: 20 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressLabel: { fontFamily: AppFonts.semibold, fontSize: 12, width: 40 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  canvasSection: { alignItems: 'center', gap: 12 },
  charDisplay: { alignItems: 'center', gap: 4 },
  bigChar: { fontSize: 80, fontFamily: 'serif', lineHeight: 96 },
  charLabel: { fontFamily: AppFonts.semibold, fontSize: 14 },
  traceHint: { fontFamily: AppFonts.regular, fontSize: 12 },
  canvas: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
  },
  controlRow: { flexDirection: 'row', gap: 8 },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  controlText: { fontFamily: AppFonts.semibold, fontSize: 13 },
  resultCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
  resultText: { fontFamily: AppFonts.bold, fontSize: 15 },
  resultButtons: { flexDirection: 'row', gap: 10 },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnText: { fontFamily: AppFonts.bold, fontSize: 14 },
  doneContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  doneTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 26,
    textAlign: 'center',
  },
  doneSubtitle: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  doneButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  stageHeader: {
    fontSize: 11,
    fontFamily: AppFonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 6,
    paddingHorizontal: 4,
    opacity: 0.55,
  },
});
