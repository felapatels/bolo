// Turning a traced finger path into authored stroke data.
//
// WHY THIS EXISTS. Fonts carry a letter's SHAPE. They do not carry its ORDER or
// its DIRECTION, and those two are the whole reason authored data is worth
// paying for: the scorer can already report "wrong-order" and "reversed-stroke"
// but has nothing to score against until someone writes the letters down.
//
// The old plan was to hand-author ~45 Devanagari glyphs as literal coordinate
// arrays, and then repeat that eleven more times. This module makes the app
// author them instead: a person who writes the script traces each letter once,
// and what their finger did IS the data. Review stops being code review and
// becomes tracing, which is the only form of it a relative who writes Gujarati
// can actually do.
//
// It lives here, not in the app, for the reason the package header already
// gives: this is pure. The canvas and the pen stay in the artifact that has a
// platform. What that leaves here is the arithmetic, which is identical on a
// phone and in a browser and is therefore the thing worth sharing.

import type { AuthoredGlyph, AuthoredStroke, StrokePoint } from "./stroke-scoring";
import type { ScriptId } from "./scripts";
import { SCRIPT_BY_LANGUAGE } from "./scripts";
import type { TraceCharacter } from "./chapters";
import { LANG_CHAPTER_IDS, SCRIPT_TRACE_CHAPTERS } from "./chapters";

/**
 * How far a point may sit from the simplified line before it is kept, in the
 * same 0..100 box everything else uses.
 *
 * Tuned against SHAPE_TOLERANCE, which is 8. Anything well under that is
 * invisible to the scorer, so 1.5 buys a readable source file for no accuracy:
 * a finger emits well over a hundred points per stroke and this returns single
 * digits, which is the difference between data a human can review in a diff and
 * data they cannot.
 */
export const SIMPLIFY_EPSILON = 1.5;

/** A stroke shorter than this is a tap or a slip, not a pen stroke. */
export const MIN_STROKE_POINTS = 2;

/**
 * How many averaging passes to run before simplifying.
 *
 * One is not enough, and that is measured rather than assumed. A single 3-point
 * average turns alternating jitter of amplitude n into n/3, so 2.5 units of
 * noise comes out at 0.83 and still reads as real deviation once an endpoint
 * skews the chord. Each pass divides by three again, so two passes take the
 * same stroke to 0.28, comfortably inside SIMPLIFY_EPSILON. Three would start
 * rounding the corners a script actually has.
 */
export const SMOOTH_PASSES = 2;

/**
 * Take the sampling noise off a touch trace before simplifying it.
 *
 * A touchscreen reports a finger that is not actually moving as a point that
 * jitters a pixel or two, and RDP cannot tell that from a deliberate wiggle: it
 * faithfully preserves every spike, which is how a straight line comes back as
 * two hundred points. Averaging first means the simplifier sees the stroke the
 * author meant rather than the one the digitiser measured.
 *
 * THE ENDPOINTS ARE SMOOTHED TOO, one-sided, and that is deliberate but it was
 * not the first attempt. Copying them through raw looks like the careful choice
 * (they carry the stroke's direction) and it defeats the whole function: RDP
 * measures every interior point against the chord between the two ENDS, so a
 * single noisy endpoint tilts that chord and every clean interior point then
 * reads as deviation. Measured on a 200-sample stroke with 2.5 units of jitter,
 * raw endpoints returned 185 points where smoothed ones return 2.
 *
 * Direction survives this untouched. Direction is which end comes FIRST in the
 * array, not where that end sits to a fraction of a unit, and the weighting
 * keeps each end anchored to itself at two parts in three.
 */
export function smoothTrace(
  points: readonly StrokePoint[],
  passes: number = SMOOTH_PASSES,
): StrokePoint[] {
  let current = points.map((p) => ({ ...p }));
  if (current.length <= 2) return current;

  for (let pass = 0; pass < passes; pass++) {
    const next: StrokePoint[] = new Array(current.length);
    const last = current.length - 1;
    // One-sided at the ends, weighted toward the end itself so it stays put.
    next[0] = {
      x: (2 * current[0].x + current[1].x) / 3,
      y: (2 * current[0].y + current[1].y) / 3,
    };
    for (let i = 1; i < last; i++) {
      next[i] = {
        x: (current[i - 1].x + current[i].x + current[i + 1].x) / 3,
        y: (current[i - 1].y + current[i].y + current[i + 1].y) / 3,
      };
    }
    next[last] = {
      x: (2 * current[last].x + current[last - 1].x) / 3,
      y: (2 * current[last].y + current[last - 1].y) / 3,
    };
    current = next;
  }
  return current;
}

function perpendicularDistance(p: StrokePoint, a: StrokePoint, b: StrokePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // Twice the triangle's area over the base length is the height.
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / Math.hypot(dx, dy);
}

/**
 * Ramer-Douglas-Peucker. Keeps the endpoints and every point that carries
 * shape, drops the rest.
 *
 * Iterative rather than recursive on purpose: a slow drag across a large canvas
 * can produce thousands of points, and the recursive form blows the stack on
 * exactly the careful tracing this tool is built to encourage.
 */
export function simplifyTrace(
  points: readonly StrokePoint[],
  epsilon: number = SIMPLIFY_EPSILON,
): StrokePoint[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let worstIndex = -1;
    let worstDistance = epsilon;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > worstDistance) {
        worstDistance = d;
        worstIndex = i;
      }
    }
    if (worstIndex !== -1) {
      keep[worstIndex] = true;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  const out: StrokePoint[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push({ ...points[i] });
  return out;
}

/**
 * Snap to whole numbers inside the 0..100 box.
 *
 * Integers because SHAPE_TOLERANCE is 8: a tenth of a unit is a hundredth of
 * the tolerance and buys nothing but noise in a file a human has to read.
 * Clamped because a finger leaving the canvas edge reports coordinates outside
 * the box, and a glyph that claims to reach x = 103 is wrong on its face.
 */
function quantize(p: StrokePoint): StrokePoint {
  return {
    x: Math.min(100, Math.max(0, Math.round(p.x))),
    y: Math.min(100, Math.max(0, Math.round(p.y))),
  };
}

/** Drop consecutive duplicates left behind by rounding. */
function dedupe(points: StrokePoint[]): StrokePoint[] {
  return points.filter(
    (p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
  );
}

/**
 * One traced stroke, cleaned: simplified, snapped to the grid, de-duplicated.
 *
 * Returns null when nothing survives, which is how a tap or an accidental
 * graze is rejected rather than committed as a one-point stroke.
 */
export function cleanStroke(
  raw: readonly StrokePoint[],
  epsilon: number = SIMPLIFY_EPSILON,
): AuthoredStroke | null {
  if (raw.length < MIN_STROKE_POINTS) return null;
  // Smooth BEFORE simplifying: RDP preserves spikes faithfully, so denoising
  // afterwards would be denoising points it already decided to keep.
  const cleaned = dedupe(simplifyTrace(smoothTrace(raw), epsilon).map(quantize));
  return cleaned.length >= MIN_STROKE_POINTS ? cleaned : null;
}

/**
 * Everything a trace needs to become a glyph, minus the strokes themselves.
 * Mirrors what a TraceCharacter already carries, so the authoring screen can
 * walk the existing chapters and hand each character straight through.
 */
export type GlyphIdentity = {
  id: string;
  char: string;
  label: string;
};

/**
 * Build an AuthoredGlyph from what the finger did.
 *
 * The array order IS the writing order and each stroke's point order IS its
 * direction, so nothing here needs to infer either. That is the entire point:
 * the two facts a font cannot hold are recorded by the act of writing.
 */
export function traceToAuthoredGlyph(
  identity: GlyphIdentity,
  rawStrokes: readonly (readonly StrokePoint[])[],
  epsilon: number = SIMPLIFY_EPSILON,
): AuthoredGlyph {
  const strokes: AuthoredStroke[] = [];
  for (const raw of rawStrokes) {
    const cleaned = cleanStroke(raw, epsilon);
    if (cleaned) strokes.push(cleaned);
  }
  return { id: identity.id, char: identity.char, label: identity.label, strokes };
}

/** How many points a glyph costs, for a readout that keeps an author honest. */
export function glyphPointCount(glyph: AuthoredGlyph): number {
  return glyph.strokes.reduce((n, s) => n + s.length, 0);
}

function serializeStroke(stroke: AuthoredStroke, indent: string): string {
  const pts = stroke.map((p) => `{ x: ${p.x}, y: ${p.y} }`).join(", ");
  const oneLine = `${indent}[${pts}],`;
  if (oneLine.length <= 96) return oneLine;
  const inner = stroke.map((p) => `${indent}  { x: ${p.x}, y: ${p.y} },`).join("\n");
  return `${indent}[\n${inner}\n${indent}],`;
}

/**
 * Emit a glyph as TypeScript source, ready to paste into a strokes file.
 *
 * Paste-ready rather than JSON because the destination is a hand-maintained
 * module that a reviewer reads in a diff, and because the char is worth having
 * in a comment where a reviewer's eye lands before the numbers do.
 */
export function serializeAuthoredGlyph(glyph: AuthoredGlyph, indent = "  "): string {
  const inner = indent + "  ";
  const strokeInner = inner + "  ";
  const lines = [
    `${indent}{`,
    `${inner}id: ${JSON.stringify(glyph.id)},`,
    `${inner}char: ${JSON.stringify(glyph.char)},`,
    `${inner}label: ${JSON.stringify(glyph.label)},`,
    // Provenance has to survive the round trip. Added 2026-08-23 when the
    // font-derived glyphs came in: the writer predated `provisional` and
    // silently dropped it, so every guess was being written out looking
    // exactly like a speaker's handwriting. Emitted only when true, so the
    // common case stays quiet in a diff.
    ...(glyph.provisional ? [`${inner}provisional: true,`] : []),
    `${inner}strokes: [`,
    ...glyph.strokes.map((s, i) => `${strokeInner}// ${i + 1}\n${serializeStroke(s, strokeInner)}`),
    `${inner}],`,
    `${indent}},`,
  ];
  return lines.join("\n");
}

/**
 * A whole authored set as a pasteable array literal.
 *
 * `name` is the const it will be assigned to, so the output drops straight into
 * a file beside DEVANAGARI_PROTOTYPE_GLYPHS without anyone retyping the header.
 */
export function serializeAuthoredGlyphs(
  glyphs: readonly AuthoredGlyph[],
  name = "AUTHORED_GLYPHS_DRAFT",
): string {
  const body = glyphs.map((g) => serializeAuthoredGlyph(g)).join("\n");
  return `export const ${name}: AuthoredGlyph[] = [\n${body}\n];\n`;
}

// ── The wire format ─────────────────────────────────────────────────────────
//
// What a contributor pastes back. Compact because a person copies it out of a
// web page and into a message by hand, and a pretty-printed JSON of 45 glyphs
// is a wall nobody will send.
//
//   bolo1|Gujarati|Ba|gu_a:12,30;20,58~74,26;74,78|gu_aa:...
//   ^     ^        ^  ^     ^ one stroke  ^ next stroke
//   |     |        |  glyph id
//   |     |        who traced it, "-" if they did not say, "!" prefix = practice
//   |     script name, spaces as underscores
//   version
//
// Parsing it is the load-bearing half. A tool that collects data nobody can
// read back in is not a tool, so this lives here beside the writer and is
// tested against it rather than being written once on the receiving end.

export const TRACE_PAYLOAD_VERSION = "bolo1";

/** One contributor's traced glyph, before it is matched to a character. */
export type ParsedTraceGlyph = {
  id: string;
  strokes: AuthoredStroke[];
};

export type ParsedTracePayload = {
  script: string;
  /** Who traced this set. "-" when they did not give a name. */
  contributor: string;
  /**
   * The contributor said they were only trying it out.
   *
   * It exists because the first person to open the page is whoever built it,
   * and they may well not write the script at all. Marking a practice run in
   * the DATA rather than remembering it out of band is what stops a test from
   * quietly becoming the thing that teaches somebody their alphabet.
   */
  isPractice: boolean;
  glyphs: ParsedTraceGlyph[];
};

export class TracePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TracePayloadError";
  }
}

function parsePoint(raw: string): StrokePoint {
  const [xs, ys] = raw.split(",");
  const x = Number(xs);
  const y = Number(ys);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TracePayloadError(`Not a point: ${JSON.stringify(raw)}`);
  }
  if (x < 0 || x > 100 || y < 0 || y > 100) {
    throw new TracePayloadError(`Point outside the 0..100 box: ${raw}`);
  }
  return { x, y };
}

/**
 * Read a pasted payload back into strokes.
 *
 * Tolerant of the things a message app does to text (surrounding whitespace,
 * stray newlines from wrapping) and strict about everything else, because a
 * silently mis-parsed glyph teaches a learner the wrong stroke order and
 * nothing downstream would catch it.
 */
export function parseTracePayload(text: string): ParsedTracePayload {
  // Message apps wrap long lines; the payload has no meaningful whitespace.
  const cleaned = text.replace(/\s+/g, "");
  if (cleaned.length === 0) throw new TracePayloadError("Empty payload.");

  const parts = cleaned.split("|");
  if (parts[0] !== TRACE_PAYLOAD_VERSION) {
    throw new TracePayloadError(
      `Expected a payload starting "${TRACE_PAYLOAD_VERSION}|", got ${JSON.stringify(parts[0].slice(0, 24))}.`,
    );
  }
  if (parts.length < 4) throw new TracePayloadError("Payload has no glyphs.");

  const script = parts[1].replace(/_/g, " ");
  const rawContributor = parts[2] === "" ? "-" : parts[2];
  const isPractice = rawContributor.startsWith("!");
  const contributor = isPractice ? rawContributor.slice(1) || "-" : rawContributor;
  const glyphs: ParsedTraceGlyph[] = [];

  for (const chunk of parts.slice(3)) {
    if (chunk === "") continue;
    const colon = chunk.indexOf(":");
    if (colon <= 0) throw new TracePayloadError(`Glyph has no id: ${JSON.stringify(chunk.slice(0, 24))}`);
    const id = chunk.slice(0, colon);
    const strokes = chunk
      .slice(colon + 1)
      .split("~")
      .filter((s) => s !== "")
      .map((s) => s.split(";").map(parsePoint));

    for (const s of strokes) {
      if (s.length < MIN_STROKE_POINTS) {
        throw new TracePayloadError(`Glyph ${id} has a stroke with fewer than ${MIN_STROKE_POINTS} points.`);
      }
    }
    if (strokes.length === 0) throw new TracePayloadError(`Glyph ${id} has no strokes.`);
    glyphs.push({ id, strokes });
  }

  if (glyphs.length === 0) throw new TracePayloadError("Payload has no glyphs.");
  return { script, contributor, isPractice, glyphs };
}

/**
 * What several people said about the same letter.
 *
 * WHY THIS IS THE POINT OF COLLECTING DUPLICATES. Stroke order carries real
 * regional and generational variation, and it also carries plain
 * misremembering. One contributor cannot tell those apart, and neither can
 * anyone reading their data afterwards. Three can: where they agree, the
 * question is settled; where they split, that letter is worth asking about
 * before it teaches anybody anything.
 *
 * Stroke COUNT is the comparison rather than shape, deliberately. It is the
 * decision a writer actually makes (is this one stroke or two), it is stable
 * across handwriting, and two people who disagree about it disagree about
 * something real. Shapes differ between any two hands and comparing them would
 * report disagreement everywhere.
 */
/**
 * Names whose submissions are the team's own testing, never teaching data.
 *
 * WHY THIS IS CODE AND NOT A NOTE IN A DOC. The page has no "this is a test"
 * control any more, deliberately: it sat next to the name field and a real
 * contributor would tick it and silently opt their own work out. What replaced
 * it is this. Whoever is building the thing tests it, repeatedly, and their
 * traces are not how anybody's grandmother writes. A note saying "remember to
 * ignore Test Aakesh" survives exactly as long as the person who read it.
 *
 * Matched case-insensitively, and any name STARTING with "test" counts, so
 * "Test Aakesh", "test", and "Testing123" are all covered without anyone having
 * to come back and extend the list.
 */
export const TEST_CONTRIBUTORS = [
  "test aakesh",
  "aakesh",
  "probe_claude",
  "probe_claude2",
  "probe3",
  "smoke",
];

/** Whether a contributor name marks the team's own testing. */
export function isTestContributor(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/^!/, "");
  if (n.startsWith("test")) return true;
  return TEST_CONTRIBUTORS.includes(n);
}

export type GlyphAgreement = {
  id: string;
  /** How many people traced this letter at all. */
  contributors: number;
  /** Stroke count to the people who used it. */
  byStrokeCount: { strokeCount: number; contributors: string[] }[];
  /** True when everyone who traced it used the same number of strokes. */
  agreed: boolean;
};

/**
 * Compare several contributors' sets, disagreements first.
 *
 * Sorted that way because the agreements need no attention and the splits are
 * the entire reason to have asked more than one person.
 */
export function compareContributions(
  payloads: readonly ParsedTracePayload[],
  { includePractice = false }: { includePractice?: boolean } = {},
): GlyphAgreement[] {
  const byGlyph = new Map<string, Map<number, string[]>>();

  for (const payload of payloads) {
    // Both dropped by DEFAULT, so forgetting the option is the safe direction.
    if (payload.isPractice && !includePractice) continue;
    // The team's own testing is never teaching data, whatever the flag says.
    if (isTestContributor(payload.contributor) && !includePractice) continue;
    for (const glyph of payload.glyphs) {
      let counts = byGlyph.get(glyph.id);
      if (!counts) {
        counts = new Map<number, string[]>();
        byGlyph.set(glyph.id, counts);
      }
      const n = glyph.strokes.length;
      counts.set(n, [...(counts.get(n) ?? []), payload.contributor]);
    }
  }

  const out: GlyphAgreement[] = [];
  for (const [id, counts] of byGlyph) {
    const byStrokeCount = [...counts.entries()]
      .map(([strokeCount, contributors]) => ({ strokeCount, contributors }))
      .sort((a, b) => b.contributors.length - a.contributors.length || a.strokeCount - b.strokeCount);
    out.push({
      id,
      contributors: byStrokeCount.reduce((n, g) => n + g.contributors.length, 0),
      byStrokeCount,
      agreed: byStrokeCount.length === 1,
    });
  }

  // Disagreements first, then the most-corroborated, then stable by id.
  return out.sort(
    (a, b) =>
      Number(a.agreed) - Number(b.agreed) ||
      b.contributors - a.contributors ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Match a parsed payload to the characters it claims to be, producing glyphs
 * ready to serialize.
 *
 * `lookup` resolves an id to its character. Unknown ids are REPORTED rather
 * than dropped: a contributor on a stale copy of the page would otherwise
 * appear to have contributed nothing, silently.
 */
export function resolveTracePayload(
  payload: ParsedTracePayload,
  lookup: (id: string) => GlyphIdentity | undefined,
): { glyphs: AuthoredGlyph[]; unknownIds: string[] } {
  const glyphs: AuthoredGlyph[] = [];
  const unknownIds: string[] = [];
  for (const g of payload.glyphs) {
    const identity = lookup(g.id);
    if (!identity) {
      unknownIds.push(g.id);
      continue;
    }
    glyphs.push({ ...identity, strokes: g.strokes });
  }
  return { glyphs, unknownIds };
}

// ── Finding the letters to author ───────────────────────────────────────────

/**
 * The alphabet characters for a script, deduped, in chapter order.
 *
 * JOINS ON CHAPTER IDS, NOT ON THE DISPLAY NAME, and that is the whole reason
 * this helper exists rather than a one-line filter at each call site. The two
 * spellings of one script drifted apart: SCRIPT_NAMES says "Meetei Mayek" (the
 * Unicode block, and how the languages table spells it) while the GENERATED
 * chapters.ts says "Meitei Mayek". Anything matching `chapter.scriptName ===
 * SCRIPT_NAMES[script]` silently finds nothing for Manipuri and reports an
 * empty alphabet rather than an error. LANG_CHAPTER_IDS is stable, so it is
 * what to join on.
 *
 * Words and sentences are left out: they are compositions of these letters, so
 * authoring them would be authoring the same strokes again with new spacing.
 */
export function alphabetForScript(script: ScriptId): TraceCharacter[] {
  const languages = Object.entries(SCRIPT_BY_LANGUAGE)
    .filter(([, s]) => s === script)
    .map(([lang]) => lang);

  const wanted = new Set<string>();
  for (const lang of languages) {
    for (const id of LANG_CHAPTER_IDS[lang] ?? []) wanted.add(id);
  }

  const seen = new Set<string>();
  const out: TraceCharacter[] = [];
  for (const chapter of SCRIPT_TRACE_CHAPTERS) {
    if (!wanted.has(chapter.id) || chapter.stage !== "alphabet") continue;
    for (const c of chapter.characters) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

