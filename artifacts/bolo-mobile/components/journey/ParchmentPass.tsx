/**
 * THE PARCHMENT PASS (build 21, the owner's home mockup, then "make sure to
 * change the actual pass to the parchment paper look in my example, and the
 * icon landmark seeping through").
 *
 * The home boarding pass used to lie on the carved station board (the
 * pediment with rosettes over a framed cream panel) that the journey's zone
 * header also draws. The mockup replaces the board, on home only, with a
 * sheet of aged paper: warm cream, darker at the edges, a soft shadow lifting
 * it off the page, a brass nameplate riding its top edge with the zone in
 * faint ink beneath, and a landmark seeping through the paper behind the
 * words. The journey's zone header keeps CarvedBoard until the journey pass.
 *
 * A PAINTED SHEET EXISTS AND IS SWITCHED OFF (build 22: the owner's art loop delivered
 * assets/journey/parchment.png: a real aged sheet, torn on all four sides,
 * on transparent, imported by scripts/import-game-art.py). It is stretched
 * over the pass's whole box, which on the phone is about 1.47:1 against the
 * painting's 4:3; a tenth of stretch does not show on paper grain and it
 * keeps every torn edge. Its shadow is the same picture tinted and dropped a
 * few points, so the shadow follows the painted tear. THE DRAWN SHEET BELOW
 * IS THE FALLBACK, not dead code: it takes over if the picture fails to load
 * (onError) or when PARCHMENT_PAINTED is flipped off, and it is the twin the
 * web home still draws until its parity pass.
 *
 * THE LANDMARK IS DRAWN, NOT PAINTED. Nothing in the bundle is a monument,
 * so the watermark is a silhouette (a great dome between two smaller ones,
 * four minarets, a plinth) in the paper's own ink at a whisper. It is an
 * icon on purpose: the owner asked for "the icon landmark", and an icon
 * stays the same object on every one of the 22 lines. A painted landmark
 * per line would need art nobody has made.
 *
 * SIZED IN POINTS, never percentages (the chat 11 render trap): the caller
 * gives width and height and every layer here is a fixed box inside them.
 */
import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { Landmark } from '@/components/journey/Landmark';
import { AppFonts } from '@/constants/fonts';
import { TICKET } from '@/lib/ticketStock';
import { ZONE_BOARD } from '@/lib/zoneBackdrops';

/** The painted sheet, 1200 x 900 with alpha, the tear at every edge. */
export const PARCHMENT_SHEET = require('../../assets/journey/parchment.png') as number;
/** The kill switch for the painted sheet: false puts the drawn one back.
 *  OFF BY THE OWNER'S RULING (build 22, 2026-08-29, on seeing it on the
 *  simulator: "revert the parchment paper on boarding pass back to previous
 *  one"). The painted path stays wired and the picture stays in the bundle,
 *  so this is one word to bring back; the drawn sheet is the home pass. */
export const PARCHMENT_PAINTED = false;
/**
 * THE LIVING PASS (2026-09-05, the owner: "replace the parchment paper
 * boarding pass with a live video just like we did on the SEA app").
 *
 * A film of a printed platform under the words instead of a still sheet:
 * steam crossing the whole width, a lantern swinging its shadow over the
 * stone, the morning light sweeping left to right. 1320x808, which is the
 * pass at 3x on the widest phone, ping-ponged to 16 seconds so it loops at
 * 45.9 dB against SEA's 25 dB bar.
 *
 * THE FIRST GENERATION WAS REJECTED AND THE REASON IS WORTH KEEPING: it moved
 * 0.52 grey levels frame to frame, a fifth of a percent, all of it in the
 * bottom-left quarter, and it was a still photograph at both ends of the
 * loop. Below what an eye registers as motion. The prompt was rewritten to
 * demand three motions, each stated as already underway and unbroken, spread
 * across the frame; that measured 0.96 with a floor of 0.50, so nothing is
 * ever completely still and no quarter is dead.
 *
 * THE WASH IS NOT DECORATION. The card carries the nameplate, the station
 * name, the stub, the dot rail and the Resume button, so the film sits under
 * a paper-toned scrim; without it the steam crosses the words. Reduced motion
 * gets the still first frame and no player at all.
 */
export const PARCHMENT_FILM = true;
/** The film, and its poster for the reduced-motion and pre-load frame. */
export const PARCHMENT_MOVIE = require('../../assets/journey/pass-film.mp4') as number;
/** The nameplate's height; it straddles the paper's top edge by half of it. */
export const PARCHMENT_PLATE_H = 34;
/** How far below the paper's top the content starts: the plate's lower half,
 *  the zone line under it, and a breath. */
export const PARCHMENT_TOP = PARCHMENT_PLATE_H / 2 + 30;
/** The paper's side and bottom padding around its content. */
export const PARCHMENT_PAD = 16;

const PAPER = {
  top: '#FBF0DC',
  mid: '#F4E2C4',
  bottom: '#EBD3AD',
  edge: '#B8946A',
  rim: '#7A5443',
  stain: '#8A6A47',
  shadow: '#3B2A1E',
  shade: 'rgba(122, 84, 67, 0.16)',
} as const;

const BRASS = {
  top: '#E8CF86',
  mid: '#D9BE72',
  bottom: '#B8953F',
  edge: '#8A6A1E',
  ink: '#3B2A1E',
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
  const L = m, R = w - m, T = m, B = h - m;
  walk(L + corner, T, R - corner, T, 0, 1);
  walk(R - corner, T, R, T + corner, -0.7, 0.7);
  walk(R, T + corner, R, B - corner, -1, 0);
  walk(R, B - corner, R - corner, B, -0.7, -0.7);
  walk(R - corner, B, L + corner, B, 0, -1);
  walk(L + corner, B, L, B - corner, 0.7, -0.7);
  walk(L, B - corner, L, T + corner, 1, 0);
  walk(L, T + corner, L + corner, T, 0.7, 0.7);
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z';
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
    out.push(`M${x0.toFixed(1)} ${y.toFixed(1)} q${(len / 2).toFixed(1)} ${bow.toFixed(1)} ${len.toFixed(1)} 0`);
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
    out.push({ cx: 6 + rnd() * (w - 12), cy: 6 + rnd() * (h - 12), r: 0.7 + rnd() * 1.6, o: 0.1 + rnd() * 0.14 });
  }
  return out;
}

export function ParchmentPass({
  width,
  height,
  nameplate,
  plate,
  landmark,
  clipContent = true,
  style,
  testID,
  children,
}: {
  width: number;
  height: number;
  /** The brass plate's line, upper-cased here. */
  nameplate: string;
  /** The faint line under it, e.g. "ZONE 1". */
  plate: string;
  /** The zone's city, whose landmark seeps through the paper. */
  landmark: string | null;
  /** Off for the length of an animation that must leave the paper. */
  clipContent?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: React.ReactNode;
}) {
  // The plate hangs half above the paper, so the whole sits that much lower
  // inside the box the caller gives it.
  const paperTop = PARCHMENT_PLATE_H / 2;
  const paperH = height - paperTop;
  const plateW = Math.min(width * 0.56, 240);
  const landmarkW = Math.min(width * 0.58, 250);
  const landmarkH = landmarkW * 0.6;
  const deckle = React.useMemo(() => deckledPath(width, paperH, 7), [width, paperH]);
  const fibres = React.useMemo(() => fibrePaths(width, paperH, 11), [width, paperH]);
  const mottle = React.useMemo(() => mottlePatches(width, paperH, 23), [width, paperH]);
  const freckles = React.useMemo(() => frecklePoints(width, paperH, 41), [width, paperH]);
  // The painted sheet, until it fails to load; then the drawn one below.
  const [painted, setPainted] = React.useState(PARCHMENT_PAINTED);
  // THE FILM. Muted and looping, and it is never given a source at all under
  // reduced motion, so no decoder is created rather than one created and
  // paused. Same shape as the SEA zone layer and the games hero.
  const reduceMotion = useReducedMotion();
  const filmOn = PARCHMENT_FILM && !reduceMotion;
  const player = useVideoPlayer(filmOn ? PARCHMENT_MOVIE : null, (pl) => {
    pl.loop = true;
    pl.muted = true;
    pl.play();
  });
  return (
    <View testID={testID} style={[{ width, height }, style]}>
      {/* THE SHEET, TORN AND WORN (build 21, owner: "parchment paper doesn't
          have details around the edges making it look realistic"). Not a
          rounded rectangle: a deckled outline walked round the paper with a
          seeded jitter, bigger bites at the corners and the odd nick along
          a side, filled with the cream gradient, rimmed by a darker worn
          edge that follows the same tear, with two faint stains and a few
          fibre strokes in the paper. The shadow is two offset copies of the
          same torn shape, so it too follows the tear rather than a box. All
          of it is one Svg in points; the words sit in a View above it. */}
      <View
        style={[
          styles.paper,
          { top: paperTop, height: paperH, width },
          clipContent ? styles.clip : styles.open,
        ]}
      >
        {painted ? (
          <>
            {/* THE PAINTED SHEET (build 22): its shadow first, the picture
                itself tinted to the shadow's ink and dropped five points, so
                the shadow is the painted tear and not a box; then the sheet,
                stretched to the box in points. */}
            <Image
              source={PARCHMENT_SHEET}
              resizeMode="stretch"
              style={[styles.sheet, { top: 5, width, height: paperH, tintColor: PAPER.shadow, opacity: 0.16 }]}
            />
            <Image
              source={PARCHMENT_SHEET}
              resizeMode="stretch"
              onError={() => setPainted(false)}
              style={[styles.sheet, { width, height: paperH }]}
              testID="parchment-sheet-painted"
            />
          </>
        ) : (
        <Svg width={width} height={paperH} pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgLinearGradient id="paperGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={PAPER.top} />
              <Stop offset="0.55" stopColor={PAPER.mid} />
              <Stop offset="1" stopColor={PAPER.bottom} />
            </SvgLinearGradient>
            <RadialGradient id="stain" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={PAPER.stain} stopOpacity="0.1" />
              <Stop offset="1" stopColor={PAPER.stain} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="vignette" cx="50%" cy="50%" r="72%">
              <Stop offset="0.55" stopColor={PAPER.stain} stopOpacity="0" />
              <Stop offset="1" stopColor={PAPER.stain} stopOpacity="0.12" />
            </RadialGradient>
          </Defs>
          {/* the shadow, following the tear */}
          <Path d={deckle} fill={PAPER.shadow} opacity={0.1} transform="translate(0, 7)" />
          <Path d={deckle} fill={PAPER.shadow} opacity={0.14} transform="translate(0, 4)" />
          {/* the paper */}
          <Path d={deckle} fill="url(#paperGrad)" />
          <Path d={deckle} fill="url(#vignette)" />
          {/* THE PAPER'S OWN IMPERFECTIONS (owner: "the actual paper should
              have features of imperfection"): a seeded mottle of faint cream
              and tan patches, then a scatter of tiny age freckles, under the
              stains and the fibres. All at a whisper, so the words stay easy. */}
          {mottle.map((m, i) => (
            <Ellipse
              key={`m${i}`}
              cx={m.cx}
              cy={m.cy}
              rx={m.rx}
              ry={m.ry}
              fill={m.light ? PAPER.top : PAPER.stain}
              fillOpacity={m.o}
              transform={`rotate(${m.rot} ${m.cx} ${m.cy})`}
            />
          ))}
          {freckles.map((f, i) => (
            <Ellipse key={`f${i}`} cx={f.cx} cy={f.cy} rx={f.r} ry={f.r * 0.8} fill={PAPER.stain} fillOpacity={f.o} />
          ))}
          {/* stains: one high on the left, one low on the right */}
          <Ellipse cx={width * 0.22} cy={paperH * 0.28} rx={width * 0.16} ry={paperH * 0.2} fill="url(#stain)" />
          <Ellipse cx={width * 0.78} cy={paperH * 0.76} rx={width * 0.2} ry={paperH * 0.18} fill="url(#stain)" />
          {/* fibres: a few faint strokes with the grain */}
          {fibres.map((d, i) => (
            <Path key={i} d={d} stroke={PAPER.stain} strokeWidth={0.8} strokeOpacity={0.14} fill="none" />
          ))}
          {/* THE FRAY, NOT A RIM (owner: "it shouldn't have a darker border"):
              the tear is softened with a stroke of the paper's own light,
              so the edge reads as fibres catching light, never as a line. */}
          <Path d={deckle} fill="none" stroke={PAPER.top} strokeWidth={2.2} strokeOpacity={0.7} />
        </Svg>
        )}
        {/* THE FILM, under everything the pass draws (2026-09-05). It fills the
            paper's box and is covered by a paper-toned wash, because the words
            sit directly on top of it: the steam crosses exactly where the
            station name and the dot rail are, and at full strength it reads
            through them. FAILURE IS A COLOUR here as it is on the SEA zone
            layer: a film that will not decode leaves the drawn sheet showing
            underneath and the pass is completely legible on it. */}
        {filmOn ? (
          <>
            <VideoView
              player={player}
              style={[styles.sheet, { width, height: paperH }]}
              contentFit="cover"
              nativeControls={false}
              pointerEvents="none"
              testID="parchment-film"
            />
            {/* THE SCRIM, AND IT IS A GRADIENT RATHER THAN A WASH (owner,
                2026-09-05: "add a bit of a layer behind these elements, but
                still see through"). A flat wash strong enough to carry the
                station name kills the film everywhere, which is the mistake
                the first two passes made at 0.58 and 0.34. This is heavy where
                the WORDS are, the top block and the chai line at the foot, and
                nearly clear across the middle band where the dot rail and the
                steam live. So the text sits on paper and the platform still
                shows through between them. */}
            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(244, 226, 196, 0.78)',
                'rgba(244, 226, 196, 0.30)',
                'rgba(244, 226, 196, 0.26)',
                'rgba(244, 226, 196, 0.74)',
              ]}
              locations={[0, 0.34, 0.6, 1]}
              style={[styles.filmWash, { height: paperH }]}
            />
          </>
        ) : null}
        {/* The landmark, seeping through from below the words. */}
        <View
          pointerEvents="none"
          style={[
            styles.landmark,
            {
              width: landmarkW,
              height: landmarkH,
              left: (width - landmarkW) / 2,
              // CENTRED ON THE SHEET, both ways (owner, 2026-08-30: "it should
              // be center of card vertically as well"); it sat on the paper's
              // foot until then. Web twin: parchment-pass.tsx.
              top: (paperH - landmarkH) / 2,
            },
          ]}
        >
          {/* A QUARTER OF INK HERE, A TENTH ON WEB, AND THEY READ ALIKE
              (2026-08-30). A tenth was invisible on the phone (owner:
              "mobile is missing this silhouette"; confirmed on the simulator,
              nothing behind the dots) while the same tenth read on web; a
              fifth was a whisper beside the web's, checked side by side on
              the simulator. Still a watermark. */}
          <Landmark
            city={landmark}
            width={landmarkW}
            height={landmarkH}
            ink={TICKET.ink}
            paper={PAPER.mid}
            opacity={0.26}
          />
        </View>
        {/* The inner rule, set in from the tear like a ticket's. The painted
            sheet has its own gilt rim right at the tear, and a second line
            inside it read as a frame, so the rule is the drawn sheet's only. */}
        {!painted ? <View pointerEvents="none" style={styles.rule} /> : null}
        {/* THE WORDS, inside the paper's padding, under the plate. */}
        <View style={[styles.content, { paddingTop: PARCHMENT_TOP - paperTop }]}>{children}</View>
      </View>
      {/* THE BRASS NAMEPLATE, riding the top edge. */}
      <View
        pointerEvents="none"
        style={[styles.plate, { width: plateW, left: (width - plateW) / 2, height: PARCHMENT_PLATE_H }]}
      >
        <LinearGradient
          colors={[BRASS.top, BRASS.mid, BRASS.bottom]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.plateInner} />
        <Text numberOfLines={1} style={styles.plateText}>
          {nameplate.toUpperCase()}
        </Text>
      </View>
      {/* The zone, faint, under the plate. */}
      <Text
        numberOfLines={1}
        style={[styles.zone, { top: PARCHMENT_PLATE_H + 6 }]}
        testID="parchment-zone"
      >
        {plate.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // The sheet's box only: the paper itself, its rim and its shadow are the
  // Svg inside it, so nothing here paints past the tear.
  paper: { position: 'absolute', left: 0 },
  clip: { overflow: 'hidden' },
  open: { overflow: 'visible' },
  edgeShade: { position: 'absolute', left: 0, right: 0, top: 0 },
  edgeShadeSide: { position: 'absolute', top: 0, bottom: 0 },
  landmark: { position: 'absolute' },
  sheet: { position: 'absolute', left: 0, top: 0 },
  /** The box the film's scrim fills. The tint is a LinearGradient at the call
   *  site, not a flat colour here: see the comment there for why a flat wash
   *  cannot serve both the words and the picture. */
  filmWash: { position: 'absolute', left: 0, right: 0, top: 0 },
  rule: {
    position: 'absolute',
    left: 9,
    right: 9,
    top: 9,
    bottom: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: TICKET.rule,
    opacity: 0.5,
  },
  content: {
    flex: 1,
    paddingHorizontal: PARCHMENT_PAD,
    paddingBottom: PARCHMENT_PAD - 4,
  },
  plate: {
    position: 'absolute',
    top: 0,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: BRASS.edge,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B2A1E',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  plateInner: {
    position: 'absolute',
    left: 3,
    right: 3,
    top: 3,
    bottom: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 248, 220, 0.55)',
  },
  plateText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 13,
    letterSpacing: 1.8,
    color: BRASS.ink,
  },
  zone: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 1.6,
    color: ZONE_BOARD.inkMuted,
    opacity: 0.55,
  },
});

