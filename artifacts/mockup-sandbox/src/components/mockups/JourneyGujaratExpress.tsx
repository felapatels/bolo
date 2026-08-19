// Spec D1b, Concept 3 (wildcard): "The Gujarat Express"
// A railway-map take on the journey: one vertical train line, lessons as
// stations, regions as fare zones, and Bolo riding the train at the
// learner's current station. Ticket-stub styling for the header and a
// platform-sign look for interchange (region boundary) stations.

import {
  JOURNEY_NODES,
  REGIONS,
  mascotUrl,
  type JourneyNode,
} from "../../lib/journeyData";

const LINE_COLORS: Record<string, string> = {
  Ahmedabad: "#ea580c",
  Kutch: "#d97706",
  "Gir Forest": "#16a34a",
  "Coastal Saurashtra": "#0284c7",
};

const LINE_X = 52; // px from the left edge of the card

function StationMarker({ node }: { node: JourneyNode }) {
  const color = LINE_COLORS[node.region];
  if (node.status === "current") {
    return (
      <div
        className="w-7 h-7 rounded-full bg-white flex items-center justify-center"
        style={{ boxShadow: `0 0 0 4px ${color}, 0 0 0 8px ${color}33` }}
      >
        <span className="text-[13px]" aria-hidden>
          🚂
        </span>
      </div>
    );
  }
  if (node.status === "completed") {
    return (
      <div
        className="w-5 h-5 rounded-full border-4 border-white text-white flex items-center justify-center"
        style={{ background: color, boxShadow: `0 0 0 2px ${color}` }}
      />
    );
  }
  return (
    <div
      className="w-5 h-5 rounded-full bg-background"
      style={{ boxShadow: "inset 0 0 0 3px hsl(var(--border))" }}
    />
  );
}

function Station({ node }: { node: JourneyNode }) {
  const color = LINE_COLORS[node.region];
  const isCurrent = node.status === "current";
  const locked = node.status === "locked";
  return (
    <button
      type="button"
      aria-label={`${node.title} station, ${node.status}`}
      className="relative w-full flex items-center gap-3 py-3 pr-3 text-left group"
    >
      {/* marker sits on the line */}
      <div
        className="absolute flex items-center justify-center"
        style={{ left: LINE_X, transform: "translateX(-50%)" }}
      >
        <StationMarker node={node} />
      </div>
      <div style={{ width: LINE_X + 22 }} className="shrink-0" />
      <div
        className={`flex-1 min-w-0 rounded-lg px-3 py-2 transition-colors group-hover:bg-accent ${
          isCurrent ? "bg-card border shadow-sm" : ""
        }`}
        style={isCurrent ? { borderColor: color } : undefined}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-semibold truncate"
            style={{
              color: locked
                ? "hsl(var(--muted-foreground))"
                : "hsl(var(--foreground))",
            }}
          >
            {node.title}
          </span>
          {node.status === "completed" && node.stars !== undefined && (
            <span className="text-[10px] shrink-0" aria-hidden>
              {"⭐".repeat(node.stars)}
            </span>
          )}
          {locked && (
            <span className="text-[10px] shrink-0" aria-hidden>
              🔒
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {node.topic}
          {isCurrent && " · Now boarding"}
        </div>
      </div>
      {isCurrent && (
        <img
          src={mascotUrl("mascot-cheer")}
          alt="Bolo riding the Gujarat Express"
          className="w-12 h-12 object-contain shrink-0 -ml-1"
        />
      )}
    </button>
  );
}

function ZoneSign({ regionName, index }: { regionName: string; index: number }) {
  const region = REGIONS.find((r) => r.name === regionName)!;
  const color = LINE_COLORS[regionName];
  return (
    <div className="relative flex items-center py-4">
      {/* interchange diamond on the line */}
      <div
        className="absolute w-4 h-4 rotate-45 border-4 border-white"
        style={{
          left: LINE_X,
          transform: "translateX(-50%) rotate(45deg)",
          background: color,
          boxShadow: `0 0 0 2px ${color}`,
        }}
      />
      <div style={{ width: LINE_X + 22 }} className="shrink-0" />
      {/* platform sign */}
      <div
        className="flex-1 rounded-md px-3 py-2 text-white shadow-sm"
        style={{ background: color }}
      >
        <div className="text-[9px] font-bold uppercase tracking-widest opacity-80">
          Fare zone {index + 1} · {region.emoji}
        </div>
        <div className="text-sm font-extrabold leading-tight">
          {region.name}{" "}
          <span className="font-medium opacity-90">{region.gujarati}</span>
        </div>
        <div className="text-[10px] opacity-85 truncate">{region.tagline}</div>
      </div>
    </div>
  );
}

export default function JourneyGujaratExpress() {
  // Build a flat render list: a zone sign before each region's stations.
  const rows: (
    | { kind: "sign"; region: string; index: number }
    | { kind: "station"; node: JourneyNode }
  )[] = [];
  REGIONS.forEach((r, i) => {
    rows.push({ kind: "sign", region: r.name, index: i });
    JOURNEY_NODES.filter((n) => n.region === r.name).forEach((n) =>
      rows.push({ kind: "station", node: n }),
    );
  });

  const doneCount = JOURNEY_NODES.filter(
    (n) => n.status === "completed",
  ).length;

  return (
    <div className="min-h-screen bg-background flex justify-center">
      <div className="w-[390px] bg-background border-x border-border pb-12">
        {/* Ticket-stub header */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
          <div className="mx-3 my-3 rounded-lg border-2 border-dashed border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                  Boarding pass · બોલો રેલ
                </div>
                <div className="text-base font-extrabold text-foreground leading-tight">
                  The Gujarat Express
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Ahmedabad → Dwarka · {doneCount}/27 stations
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl" aria-hidden>
                  🎫
                </div>
                <div className="text-[10px] font-bold text-orange-600">
                  🔥 6-day streak
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Line + stations */}
        <div className="relative">
          {/* continuous rail: one colored segment per region */}
          <div
            className="absolute top-0 bottom-0 flex flex-col"
            style={{ left: LINE_X, transform: "translateX(-50%)", width: 8 }}
          >
            {REGIONS.map((r) => (
              <div
                key={r.name}
                style={{
                  background: LINE_COLORS[r.name],
                  flexGrow:
                    JOURNEY_NODES.filter((x) => x.region === r.name).length + 1,
                }}
              />
            ))}
          </div>

          {rows.map((row) =>
            row.kind === "sign" ? (
              <ZoneSign
                key={`sign-${row.region}`}
                regionName={row.region}
                index={row.index}
              />
            ) : (
              <Station key={row.node.id} node={row.node} />
            ),
          )}

          {/* terminus */}
          <div className="relative flex items-center py-4">
            <div
              className="absolute w-6 h-6 rounded-full border-4 border-white flex items-center justify-center text-[10px]"
              style={{
                left: LINE_X,
                transform: "translateX(-50%)",
                background: "#0284c7",
                boxShadow: "0 0 0 2px #0284c7",
              }}
            />
            <div style={{ width: LINE_X + 22 }} className="shrink-0" />
            <div className="text-xs font-bold text-muted-foreground">
              🛕 Terminus: Dwarka, journey complete
            </div>
          </div>
        </div>

        <div className="mt-4 px-6 text-center text-[11px] text-muted-foreground">
          Tap any lit station to replay it. The express only stops at the next
          locked station once you finish the one before it.
        </div>
      </div>
    </div>
  );
}
