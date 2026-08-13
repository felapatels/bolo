import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useRecordChachaEncounter,
  useBuyOutfit,
  useGetChachaLines,
  getGetChachaLinesQueryKey,
  getGetTokensQueryKey,
  type ChachaLine,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChaiGlyph, STALL_ASSETS, STALL_TITLE } from "@/components/chai-stall";
import { Confetti } from "@/components/ui/confetti";
import { MilestoneToast } from "@/components/ui/milestone-toast";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { markChachaStopSeen } from "@/lib/quick-games";
import { getCoachAudioElement, blessAudioPlayback } from "@/lib/iosAudio";
import { speakChachaLine } from "@/lib/chachaVoice";
import { loadCoachVoicePref } from "@/lib/coachVoicePref";
import { useSynthesizeSpeech } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChachaEncounterDialog({
  stationIndex,
  firstItemHref,
  open,
  onOpenChange,
}: {
  stationIndex: number;
  firstItemHref: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { activeLang, activeLanguage } = useLanguage();
  const native = useNativeText();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const recordEncounter = useRecordChachaEncounter();
  const buyOutfit = useBuyOutfit();
  const synthesize = useSynthesizeSpeech();

  const calledStationRef = useRef<number | null>(null);

  const [toastKey, setToastKey] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playError, setPlayError] = useState(false);

  // Chacha's own voice, gated by the master "does Bolo speak at all" switch —
  // NOT by "Autoplay phrase" (bolo.silentMode). His lines are flavour dialogue,
  // not a pronunciation reference: there is no recording to get out of the way
  // of and no replay affordance, so a control labelled "Autoplay phrase" has no
  // business silencing them. A learner who switched Bolo's voice off entirely
  // must not suddenly hear a new one, so that gate does apply, and it suppresses
  // the request as well as the playback. Read once per open so a mid-encounter
  // toggle cannot cut him off mid-word.
  const [voiceOn] = useState(() => loadCoachVoicePref());

  // His three lines. Fired as the dialog opens, in PARALLEL with the arrival
  // request and never chained behind it: nothing about the Chai grant, the
  // balance or the celebration may wait on audio.
  const chachaLines = useGetChachaLines({
    query: {
      queryKey: getGetChachaLinesQueryKey(),
      enabled: open && voiceOn,
      // Fixed text, fixed voice, server-cached: refetching buys nothing.
      staleTime: Infinity,
      retry: false,
    },
  });

  const lineFor = (key: ChachaLine["key"]): ChachaLine | undefined =>
    chachaLines.data?.lines.find((l) => l.key === key);

  // The line currently being spoken, shown on screen while it plays.
  const [spokenLine, setSpokenLine] = useState<{
    text: string;
    english: string;
  } | null>(null);

  // Each beat speaks at most once per encounter.
  const saidRef = useRef<Record<string, boolean>>({});

  const say = (key: ChachaLine["key"]) => {
    if (!voiceOn || saidRef.current[key]) return;
    const line = lineFor(key);
    if (!line) return;
    saidRef.current[key] = true;
    speakChachaLine(
      { audioBase64: line.audioBase64, format: line.format },
      {
        onStart: () => setSpokenLine({ text: line.text, english: line.english }),
        // Only clear the caption if this line is still the one on screen; a
        // later line may already have claimed it.
        onEnd: () =>
          setSpokenLine((cur) =>
            cur && cur.text === line.text ? null : cur,
          ),
      },
    );
  };

  useEffect(() => {
    if (open && stationIndex != null && calledStationRef.current !== stationIndex) {
      calledStationRef.current = stationIndex;
      recordEncounter.mutate(
        {
          data: { languageCode: activeLang, station: stationIndex },
        },
        {
          onSuccess: (data) => {
            // Only an arrival the server actually answered counts as spent:
            // marking it earlier would let one failed request cost the learner
            // this station's chai for good.
            markChachaStopSeen(activeLang, stationIndex);
            if (data.granted) {
              setToastKey(Date.now());
            }
            // Ensure any component reading tokens gets updated balance if we got a gift
            queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
          },
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stationIndex, activeLang]);

  // Beat one: he greets on open, the moment his lines land. If they land
  // late he still greets — the queue keeps the order, so the gift waits.
  useEffect(() => {
    if (!open) return;
    say("greeting");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chachaLines.data]);

  // Beat two: the gift line ONLY when this arrival actually poured the Chai.
  // A revisit to a station that has already paid gets greeting and farewell
  // and nothing in between.
  useEffect(() => {
    if (!open || recordEncounter.data?.granted !== true) return;
    say("gift");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recordEncounter.data?.granted, chachaLines.data]);

  // Reset dialog state when closed
  useEffect(() => {
    if (!open) {
      setToastKey(null);
      calledStationRef.current = null;
      saidRef.current = {};
      setSpokenLine(null);
    }
  }, [open]);

  // Beat three: he sees the learner off on every close path — the Thanks
  // button, the Not today button, and dismissing the dialog. Queued before the
  // close so it finishes over the closing dialog and the route change; the
  // player is a module-scope singleton precisely so it survives both.
  const handleClose = () => {
    blessAudioPlayback();
    say("farewell");
    onOpenChange(false);
    setLocation(firstItemHref);
  };

  const playPhrase = async () => {
    const phrase = recordEncounter.data?.phrase;
    if (playing || !phrase) return;
    setPlaying(true);
    setPlayError(false);
    try {
      const res = await synthesize.mutateAsync({
        data: {
          text: phrase.nativeScript,
          languageName: activeLanguage?.name,
          languageCode: activeLang,
        },
      });
      const audio = getCoachAudioElement();
      audio.src = `data:audio/${res.format};base64,${res.audioBase64}`;
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setPlaying(false);
        setPlayError(true);
      };
      await audio.play();
    } catch (e) {
      setPlaying(false);
      setPlayError(true);
    }
  };

  const result = recordEncounter.data;
  const isLoaded = recordEncounter.isSuccess && result != null;
  const isPending = recordEncounter.isPending;
  const phrase = result?.phrase;
  const offer = result?.offer;

  const handleBuy = () => {
    if (!offer) return;
    buyOutfit.mutate(
      { data: { outfitId: offer.outfitId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
          handleClose();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md rounded-3xl p-6 sm:p-8 flex flex-col gap-6">
        <DialogHeader className="sr-only">
          <DialogTitle>{STALL_TITLE}</DialogTitle>
          <DialogDescription>Chacha-ji's stall encounter</DialogDescription>
        </DialogHeader>

        {isLoaded && <Confetti active={result.granted} variant="default" />}
        <MilestoneToast
          message={result ? `+${result.chaiGranted} Chai` : null}
          toastKey={toastKey}
        />

        {/* Scene */}
        <div
          className="relative w-full overflow-hidden rounded-2xl border border-card-border"
          style={{ aspectRatio: `1024 / 572` }}
          aria-hidden="true"
        >
          <img
            src={STALL_ASSETS.scene}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <img
            src={STALL_ASSETS.chachaji}
            alt=""
            className="pointer-events-none absolute"
            style={{
              left: "48.5%",
              bottom: "17%",
              width: "19.5%",
            }}
          />
        </div>

        {/* What he is saying right now, in step with his voice. Sits outside
            the loaded/pending branches so his greeting is on screen while the
            arrival is still in flight. */}
        {spokenLine && (
          <div
            data-testid="chacha-spoken-line"
            aria-live="polite"
            className="flex flex-col gap-1 items-center text-center"
          >
            <p className="text-base font-semibold text-foreground italic">
              {spokenLine.text}
            </p>
            <p className="text-sm text-muted-foreground">{spokenLine.english}</p>
          </div>
        )}

        {/* Content */}
        {isPending && (
          <div className="flex justify-center p-8">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {isLoaded && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-extrabold text-foreground text-center">
              {STALL_TITLE}
            </h2>

            <div className="flex flex-col gap-2 items-center text-center">
              <p className="text-base text-foreground font-medium">Chacha-ji pours you a chai.</p>
              <div className="flex items-center gap-2 bg-secondary/10 px-3 py-1.5 rounded-full">
                <span className="font-bold text-secondary">+3</span>
                <ChaiGlyph className="w-4 h-4" />
                <span className="font-medium text-muted-foreground ml-1">Balance: {result.balance}</span>
              </div>
            </div>

            {phrase && (
              <div className="shrink-0 bg-card rounded-2xl border border-card-border shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={playPhrase}
                    disabled={playing}
                    aria-label="Hear the phrase"
                    className={cn(
                      "shrink-0 w-11 h-11 bg-secondary text-white rounded-full flex items-center justify-center shadow-md active:scale-95 disabled:opacity-40 transition-all",
                      playError && "ring-4 ring-destructive/50",
                    )}
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>

                  <div className="flex-1 min-w-0 text-left">
                    <h2
                      className="text-3xl font-extrabold text-foreground leading-tight tracking-tight truncate"
                      style={native.style}
                      dir={native.dir}
                    >
                      {phrase.nativeScript}
                    </h2>
                    {phrase.romanized && (
                      <p className="text-primary font-bold text-base leading-tight">
                        {phrase.romanized}
                      </p>
                    )}
                    <p className="text-muted-foreground text-sm leading-tight">
                      {phrase.english}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {offer ? (
              <div className="bg-card border border-card-border rounded-2xl p-4 flex flex-col gap-4 text-center shadow-sm">
                <div>
                  <h3 className="text-lg font-bold text-foreground">{offer.name}</h3>
                  <p className="text-sm text-muted-foreground">{offer.tagline}</p>
                </div>
                <div className="flex justify-center items-center gap-3">
                  <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Price
                    </span>
                    <span className="font-bold">{offer.cost}</span>
                    <ChaiGlyph className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      You have
                    </span>
                    <span className="font-bold">{result.balance}</span>
                    <ChaiGlyph className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex flex-col gap-2 mt-2">
                  <Button
                    onClick={handleBuy}
                    disabled={buyOutfit.isPending || result.balance < offer.cost}
                    className="w-full font-bold h-12 rounded-xl"
                  >
                    Buy {offer.name}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleClose}
                    className="w-full font-bold h-12 rounded-xl text-muted-foreground hover:text-foreground"
                  >
                    Not today, Chacha-ji
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 mt-2">
                {result.ordinal % 3 === 0 && (
                  <p className="text-center font-medium text-foreground italic">
                    "Come back soon, beta."
                  </p>
                )}
                <Button
                  onClick={handleClose}
                  className="w-full font-bold h-12 rounded-xl text-white bg-primary hover:bg-primary/90"
                >
                  Thanks, Chacha-ji
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
