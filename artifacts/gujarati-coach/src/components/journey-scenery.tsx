// Journey map scenery: per-zone landmark vistas for the fare-zone postcards,
// small trackside doodads along the serpentine rail, and festival bunting for
// the terminus. Everything here is hand-coded inline SVG in the brand palette
// plus the active line's accent — no raster artwork, nothing generated.
//
// The six vistas are keyed by ZONE INDEX (the six categories are fixed across
// all languages), so every line gets a thematic scene: gateway arch
// (Greetings), family homes (Family), clock tower (Numbers), chai stall
// (Food), bazaar street (Everyday Words), festival palace (Feelings finale).

const AMBER = "#f59e0b";
const LEAF = "#10b981";
const LEAF2 = "#34d399";
const TRUNK = "#92400e";
const SLATE = "#64748b";
const CLOUD = "#cbd5e1";
const PINK = "#ec4899";

function Cloud({ x, y, s = 1, fill = "#ffffff", o = 0.85 }: { x: number; y: number; s?: number; fill?: string; o?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill} opacity={o}>
      <ellipse cx={0} cy={0} rx={10} ry={5} />
      <ellipse cx={8} cy={-2} rx={7} ry={4} />
      <ellipse cx={-8} cy={-2} rx={6} ry={3.5} />
    </g>
  );
}

function Birds({ x, y }: { x: number; y: number }) {
  return (
    <g stroke="#475569" strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.7}>
      <path d={`M${x} ${y} q2.5 -3 5 0 q2.5 -3 5 0`} />
      <path d={`M${x + 13} ${y - 5} q2 -2.5 4 0 q2 -2.5 4 0`} />
    </g>
  );
}

function Sun({ x = 206, y = 13 }: { x?: number; y?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={7} fill={AMBER} opacity={0.9} />
      <circle cx={x} cy={y} r={10} fill="none" stroke={AMBER} strokeWidth={1} opacity={0.4} strokeDasharray="2 3" />
    </g>
  );
}

function Burst({ x, y, r, ink }: { x: number; y: number; r: number; ink: string }) {
  const rays = [0, 60, 120, 180, 240, 300];
  return (
    <g stroke={ink} strokeWidth={1.6} strokeLinecap="round" opacity={0.85}>
      {rays.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={x + Math.cos(rad) * (r * 0.45)}
            y1={y + Math.sin(rad) * (r * 0.45)}
            x2={x + Math.cos(rad) * r}
            y2={y + Math.sin(rad) * r}
          />
        );
      })}
      <circle cx={x} cy={y} r={1.4} fill={ink} stroke="none" />
    </g>
  );
}

function House({ x, w, h, body, roof, o = 1 }: { x: number; w: number; h: number; body: string; roof: string; o?: number }) {
  return (
    <g opacity={o}>
      <rect x={x} y={56 - h} width={w} height={h} fill={body} />
      <path d={`M${x - 3} ${56 - h} h${w + 6} l-${w / 2 + 3} -11 Z`} fill={roof} />
      <rect x={x + w / 2 - 3} y={56 - h + 5} width={6} height={6} rx={1} fill="#ffffff" opacity={0.9} />
    </g>
  );
}

function Ground({ a }: { a: string }) {
  return <rect x={0} y={54.5} width={240} height={1.5} fill={a} opacity={0.5} />;
}

/** Zone 1 — Greetings & Manners: a welcoming city gateway arch. */
function GatewayScene({ a }: { a: string }) {
  return (
    <g>
      <Sun />
      <Cloud x={40} y={14} />
      <Birds x={158} y={17} />
      <rect x={92} y={18} width={10} height={38} rx={2} fill={a} opacity={0.9} />
      <rect x={138} y={18} width={10} height={38} rx={2} fill={a} opacity={0.9} />
      <rect x={86} y={12} width={68} height={7} rx={2} fill={a} opacity={0.75} />
      <path d="M102 56 V38 Q120 22 138 38 V56" fill="none" stroke={a} strokeWidth={5} opacity={0.85} />
      <line x1={120} y1={12} x2={120} y2={3} stroke={TRUNK} strokeWidth={1.5} />
      <path d="M120 3 l9 3 -9 3 Z" fill={AMBER} />
      <ellipse cx={68} cy={54} rx={10} ry={5} fill={LEAF} opacity={0.85} />
      <ellipse cx={172} cy={54} rx={12} ry={5.5} fill={LEAF2} opacity={0.85} />
      <Ground a={a} />
    </g>
  );
}

/** Zone 2 — Family: a huddle of little homes with a shade tree. */
function HomesScene({ a }: { a: string }) {
  return (
    <g>
      <Sun x={210} y={12} />
      <Cloud x={56} y={12} />
      <House x={62} w={32} h={22} body={a} roof={TRUNK} o={0.85} />
      <House x={104} w={36} h={28} body={AMBER} roof={a} o={0.9} />
      <House x={150} w={30} h={20} body={a} roof={TRUNK} o={0.55} />
      {/* chimney smoke */}
      <g fill={CLOUD} opacity={0.6}>
        <circle cx={132} cy={20} r={2.5} />
        <circle cx={136} cy={15} r={3} />
      </g>
      <rect x={196} y={42} width={4} height={14} fill={TRUNK} opacity={0.9} />
      <circle cx={198} cy={36} r={9} fill={LEAF} opacity={0.9} />
      <circle cx={192} cy={40} r={5.5} fill={LEAF2} opacity={0.85} />
      <Ground a={a} />
    </g>
  );
}

/** Zone 3 — Numbers 1-10: the town clock tower. */
function ClockTowerScene({ a }: { a: string }) {
  return (
    <g>
      <Cloud x={44} y={14} />
      <Birds x={180} y={14} />
      <rect x={78} y={38} width={30} height={18} fill={a} opacity={0.4} />
      <rect x={134} y={42} width={30} height={14} fill={a} opacity={0.3} />
      <rect x={110} y={12} width={20} height={44} rx={2} fill={a} opacity={0.9} />
      <path d="M108 12 h24 l-12 -9 Z" fill={a} opacity={0.75} />
      <circle cx={120} cy={25} r={7} fill="#ffffff" opacity={0.95} />
      <g stroke={a} strokeWidth={1.6} strokeLinecap="round">
        <line x1={120} y1={25} x2={120} y2={20.5} />
        <line x1={120} y1={25} x2={123.5} y2={26.5} />
      </g>
      <line x1={120} y1={3} x2={120} y2={-2} stroke={SLATE} strokeWidth={1} />
      <path d="M120 -2 l7 2.5 -7 2.5 Z" fill={LEAF} transform="translate(0 4)" />
      <ellipse cx={62} cy={54} rx={9} ry={4.5} fill={LEAF2} opacity={0.85} />
      <Ground a={a} />
    </g>
  );
}

/** Zone 4 — Food & Eating: the chai stall, steam rising. */
function ChaiStallScene({ a }: { a: string }) {
  const stripes = [0, 1, 2, 3, 4, 5];
  return (
    <g>
      <Sun x={40} y={13} />
      <Cloud x={196} y={14} s={0.9} />
      {/* awning */}
      {stripes.map((i) => (
        <rect key={i} x={82 + i * 13} y={18} width={13} height={11} fill={i % 2 === 0 ? AMBER : "#ffffff"} opacity={0.95} />
      ))}
      <rect x={80} y={16} width={82} height={3} rx={1.5} fill={a} opacity={0.8} />
      {/* counter + posts */}
      <rect x={86} y={36} width={70} height={20} rx={1} fill={a} opacity={0.85} />
      <rect x={83} y={29} width={3} height={27} fill={TRUNK} />
      <rect x={156} y={29} width={3} height={27} fill={TRUNK} />
      {/* kettle + cups + steam */}
      <circle cx={104} cy={33} r={4.5} fill={SLATE} />
      <rect x={99} y={31} width={2.5} height={2} fill={SLATE} />
      <rect x={118} y={31} width={5} height={5} rx={1} fill="#ffffff" opacity={0.95} />
      <rect x={128} y={31} width={5} height={5} rx={1} fill="#ffffff" opacity={0.95} />
      <g stroke={CLOUD} strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.9}>
        <path d="M104 25 q-2 -3 0 -6 q2 -3 0 -5" />
        <path d="M121 28 q-1.5 -2.5 0 -5" />
      </g>
      <ellipse cx={186} cy={54} rx={11} ry={5} fill={LEAF} opacity={0.85} />
      <Ground a={a} />
    </g>
  );
}

/** Zone 5 — Everyday Words: bazaar stalls under a pennant string. */
function BazaarScene({ a }: { a: string }) {
  const stall = (x: number, canopy: string) => (
    <g key={x}>
      <path d={`M${x} 30 h30 l-4 9 h-22 Z`} fill={canopy} opacity={0.9} />
      <line x1={x + 3} y1={39} x2={x + 3} y2={56} stroke={TRUNK} strokeWidth={2.5} />
      <line x1={x + 27} y1={39} x2={x + 27} y2={56} stroke={TRUNK} strokeWidth={2.5} />
      <rect x={x + 6} y={44} width={18} height={8} rx={1} fill={a} opacity={0.35} />
    </g>
  );
  // pennant string
  const flags = [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84];
  const colors = [a, AMBER, LEAF, PINK];
  const px = (t: number) => 30 + t * 180;
  const py = (t: number) => 10 + 4 * Math.sin(Math.PI * t) + 8 * t * (1 - t);
  return (
    <g>
      <path d="M30 10 Q120 22 210 10" fill="none" stroke={SLATE} strokeWidth={1} opacity={0.7} />
      {flags.map((t, i) => (
        <path
          key={t}
          d={`M${px(t) - 3.2} ${py(t)} L${px(t) + 3.2} ${py(t)} L${px(t)} ${py(t) + 7.5} Z`}
          fill={colors[i % colors.length]}
          opacity={0.9}
        />
      ))}
      {stall(52, a)}
      {stall(105, LEAF)}
      {stall(158, AMBER)}
      <Ground a={a} />
    </g>
  );
}

/** Zone 6 — Feelings, the festival-city finale: palace domes and fireworks. */
function FestivalScene({ a }: { a: string }) {
  return (
    <g>
      <Burst x={52} y={14} r={9} ink={AMBER} />
      <Burst x={188} y={12} r={11} ink={PINK} />
      <Burst x={212} y={30} r={7} ink={LEAF} />
      {/* palace base */}
      <rect x={88} y={40} width={64} height={16} rx={1} fill={a} opacity={0.85} />
      {/* central onion dome */}
      <path d="M106 40 Q106 26 120 22 Q134 26 134 40 Z" fill={a} opacity={0.95} />
      <line x1={120} y1={22} x2={120} y2={15} stroke={a} strokeWidth={2} />
      <circle cx={120} cy={13.5} r={2} fill={AMBER} />
      {/* side chhatris */}
      <g opacity={0.75}>
        <path d="M88 34 q8 -8 16 0 Z" fill={a} />
        <line x1={91} y1={34} x2={91} y2={40} stroke={a} strokeWidth={2} />
        <line x1={101} y1={34} x2={101} y2={40} stroke={a} strokeWidth={2} />
        <path d="M136 34 q8 -8 16 0 Z" fill={a} />
        <line x1={139} y1={34} x2={139} y2={40} stroke={a} strokeWidth={2} />
        <line x1={149} y1={34} x2={149} y2={40} stroke={a} strokeWidth={2} />
      </g>
      <ellipse cx={64} cy={54} rx={10} ry={5} fill={LEAF} opacity={0.85} />
      <ellipse cx={178} cy={54} rx={10} ry={5} fill={LEAF2} opacity={0.85} />
      <Ground a={a} />
    </g>
  );
}

const SCENES = [GatewayScene, HomesScene, ClockTowerScene, ChaiStallScene, BazaarScene, FestivalScene] as const;

/** Postcard picture side: accent-tinted sky + the zone's landmark scene.
 *  Grayscale for locked showroom zones comes free from the postcard's
 *  wrapping `grayscale` filter. */
export function ZoneVista({ zoneIndex, accent }: { zoneIndex: number; accent: string }) {
  const Scene = SCENES[zoneIndex] ?? GatewayScene;
  return (
    <div
      className="relative h-14 w-full overflow-hidden"
      style={{ background: `linear-gradient(to bottom, ${accent}2e, ${accent}0a)` }}
      aria-hidden
    >
      {/* `meet` (not `slice`): the band is wider than the 240-unit scene, and
          slice-filling the width crops the top of tall landmarks (clock cap,
          awning, pennants). Centered at full height, gradient fills the sides. */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 240 56" preserveAspectRatio="xMidYMax meet">
        <Scene a={accent} />
      </svg>
    </div>
  );
}

/** Small trackside scene beside a station row (rendered inside the map SVG,
 *  anchored at ground level — draws upward from y=0). Variant cycles with the
 *  global station index. Locked showroom zones gray out via CSS filter. */
export function TracksideDoodad({
  variant,
  x,
  y,
  accent,
  gray,
}: {
  variant: number;
  x: number;
  y: number;
  accent: string;
  gray: boolean;
}) {
  const v = ((variant % 6) + 6) % 6;
  let art: React.ReactNode;
  if (v === 0) {
    // shade tree
    art = (
      <g>
        <rect x={-2} y={-14} width={4} height={14} rx={1} fill={TRUNK} />
        <circle cx={0} cy={-20} r={9} fill={LEAF} />
        <circle cx={7} cy={-15} r={6} fill={LEAF2} opacity={0.9} />
        <circle cx={-7} cy={-15} r={5.5} fill={LEAF2} opacity={0.8} />
      </g>
    );
  } else if (v === 1) {
    // drifting cloud + birds
    art = (
      <g>
        <Cloud x={0} y={-26} fill={CLOUD} o={0.8} />
        <Birds x={-10} y={-11} />
      </g>
    );
  } else if (v === 2) {
    // railway signal
    art = (
      <g>
        <rect x={-1.5} y={-26} width={3} height={26} fill={SLATE} />
        <rect x={-5} y={-38} width={10} height={14} rx={2} fill="#334155" />
        <circle cx={0} cy={-34} r={2.6} fill="#ef4444" />
        <circle cx={0} cy={-28} r={2.6} fill="#22c55e" />
      </g>
    );
  } else if (v === 3) {
    // bushes + accent milestone
    art = (
      <g>
        <ellipse cx={-8} cy={-4} rx={8} ry={5} fill={LEAF} />
        <ellipse cx={3} cy={-3} rx={6} ry={4} fill={LEAF2} />
        <rect x={10} y={-11} width={9} height={11} rx={2.5} fill="#ffffff" stroke={SLATE} strokeWidth={1} />
        <rect x={10} y={-11} width={9} height={5} rx={2.5} fill={accent} />
      </g>
    );
  } else if (v === 4) {
    // wayside hut
    art = (
      <g>
        <rect x={-10} y={-14} width={20} height={14} fill={AMBER} opacity={0.8} />
        <path d="M-13 -14 h26 l-13 -9 Z" fill={TRUNK} />
        <rect x={-3} y={-8} width={6} height={8} fill="#7c2d12" />
      </g>
    );
  } else {
    // telegraph pole with drooping wires
    art = (
      <g>
        <rect x={-1.5} y={-30} width={3} height={30} fill={TRUNK} opacity={0.85} />
        <rect x={-8} y={-28} width={16} height={2.5} rx={1} fill={TRUNK} opacity={0.85} />
        <rect x={-6} y={-23} width={12} height={2.5} rx={1} fill={TRUNK} opacity={0.85} />
        <g stroke={SLATE} strokeWidth={1} fill="none" opacity={0.6}>
          <path d="M-8 -27 q-8 6 -14 7" />
          <path d="M8 -27 q8 6 14 7" />
        </g>
      </g>
    );
  }
  return (
    <g
      transform={`translate(${x} ${y})`}
      style={gray ? { filter: "grayscale(1)", opacity: 0.45 } : undefined}
      aria-hidden
    >
      {art}
    </g>
  );
}

/** Festival bunting strung across the map above the terminus. */
export function Bunting({ x1, x2, y, accent }: { x1: number; x2: number; y: number; accent: string }) {
  const colors = [accent, AMBER, LEAF, "#4f46e5", PINK];
  const cx = (x1 + x2) / 2;
  const sag = 14;
  const flags = [0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.88];
  const at = (t: number) => {
    const mt = 1 - t;
    return {
      x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
      y: mt * mt * y + 2 * mt * t * (y + sag * 2) + t * t * y,
    };
  };
  return (
    <g aria-hidden>
      <path d={`M${x1} ${y} Q${cx} ${y + sag * 2} ${x2} ${y}`} fill="none" stroke={SLATE} strokeWidth={1.2} opacity={0.7} />
      {flags.map((t, i) => {
        const p = at(t);
        return (
          <path
            key={t}
            d={`M${p.x - 4} ${p.y} L${p.x + 4} ${p.y} L${p.x} ${p.y + 9} Z`}
            fill={colors[i % colors.length]}
            opacity={0.9}
          />
        );
      })}
    </g>
  );
}
