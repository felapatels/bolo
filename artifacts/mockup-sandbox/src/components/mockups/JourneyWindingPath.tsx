// Spec D1b — Concept 1: "Winding path"
// A serpentine Duolingo-style trail snaking down through Gujarat-themed
// scenery. Nodes are tappable circles; Bolo perches at the current node.

import {
  JOURNEY_NODES,
  REGIONS,
  mascotUrl,
  type JourneyNode,
} from "../../lib/journeyData";

const VIEW_W = 390;
const ROW_H = 96;
const AMPLITUDE = 105;
const CENTER_X = VIEW_W / 2;
const TOP_PAD = 90;

function nodeX(i: number): number {
  // Smooth serpentine: full left-right sweep every 6 nodes.
  return CENTER_X + AMPLITUDE * Math.sin((i * Math.PI) / 3);
}

function nodeY(i: number): number {
  return TOP_PAD + i * ROW_H;
}

const totalH = TOP_PAD + (JOURNEY_NODES.length - 1) * ROW_H + 140;

function trailPath(): string {
  let d = `M ${nodeX(0)} ${nodeY(0)}`;
  for (let i = 1; i < JOURNEY_NODES.length; i++) {
    const x0 = nodeX(i - 1);
    const y0 = nodeY(i - 1);
    const x1 = nodeX(i);
    const y1 = nodeY(i);
    const midY = (y0 + y1) / 2;
    d += ` C ${x0} ${midY}, ${x1} ${midY}, ${x1} ${y1}`;
  }
  return d;
}

// Region background bands (soft Gujarat-flavored washes on top of theme bg).
const REGION_WASHES: Record<string, string> = {
  Ahmedabad: "rgba(234, 88, 12, 0.07)", // sandstone / old-city warmth
  Kutch: "rgba(217, 119, 6, 0.09)", // white-desert gold
  "Gir Forest": "rgba(22, 101, 52, 0.08)", // forest green
  "Coastal Saurashtra": "rgba(2, 132, 199, 0.08)", // sea blue
};

const SCENERY: { i: number; side: "l" | "r"; emoji: string; label: string }[] =
  [
    { i: 1, side: "r", emoji: "🪁", label: "Uttarayan kites" },
    { i: 3, side: "l", emoji: "🫖", label: "Chai stall" },
    { i: 6, side: "r", emoji: "🕌", label: "Sidi Saiyyed Jali" },
    { i: 9, side: "l", emoji: "🐪", label: "Rann camel" },
    { i: 11, side: "r", emoji: "🧵", label: "Kutchi embroidery" },
    { i: 15, side: "r", emoji: "🌳", label: "Teak forest" },
    { i: 17, side: "l", emoji: "🦁", label: "Gir lion" },
    { i: 20, side: "r", emoji: "🦌", label: "Chital deer" },
    { i: 23, side: "l", emoji: "⛵", label: "Porbandar boats" },
    { i: 25, side: "r", emoji: "🛕", label: "Dwarka temple" },
  ];

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5 justify-center mt-1">
      {[0, 1, 2].map((s) => (
        <span
          key={s}
          className="text-[10px] leading-none"
          style={{ opacity: s < count ? 1 : 0.25 }}
        >
          ⭐
        </span>
      ))}
    </div>
  );
}

function PathNode({ node, index }: { node: JourneyNode; index: number }) {
  const x = nodeX(index);
  const y = nodeY(index);
  const isCurrent = node.status === "current";
  const isCompleted = node.status === "completed";

  const circleStyle: React.CSSProperties = isCompleted
    ? {
        background: "linear-gradient(180deg, #f59e0b, #ea580c)",
        color: "white",
        boxShadow: "0 4px 0 #9a3412, 0 6px 12px rgba(154,52,18,0.35)",
      }
    : isCurrent
      ? {
          background: "linear-gradient(180deg, #22c55e, #15803d)",
          color: "white",
          boxShadow:
            "0 4px 0 #14532d, 0 0 0 6px rgba(34,197,94,0.25), 0 8px 16px rgba(21,128,61,0.4)",
        }
      : {
          background: "hsl(var(--muted))",
          color: "hsl(var(--muted-foreground))",
          boxShadow: "0 3px 0 hsl(var(--border))",
        };

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{ left: x, top: y, transform: "translate(-50%, -50%)", width: 120 }}
    >
      {isCurrent && (
        <img
          src={mascotUrl("mascot-cheer")}
          alt="Bolo the parrot at your current lesson"
          className="absolute -top-16 w-16 h-16 object-contain drop-shadow-md"
          style={{ zIndex: 3 }}
        />
      )}
      <button
        type="button"
        aria-label={`${node.title} — ${node.status}`}
        className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold transition-transform hover:scale-105 active:translate-y-0.5"
        style={circleStyle}
      >
        {isCompleted ? "✓" : node.status === "locked" ? "🔒" : node.id}
      </button>
      <div
        className="mt-1.5 text-[11px] font-semibold text-center leading-tight"
        style={{
          color:
            node.status === "locked"
              ? "hsl(var(--muted-foreground))"
              : "hsl(var(--foreground))",
        }}
      >
        {node.title}
      </div>
      {isCompleted && node.stars !== undefined && <Stars count={node.stars} />}
      {isCurrent && (
        <span className="mt-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-600 text-white">
          Start
        </span>
      )}
    </div>
  );
}

export default function JourneyWindingPath() {
  // Region band extents in node-index space.
  const bands = REGIONS.map((r) => {
    const idxs = JOURNEY_NODES.map((n, i) => ({ n, i })).filter(
      ({ n }) => n.region === r.name,
    ).map(({ i }) => i);
    return { region: r, from: Math.min(...idxs), to: Math.max(...idxs) };
  });

  return (
    <div className="min-h-screen bg-background flex justify-center">
      <div
        className="relative w-[390px] bg-background border-x border-border overflow-hidden"
        style={{ minHeight: totalH + 70 }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-card/95 backdrop-blur border-b border-border">
          <div>
            <div className="text-sm font-bold text-foreground">
              Your Gujarat journey
            </div>
            <div className="text-[11px] text-muted-foreground">
              12 of 27 lessons · Kutch કચ્છ
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm font-bold text-orange-600">
            🔥 6
          </div>
        </div>

        {/* Region washes */}
        {bands.map(({ region, from, to }) => (
          <div
            key={region.name}
            className="absolute inset-x-0"
            style={{
              top: nodeY(from) - ROW_H / 2 + 40,
              height: (to - from + 1) * ROW_H,
              background: REGION_WASHES[region.name],
            }}
          />
        ))}

        {/* Region labels */}
        {bands.map(({ region, from }) => (
          <div
            key={`label-${region.name}`}
            className="absolute inset-x-3 z-[2] flex"
            style={{
              top: Math.max(nodeY(from) - ROW_H / 2 - 14, 74),
              justifyContent:
                nodeX(from) > CENTER_X ? "flex-start" : "flex-end",
            }}
          >
            <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-card border border-border text-foreground shadow-sm">
              {region.emoji} {region.name} · {region.gujarati}
            </span>
          </div>
        ))}

        {/* Trail + content, offset below header */}
        <div className="relative" style={{ height: totalH }}>
          <svg
            className="absolute inset-0"
            width={VIEW_W}
            height={totalH}
            aria-hidden
          >
            <path
              d={trailPath()}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={16}
              strokeLinecap="round"
            />
            <path
              d={trailPath()}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={8}
              strokeDasharray="1 14"
              strokeLinecap="round"
              opacity={0.9}
            />
          </svg>

          {/* Scenery accents */}
          {SCENERY.map((s) => (
            <div
              key={s.i}
              className="absolute flex flex-col items-center w-16 text-center"
              style={{
                top: nodeY(s.i) - 10,
                left: s.side === "l" ? 8 : undefined,
                right: s.side === "r" ? 8 : undefined,
                opacity: 0.85,
              }}
              aria-hidden
            >
              <span className="text-2xl">{s.emoji}</span>
              <span className="text-[9px] text-muted-foreground leading-tight">
                {s.label}
              </span>
            </div>
          ))}

          {JOURNEY_NODES.map((n, i) => (
            <PathNode key={n.id} node={n} index={i} />
          ))}

          {/* Journey's end flag */}
          <div
            className="absolute flex flex-col items-center"
            style={{
              left: nodeX(JOURNEY_NODES.length),
              top: nodeY(JOURNEY_NODES.length - 1) + 76,
              transform: "translateX(-50%)",
            }}
          >
            <span className="text-3xl">🏁</span>
            <span className="text-[11px] font-semibold text-muted-foreground">
              Journey complete!
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
