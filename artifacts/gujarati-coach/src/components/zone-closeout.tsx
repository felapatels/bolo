// Chunk 6B Story 4: the zone closeout, a two-beat celebration overlay on the
// journey map, detected client-side when a zone's stations are all done.
//
// Beat 1: celebration + arrival fact + a closeout game CTA (Plus riders get
// Speed Round, free riders get Express Listening pinned to the zone topic).
// Beat 2: the capstone conversation offer, only when the zone has a scenario
// and no stamp yet. Nothing gates: every action (including dismissing) moves
// the state machine forward and never blocks the map.
//
// State lives in localStorage per language (absent -> beat2 -> done). Zones
// that are ALREADY complete the first time this ships are seeded straight to
// "done" so nobody gets a retroactive celebration for old work.

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { PartyPopper } from "lucide-react";
import { Mascot } from "@/components/mascot";
import { blessAudioPlayback } from "@/lib/iosAudio";
import { useEntitlements } from "@/lib/entitlements";
import { factForZone } from "@/lib/india-facts";
import {
  closeoutStateUnseeded,
  readCloseoutStages,
  seedCloseoutStages,
  writeCloseoutStage,
} from "@/lib/quick-games";

export type CloseoutZone = {
  zoneIndex: number;
  zoneId: number;
  geoName: string;
  title: string;
  allDone: boolean;
  scenarioId?: string;
  hasStamp: boolean;
};

export function ZoneCloseoutOverlay({
  lang,
  lineName,
  accent,
  zones,
}: {
  lang: string;
  lineName: string;
  accent: string;
  zones: CloseoutZone[];
}) {
  const { isPlus, isLoading } = useEntitlements();
  // Fail closed like the games hub: only confirmed Plus gets the Plus game.
  const plusReady = isPlus === true && !isLoading;
  const [active, setActive] = useState<{ zone: CloseoutZone; beat: 1 | 2 } | null>(null);

  const zonesKey = zones.map((z) => `${z.zoneIndex}:${z.allDone ? 1 : 0}`).join(",");
  useEffect(() => {
    // First sight of the feature: zones that are already complete seed
    // straight to "done" (no retroactive celebrations).
    if (closeoutStateUnseeded(lang)) {
      seedCloseoutStages(
        lang,
        zones.filter((z) => z.allDone).map((z) => z.zoneIndex),
      );
      return;
    }
    if (active) return;
    const stages = readCloseoutStages(lang);
    for (const z of zones) {
      if (!z.allDone) continue;
      const stage = stages[z.zoneIndex];
      if (stage === "done") continue;
      // Beat 2 ALWAYS runs now. It used to be skipped whenever the zone had no
      // capstone to offer, which meant five of six zones ended on silence the
      // moment the game was over. What varies is what beat 2 SAYS.
      setActive({ zone: z, beat: stage === undefined ? 1 : 2 });
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, zonesKey, active]);

  if (!active) return null;
  const { zone, beat } = active;

  const advanceFromBeat1 = () => {
    writeCloseoutStage(lang, zone.zoneIndex, "beat2");
    setActive({ zone, beat: 2 });
  };

  // The two faces of beat 2, ruled Aug 18 2026 when the twins were converged.
  // A capstone is the better payoff when there is one to offer; otherwise the
  // beat still exists and its job is the door into the wallet, which no other
  // surface in the game flow provides.
  const offerCapstone = Boolean(zone.scenarioId) && !zone.hasStamp;
  const finish = () => {
    writeCloseoutStage(lang, zone.zoneIndex, "done");
    setActive(null);
  };

  const gameHref = plusReady
    ? "/games/speed-round?ctx=closeout"
    : `/games/express-listening?cat=${zone.zoneId}&ctx=closeout`;
  const gameLabel = plusReady
    ? "Celebrate with a Speed Round"
    : "Celebrate with Express Listening";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      data-testid="zone-closeout-overlay"
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-xl">
        {beat === 1 ? (
          <div data-testid="closeout-beat1" className="flex flex-col items-center gap-4">
            <Mascot pose="cheer" size={88} />
            <div>
              <h2 className="flex items-center justify-center gap-2 text-xl font-extrabold text-foreground">
                <PartyPopper className="h-5 w-5" style={{ color: accent }} />
                Zone {zone.zoneIndex + 1} complete!
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every stop in {zone.geoName} is done. The whole platform is cheering!
              </p>
            </div>
            <div
              className="w-full rounded-xl border border-dashed p-3 text-left"
              style={{ borderColor: `${accent}66` }}
            >
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: accent }}>
                Arrival fact
              </p>
              <p className="mt-1 text-xs leading-snug text-muted-foreground" data-testid="closeout-arrival-fact">
                {factForZone({
                  zoneIndex: zone.zoneIndex,
                  geoName: zone.geoName,
                  lineName,
                  salt: 3,
                })}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2.5">
              <Link
                href={gameHref}
                onClick={() => {
                  blessAudioPlayback();
                  writeCloseoutStage(lang, zone.zoneIndex, "beat2");
                }}
                data-testid="closeout-game-cta"
                className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-black text-white active:scale-[0.98] transition-transform"
                style={{ background: accent }}
              >
                {gameLabel}
              </Link>
              <button
                type="button"
                onClick={advanceFromBeat1}
                data-testid="closeout-skip"
                className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-bold text-foreground active:scale-[0.98] transition-transform"
              >
                Skip for now
              </button>
            </div>
          </div>
        ) : (
          <div data-testid="closeout-beat2" className="flex flex-col items-center gap-4">
            <Mascot pose="wave" size={88} />
            {offerCapstone ? (
              <>
                <div>
                  <h2 className="text-xl font-extrabold text-foreground">Before you roll on</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The stationmaster at {zone.geoName} fancies a quick chat. Ready for a capstone
                    conversation?
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2.5">
                  <Link
                    href={`/chat?scenario=${zone.scenarioId}`}
                    onClick={() => {
                      blessAudioPlayback();
                      finish();
                    }}
                    data-testid="closeout-chat-cta"
                    className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-black text-white active:scale-[0.98] transition-transform"
                    style={{ background: accent }}
                  >
                    Chat with Bolo
                  </Link>
                  <button
                    type="button"
                    onClick={finish}
                    data-testid="closeout-later"
                    className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-bold text-foreground active:scale-[0.98] transition-transform"
                  >
                    Maybe later
                  </button>
                </div>
              </>
            ) : (
              /* No capstone to offer, or it is already stamped. The beat still
                 runs: its job is the wallet, which nothing else in the game
                 flow opens. Deliberately does NOT restate the Chai number the
                 game result already showed. */
              <>
                <div>
                  <h2 className="text-xl font-extrabold text-foreground">
                    {zone.geoName} is behind you
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your Chai is in the wallet whenever you want to spend it.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2.5">
                  <Link
                    href="/bazaar"
                    onClick={finish}
                    data-testid="closeout-wallet-cta"
                    className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-black text-white active:scale-[0.98] transition-transform"
                    style={{ background: accent }}
                  >
                    Open your Chai wallet
                  </Link>
                  <button
                    type="button"
                    onClick={finish}
                    data-testid="closeout-later"
                    className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-bold text-foreground active:scale-[0.98] transition-transform"
                  >
                    Keep rolling
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
