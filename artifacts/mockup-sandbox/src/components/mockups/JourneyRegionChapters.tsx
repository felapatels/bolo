// Spec D1b, Concept 2: "Region chapters"
// The journey is split into named Gujarat regions/chapters. Nodes are grouped
// per chapter and each chapter ends in a postcard-style checkpoint card.

import {
  JOURNEY_NODES,
  REGIONS,
  mascotUrl,
  type JourneyNode,
  type JourneyRegion,
} from "../../lib/journeyData";

const CHAPTER_THEMES: Record<
  string,
  { accent: string; accentSoft: string; postcard: string; stamp: string }
> = {
  Ahmedabad: {
    accent: "#ea580c",
    accentSoft: "rgba(234,88,12,0.12)",
    postcard: "linear-gradient(135deg, #fed7aa 0%, #fdba74 55%, #fb923c 100%)",
    stamp: "🕌",
  },
  Kutch: {
    accent: "#d97706",
    accentSoft: "rgba(217,119,6,0.12)",
    postcard: "linear-gradient(135deg, #fef3c7 0%, #fde68a 55%, #f59e0b 100%)",
    stamp: "🐪",
  },
  "Gir Forest": {
    accent: "#16a34a",
    accentSoft: "rgba(22,163,74,0.12)",
    postcard: "linear-gradient(135deg, #bbf7d0 0%, #86efac 55%, #4ade80 100%)",
    stamp: "🦁",
  },
  "Coastal Saurashtra": {
    accent: "#0284c7",
    accentSoft: "rgba(2,132,199,0.12)",
    postcard: "linear-gradient(135deg, #bae6fd 0%, #7dd3fc 55%, #38bdf8 100%)",
    stamp: "🌊",
  },
};

function LessonRow({ node }: { node: JourneyNode }) {
  const theme = CHAPTER_THEMES[node.region];
  const isCurrent = node.status === "current";
  const isCompleted = node.status === "completed";

  return (
    <button
      type="button"
      aria-label={`${node.title}, ${node.status}`}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-accent"
      style={
        isCurrent
          ? {
              background: theme.accentSoft,
              boxShadow: `inset 0 0 0 2px ${theme.accent}`,
            }
          : undefined
      }
    >
      <div
        className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold"
        style={
          isCompleted
            ? { background: theme.accent, color: "white" }
            : isCurrent
              ? {
                  background: "white",
                  color: theme.accent,
                  boxShadow: `0 0 0 3px ${theme.accent}`,
                }
              : {
                  background: "hsl(var(--muted))",
                  color: "hsl(var(--muted-foreground))",
                }
        }
      >
        {isCompleted ? "✓" : node.status === "locked" ? "🔒" : node.id}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-sm font-semibold truncate"
          style={{
            color:
              node.status === "locked"
                ? "hsl(var(--muted-foreground))"
                : "hsl(var(--foreground))",
          }}
        >
          {node.title}
        </div>
        <div className="text-[11px] text-muted-foreground">{node.topic}</div>
      </div>
      {isCompleted && node.stars !== undefined && (
        <div className="flex gap-px text-[11px]" aria-hidden>
          {[0, 1, 2].map((s) => (
            <span key={s} style={{ opacity: s < (node.stars ?? 0) ? 1 : 0.2 }}>
              ⭐
            </span>
          ))}
        </div>
      )}
      {isCurrent && (
        <img
          src={mascotUrl("mascot-wave")}
          alt="Bolo is here"
          className="w-10 h-10 object-contain shrink-0"
        />
      )}
    </button>
  );
}

function PostcardCheckpoint({
  region,
  done,
}: {
  region: JourneyRegion;
  done: boolean;
}) {
  const theme = CHAPTER_THEMES[region.name];
  return (
    <div
      className="relative mx-1 mt-3 rounded-xl p-4 border-4 border-white shadow-md"
      style={{
        background: theme.postcard,
        transform: "rotate(-1.2deg)",
        filter: done ? undefined : "grayscale(0.7)",
        opacity: done ? 1 : 0.75,
      }}
    >
      {/* Stamp corner */}
      <div className="absolute top-2 right-2 w-11 h-12 bg-white/85 rounded-sm border border-dashed border-gray-400 flex items-center justify-center text-xl">
        {theme.stamp}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-black/50">
        Checkpoint postcard
      </div>
      <div className="mt-1 text-lg font-extrabold text-black/80 leading-tight">
        Greetings from {region.name}!
      </div>
      <div className="text-sm font-semibold text-black/60">
        {region.gujarati}
      </div>
      <div className="mt-2 text-[11px] text-black/60 max-w-[230px]">
        {done
          ? `Chapter complete, you can now handle ${region.tagline.toLowerCase()}.`
          : "Finish every lesson in this chapter to collect this postcard."}
      </div>
      <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 text-[10px] font-bold text-black/70">
        {done ? "✅ Collected" : "✉️ Not collected yet"}
      </div>
    </div>
  );
}

export default function JourneyRegionChapters() {
  return (
    <div className="min-h-screen bg-background flex justify-center">
      <div className="w-[390px] bg-background border-x border-border pb-10">
        {/* Header */}
        <div className="sticky top-0 z-10 px-4 py-3 bg-card/95 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-foreground">
                Gujarat, chapter by chapter
              </div>
              <div className="text-[11px] text-muted-foreground">
                1 postcard collected · 12 / 27 lessons
              </div>
            </div>
            <img
              src={mascotUrl("mascot-thumbsup")}
              alt="Bolo mascot"
              className="w-9 h-9 object-contain"
            />
          </div>
        </div>

        {REGIONS.map((region, ri) => {
          const nodes = JOURNEY_NODES.filter((n) => n.region === region.name);
          const doneCount = nodes.filter(
            (n) => n.status === "completed",
          ).length;
          const chapterDone = doneCount === nodes.length;
          const theme = CHAPTER_THEMES[region.name];
          return (
            <section key={region.name} className="px-3 pt-5">
              {/* Chapter header */}
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ background: theme.accentSoft }}
              >
                <span className="text-2xl">{region.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: theme.accent }}
                  >
                    Chapter {ri + 1}
                  </div>
                  <div className="text-base font-extrabold text-foreground leading-tight">
                    {region.name}{" "}
                    <span className="font-semibold text-muted-foreground">
                      {region.gujarati}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {region.tagline}
                  </div>
                </div>
                <div
                  className="text-xs font-bold shrink-0"
                  style={{ color: theme.accent }}
                >
                  {doneCount}/{nodes.length}
                </div>
              </div>

              {/* Progress bar */}
              <div className="mx-1 mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(doneCount / nodes.length) * 100}%`,
                    background: theme.accent,
                  }}
                />
              </div>

              {/* Lessons */}
              <div className="mt-2 flex flex-col gap-1">
                {nodes.map((n) => (
                  <LessonRow key={n.id} node={n} />
                ))}
              </div>

              <PostcardCheckpoint region={region} done={chapterDone} />
            </section>
          );
        })}

        <div className="mt-8 flex flex-col items-center gap-2 text-center px-8">
          <img
            src={mascotUrl("mascot-cheer")}
            alt="Bolo cheering"
            className="w-16 h-16 object-contain"
          />
          <p className="text-xs text-muted-foreground">
            Collect all four postcards to complete your journey across Gujarat!
          </p>
        </div>
      </div>
    </div>
  );
}
