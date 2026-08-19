import {
  animate,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { MascotPose } from "@/components/mascot";

/**
 * ⛔ DO NOT RENDER THIS IN THE APP.
 *
 * BoloRig is a NON-CANONICAL hand-drawn approximation of the Bolo mascot,
 * retired on July 29, 2026 (owner decision) because it doesn't match the
 * canonical art. It is kept on disk for reference only and must stay
 * unreferenced. The only permitted mascot pixels are the five canonical PNGs
 * in public/mascot/, animated as whole images, see components/mascot.tsx.
 *
 * BoloRig, Bolo the parrot as a layered, rigged SVG character.
 *
 * Replaces the five static pose PNGs with one vector character whose body
 * parts (wings, head, crest, beak, eyes, tail) are individually animated.
 * Poses are per-part target configurations (see POSES) and switching poses
 * spring-animates each part, so transitions are smooth instead of hard swaps.
 *
 * Every animated part uses an explicit SVG `transform` attribute built from
 * MotionValue templates (`rotate(deg cx cy)` etc.) so pivots are exact viewBox
 * coordinates, wings rotate at the shoulder, the head at the neck, the jaw at
 * its hinge. (framer's own originX/originY fractions are unreliable for SVG
 * groups, which is why we don't use `animate={{ rotate }}` on parts.)
 *
 * On top of the pose system sits an ambient "life" layer (random blinking,
 * breathing, occasional head tilts, pupil cursor-tracking) plus reactive
 * moments: an amplitude-driven talking beak, a lean-in listening attitude,
 * a sympathetic flinch when entering the tryagain pose, and a squash-and-
 * stretch poke reaction when the learner touches him.
 *
 * Reduced motion: every behavior collapses, the rig renders the current
 * pose as a still frame (no blinking, tracking, beak sync, or beats).
 *
 * Visual reference: public/mascot/README.md and the pose PNGs it describes.
 */

// ---------------------------------------------------------------------------
// Palette, matches the PNG reference sheet (teal body, indigo wings/crest,
// coral beak and feet, deep-slate eyes, rosy cheeks).
// ---------------------------------------------------------------------------
const C = {
  tealLight: "#2CBBA6",
  teal: "#1CA593",
  tealDark: "#12897A",
  tealShade: "#0F7F71",
  indigoLight: "#6D64F0",
  indigo: "#4F46E5",
  indigoDark: "#3B32C4",
  indigoShade: "#2E27A8",
  coralLight: "#F8A183",
  coral: "#F08262",
  coralDark: "#DD6247",
  coralShade: "#C9563C",
  mouth: "#7E2F3F",
  tongue: "#E56371",
  eyeNavy: "#1E3A5C",
  pupil: "#0D1F33",
  brow: "#1D3B52",
  blush: "#F0929F",
} as const;

export type MascotActivity = "talking" | "listening";

export interface RigEffect {
  kind: "flap" | "spread" | "flutter";
  /** Changing the id retriggers the effect. */
  id: number;
}

// ---------------------------------------------------------------------------
// Pose system, each pose is a set of per-part transform targets.
// Wing rotate convention: 0 = hanging at rest along the body; positive
// values raise the wing outward/up (SVG rotation is clockwise, y-down, and
// the wing hangs below its shoulder pivot); negative values sweep it inward
// across the chest (used for the wing-to-chin thinking gesture). The right
// wing lives in a mirrored group, so the same numbers act symmetrically.
// ---------------------------------------------------------------------------
interface PoseConfig {
  head: { rotate: number; y: number };
  wingL: { rotate: number; x: number; y: number };
  wingR: { rotate: number; x: number; y: number };
  browL: { rotate: number; y: number };
  browR: { rotate: number; y: number };
  pupils: { x: number; y: number };
  /** 0 = closed beak, 1 = wide open. */
  beakOpen: number;
  tail: { rotate: number };
  body: { scaleY: number };
}

const POSES: Record<MascotPose, PoseConfig> = {
  wave: {
    head: { rotate: 3, y: 0 },
    wingL: { rotate: 158, x: 0, y: 2 },
    wingR: { rotate: 6, x: 0, y: 0 },
    browL: { rotate: -3, y: 0 },
    browR: { rotate: 3, y: 0 },
    pupils: { x: 0, y: 0 },
    beakOpen: 0.45,
    tail: { rotate: -4 },
    body: { scaleY: 1 },
  },
  cheer: {
    head: { rotate: -2, y: -2 },
    wingL: { rotate: 138, x: -2, y: 0 },
    wingR: { rotate: 138, x: -2, y: 0 },
    browL: { rotate: -4, y: -2 },
    browR: { rotate: 4, y: -2 },
    pupils: { x: 0, y: -0.6 },
    beakOpen: 1,
    tail: { rotate: 8 },
    body: { scaleY: 1.02 },
  },
  thumbsup: {
    head: { rotate: 4, y: 0 },
    wingL: { rotate: 112, x: 2, y: -2 },
    wingR: { rotate: 4, x: 0, y: 0 },
    browL: { rotate: -3, y: -1 },
    browR: { rotate: 3, y: -1 },
    pupils: { x: 0.5, y: 0 },
    beakOpen: 0.55,
    tail: { rotate: -5 },
    body: { scaleY: 1 },
  },
  thinking: {
    head: { rotate: -5, y: 1 },
    wingL: { rotate: -58, x: 8, y: -2 },
    wingR: { rotate: 155, x: -6, y: 0 },
    browL: { rotate: -9, y: -2 },
    browR: { rotate: 11, y: 1 },
    pupils: { x: -1.2, y: -1.3 },
    beakOpen: 0.06,
    tail: { rotate: -3 },
    body: { scaleY: 1 },
  },
  tryagain: {
    head: { rotate: 4, y: 0 },
    wingL: { rotate: 62, x: -2, y: 0 },
    wingR: { rotate: 62, x: -2, y: 0 },
    browL: { rotate: 10, y: 1 },
    browR: { rotate: -10, y: 1 },
    pupils: { x: 0, y: 0.4 },
    beakOpen: 0.3,
    tail: { rotate: -6 },
    body: { scaleY: 1 },
  },
};

const PART_SPRING = { stiffness: 190, damping: 16 };
const WING_SPRING = { stiffness: 240, damping: 15 };

/**
 * An SVG <g> whose `transform` attribute follows a MotionValue string
 * template. framer-motion intercepts the `transform` prop on motion.g (it
 * manages transforms itself), so we write the attribute directly, this is
 * what makes exact viewBox-coordinate pivots like `rotate(deg 57 110)` work.
 */
function TG({ tpl, children }: { tpl: MotionValue<string>; children: ReactNode }) {
  const ref = useRef<SVGGElement | null>(null);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.setAttribute("transform", tpl.get());
    return tpl.on("change", (v) => g.setAttribute("transform", v));
  }, [tpl]);
  return <g ref={ref}>{children}</g>;
}

/** Spring-animates a MotionValue toward `target`; jumps when `still`. */
function usePartValue(
  target: number,
  still: boolean,
  spring: { stiffness: number; damping: number },
): MotionValue<number> {
  const mv = useMotionValue(target);
  useEffect(() => {
    if (still) {
      mv.jump(target);
      return;
    }
    const controls = animate(mv, target, { type: "spring", ...spring });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, still, mv, spring.stiffness, spring.damping]);
  return mv;
}

// ---------------------------------------------------------------------------
// Talking amplitude, samples the currently playing chat audio element via
// captureStream + AnalyserNode where supported (never reroutes playback, so
// a failure can only cost us amplitude data, not the learner's audio). When
// no real signal is available the beak falls back to a speech-like synthetic
// rhythm so the mouth always moves while Bolo's voice plays.
// ---------------------------------------------------------------------------
let talkCtx: AudioContext | null = null;
const talkAnalysers = new WeakMap<HTMLAudioElement, AnalyserNode | null>();

function getTalkAnalyser(el: HTMLAudioElement): AnalyserNode | null {
  if (talkAnalysers.has(el)) return talkAnalysers.get(el) ?? null;
  let analyser: AnalyserNode | null = null;
  try {
    const capture = (
      el as HTMLAudioElement & { captureStream?: () => MediaStream }
    ).captureStream;
    if (typeof capture === "function" && typeof AudioContext !== "undefined") {
      talkCtx = talkCtx ?? new AudioContext();
      void talkCtx.resume().catch(() => {});
      const stream = capture.call(el);
      if (stream.getAudioTracks().length > 0) {
        const source = talkCtx.createMediaStreamSource(stream);
        analyser = talkCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser); // analysis only, element output untouched
      }
    }
  } catch {
    analyser = null;
  }
  talkAnalysers.set(el, analyser);
  return analyser;
}

function readRms(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

/** Speech-like synthetic mouth rhythm for browsers without captureStream. */
function syntheticTalkLevel(tMs: number): number {
  const syllable = 0.5 + 0.5 * Math.sin(tMs * 0.014);
  const phrase = 0.6 + 0.4 * Math.sin(tMs * 0.0021 + 1.7);
  const jitter = 0.85 + 0.15 * Math.sin(tMs * 0.043);
  return Math.max(0.08, syllable * phrase * jitter);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function BoloRig({
  pose,
  activity = null,
  talkAudioRef,
  effect = null,
  className,
}: {
  pose: MascotPose;
  /** Reactive mode: beak-syncs while "talking", leans in while "listening". */
  activity?: MascotActivity | null;
  /** The audio element Bolo's voice plays through (drives the talking beak). */
  talkAudioRef?: RefObject<HTMLAudioElement | null>;
  /** One-shot wing effect fired by the funny idle variants. */
  effect?: RigEffect | null;
  className?: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const p = POSES[pose];
  const listening = activity === "listening" && !reduceMotion;
  const talking = activity === "talking" && !reduceMotion;

  // ── Occasional head tilt (curious sway) ──────────────────────────────────
  const [ambientTilt, setAmbientTilt] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        setAmbientTilt((Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 2.5));
        timer = setTimeout(() => {
          if (cancelled) return;
          setAmbientTilt(0);
          loop();
        }, 1200 + Math.random() * 800);
      }, 5000 + Math.random() * 6000);
    };
    loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reduceMotion]);

  // ── Pose part springs ────────────────────────────────────────────────────
  const headRot = usePartValue(
    p.head.rotate + (listening ? -6 : 0) + ambientTilt,
    reduceMotion,
    PART_SPRING,
  );
  const headY = usePartValue(p.head.y + (listening ? 1.5 : 0), reduceMotion, PART_SPRING);
  const wingLRot = usePartValue(p.wingL.rotate, reduceMotion, WING_SPRING);
  const wingLX = usePartValue(p.wingL.x, reduceMotion, WING_SPRING);
  const wingLY = usePartValue(p.wingL.y, reduceMotion, WING_SPRING);
  const wingRRot = usePartValue(p.wingR.rotate, reduceMotion, WING_SPRING);
  const wingRX = usePartValue(p.wingR.x, reduceMotion, WING_SPRING);
  const wingRY = usePartValue(p.wingR.y, reduceMotion, WING_SPRING);
  const browLRot = usePartValue(p.browL.rotate, reduceMotion, PART_SPRING);
  const browLY = usePartValue(p.browL.y, reduceMotion, PART_SPRING);
  const browRRot = usePartValue(p.browR.rotate, reduceMotion, PART_SPRING);
  const browRY = usePartValue(p.browR.y, reduceMotion, PART_SPRING);
  const glanceX = usePartValue(p.pupils.x, reduceMotion, PART_SPRING);
  const glanceY = usePartValue(p.pupils.y, reduceMotion, PART_SPRING);
  const tailRot = usePartValue(p.tail.rotate, reduceMotion, PART_SPRING);
  const bodyScaleY = usePartValue(p.body.scaleY, reduceMotion, PART_SPRING);
  const eyeScale = usePartValue(listening ? 1.06 : 1, reduceMotion, PART_SPRING);

  // ── Ambient breathing ────────────────────────────────────────────────────
  const breath = useMotionValue(1);
  useEffect(() => {
    if (reduceMotion) {
      breath.jump(1);
      return;
    }
    const controls = animate(breath, [1, 1.016, 1], {
      duration: 3.4,
      repeat: Infinity,
      ease: "easeInOut",
    });
    return () => controls.stop();
  }, [reduceMotion, breath]);

  // ── Blinking ─────────────────────────────────────────────────────────────
  const lidScale = useMotionValue(0);
  const blinkNow = useRef(() => {});
  blinkNow.current = () => {
    if (reduceMotion) return;
    void animate(lidScale, [0, 1, 1, 0], {
      duration: 0.26,
      times: [0, 0.4, 0.55, 1],
      ease: "easeInOut",
    });
  };
  useEffect(() => {
    if (reduceMotion) {
      lidScale.jump(0);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        if (cancelled) return;
        blinkNow.current();
        // ~1 in 5 blinks is a quick double blink.
        schedule(Math.random() < 0.2 ? 380 : 2400 + Math.random() * 3600);
      }, delay);
    };
    schedule(1200 + Math.random() * 2400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reduceMotion, lidScale]);

  // ── Pupil cursor tracking (desktop, subtle, clamped) ─────────────────────
  const trackX = useMotionValue(0);
  const trackY = useMotionValue(0);
  const trackSpringX = useSpring(trackX, { stiffness: 120, damping: 16 });
  const trackSpringY = useSpring(trackY, { stiffness: 120, damping: 16 });
  useEffect(() => {
    if (reduceMotion) return;
    if (typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      if (r.width === 0) return;
      // Eye line sits at ~40% down the artwork.
      const cx = r.left + r.width * 0.5;
      const cy = r.top + r.height * 0.4;
      const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width * 1.5)));
      const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height * 1.5)));
      trackX.set(nx * 2.4);
      trackY.set(ny * 1.7);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduceMotion, trackX, trackY]);

  const pupilTX = useTransform<number, number>([glanceX, trackSpringX], ([a, b]) => a + b);
  const pupilTY = useTransform<number, number>([glanceY, trackSpringY], ([a, b]) => a + b);

  // ── Talking beak (amplitude-driven) ──────────────────────────────────────
  const beakOpen = useMotionValue(p.beakOpen);
  useEffect(() => {
    if (talking) {
      let raf = 0;
      const buf: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(128));
      let smoothed = beakOpen.get();
      const loop = () => {
        const el = talkAudioRef?.current ?? null;
        let level: number | null = null;
        if (el && !el.paused) {
          const analyser = getTalkAnalyser(el);
          if (analyser) {
            const rms = readRms(analyser, buf);
            // A live analyser that reads pure silence (suspended context or
            // muted graph) falls back to the synthetic rhythm below.
            if (rms > 0.004) level = Math.min(1, rms * 7);
          }
        }
        if (level === null) level = syntheticTalkLevel(performance.now());
        // Fast attack, slower release, reads as speech, not flutter.
        smoothed =
          level > smoothed ? smoothed * 0.45 + level * 0.55 : smoothed * 0.75 + level * 0.25;
        beakOpen.set(smoothed);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }
    if (reduceMotion) {
      beakOpen.jump(p.beakOpen);
      return;
    }
    const anim = animate(beakOpen, p.beakOpen, { type: "spring", stiffness: 300, damping: 24 });
    return () => anim.stop();
  }, [talking, p.beakOpen, reduceMotion, beakOpen, talkAudioRef]);

  const jawRot = useTransform(beakOpen, (v) => v * 24);
  const upperBeakRot = useTransform(beakOpen, (v) => v * -7);
  const mouthScaleY = useTransform(beakOpen, (v) => 0.15 + 0.85 * Math.min(1, v));

  // ── Beats: flinch (entering tryagain) and poke (touch reaction) ──────────
  const beatRot = useMotionValue(0);
  const beatX = useMotionValue(0);
  const beatScale = useMotionValue(1);
  const beatScaleY = useMotionValue(1);
  const wingBeatRot = useMotionValue(0);
  const prevPoseRef = useRef(pose);
  const pokeCooldownRef = useRef(0);

  const wingFlutter = (depth: number) => {
    void animate(wingBeatRot, [0, depth, depth * 0.2, depth * 0.65, 0], {
      duration: 0.5,
      ease: "easeOut",
    });
  };

  useEffect(() => {
    const prev = prevPoseRef.current;
    prevPoseRef.current = pose;
    if (reduceMotion || pose !== "tryagain" || prev === "tryagain") return;
    // Sympathetic flinch/ruffle before settling into the encouraging pose.
    const opts = { duration: 0.55, ease: "easeOut" as const };
    void animate(beatRot, [0, -5, 4, -2.5, 0], opts);
    void animate(beatX, [0, -2.5, 2.5, -1, 0], opts);
    void animate(beatScaleY, [1, 0.95, 1.02, 1], opts);
    wingFlutter(22);
    blinkNow.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose, reduceMotion]);

  const handlePoke = () => {
    if (reduceMotion) return;
    const now = performance.now();
    if (now - pokeCooldownRef.current < 650) return;
    pokeCooldownRef.current = now;
    const opts = { duration: 0.55, ease: "easeOut" as const };
    void animate(beatScale, [1, 0.93, 1.06, 0.985, 1], opts);
    void animate(beatRot, [0, 0, -4, 3, 0], opts);
    wingFlutter(30);
    blinkNow.current();
    // A surprised little beak pop (skipped while the voice drives the beak).
    if (!talking) {
      void animate(beakOpen, [beakOpen.get(), 0.85, p.beakOpen], {
        duration: 0.45,
        ease: "easeOut",
      });
    }
  };

  // ── Funny-idle wing effects (real wing flaps on the jump, etc.) ──────────
  useEffect(() => {
    if (!effect || reduceMotion) return;
    if (effect.kind === "flap") {
      void animate(wingBeatRot, [0, 72, 12, 62, 8, 42, 0], {
        duration: 0.9,
        ease: "easeInOut",
      });
    } else if (effect.kind === "spread") {
      void animate(wingBeatRot, [0, 78, 78, 0], {
        duration: 1.05,
        times: [0, 0.25, 0.7, 1],
        ease: "easeInOut",
      });
    } else {
      void animate(wingBeatRot, [0, 26, 0, 26, 0], { duration: 0.55, ease: "easeInOut" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect?.id, effect?.kind, reduceMotion]);

  // ── Transform templates (explicit viewBox-coordinate pivots) ─────────────
  const beatSY = useTransform<number, number>([beatScale, beatScaleY], ([s, sy]) => s * sy);
  const beatTpl = useMotionTemplate`translate(${beatX} 0) translate(100 160) scale(${beatScale} ${beatSY}) rotate(${beatRot}) translate(-100 -160)`;
  const breathTpl = useMotionTemplate`translate(100 196) scale(1 ${breath}) translate(-100 -196)`;
  const tailTpl = useMotionTemplate`rotate(${tailRot} 142 152)`;
  const bodyTpl = useMotionTemplate`translate(100 194) scale(1 ${bodyScaleY}) translate(-100 -194)`;
  const wingLTotal = useTransform<number, number>([wingLRot, wingBeatRot], ([a, b]) => a + b);
  const wingRTotal = useTransform<number, number>([wingRRot, wingBeatRot], ([a, b]) => a + b);
  const wingLTpl = useMotionTemplate`translate(${wingLX} ${wingLY}) rotate(${wingLTotal} 57 110)`;
  const wingRTpl = useMotionTemplate`translate(${wingRX} ${wingRY}) rotate(${wingRTotal} 57 110)`;
  const headTpl = useMotionTemplate`translate(0 ${headY}) rotate(${headRot} 100 108)`;
  const browLTpl = useMotionTemplate`translate(0 ${browLY}) rotate(${browLRot} 76 58)`;
  const browRTpl = useMotionTemplate`translate(0 ${browRY}) rotate(${browRRot} 124 58)`;
  const eyesTpl = useMotionTemplate`translate(100 79) scale(${eyeScale}) translate(-100 -79)`;
  const pupilTpl = useMotionTemplate`translate(${pupilTX} ${pupilTY})`;
  const lidLTpl = useMotionTemplate`translate(80 64.5) scale(1 ${lidScale}) translate(-80 -64.5)`;
  const lidRTpl = useMotionTemplate`translate(120 64.5) scale(1 ${lidScale}) translate(-120 -64.5)`;
  const mouthTpl = useMotionTemplate`translate(100 100) scale(1 ${mouthScaleY}) translate(-100 -100)`;
  const jawTpl = useMotionTemplate`rotate(${jawRot} 91 102)`;
  const upperBeakTpl = useMotionTemplate`rotate(${upperBeakRot} 100 74)`;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 200 200"
      className={className}
      onPointerDown={handlePoke}
      role="presentation"
      focusable="false"
    >
      <defs>
        <linearGradient id="bolo-teal" x1="0" y1="30" x2="0" y2="196" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.tealLight} />
          <stop offset="0.55" stopColor={C.teal} />
          <stop offset="1" stopColor={C.tealDark} />
        </linearGradient>
        <linearGradient id="bolo-indigo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.indigoLight} />
          <stop offset="1" stopColor={C.indigoDark} />
        </linearGradient>
        <linearGradient id="bolo-beak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.coralLight} />
          <stop offset="1" stopColor={C.coralDark} />
        </linearGradient>
        {/* Soft top-left sheen that fakes the airbrushed 3D shading of the
            original PNG art (flat vectors read as stickers without it). */}
        <radialGradient id="bolo-sheen" cx="0.38" cy="0.28" r="0.75">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.05" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Beat layer, poke squash / flinch shake for the whole character */}
      <TG tpl={beatTpl}>
        {/* Breathing layer, subtle bottom-anchored swell */}
        <TG tpl={breathTpl}>
          {/* Tail, indigo feathers behind the body, lower right */}
          <TG tpl={tailTpl}>
            <path
              d="M140 150 C 168 148, 186 162, 190 184 C 178 178, 166 180, 156 174 Z"
              fill="url(#bolo-indigo)"
              stroke={C.indigoShade}
              strokeWidth="2"
              strokeOpacity="0.35"
              strokeLinejoin="round"
            />
            <path
              d="M138 156 C 162 158, 176 172, 178 190 C 166 183, 154 184, 146 176 Z"
              fill={C.indigo}
              stroke={C.indigoShade}
              strokeWidth="2"
              strokeOpacity="0.35"
              strokeLinejoin="round"
            />
          </TG>

          {/* Body, plump teal pear (scaleY carries the cheer stretch) */}
          <TG tpl={bodyTpl}>
            <ellipse
              cx="100"
              cy="140"
              rx="53"
              ry="55"
              fill="url(#bolo-teal)"
              stroke={C.tealShade}
              strokeWidth="3"
              strokeOpacity="0.22"
            />
            <ellipse cx="100" cy="140" rx="53" ry="55" fill="url(#bolo-sheen)" />
            {/* Chest scallops, soft darker feather arcs */}
            <g stroke={C.tealDark} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.4">
              <path d="M84 128 q 8 8 16 0 q 8 8 16 0" />
              <path d="M78 146 q 8 8 15 0 q 7 8 14 0 q 7 8 15 0" />
              <path d="M86 164 q 7 7 14 0 q 7 7 14 0" />
            </g>
          </TG>

          {/* Feet, chunky coral three-toe feet (fat overlapping toes on a
              rounded pad, like the plush PNG feet) */}
          <g stroke={C.coralShade} strokeWidth="1.8" strokeOpacity="0.35">
            <g fill={C.coral}>
              <ellipse cx="77" cy="188.5" rx="11.5" ry="6.5" />
              <ellipse cx="67" cy="192" rx="7.5" ry="6" />
              <ellipse cx="77" cy="194" rx="7.5" ry="6.2" />
              <ellipse cx="87" cy="192" rx="7" ry="5.8" />
            </g>
            <g fill={C.coral}>
              <ellipse cx="123" cy="188.5" rx="11.5" ry="6.5" />
              <ellipse cx="113" cy="192" rx="7" ry="5.8" />
              <ellipse cx="123" cy="194" rx="7.5" ry="6.2" />
              <ellipse cx="133" cy="192" rx="7.5" ry="6" />
            </g>
          </g>

          {/* Right wing (mirrored group), folded on the body at rest */}
          <g transform="translate(200 0) scale(-1 1)">
            <TG tpl={wingRTpl}>
              <Wing />
            </TG>
          </g>

          {/* Head, carries crest, face, eyes, and beak */}
          <TG tpl={headTpl}>
            {/* Crest, lush indigo pompadour: fat overlapping curls swooping
                up and to the right, matching the PNG tuft */}
            <g fill="url(#bolo-indigo)" stroke={C.indigoShade} strokeWidth="2" strokeOpacity="0.25" strokeLinejoin="round">
              <path d="M90 44 C 78 32, 78 12, 96 5 C 88 17, 90 30, 98 42 Z" />
              <path d="M95 40 C 95 16, 110 2, 128 6 C 113 14, 107 27, 108 44 Z" />
              <path d="M106 44 C 113 24, 130 16, 145 23 C 131 27, 122 36, 119 50 Z" />
              <path d="M114 48 C 124 36, 138 34, 148 41 C 137 43, 129 49, 125 58 Z" />
            </g>

            {/* Head ball */}
            <circle cx="100" cy="78" r="47" fill="url(#bolo-teal)" stroke={C.tealShade} strokeWidth="3" strokeOpacity="0.22" />
            <circle cx="100" cy="78" r="47" fill="url(#bolo-sheen)" />

            {/* Cheeks, rosy blush tucked under the outer eye corners */}
            <ellipse cx="66" cy="95" rx="9" ry="7" fill={C.blush} opacity="0.9" />
            <ellipse cx="134" cy="95" rx="9" ry="7" fill={C.blush} opacity="0.9" />

            {/* Brows */}
            <TG tpl={browLTpl}>
              <path
                d="M70 59.5 Q 77 55 84 57.5"
                stroke={C.brow}
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
            </TG>
            <TG tpl={browRTpl}>
              <path
                d="M116 57.5 Q 123 55 130 59.5"
                stroke={C.brow}
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
            </TG>

            {/* Eyes */}
            <TG tpl={eyesTpl}>
              {([80, 120] as const).map((ex) => (
                <g key={ex}>
                  <ellipse cx={ex} cy="79" rx="13.5" ry="14.5" fill="#FFFFFF" />
                  {/* Pupils: pose glance + cursor tracking (shared template) */}
                  <TG tpl={pupilTpl}>
                    {/* Big navy iris nearly filling the eye, like the PNG */}
                    <circle cx={ex} cy="79.5" r="10" fill={C.eyeNavy} />
                    <circle cx={ex} cy="80" r="5.4" fill={C.pupil} />
                    <circle cx={ex - 3.2} cy="75.2" r="3.1" fill="#FFFFFF" />
                    <circle cx={ex + 2.8} cy="83.4" r="1.5" fill="#FFFFFF" opacity="0.9" />
                  </TG>
                  {/* Eyelid, teal shutter that closes from the top */}
                  <TG tpl={ex === 80 ? lidLTpl : lidRTpl}>
                    <ellipse cx={ex} cy="79" rx="14.2" ry="15.2" fill={C.teal} />
                  </TG>
                </g>
              ))}
            </TG>

            {/* Beak, upper hook, animated jaw, mouth interior */}
            <g>
              {/* Mouth interior (revealed as the jaw opens) */}
              <TG tpl={mouthTpl}>
                <ellipse cx="100" cy="106" rx="8" ry="7" fill={C.mouth} />
                <ellipse cx="100" cy="110" rx="4.2" ry="2.4" fill={C.tongue} />
              </TG>
              {/* Lower jaw */}
              <TG tpl={jawTpl}>
                <path
                  d="M89 102 C 92 111, 108 111, 111 102 C 109 111, 105 116, 100 116.5 C 95 116, 91 111, 89 102 Z"
                  fill={C.coralDark}
                  stroke={C.coralShade}
                  strokeWidth="1.5"
                  strokeOpacity="0.4"
                />
              </TG>
              {/* Upper beak, plump rounded hook, wide between the eyes and
                  curling to a soft tip above the mouth (not a long droop) */}
              <TG tpl={upperBeakTpl}>
                <path
                  d="M86 79 C 87 68, 113 68, 114 79 C 118 89, 113 99, 101 105 C 92 100, 86 90, 86 79 Z"
                  fill="url(#bolo-beak)"
                  stroke={C.coralShade}
                  strokeWidth="2"
                  strokeOpacity="0.3"
                  strokeLinejoin="round"
                />
                {/* soft highlight + nostril */}
                <ellipse cx="95" cy="79" rx="4.6" ry="6" fill="#FFFFFF" opacity="0.28" />
                <circle cx="107" cy="81" r="1.5" fill={C.coralShade} opacity="0.7" />
              </TG>
            </g>
          </TG>

          {/* Left wing, in front so it can reach the chin when thinking */}
          <TG tpl={wingLTpl}>
            <Wing />
          </TG>
        </TG>
      </TG>
    </svg>
  );
}

/**
 * One wing, drawn hanging at rest (shoulder at ~(57,110), scalloped feather
 * tips at the bottom). Positive rotation around the shoulder raises it outward.
 */
function Wing() {
  return (
    <g>
      <path
        d="M57 108
           C 40 112, 29 128, 30 148
           C 29 160, 32 170, 39 175
           C 40 167, 42 161, 45 157
           C 45 168, 49 176, 56 178
           C 56 169, 57 163, 60 158
           C 61 168, 66 174, 72 174
           C 71 166, 72 160, 74 155
           C 77 162, 82 164, 85 158
           C 86 141, 81 121, 67 110
           C 63 107, 60 107, 57 108 Z"
        fill="url(#bolo-indigo)"
        stroke={C.indigoShade}
        strokeWidth="2.5"
        strokeOpacity="0.3"
        strokeLinejoin="round"
      />
      <g stroke={C.indigoLight} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5">
        <path d="M49 122 C 42 132, 40 146, 42 162" />
        <path d="M59 119 C 54 132, 53 147, 56 164" />
        <path d="M69 120 C 66 132, 66 146, 69 160" />
      </g>
    </g>
  );
}
