// Journey map scenery: per-zone landmark vistas for the fare-zone postcards,
// India-flavored dimensional trackside scenery along the serpentine rail
// (zone-themed, Task 985), and festival bunting for the terminus. Everything
// here is hand-coded inline SVG in the brand palette plus the active line's
// accent, no raster artwork, nothing generated.
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

// ---------------------------------------------------------------------------
// India-flavored trackside scenery (Task 985): a dimensional FLAT set — every
// asset shows a front face plus a right-hand face in exactly ONE darker
// palette step (its shade tone), lit from a single shared upper-left light,
// standing on a soft ground-contact ellipse. Purely decorative: no tap
// targets, no motion, always visually subordinate to stations, postcards,
// the train, Bolo, and the rail comet.
// ---------------------------------------------------------------------------

const INK = "#0f172a"; // ground shadows + wheel rubber
const AMBER_SHADE = "#b45309"; // darker step of AMBER
const LEAF_SHADE = "#047857"; // darker step of LEAF
const TRUNK_SHADE = "#713f12"; // darker step of TRUNK
const SLATE_SHADE = "#475569"; // darker step of SLATE
const INDIGO = "#5048e5"; // brand primary ink (crossing crossbuck trim)
const TEAL = "#0d9488"; // brand secondary (crossing hardware)
const SIGNAL_RED = "#ef4444"; // crossing stop lamp + gate-arm stripes
// Signal polish item 2: lamp-only fills, a step brighter and more saturated
// than the scenery AMBER/LEAF so the three states read at a glance on the map.
const SIGNAL_AMBER = "#ffb300"; // waved lamp
const SIGNAL_GREEN = "#22c55e"; // cleared lamp
const PINK_SHADE = "#be185d"; // darker step of PINK
const STONE = "#e7e5e4"; // cow hide
const STONE_SHADE = "#a8a29e"; // darker step of STONE
const RIVER = "#7dd3fc"; // ghat water

/** Shared ground-contact ellipse: every scenery element sits on one. The
 *  center shifts slightly right (down-light from upper-left), matching the
 *  --depth-shadow-* CSS tokens and DEPTH_2_5D in lib/motion.tsx. */
export const SCENERY_GROUND_SHADOW = { dx: 2, ryRatio: 0.24, opacity: 0.13 } as const;

function GroundShadow({ rx, cx = 0 }: { rx: number; cx?: number }) {
  return (
    <ellipse
      cx={cx + SCENERY_GROUND_SHADOW.dx}
      cy={1.2}
      rx={rx}
      ry={Math.max(2.2, rx * SCENERY_GROUND_SHADOW.ryRatio)}
      fill={INK}
      opacity={SCENERY_GROUND_SHADOW.opacity}
    />
  );
}

/** Auto-rickshaw: green cabin, amber canopy, parked. */
function TukTuk() {
  return (
    <g>
      <GroundShadow rx={17} />
      {/* cabin side face (right, shaded) */}
      <path d="M8 -3.2 l4.5 -1.4 v-14.4 l-4.5 -1.8 Z" fill={LEAF_SHADE} />
      {/* cabin front face */}
      <rect x={-13} y={-20.8} width={21} height={17.6} rx={2.5} fill={LEAF} />
      {/* canopy front + side */}
      <rect x={-15} y={-27} width={25} height={6.4} rx={2} fill={AMBER} />
      <path d="M10 -26.6 l4 1.4 v4.6 l-4 -0.2 Z" fill={LEAF_SHADE} />
      {/* windshield */}
      <rect x={-10.5} y={-18.6} width={8} height={6.6} rx={1} fill="#ffffff" opacity={0.92} />
      {/* wheels: rear-right first so the front pair overlaps it */}
      <circle cx={11} cy={-2.6} r={2.6} fill={SLATE_SHADE} />
      <circle cx={-6.5} cy={-1.8} r={3.2} fill={INK} opacity={0.8} />
      <circle cx={5.5} cy={-1.8} r={3.2} fill={INK} opacity={0.8} />
      {/* headlight */}
      <circle cx={-12.8} cy={-11.5} r={1.5} fill="#fef9c3" />
    </g>
  );
}

/** Standing zebu cow: stone hide, shoulder hump, gentle horns. */
function CowStanding() {
  return (
    <g>
      <GroundShadow rx={15} />
      {/* legs (far pair sits in the shade tone) */}
      <rect x={-6.2} y={-8} width={2.2} height={8} rx={1} fill={STONE_SHADE} />
      <rect x={5.2} y={-8} width={2.2} height={8} rx={1} fill={STONE_SHADE} />
      <rect x={-8.6} y={-8} width={2.2} height={8} rx={1} fill={STONE} />
      <rect x={2.8} y={-8} width={2.2} height={8} rx={1} fill={STONE} />
      {/* body + zebu hump */}
      <rect x={-10} y={-16.5} width={20.5} height={10} rx={4.5} fill={STONE} />
      <path d="M1 -16.2 q3.4 -3.6 6.8 0 Z" fill={STONE} />
      {/* shaded hindquarter (right) */}
      <path d="M4 -16.4 q6.6 0.4 6.5 5.2 q0 4.6 -5 4.7 Z" fill={STONE_SHADE} />
      {/* tail */}
      <path d="M10.4 -14.5 q3 1.5 2.4 7.5" stroke={STONE_SHADE} strokeWidth={1.3} fill="none" strokeLinecap="round" />
      {/* head, ear, horns, muzzle */}
      <rect x={-16.5} y={-19} width={7.6} height={7} rx={2.8} fill={STONE} />
      <ellipse cx={-9.6} cy={-17.6} rx={2.4} ry={1.3} fill={STONE_SHADE} />
      <path d="M-15.8 -19.2 q-1.4 -3 1.2 -4.2 M-10.8 -19.2 q1.4 -3 -1.2 -4.2" stroke={TRUNK_SHADE} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      <rect x={-16.5} y={-14} width={4.4} height={2} rx={1} fill={PINK} opacity={0.55} />
    </g>
  );
}

/** Wooden fruit cart on one big wheel, mounded with produce. */
function FruitCart() {
  return (
    <g>
      <GroundShadow rx={16} />
      {/* handles */}
      <path d="M-13 -9.6 l-6 2.4" stroke={TRUNK} strokeWidth={1.6} strokeLinecap="round" />
      {/* bed front + side */}
      <rect x={-14} y={-12} width={24} height={5} rx={1} fill={TRUNK} />
      <path d="M10 -7 l4 -1.6 v-4.4 l-4 -1 Z" fill={TRUNK_SHADE} />
      {/* prop leg + wheel */}
      <rect x={6.4} y={-7} width={2} height={7} rx={1} fill={TRUNK_SHADE} />
      <circle cx={-6} cy={-3.4} r={4} fill="none" stroke={TRUNK_SHADE} strokeWidth={2} />
      <circle cx={-6} cy={-3.4} r={1.1} fill={TRUNK_SHADE} />
      {/* fruit mounds */}
      <circle cx={-9} cy={-13.6} r={2.4} fill={AMBER} />
      <circle cx={-4.2} cy={-14.4} r={2.4} fill={AMBER} />
      <circle cx={-6.6} cy={-17.2} r={2.2} fill={AMBER_SHADE} />
      <circle cx={1.6} cy={-13.8} r={2.3} fill={LEAF} />
      <circle cx={6.4} cy={-13.4} r={2.2} fill={PINK} />
      <circle cx={4} cy={-16.4} r={2} fill={LEAF} />
    </g>
  );
}

/** Chai stall per the token-economy spec's stall description: striped awning,
 *  wooden counter, kettle and glasses. Deliberately unmanned — the Chaiwala
 *  character (separate task) steps in behind this counter later. */
function ChaiStall() {
  return (
    <g>
      <GroundShadow rx={18} />
      {/* posts */}
      <rect x={-14} y={-21} width={2} height={21} fill={TRUNK} />
      <rect x={10.5} y={-21} width={2} height={21} fill={TRUNK} />
      {/* counter front + side */}
      <rect x={-13} y={-13} width={24} height={9.5} rx={1} fill={TRUNK} />
      <path d="M11 -3.5 l4 -1.7 v-7.6 l-4 -0.7 Z" fill={AMBER_SHADE} />
      {/* counter skirt panel */}
      <rect x={-11} y={-11} width={20} height={5.5} rx={1} fill={AMBER} opacity={0.35} />
      {/* striped awning front + side */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={-16 + i * 7} y={-26.5} width={7} height={6} fill={i % 2 === 0 ? AMBER : "#ffffff"} />
      ))}
      <path d="M12 -26.5 l3.6 1.3 v4.7 h-3.6 Z" fill={AMBER_SHADE} />
      <rect x={-16.5} y={-27.6} width={29} height={1.6} rx={0.8} fill={AMBER_SHADE} />
      {/* kettle + glasses (steam wisp deferred to the motion pass) */}
      <circle cx={-6} cy={-15.4} r={2.8} fill={SLATE} />
      <rect x={-10.2} y={-16.6} width={2.2} height={1.6} rx={0.8} fill={SLATE} />
      <rect x={1} y={-16} width={3} height={3} rx={0.8} fill="#ffffff" opacity={0.95} />
      <rect x={5.6} y={-16} width={3} height={3} rx={0.8} fill="#ffffff" opacity={0.95} />
    </g>
  );
}

/** Roadside temple: curved shikhara over a small sanctum, accent pennant. */
function TempleSilhouette({ accent }: { accent: string }) {
  return (
    <g>
      <GroundShadow rx={14} />
      {/* sanctum front + side */}
      <rect x={-11} y={-8.5} width={19} height={8.5} fill={AMBER} />
      <path d="M8 0 l4 -1.6 v-6.2 l-4 -0.7 Z" fill={AMBER_SHADE} />
      {/* shikhara tower, right half shaded */}
      <path d="M-7 -8.5 Q-5 -24 0 -26.5 Q5 -24 7 -8.5 Z" fill={AMBER} />
      <path d="M0 -26.5 Q5 -24 7 -8.5 L0 -8.5 Z" fill={AMBER_SHADE} />
      {/* amalaka + mast + pennant */}
      <circle cx={0} cy={-27.5} r={1.5} fill={AMBER_SHADE} />
      <line x1={0} y1={-29} x2={0} y2={-33.5} stroke={TRUNK_SHADE} strokeWidth={1.1} />
      <path d="M0 -33.5 l5.5 1.9 -5.5 1.9 Z" fill={accent} />
      {/* doorway */}
      <path d="M-4.6 0 v-4.6 q2.3 -2.2 4.6 0 V0 Z" fill={TRUNK} />
    </g>
  );
}

/** Banyan tree: broad canopy with a shaded right lobe and prop roots. */
function BanyanTree() {
  return (
    <g>
      <GroundShadow rx={14} />
      {/* prop roots + trunk */}
      <rect x={-7.4} y={-9} width={1.8} height={9} rx={0.9} fill={TRUNK} opacity={0.85} />
      <rect x={5.6} y={-8} width={1.8} height={8} rx={0.9} fill={TRUNK} opacity={0.85} />
      <path d="M-2.6 0 h5.2 l1.2 -12.5 h-7.6 Z" fill={TRUNK} />
      {/* canopy: main mass + shaded right lobe */}
      <ellipse cx={-2.5} cy={-19} rx={13} ry={8} fill={LEAF} />
      <ellipse cx={7} cy={-16} rx={8.5} ry={5.8} fill={LEAF_SHADE} />
      {/* hanging aerial root */}
      <line x1={9.5} y1={-12} x2={9.5} y2={-5.5} stroke={TRUNK} strokeWidth={1.2} opacity={0.8} />
    </g>
  );
}

/** String of marigolds (toran) sagging between two posts. */
function MarigoldString() {
  const blooms = [0.1, 0.24, 0.38, 0.5, 0.62, 0.76, 0.9];
  const x1 = -15;
  const x2 = 15;
  const yTop = -15;
  const at = (t: number) => {
    const mt = 1 - t;
    return {
      x: mt * mt * x1 + 2 * mt * t * 0 + t * t * x2,
      y: mt * mt * yTop + 2 * mt * t * (yTop + 9) + t * t * yTop,
    };
  };
  return (
    <g>
      <GroundShadow rx={4} cx={x1 + 1} />
      <GroundShadow rx={4} cx={x2 + 1} />
      {/* left post lit, right post in the shade tone (upper-left light) */}
      <rect x={x1 - 1} y={yTop} width={2.2} height={15} rx={1} fill={TRUNK} />
      <rect x={x2 - 1} y={yTop} width={2.2} height={15} rx={1} fill={TRUNK_SHADE} />
      <path d={`M${x1} ${yTop} Q0 ${yTop + 9 * 2} ${x2} ${yTop}`} fill="none" stroke={SLATE} strokeWidth={1} opacity={0.7} />
      {blooms.map((t, i) => {
        const p = at(t);
        return <circle key={t} cx={p.x} cy={p.y + 1.6} r={2.1} fill={i % 2 === 0 ? AMBER : PINK} />;
      })}
    </g>
  );
}

/** Cycle rickshaw: two spoked wheels, pink folding canopy, parked. */
function CycleRickshaw() {
  return (
    <g>
      <GroundShadow rx={15} />
      {/* wheels */}
      <circle cx={-9} cy={-4.2} r={4.4} fill="none" stroke={SLATE_SHADE} strokeWidth={1.6} />
      <circle cx={7.5} cy={-4.2} r={4.4} fill="none" stroke={SLATE_SHADE} strokeWidth={1.6} />
      <circle cx={-9} cy={-4.2} r={1} fill={SLATE_SHADE} />
      <circle cx={7.5} cy={-4.2} r={1} fill={SLATE_SHADE} />
      {/* frame + handlebar + saddle */}
      <path d="M-9 -4.2 L-3.5 -10 L2 -4.2" stroke={SLATE_SHADE} strokeWidth={1.4} fill="none" />
      <path d="M-13.5 -11.5 l3 1.8" stroke={SLATE_SHADE} strokeWidth={1.4} strokeLinecap="round" />
      <rect x={-5.6} y={-12} width={4} height={1.8} rx={0.9} fill={SLATE_SHADE} />
      {/* passenger bench front + canopy (right half shaded) */}
      <rect x={2} y={-12.5} width={12} height={8.5} rx={2} fill={PINK} />
      <path d="M14 -4 l2.5 -1.2 v-6 l-2.5 -1.3 Z" fill={PINK_SHADE} />
      <path d="M2 -13 Q8 -21.5 15 -13 Z" fill={PINK} />
      <path d="M8.5 -17.6 Q12.5 -16.6 15 -13 L8.5 -13 Z" fill={PINK_SHADE} />
    </g>
  );
}

/** River ghat: stone steps down to the water with a small wooden boat and a
 *  chhatri crowning the top step — the Varanasi-approach finale. */
function RiverGhat({ accent }: { accent: string }) {
  return (
    <g>
      <GroundShadow rx={19} />
      {/* water + ripple */}
      <rect x={-21} y={-2.6} width={17} height={2.6} rx={1.2} fill={RIVER} opacity={0.75} />
      <path d="M-18 -1.2 q2 -1 4 0 q2 1 4 0" stroke="#ffffff" strokeWidth={0.8} fill="none" opacity={0.7} />
      {/* boat */}
      <path d="M-19 -3.4 h8.5 q-1.4 2.8 -4.2 2.8 q-2.9 0 -4.3 -2.8 Z" fill={TRUNK} />
      {/* steps rising rightward, right slab shaded */}
      <path d="M-4 0 v-2.7 h5 v-2.7 h5 v-2.7 h5 v-2.7 h5 V0 Z" fill={SLATE} opacity={0.9} />
      <rect x={13} y={-10.8} width={3} height={10.8} fill={SLATE_SHADE} />
      {/* chhatri on the top step */}
      <line x1={11} y1={-10.8} x2={11} y2={-14.6} stroke={SLATE_SHADE} strokeWidth={1.1} />
      <path d="M7.6 -14.6 q3.4 -3 6.8 0 Z" fill={accent} />
    </g>
  );
}

export type SceneryKind =
  | "tuktuk"
  | "cow"
  | "fruitCart"
  | "chaiStall"
  | "temple"
  | "banyan"
  | "marigolds"
  | "cycleRickshaw"
  | "ghat";

const SCENERY_ASSETS: Record<SceneryKind, (p: { accent: string }) => React.ReactNode> = {
  tuktuk: () => <TukTuk />,
  cow: () => <CowStanding />,
  fruitCart: () => <FruitCart />,
  chaiStall: () => <ChaiStall />,
  temple: ({ accent }) => <TempleSilhouette accent={accent} />,
  banyan: () => <BanyanTree />,
  marigolds: () => <MarigoldString />,
  cycleRickshaw: () => <CycleRickshaw />,
  ghat: ({ accent }) => <RiverGhat accent={accent} />,
};

/** Approximate half-width of each asset (SVG px, including its ground
 *  shadow), used by the placement geometry tests to prove no overlap with
 *  station markers, cards, postcards, or the rail at supported widths. */
export const SCENERY_HALF_W: Record<SceneryKind, number> = {
  tuktuk: 19,
  cow: 17,
  fruitCart: 20,
  chaiStall: 20,
  temple: 16,
  banyan: 16,
  marigolds: 19,
  cycleRickshaw: 18,
  ghat: 21,
};

/** Tallest asset extent above its ground line (SVG px, the temple's pennant
 *  mast), used by the placement tests to prove scenery stays inside its
 *  station row band and never bleeds into postcard rows. */
export const SCENERY_MAX_H = 40;

/** Placement anchors relative to the serpentine geometry: scenery centers in
 *  the free strip beside a station row (opposite its card), at the same edge
 *  inset and ground line the old doodads used, so future layout changes move
 *  scenery together with the stations. */
export const SCENERY_PLACEMENT = {
  /** Distance from the map edge to a scenery element's center x. */
  edgeX: 42,
  /** Ground line offset below a station row's center y. */
  groundDy: 22,
} as const;

/** Zone themes progress Delhi-urban toward Varanasi-riverine: early zones
 *  urban-weighted, middle zones market-and-town, final zones river-and-temple.
 *  Keyed by zone INDEX (fixed across all 22 lines). */
export const ZONE_SCENERY_THEMES: readonly (readonly SceneryKind[])[] = [
  ["tuktuk", "chaiStall", "banyan"],
  ["cycleRickshaw", "tuktuk", "chaiStall"],
  ["fruitCart", "cow", "marigolds"],
  ["cow", "fruitCart", "cycleRickshaw"],
  ["temple", "banyan", "marigolds"],
  ["ghat", "temple", "marigolds"],
];

/** Deterministic per-zone plan: 1-3 elements depending on how many stations
 *  the zone has, spread evenly across its station rows (`row` is the 0-based
 *  station index within the zone). Pure function of the zone layout — no
 *  per-render randomness, so screenshots and tests are stable. */
export function planZoneScenery(
  zoneIndex: number,
  stationCount: number,
): { kind: SceneryKind; row: number }[] {
  if (stationCount <= 0) return [];
  const theme = ZONE_SCENERY_THEMES[Math.min(zoneIndex, ZONE_SCENERY_THEMES.length - 1)]!;
  const count = Math.max(1, Math.min(3, Math.floor(stationCount / 3)));
  return Array.from({ length: count }, (_, i) => ({
    kind: theme[i % theme.length]!,
    row: Math.min(stationCount - 1, Math.floor(((i + 0.5) * stationCount) / count)),
  }));
}

// ---------------------------------------------------------------------------
// Chunk 6B: trackside signals and zone signposts, seated by the same planner
// so they inherit the serpentine geometry rules the scenery follows. Unlike
// scenery these are INTERACTIVE surfaces, so the journey renders them as
// absolutely positioned HTML (buttons) over the map, never inside the
// pointer-events-none scenery SVG layer.
// ---------------------------------------------------------------------------

/**
 * One trackside signal in every other inter-station gap: the gaps after
 * global stops 1, 3, 5, and so on (1-based stop numbers across the whole
 * flattened line). `afterStop` names the departed stop; `signalIndex` is the
 * signal's 0-based ordinal used for the deterministic game rotation.
 * Deterministic and pure, like planZoneScenery.
 */
export function planTracksideSignals(
  totalStations: number,
): { afterStop: number; signalIndex: number }[] {
  const out: { afterStop: number; signalIndex: number }[] = [];
  for (let stop = 1, i = 0; stop < totalStations; stop += 2, i += 1) {
    out.push({ afterStop: stop, signalIndex: i });
  }
  return out;
}

/**
 * One tappable signpost per zone (Story 5): picks a station row the zone's
 * scenery plan left free so the two never share a strip, scanning from the
 * last row backward (late rows read as "approaching the gateway"). Falls
 * back to row 0 for tiny zones where scenery occupies every row; the journey
 * hugs the map edge there so the two still cannot collide. The signpost
 * ALWAYS renders for a non-empty zone.
 */
export function planZoneSignpost(
  zoneIndex: number,
  stationCount: number,
): { row: number } | null {
  if (stationCount <= 0) return null;
  const taken = new Set(planZoneScenery(zoneIndex, stationCount).map((s) => s.row));
  for (let row = stationCount - 1; row >= 0; row -= 1) {
    if (!taken.has(row)) return { row };
  }
  return { row: 0 };
}

/** Railroad-crossing trackside signal glyph (Hotfix 3 item 2): crossbuck,
 *  lamp, and a striped gate arm on a slate post, flat playful style in the
 *  established palette. The STATE MODEL drives it: red lamp + bar DOWN while
 *  the signal is not yet cleared (active and future both render FULL COLOR,
 *  never dimmed); amber caution lamp + bar UP once waved through; green lamp
 *  + bar UP once cleared. Sized for a 32x40 button. */
export function SignalGlyph({
  state,
}: {
  state: "upcoming" | "active" | "waved" | "cleared";
}) {
  const barDown = state === "upcoming" || state === "active";
  const lamp = barDown ? SIGNAL_RED : state === "waved" ? SIGNAL_AMBER : SIGNAL_GREEN;
  // The striped gate arm, drawn pointing left from its pivot on the post.
  // The bar-up states rotate this same group about the pivot, so the arm's
  // geometry is identical in every state.
  const arm = (
    <g>
      <rect x={1} y={20.9} width={16.4} height={3} rx={1.5} fill="#ffffff" stroke={SLATE} strokeWidth={0.6} />
      <rect x={2.4} y={21.4} width={3.4} height={2} rx={0.6} fill={SIGNAL_RED} />
      <rect x={8.2} y={21.4} width={3.4} height={2} rx={0.6} fill={SIGNAL_RED} />
      <rect x={14} y={21.4} width={2.4} height={2} rx={0.6} fill={SIGNAL_RED} />
    </g>
  );
  // Signal polish item 2: rendered a step larger (was 32x40); the viewBox is
  // unchanged so the glyph geometry scales as one piece.
  return (
    <svg width={40} height={50} viewBox="0 0 32 40" aria-hidden focusable="false">
      {/* post + base */}
      <rect x={15} y={7} width={2.8} height={29} rx={1.2} fill={SLATE_SHADE} />
      <rect x={10.4} y={35.4} width={12} height={3} rx={1.5} fill={TEAL} />
      {/* crossbuck (X sign) */}
      <g transform="rotate(26 16.4 5.4)">
        <rect x={8.4} y={4} width={16} height={2.9} rx={1.45} fill="#ffffff" stroke={INDIGO} strokeWidth={1} />
      </g>
      <g transform="rotate(-26 16.4 5.4)">
        <rect x={8.4} y={4} width={16} height={2.9} rx={1.45} fill="#ffffff" stroke={INDIGO} strokeWidth={1} />
      </g>
      {/* lamp box */}
      <rect x={12.2} y={10.4} width={8.4} height={8.4} rx={2.6} fill={INK} opacity={0.85} />
      {/* RED ACTIVE blocking emphasis: amber halo ring plus a red glow behind
          the lit lamp. The attention pulse lives on the button
          (motion-safe:animate-pulse), so reduced motion suppresses it there.
          RED FUTURE gets the same full-color lamp with no halo. */}
      {state === "active" && (
        <>
          <circle cx={16.4} cy={14.6} r={6.6} fill="none" stroke={AMBER} strokeWidth={1.6} opacity={0.9} />
          <circle cx={16.4} cy={14.6} r={5.2} fill={SIGNAL_RED} opacity={0.35} />
        </>
      )}
      <circle cx={16.4} cy={14.6} r={3} fill={lamp} />
      {/* gate arm: down blocks the track, up clears it */}
      {barDown ? arm : <g transform="rotate(75 16.4 22.4)">{arm}</g>}
      {/* pivot hub */}
      <circle cx={16.4} cy={22.4} r={1.7} fill={TEAL} />
    </svg>
  );
}

/** Hotfix 3S Item 5: the Signalman — the friendly crossing keeper the copy
 *  already talks about ("the signalman kept your Chai"). Hand-drawn inline
 *  SVG in the brand palette, TrainEngine construction pattern: layered
 *  rects/circles/paths, flat playful shapes, no gradients, no raster, no AI
 *  art. Decorative only — always rendered inside an aria-hidden scene. */
const SKIN = "#f5c99b"; // signalman face/hands (warm step of the AMBER family)

export function SignalmanGlyph({ className }: { className?: string }) {
  return (
    <svg
      width={26}
      height={40}
      viewBox="0 0 26 40"
      aria-hidden
      focusable="false"
      className={className}
      data-testid="signalman-glyph"
    >
      {/* ground shadow (shared scenery convention: down-light from upper-left) */}
      <ellipse cx={13} cy={36.2} rx={8} ry={1.9} fill={INK} opacity={0.13} />
      {/* flag pole, held high — drawn first so the hand overlaps the grip */}
      <rect x={21.2} y={2.4} width={1.5} height={17} rx={0.75} fill={SLATE_SHADE} />
      {/* red pennant, pointing back toward the track */}
      <path d="M22.7 2.8 L22.7 8.8 L15.2 5.8 Z" fill={SIGNAL_RED} />
      {/* legs + boots */}
      <rect x={7.6} y={23.6} width={2.6} height={9.6} rx={1.2} fill={INK} />
      <rect x={12.2} y={23.6} width={2.6} height={9.6} rx={1.2} fill={INK} />
      <rect x={6.9} y={32.6} width={4} height={2.8} rx={1.3} fill={TRUNK_SHADE} />
      <rect x={11.5} y={32.6} width={4} height={2.8} rx={1.3} fill={TRUNK_SHADE} />
      {/* uniform jacket, belt, brass buttons */}
      <rect x={6.4} y={12.8} width={9.4} height={11} rx={3} fill={INDIGO} />
      <rect x={6.4} y={21.2} width={9.4} height={1.6} fill={TEAL} />
      <circle cx={11.1} cy={16} r={0.7} fill={AMBER} />
      <circle cx={11.1} cy={19} r={0.7} fill={AMBER} />
      {/* resting arm + hand */}
      <rect x={4.4} y={13.6} width={2.4} height={7.6} rx={1.2} fill={INDIGO} />
      <circle cx={5.6} cy={21.8} r={1.1} fill={SKIN} />
      {/* raised arm gripping the pole */}
      <path
        d="M15.2 15.2 L21.4 10"
        stroke={INDIGO}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={21.9} cy={9.6} r={1.2} fill={SKIN} />
      {/* friendly face */}
      <circle cx={11} cy={8.5} r={4.2} fill={SKIN} />
      <circle cx={9.6} cy={8.4} r={0.55} fill={INK} />
      <circle cx={12.5} cy={8.4} r={0.55} fill={INK} />
      <path
        d="M9.6 10.2 q1.4 1.3 2.9 0"
        stroke={INK}
        strokeWidth={0.8}
        strokeLinecap="round"
        fill="none"
      />
      {/* peaked cap with teal band */}
      <rect x={6.6} y={2.8} width={8.8} height={3.4} rx={1.6} fill={INDIGO} />
      <rect x={6.6} y={5.3} width={8.8} height={1.2} fill={TEAL} />
      <rect x={5.4} y={6.1} width={7.2} height={1.2} rx={0.6} fill={INDIGO} />
    </svg>
  );
}

/** Wooden signpost glyph for the zone line-fact marker: two boards on a post
 *  with a marigold at the foot. Sized for a 30x38 button. */
export function SignpostGlyph({ accent }: { accent: string }) {
  return (
    <svg width={30} height={38} viewBox="0 0 30 38" aria-hidden focusable="false">
      <rect x={13.6} y={6} width={2.8} height={28} rx={1.2} fill={TRUNK} />
      {/* boards: top points right, lower points left; right edges shaded */}
      <path d="M6 7 h16 l4 3.5 -4 3.5 h-16 Z" fill={accent} opacity={0.92} />
      <path d="M24 14 l-4 -3.5 4 -3.5 Z" fill={TRUNK_SHADE} opacity={0.5} />
      <path d="M24 17 h-16 l-4 3.5 4 3.5 h16 Z" fill={AMBER} opacity={0.92} />
      {/* board pins */}
      <circle cx={15} cy={10.5} r={0.9} fill="#ffffff" opacity={0.85} />
      <circle cx={15} cy={20.5} r={0.9} fill="#ffffff" opacity={0.85} />
      {/* marigold at the foot */}
      <circle cx={11} cy={33.4} r={2.1} fill={AMBER} />
      <circle cx={11} cy={33.4} r={0.8} fill={AMBER_SHADE} />
    </svg>
  );
}

/** One placed scenery element (rendered inside the map SVG, anchored at
 *  ground level — draws upward from y=0). Locked showroom zones gray out via
 *  CSS filter, matching the postcards. */
export function SceneryElement({
  kind,
  x,
  y,
  accent,
  gray,
}: {
  kind: SceneryKind;
  x: number;
  y: number;
  accent: string;
  gray: boolean;
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      data-testid="scenery-item"
      data-scenery={kind}
      style={gray ? { filter: "grayscale(1)", opacity: 0.45 } : { opacity: 0.95 }}
      aria-hidden
    >
      {SCENERY_ASSETS[kind]({ accent })}
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
