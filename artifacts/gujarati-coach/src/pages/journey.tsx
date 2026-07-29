// Spec D1b: the journey map. One themed rail line per language (structured
// content in lib/journeyLines.ts), six fare zones in authoritative category
// order, one station per lesson group (phrase-stage stops before
// sentence-stage), states straight from the Slice 2 unlock API. For
// plan-locked languages the map renders in M1 teaser/exhausted "showroom"
// mode per the API's access envelope: full structure, everything locked
// except the marked teaser station. Approved treatments: tested_out = express
// stamp, sentence stage = first-class diamond + Plus chip, locked showroom
// zones = grayscale postcards.
import { Link } from "wouter";
import { useState } from "react";
import {
  useListCategories,
  useListCategoryLessonGroups,
  type LessonGroupList,
  type LessonGroupSummary,
} from "@workspace/api-client-react";
import { ArrowLeft, Lock, Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/language-context";
import { LessonErrorScreen } from "@/components/lesson-states";
import { UpgradeScreen } from "@/components/plus";
import {
  asUpgradeRequired,
  upgradeHref,
  upgradeHrefForDenial,
  useEntitlements,
} from "@/lib/entitlements";
import { JOURNEY_ZONES, getJourneyLine } from "@/lib/journeyLines";

const LINE_X = 52; // px from the left edge of the rail column (mockup C)
const GRAY = "#9ca3af"; // rail/marker color for locked showroom zones

type Station = LessonGroupSummary & {
  zoneId: number;
  zoneIndex: number;
  stopNumber: number; // 1-based within the zone
  stopCount: number; // stations in the zone
};

type LockInfo = {
  kind: "progression" | "sentence" | "language";
  stopLabel: string;
  zoneTitle: string;
};

function stageRank(g: LessonGroupSummary): number {
  return g.stage === "sentence" ? 1 : 0;
}

function isStatusAccessible(status: LessonGroupSummary["status"]): boolean {
  return (
    status === "unlocked" ||
    status === "in_progress" ||
    status === "completed" ||
    status === "tested_out"
  );
}

/** Marker sitting on the rail: circle for phrase stops, diamond for the
 *  first-class sentence stops, train for the current stop. */
function StationMarker({
  station,
  color,
  isCurrent,
  accessible,
}: {
  station: Station;
  color: string;
  isCurrent: boolean;
  accessible: boolean;
}) {
  if (isCurrent) {
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
  const done = station.status === "completed" || station.status === "tested_out";
  const shapeClass =
    station.stage === "sentence" ? "rotate-45 rounded-[3px]" : "rounded-full";
  if (done) {
    return (
      <div
        className={cn("w-5 h-5 border-4 border-white", shapeClass)}
        style={{ background: color, boxShadow: `0 0 0 2px ${color}` }}
      />
    );
  }
  return (
    <div
      className={cn("w-5 h-5 bg-background", shapeClass)}
      style={{
        boxShadow: accessible
          ? `inset 0 0 0 3px ${color}`
          : "inset 0 0 0 3px hsl(var(--border))",
      }}
    />
  );
}

/** Fare-zone postcard: shared frame, per-line accent, zone name in the
 *  landmark slot (no artwork is generated — acceptance 8). Locked showroom
 *  zones render grayscale. */
function ZonePostcard({
  zoneIndex,
  zoneTitle,
  geoName,
  accent,
  stationCount,
  grayed,
}: {
  zoneIndex: number;
  zoneTitle: string;
  geoName: string;
  accent: string;
  stationCount: number;
  grayed: boolean;
}) {
  const color = grayed ? GRAY : accent;
  return (
    <div className={cn("relative flex items-center py-4", grayed && "grayscale opacity-80")}>
      {/* interchange diamond on the rail */}
      <div
        className="absolute w-4 h-4 border-4 border-white"
        style={{
          left: LINE_X,
          transform: "translateX(-50%) rotate(45deg)",
          background: color,
          boxShadow: `0 0 0 2px ${color}`,
        }}
      />
      <div style={{ width: LINE_X + 22 }} className="shrink-0" />
      {/* postcard frame */}
      <div className="flex-1 rounded-lg border-2 bg-white p-1 shadow-sm" style={{ borderColor: color }}>
        <div
          className="rounded-md border border-dashed px-3 py-2"
          style={{ borderColor: `${color}66` }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color }}>
                Fare zone {zoneIndex + 1} · {zoneTitle}
              </div>
              <div className="text-sm font-extrabold leading-tight text-foreground truncate">
                {geoName}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {stationCount} {stationCount === 1 ? "stop" : "stops"} in this zone
              </div>
            </div>
            {/* postage-stamp corner: frame only, landmark art ships separately */}
            <div
              className="shrink-0 h-9 w-9 rounded-sm border border-dashed flex items-center justify-center text-[8px] font-bold uppercase text-center leading-tight"
              style={{ borderColor: `${color}88`, color }}
              aria-hidden
            >
              {geoName.split(" ")[0]?.slice(0, 6)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StationRow({
  station,
  color,
  isCurrent,
  accessible,
  showTeaserChip,
  href,
  onLocked,
}: {
  station: Station;
  color: string;
  isCurrent: boolean;
  accessible: boolean;
  showTeaserChip: boolean;
  href: string;
  onLocked: () => void;
}) {
  const stopLabel = `Stop ${station.stopNumber} of ${station.stopCount}`;
  const statusCopy =
    station.status === "completed"
      ? "Completed"
      : station.status === "tested_out"
        ? "Tested out"
        : station.status === "in_progress"
          ? "In progress"
          : accessible
            ? "Now boarding"
            : "Locked";
  const body = (
    <>
      <div
        className="absolute flex items-center justify-center"
        style={{ left: LINE_X, transform: "translateX(-50%)" }}
      >
        <StationMarker
          station={station}
          color={color}
          isCurrent={isCurrent}
          accessible={accessible}
        />
      </div>
      <div style={{ width: LINE_X + 22 }} className="shrink-0" />
      <div
        className={cn(
          "flex-1 min-w-0 rounded-lg px-3 py-2 transition-colors group-hover:bg-accent",
          isCurrent && "bg-card border shadow-sm",
        )}
        style={isCurrent ? { borderColor: color } : undefined}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-sm font-semibold",
              accessible ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {stopLabel}
          </span>
          {station.stage === "sentence" && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-secondary shrink-0"
              title="First-class sentence stop — Plus"
            >
              <Sparkles className="w-2.5 h-2.5" />
              Plus
            </span>
          )}
          {station.status === "tested_out" && (
            <span
              className="inline-block -rotate-6 rounded-sm border-2 border-dashed px-1.5 py-px text-[8px] font-black uppercase tracking-widest shrink-0"
              style={{ borderColor: color, color }}
            >
              Express
            </span>
          )}
          {showTeaserChip && (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shrink-0"
              style={{ background: color }}
            >
              Free taste
            </span>
          )}
          {!accessible && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {statusCopy}
          {station.attemptedCount ? ` · ${station.masteredCount}/${station.phraseCount} mastered` : ` · ${station.phraseCount} phrases`}
          {isCurrent && " · Bolo is waiting here"}
        </div>
      </div>
      {isCurrent && <Mascot pose="cheer" size={44} className="shrink-0 -ml-1" />}
    </>
  );
  const aria = `${stopLabel} — ${statusCopy}${station.stage === "sentence" ? " (sentence stop)" : ""}`;
  if (accessible) {
    return (
      <Link
        href={href}
        aria-label={aria}
        className="relative w-full flex items-center gap-3 py-2.5 pr-3 text-left group"
      >
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={aria}
      onClick={onLocked}
      className="relative w-full flex items-center gap-3 py-2.5 pr-3 text-left group"
    >
      {body}
    </button>
  );
}

export default function Journey() {
  const { activeLang, activeLanguage } = useLanguage();
  const { isAllAccess } = useEntitlements();
  const line = getJourneyLine(activeLang);
  const [lock, setLock] = useState<LockInfo | null>(null);

  // One language's map never fetches another language's data (behavior 9):
  // exactly six fixed zone queries for the active language.
  const categoriesQuery = useListCategories({ lang: activeLang });
  const q1 = useListCategoryLessonGroups(JOURNEY_ZONES[0].id, activeLang);
  const q2 = useListCategoryLessonGroups(JOURNEY_ZONES[1].id, activeLang);
  const q3 = useListCategoryLessonGroups(JOURNEY_ZONES[2].id, activeLang);
  const q4 = useListCategoryLessonGroups(JOURNEY_ZONES[3].id, activeLang);
  const q5 = useListCategoryLessonGroups(JOURNEY_ZONES[4].id, activeLang);
  const q6 = useListCategoryLessonGroups(JOURNEY_ZONES[5].id, activeLang);
  const zoneQueries = [q1, q2, q3, q4, q5, q6];

  // Plain-locked language (no teaser set): the API keeps its pre-M1 402 and
  // the map defers to the standard upgrade screen.
  const upgrade = zoneQueries
    .map((q) => asUpgradeRequired(q.error))
    .find((u) => u !== null);
  if (upgrade) {
    return (
      <UpgradeScreen
        backHref="/app"
        title={
          upgrade.reason === "teaser_exhausted"
            ? "You've tried this language!"
            : "Unlock this language"
        }
        message={upgrade.message}
        upgradeHref={upgradeHrefForDenial(upgrade, activeLang)}
      />
    );
  }
  if (zoneQueries.some((q) => q.isError)) {
    return (
      <LessonErrorScreen
        backHref="/app"
        onRetry={() => {
          zoneQueries.forEach((q) => void q.refetch());
        }}
        isRetrying={zoneQueries.some((q) => q.isFetching)}
      />
    );
  }
  if (zoneQueries.some((q) => q.isLoading)) {
    return (
      <div className="app-surface min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-3">
        <Mascot pose="wave" size={88} />
        <p className="text-sm font-bold text-muted-foreground">
          Laying the tracks…
        </p>
      </div>
    );
  }

  // Behavior 8: the embedded zone table is authoritative; a live mismatch is a
  // hard stop, never a silent remap.
  const categories = categoriesQuery.data;
  const zoneMismatch =
    categories !== undefined &&
    JOURNEY_ZONES.some(
      (z) => !categories.some((c) => c.id === z.id && c.title === z.title),
    );
  if (zoneMismatch) {
    return (
      <LessonErrorScreen
        backHref="/app"
        onRetry={() => void categoriesQuery.refetch()}
        isRetrying={categoriesQuery.isFetching}
      />
    );
  }

  // M1 access envelope: present only in showroom (teaser/exhausted) mode.
  const access =
    zoneQueries.map((q) => (q.data as LessonGroupList | undefined)?.access).find(Boolean) ??
    null;
  const teaserProgress =
    zoneQueries.map((q) => (q.data as LessonGroupList | undefined)?.teaser).find(Boolean) ??
    null;
  const showroom = access !== null;

  const zones = JOURNEY_ZONES.map((z, i) => {
    const groups = [...((zoneQueries[i]!.data as LessonGroupList | undefined)?.lessonGroups ?? [])]
      // Phrase-stage stops before sentence-stage, then position order.
      .sort((a, b) => stageRank(a) - stageRank(b) || (a.position ?? 0) - (b.position ?? 0));
    const stations: Station[] = groups.map((g, gi) => ({
      ...g,
      zoneId: z.id,
      zoneIndex: i,
      stopNumber: gi + 1,
      stopCount: groups.length,
    }));
    return { ...z, geoName: line.zones[i]!, stations };
  });

  const allStations = zones.flatMap((z) => z.stations);
  const doneCount = allStations.filter(
    (s) => s.status === "completed" || s.status === "tested_out",
  ).length;
  const totalCount = allStations.length;
  const currentId = allStations.find(
    (s) =>
      (s.status === "unlocked" || s.status === "in_progress") &&
      !(s.stage === "sentence" && !isAllAccess),
  )?.id;

  const languageName = activeLanguage?.name ?? "this language";
  const upgradeLanguageHref = upgradeHref({
    plan: "one_language",
    lang: activeLang,
    reason: access === "exhausted" ? "teaser_exhausted" : "language_locked",
  });

  return (
    <div className="app-surface min-h-[100dvh] bg-background flex flex-col">
      {/* Boarding-pass header (mockup C ticket stub) */}
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
        <div className="mx-auto w-full max-w-2xl px-3 py-3 flex items-center gap-2">
          <Link
            href="/app"
            aria-label="Back to home"
            className="p-2 rounded-full hover:bg-muted text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 rounded-lg border-2 border-dashed border-border bg-card px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                  Boarding pass · બોલો રેલ
                </div>
                <div className="text-base font-extrabold text-foreground leading-tight truncate">
                  {line.lineName}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {line.zones[0]} → {line.zones[5]} · {doneCount}/{totalCount} stations
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl" aria-hidden>
                  🎫
                </div>
                {access === "teaser" && teaserProgress && (
                  <div className="text-[10px] font-bold" style={{ color: line.accent }}>
                    Free taste {teaserProgress.consumed}/{teaserProgress.limit}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 pb-14">
        {access === "exhausted" && (
          <div className="mx-3 mt-4 rounded-2xl border-2 p-4" style={{ borderColor: line.accent }}>
            <p className="text-sm font-bold text-foreground">
              You've tried the {line.lineName}! All {teaserProgress?.limit ?? 3} free
              phrases are used.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Unlock {languageName} to board every stop on the line.
            </p>
            <Link
              href={upgradeLanguageHref}
              className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white active:scale-[0.98] transition-transform"
              style={{ background: line.accent }}
            >
              <Sparkles className="w-4 h-4" />
              Get your ticket
            </Link>
          </div>
        )}

        {/* Rail + zones + stations */}
        <div className="relative mt-2">
          {/* continuous rail: one segment per zone */}
          <div
            className="absolute top-0 bottom-0 flex flex-col"
            style={{ left: LINE_X, transform: "translateX(-50%)", width: 8 }}
          >
            {zones.map((z) => {
              const zoneAccessible = z.stations.some(
                (s) => isStatusAccessible(s.status) || s.teaserStation,
              );
              return (
                <div
                  key={z.id}
                  style={{
                    background: showroom && !zoneAccessible ? GRAY : line.accent,
                    flexGrow: z.stations.length + 1,
                  }}
                />
              );
            })}
          </div>

          {zones.map((z, zi) => {
            const zoneAccessible = z.stations.some(
              (s) => isStatusAccessible(s.status) || s.teaserStation,
            );
            const grayed = showroom && !zoneAccessible;
            const zoneColor = grayed ? GRAY : line.accent;
            return (
              <div key={z.id}>
                <ZonePostcard
                  zoneIndex={zi}
                  zoneTitle={z.title}
                  geoName={z.geoName}
                  accent={line.accent}
                  stationCount={z.stations.length}
                  grayed={grayed}
                />
                {z.stations.map((s) => {
                  const stopLabel = `Stop ${s.stopNumber} of ${s.stopCount}`;
                  // Behavior 4 + 6: a Free learner's sentence stop always routes
                  // through the entitlement presentation, even when progression
                  // says unlocked — its phrases are Plus content server-side.
                  const sentenceGated = s.stage === "sentence" && !isAllAccess;
                  const accessible =
                    isStatusAccessible(s.status) && !sentenceGated;
                  return (
                    <StationRow
                      key={s.id}
                      station={s}
                      color={zoneColor}
                      isCurrent={s.id === currentId}
                      accessible={accessible}
                      showTeaserChip={s.teaserStation === true}
                      href={`/practice/${z.id}?group=${s.id}`}
                      onLocked={() =>
                        setLock({
                          kind: showroom
                            ? "language"
                            : sentenceGated
                              ? "sentence"
                              : "progression",
                          stopLabel: `${stopLabel} · ${z.geoName}`,
                          zoneTitle: z.title,
                        })
                      }
                    />
                  );
                })}
              </div>
            );
          })}

          {/* terminus */}
          <div className="relative flex items-center py-4">
            <div
              className="absolute w-6 h-6 rounded-full border-4 border-white"
              style={{
                left: LINE_X,
                transform: "translateX(-50%)",
                background: doneCount === totalCount && totalCount > 0 ? line.accent : GRAY,
                boxShadow: `0 0 0 2px ${doneCount === totalCount && totalCount > 0 ? line.accent : GRAY}`,
              }}
            />
            <div style={{ width: LINE_X + 22 }} className="shrink-0" />
            <div className="text-xs font-bold text-muted-foreground">
              Terminus: {line.zones[5]} —{" "}
              {doneCount === totalCount && totalCount > 0
                ? "journey complete!"
                : "the festival finale awaits"}
            </div>
          </div>
        </div>

        <p className="mt-2 px-6 text-center text-[11px] text-muted-foreground">
          Tap any lit station to practice it. The {line.lineName} only stops at
          the next station once you finish the one before it.
        </p>
      </main>

      {/* Lock dialogs: entitlement locks and progression locks read differently
          (behavior 4 / acceptance 4). */}
      <Dialog open={lock !== null} onOpenChange={(open) => !open && setLock(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          {lock?.kind === "progression" && (
            <>
              <DialogHeader>
                <DialogTitle>This stop is still locked</DialogTitle>
                <DialogDescription>
                  {lock.stopLabel}: finish the stop before it to board here.
                  The {line.lineName} runs station by station.
                </DialogDescription>
              </DialogHeader>
              <button
                type="button"
                onClick={() => setLock(null)}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground active:scale-[0.98] transition-transform"
              >
                Keep practicing
              </button>
            </>
          )}
          {lock?.kind === "sentence" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rotate-45 rounded-[2px]"
                    style={{ background: line.accent }}
                    aria-hidden
                  />
                  First-class coach: full sentences
                </DialogTitle>
                <DialogDescription>
                  {lock.stopLabel} is a sentence stop — graduate from phrases to
                  real, natural sentences. First-class seats are a Plus perk.
                </DialogDescription>
              </DialogHeader>
              <Link
                href={upgradeHref({ plan: "plus" })}
                onClick={() => setLock(null)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm font-black text-white active:scale-[0.98] transition-transform"
              >
                <Sparkles className="w-4 h-4" />
                Unlock with Plus
              </Link>
            </>
          )}
          {lock?.kind === "language" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {access === "exhausted"
                    ? "You've tried this line!"
                    : "This line needs a ticket"}
                </DialogTitle>
                <DialogDescription>
                  {access === "exhausted"
                    ? `All ${teaserProgress?.limit ?? 3} free phrases on the ${line.lineName} are used. Unlock ${languageName} to keep riding.`
                    : `Your free taste covers the marked station (${teaserProgress?.consumed ?? 0}/${teaserProgress?.limit ?? 3} tried). Unlock ${languageName} to board every stop.`}
                </DialogDescription>
              </DialogHeader>
              <Link
                href={upgradeLanguageHref}
                onClick={() => setLock(null)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground active:scale-[0.98] transition-transform"
              >
                <Sparkles className="w-4 h-4" />
                Get your ticket
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setLock(null)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
