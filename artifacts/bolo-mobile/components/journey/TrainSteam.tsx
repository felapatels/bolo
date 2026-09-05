/**
 * THE TRAIN'S STEAM (owner, 2026-09-05, spec refined twice on seeing it).
 *
 * Wisps, not clouds. Fourteen soft irregular ovals leave the locomotive's
 * chimney nearly invisible, become visible as they cool and spread, widen,
 * bend upper-left, and vanish behind the blue stats band.
 *
 *     stats band        zIndex 30   the plume disappears BEHIND this
 *     steam             zIndex 20   here, outside anything clipped
 *     journey card      zIndex 10   the train is in here
 *
 * IT IS A SPRITE, NOT SKIA, AND THAT WAS A DELIBERATE CHOICE. The owner's spec
 * reached for @shopify/react-native-skia, which would look excellent and is
 * not installed: it is a NATIVE module, so it shows nothing until a new dev
 * client is built, rebuilding ios/ risks the hand-patched Info.plist that
 * keeps the mic and deep links alive, and adding native dependencies to this
 * app is the exact class of change that cost roughly nineteen builds over
 * expo-video and worklets. assets/journey/steam-wisp.png carries REAL blur,
 * baked in at generation: fifty-two overlapping lobes, a light gaussian and a
 * radial falloff to zero at the frame, so the sprite has no edge. Tinted and
 * stretched at runtime it gets most of Skia's look for no native risk, and it
 * behaves identically on Android.
 *
 * THREE EARLIER ATTEMPTS FAILED AND EACH TAUGHT SOMETHING. Hard circles read
 * as bubbles. White steam on cream ticket stock and a white frame has almost
 * no contrast, so it looked thin when it was not. And the plume was anchored
 * to the scroll content, a box hundreds of points taller than the window, so
 * every correction moved it unpredictably; it is anchored to the journey
 * wrapper now, whose geometry the app reports and a screenshot can verify.
 *
 * ON THE LOOP: `useLoopProgress`, the same reanimated loop the pass's shimmer
 * and glow already ride, so this app has one definition of "a loop". It rests
 * at 0 while disabled, which gives the reduced-motion still frame for free.
 *
 * AND IT MUST BE JUDGED ON TESTFLIGHT. This app has a documented history of
 * animation that runs perfectly in a dev build and comes out dead flat in
 * release; only store builds tell the truth here.
 */
import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useLoopProgress } from '@/lib/useLoopProgress';

const WISP = require('../../assets/journey/steam-wisp.png') as number;

/** What the owner's opacity curve is multiplied by so it clears the eye on a
 *  cream ground. See the curve for the measurement that set it. */
const GAIN = 4.1;

/**
 * THE CHIMNEY, AS A FRACTION OF THE LOCOMOTIVE'S BOX (owner, 2026-09-05).
 * Exported so the emitter is defined by the TRAIN rather than by a screen
 * offset: if the engine is ever resized or moved, this is the one number that
 * has to stay true. The pass positions the plume from the measured wrapper
 * today; this is what a derived anchor would read.
 */
export const TRAIN_CHIMNEY = { x: 0.66, y: 0.18 } as const;

/**
 * GREY, AND THIS IS THE THIRD TIME THIS LESSON HAS BEEN PAID FOR HERE.
 *
 * The owner's three values were near-white (F5F2E8, FFFFFF, DCDAD2), which is
 * right over the darker station artwork and invisible everywhere else: the
 * plume also crosses the frame's WHITE header and the page's near-white
 * ground, and white on those is nothing. It was rendering perfectly the whole
 * time and could not be seen. Proven rather than guessed: with the sprite
 * swapped for a flat magenta fill the layer measured from y 281 to 869, over
 * exactly the right span, so the geometry was never at fault.
 *
 * LIGHTER AGAIN ON THE OWNER'S CHALLENGE, "why can't it be thicker and
 * lighter", and the answer is that it can: thickness and lightness are
 * separate axes and I had been trading one for the other. Contrast can come
 * from COVERAGE instead of from darkness, so the tints move back up toward the
 * artwork's own rgb(219,208,204) while the particle count, size and gain all
 * rise to carry it. The one place that cannot be won is pure white over the
 * frame's white header, where the contrast is zero at any alpha; everywhere
 * else, and especially over the blue stats band, light steam reads strongly. Weight is each tint's own alpha, kept separate from
 * the opacity curve so the curve stays one shape for every particle.
 */
const TINTS = [
  { color: '#E4DED4', weight: 0.9 },
  { color: '#D6CFC4', weight: 1.0 },
  { color: '#F2EDE4', weight: 0.8 },
] as const;

/**
 * FOURTEEN, NOT FOUR. A believable plume is many faint overlapping particles;
 * a few big ones is a cartoon. Each carries its own cycle, drift, phase and
 * base width so no two ever coincide.
 */
const WISPS = Array.from({ length: 26 }, (_, i) => ({
  cycle: 4600 + ((i * 617) % 2600),
  drift: (i % 2 === 0 ? 1 : -1) * (7 + ((i * 5) % 16)),
  phase: i / 26,
  base: 46 + ((i * 13) % 34),
  tint: TINTS[i % TINTS.length],
}));

export function TrainSteam({
  enabled,
  height,
  style,
  testID,
}: {
  enabled: boolean;
  /** How far the plume climbs. The canvas is this tall; the chimney is its foot. */
  height: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View pointerEvents="none" style={style} testID={testID}>
      {WISPS.map((w, i) => (
        <Wisp key={i} {...w} rise={height} enabled={enabled} />
      ))}
    </View>
  );
}

function Wisp({
  cycle,
  drift,
  phase,
  base,
  tint,
  rise,
  enabled,
}: {
  cycle: number;
  drift: number;
  phase: number;
  base: number;
  tint: (typeof TINTS)[number];
  rise: number;
  enabled: boolean;
}) {
  const progress = useLoopProgress(cycle, enabled);
  const anim = useAnimatedStyle(() => {
    // Wrapping a phase into the shared progress staggers the fourteen without
    // fourteen delays, and means every one is already mid-flight on the first
    // frame, so the plume is never empty.
    const p = (progress.value + phase) % 1;

    // THE OWNER'S CURVE, SHAPE KEPT AND SCALE RAISED, and the raise is
    // measured rather than preferred. Faint at the lip, brightest once it has
    // cooled and spread, thinning the rest of the way: that shape is exactly
    // as specified and it is what stops the plume reading as a puff machine.
    // At the specified PEAK of 0.35 the corridor measured 0.1 to 1.3 grey
    // levels between screenshots, against a perceptual floor of about 2 to 3,
    // so it was invisible. The lip was also raised from 0.10 to 0.22 and the
    // tail now holds to 0.78 instead of 0.6: the plume has to survive the
    // whole climb OVER the stats band and only let go under the language
    // picker, so fading from three fifths of the way up emptied it too early. The reason is the background: those numbers assume
    // a darker ground, and this plume crosses cream ticket stock and a white
    // frame. GAIN carries the whole curve up without changing its shape.
    const o =
      (p < 0.2
        ? 0.32 + (p / 0.2) * 0.03
        : p < 0.78
          ? 0.35 - ((p - 0.2) / 0.58) * 0.09
          : Math.max(0, 0.26 * (1 - (p - 0.78) / 0.22))) * GAIN;

    // Tight at the chimney, wide by the band. Slightly sub-linear so it opens
    // gradually rather than ballooning in the first third.
    const scale = 0.5 + 1.4 * Math.pow(p, 0.8);

    return {
      opacity: o * tint.weight,
      transform: [
        // EASED, WHICH IS WHAT PUTS DENSITY AT THE STACK (owner, 2026-09-05:
        // "density near stack"). Linear travel spreads fourteen particles
        // evenly over the whole climb, so the chimney is as sparse as the top.
        // Rising slowly at first BUNCHES them where they leave the funnel and
        // thins them out higher up, which is both denser at the source and
        // closer to how a plume actually looks. RAISED FROM 1.35 TO 1.6 and
        // the count from fourteen to twenty on the owner's second pass: the
        // extra particles cost almost nothing up top, because with this
        // exponent most of their life is spent low, which is precisely where
        // the density was wanted.
        { translateY: -rise * Math.pow(p, 1.6) },
        // THE PLUME TRAILS BACK, as if the engine were pulling away (owner,
        // 2026-09-05: "curve it toward the left, like the train is moving
        // forward slightly"). The locomotive faces RIGHT, so forward motion
        // drags its steam LEFT, and the drag grows the longer a puff has been
        // in the air: an exponent above 1 leaves the plume near vertical at
        // the lip and bends it increasingly as it climbs, which is a curve
        // rather than the straight lean this used to have at -26 * p squared.
        // It also carries the steam back into the composition instead of off
        // the screen's right edge.
        { translateX: -78 * Math.pow(p, 1.7) + Math.sin(p * Math.PI * 2 + phase * 6) * drift },
        { scale },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.wisp,
        { width: base, height: base * 0.56, marginLeft: -base / 2 },
        anim,
      ]}
    >
      {/* EXPLICIT POINTS, NEVER absoluteFill. CLAUDE.md's first render trap:
          an Image sized by absoluteFill or by width:'100%' plus aspectRatio
          inside this tree can resolve to its INTRINSIC pixel size on device,
          which for this sprite is 512x320. That is exactly what happened here
          and it is why the plume vanished entirely rather than looking wrong.
          The box is knowable, so it is given. */}
      <Image
        source={WISP}
        resizeMode="stretch"
        style={{ width: base, height: base * 0.56, tintColor: tint.color }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /** Every wisp starts on the SAME point, the chimney's lip; only drift and
   *  the lean move it sideways as it climbs. */
  wisp: { position: 'absolute', bottom: 0, left: '50%' },
});
