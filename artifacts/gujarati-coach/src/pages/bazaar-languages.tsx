import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { BazaarHeader } from "@/components/bazaar-header";
import { ChaiWalletSheet, LanguageSignpostRow } from "@/components/chai-wallet";
import { LanguagePicker } from "@/components/language-picker";
import { useLanguage } from "@/lib/language-context";
import { useEntitlements } from "@/lib/entitlements";
import { getJourneyLine } from "@/lib/journeyLines";
import { useJourneyProgress } from "@/lib/useJourneyProgress";
import { blessAudioPlayback } from "@/lib/iosAudio";
import { cn } from "@/lib/utils";

/** The office's picture: the chalkboard on its easel, no words on it. */
const OFFICE_ART = `${import.meta.env.BASE_URL}games/script-trace.png`;

/**
 * THE LANGUAGE OFFICE (mobile build 22, here build 23; the owner's bazaar
 * redesign: "unlock new languages and content"). The language you are
 * learning, with how far along its line you are and a Continue into the
 * journey; every other language as a tile that opens the picker. HOW A
 * LANGUAGE IS UNLOCKED IS THE ONE HONEST DIFFERENCE from the mockup:
 * nothing is bought here. Chai buys a STOP on a locked language's journey,
 * stop by stop (the wallet's signpost explains it), and All-Access owns
 * every stop. The mockup's "25 Chai per language" is not a thing the server
 * sells, so the tiles say what is true instead of pricing what is not.
 * Mobile twin: app/(app)/bazaar/languages.tsx.
 */
export default function LanguageOfficePage() {
  const { languages, activeLang, activeLanguage } = useLanguage();
  const { isPlus, isOneLanguage } = useEntitlements();
  const line = getJourneyLine(activeLang);
  const journey = useJourneyProgress(activeLang, line.zones);
  const [walletOpen, setWalletOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const others = languages.filter((l) => l.code !== activeLang);
  const included = isPlus || isOneLanguage;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-nav pt-4 lg:pb-12" data-testid="bazaar-language-office">
      <BazaarHeader title="Language Office" subtitle="Unlock new languages." centred onWallet={() => setWalletOpen(true)} />
      <div className="space-y-3.5">
        <div className="overflow-hidden rounded-[22px]" style={{ aspectRatio: "1 / 0.56" }}>
          <img src={OFFICE_ART} alt="" aria-hidden className="h-full w-full object-cover" />
        </div>
        <p className="pt-1 text-xs font-black uppercase tracking-[1.4px] text-foreground">Languages</p>
        {activeLanguage ? (
          <div
            data-testid="language-office-active"
            className="flex items-center gap-3 rounded-[18px] border-[1.5px] border-primary bg-card p-3.5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-foreground">{activeLanguage.name}</p>
              <p className="mt-px text-sm text-muted-foreground" lang={activeLanguage.code}>
                {activeLanguage.nativeName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {journey.isLoading
                  ? "Counting your stops"
                  : `${journey.doneCount}/${journey.totalCount} stops on the ${line.lineName}`}
              </p>
            </div>
            <Link
              href="/journey"
              onClick={blessAudioPlayback}
              aria-label={`Continue ${activeLanguage.name}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-[9px] text-sm font-bold text-primary-foreground"
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-2.5">
          {others.map((l) => (
            <button
              key={l.code}
              type="button"
              data-testid={`language-office-${l.code}`}
              aria-label={`${l.name}, ${included ? "included" : "Chai opens its stops"}`}
              onClick={() => setPickerOpen(true)}
              className="flex flex-col items-center gap-1 rounded-2xl border border-card-border bg-card p-3 text-center transition-colors hover:border-primary/40"
            >
              <span className="truncate text-2xl font-bold leading-[30px] text-primary" lang={l.code}>
                {l.nativeName.slice(0, 2)}
              </span>
              <span className="w-full truncate text-[15px] font-bold text-foreground">{l.name}</span>
              <span
                className={cn(
                  "line-clamp-2 text-[11px] font-semibold leading-[14px]",
                  included ? "text-success" : "text-muted-foreground",
                )}
              >
                {included ? "Included" : "Chai opens stops"}
              </span>
            </button>
          ))}
        </div>
        {/* The picker itself, opened by any tile; the trigger is the tiles. */}
        <LanguagePicker open={pickerOpen} onOpenChange={setPickerOpen} trigger={<span />} />
        {/* The signpost, free tier only: where the Chai actually goes. */}
        <LanguageSignpostRow />
      </div>
      <ChaiWalletSheet open={walletOpen} onOpenChange={setWalletOpen} />
    </div>
  );
}
