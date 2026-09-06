/**
 * THE TRAIN'S STEAM, the web twin of bolo-mobile/components/journey/
 * TrainSteam.tsx (owner, 2026-09-05 there; here 2026-09-06 on "we need parity
 * homepage on web with the new boarding pass").
 *
 * IT IS THE SHORT PLUME, AND THAT WAS A DECISION, NOT A SHORTFALL. On mobile
 * the plume climbs OVER the blue stats band and lets go under the language
 * picker. Web's home is not stacked the same: the card directly above the pass
 * is the daily gift, with the stats banner further up again, so a literal port
 * would send the steam up through the gift box. Owner chose the short plume,
 * 2026-09-06: same wisps, same curve, same leftward trail, gone by the top of
 * the pass frame. The rise is MEASURED from the chimney to the frame's top by
 * the host, so it stays right at every width the column runs at.
 *
 * IT IS A SPRITE, AND THE SPRITE CARRIES REAL BLUR.
 * public/journey/steam-wisp.png is mobile's file byte for byte: fifty-two
 * overlapping lobes, a light gaussian and a radial falloff to zero at the
 * frame, so it has no edge. White at full alpha in the middle, nothing at the
 * corners. Here it is used as a MASK rather than as a picture, with the tint
 * behind it, which is the CSS equivalent of React Native's `tintColor`: same
 * alpha, any colour.
 *
 * GREY, AND THAT LESSON WAS PAID FOR THREE TIMES ON MOBILE. The obvious near
 * whites (F5F2E8, FFFFFF, DCDAD2) are right over the darker station artwork
 * and invisible everywhere else, and this plume crosses cream ticket stock and
 * a near white page. These are the tints mobile ended on, and the contrast
 * comes from COVERAGE rather than from darkness: many faint overlapping
 * particles, not a few dark ones.
 *
 * THE CURVE LIVES IN index.css, in one `steam-wisp` keyframes block, because
 * CSS cannot evaluate a curve per frame the way mobile's worklet does. It was
 * GENERATED from mobile's own expressions at twenty-one stops rather than
 * typed, so the two plumes are the same shape and neither can drift from the
 * other by a typo. The generator is a dozen lines of python and is quoted in
 * the commit that added the block; regenerate rather than hand-edit.
 */
import type { CSSProperties } from "react";

/**
 * THE CHIMNEY, AS A FRACTION OF THE LOCOMOTIVE'S BOX. Mobile's exported
 * TRAIN_CHIMNEY to the digit, and it holds here because web renders the same
 * picture at its own aspect with `object-contain`, so the img's layout box IS
 * the picture and a fraction of one is a fraction of the other. Measured
 * independently off the asset as a check: the topmost dark pixels (the stack,
 * the steam having been painted out) centre on x 0.627 and start at y 0.157.
 */
export const TRAIN_CHIMNEY = { x: 0.66, y: 0.18 } as const;

const WISP_SRC = `${import.meta.env.BASE_URL}journey/steam-wisp.png`;

/** Weight is each tint's own alpha, kept out of the opacity curve so the curve
 *  stays one shape for every particle. Mobile's three, unchanged. */
const TINTS = [
  { color: "#E4DED4", weight: 0.9 },
  { color: "#D6CFC4", weight: 1.0 },
  { color: "#F2EDE4", weight: 0.8 },
] as const;

/**
 * TWENTY-SIX, NOT FOUR. A believable plume is many faint overlapping
 * particles; a few big ones is a cartoon. Each carries its own cycle, drift,
 * phase and base width so no two ever coincide. Mobile's generator, verbatim,
 * so the two plumes are made of the same twenty-six particles.
 */
const WISPS = Array.from({ length: 26 }, (_, i) => ({
  cycle: 4600 + ((i * 617) % 2600),
  drift: (i % 2 === 0 ? 1 : -1) * (7 + ((i * 5) % 16)),
  phase: i / 26,
  base: 46 + ((i * 13) % 34),
  tint: TINTS[i % TINTS.length],
}));

/**
 * MOBILE'S OWN CLIMB, and every other length here is a share of it.
 *
 * Mobile is one width, so it can write its particle sizes, its lean and its
 * canvas in points and be right. Web's plume is as tall as the measured gap
 * between the chimney and the frame's top, which on the short-plume variant is
 * about two thirds of mobile's climb on a phone and half as much again on a
 * 700px column. Sizing the particles off the BOARD rather than off the CLIMB
 * was the first attempt and it looked wrong for a reason worth writing down: a
 * particle that grows to 1.9x over its life, spread across a shorter climb, is
 * a fatter plume, not the same plume. It buried the ticket. Every length is
 * therefore a share of the rise, so the plume is geometrically similar to
 * mobile's whatever the column does.
 */
const REFERENCE_RISE = 375;
/** How far the plume trails back over its whole climb, as a share of the rise.
 *  Mobile's 78 against its 375, so the lean stays in proportion at any size. */
const LEAN_SHARE = 78 / REFERENCE_RISE;
/** The canvas's width for a full-height plume. Mobile's 56 on a 440pt phone. */
export const STEAM_CANVAS_SHARE = 56 / REFERENCE_RISE;

export function TrainSteam({
  height,
  width,
  className,
  style,
  testId,
}: {
  /** How far the plume climbs, in px. The chimney is this box's foot. */
  height: number;
  /** The canvas's width. Only the wisps' shared anchor uses it; they travel
   *  well outside it, and they are meant to. */
  width: number;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}) {
  // Every particle is a share of the climb; see REFERENCE_RISE.
  const scale = height / REFERENCE_RISE;
  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      className={className}
      style={{ ...style, width, height, pointerEvents: "none" }}
    >
      {WISPS.map((w, i) => {
        const base = Math.round(w.base * scale);
        return (
          <span
            key={i}
            className="absolute block"
            style={
              {
                // Every wisp starts on the SAME point, the chimney's lip; only
                // the drift and the lean move it sideways as it climbs.
                bottom: 0,
                left: "50%",
                width: base,
                height: Math.round(base * 0.56),
                marginLeft: -base / 2,
                backgroundColor: w.tint.color,
                WebkitMaskImage: `url(${WISP_SRC})`,
                maskImage: `url(${WISP_SRC})`,
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                animationName: "steam-wisp",
                animationDuration: `${w.cycle}ms`,
                animationTimingFunction: "linear",
                animationIterationCount: "infinite",
                // A NEGATIVE DELAY, not a positive one: it starts the particle
                // partway through its own cycle, so the plume is full on the
                // first painted frame rather than filling up over six seconds.
                animationDelay: `${-Math.round(w.phase * w.cycle)}ms`,
                "--wisp-rise": `${height}px`,
                "--wisp-lean": `${Math.round(height * LEAN_SHARE)}px`,
                "--wisp-drift": `${Math.round(w.drift * scale)}px`,
                "--wisp-weight": w.tint.weight,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
