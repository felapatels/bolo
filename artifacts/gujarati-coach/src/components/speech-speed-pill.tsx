import { useSyncExternalStore } from "react";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadSpeechRatePref,
  nextSpeechRate,
  saveSpeechRatePref,
  speechRateLabel,
  subscribeSpeechRate,
} from "@/lib/speechRatePref";

/**
 * THE SPEAKING SPEED, WHERE THE SPEAKING HAPPENS.
 *
 * Owner, 2026-09-17, verbatim: "where is the coach and bolo speed setting on
 * the chat screen? it should be on chat screen and lesson screens, wherever
 * bolo or coach speaks". The control landed on 2026-09-13 (ledger X96) on the
 * account page only.
 *
 * ONE PREFERENCE, MANY DOORS. This reads and writes lib/speechRatePref.ts, the
 * exact key the account page uses, and subscribes to it, so a change here
 * shows on the account page and on every other pill that is mounted.
 *
 * IT IS STILL A PLAYBACK RATE. Every play site calls applySpeechRate(el),
 * which reads the stored rate at that moment, so the next clip plays at the
 * new speed and nothing is re-synthesised.
 *
 * A single pill that CYCLES Normal, Slow, Slower, so it costs one slot in a
 * header. The state is the WORD on the pill (the account page's own labels),
 * never a colour: the owner is partially colour blind.
 *
 * Mobile twin: bolo-mobile/components/SpeechSpeedPill.tsx.
 */
export function useSpeechRate(): number {
  return useSyncExternalStore(subscribeSpeechRate, loadSpeechRatePref, loadSpeechRatePref);
}

export function SpeechSpeedPill({
  variant = "compact",
  testId = "speech-speed-pill",
  className,
}: {
  /**
   * `compact`: lesson header slot, the icon and the word, fixed width so
   * cycling never reflows the header.
   * `labelled`: adds "Speed", for a row with room (chat's language row).
   * `stacked`: icon over the word, sized like the 36px game mute button so a
   * game title stays close to centre.
   */
  variant?: "compact" | "labelled" | "stacked";
  testId?: string;
  className?: string;
}) {
  const rate = useSpeechRate();
  const label = speechRateLabel(rate);
  const nextLabel = speechRateLabel(nextSpeechRate(rate));

  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={`Speaking speed: ${label}`}
      title={`Speaking speed: ${label}. Tap for ${nextLabel}.`}
      onClick={() => saveSpeechRatePref(nextSpeechRate(rate))}
      className={cn(
        "flex shrink-0 items-center justify-center border border-card-border bg-card text-foreground transition-all active:scale-[0.97]",
        // Below 400px (an iPhone SE is 375) the icon goes and the slot narrows:
        // the practice header already holds the back arrow, progress bar,
        // counter, XP, language chip and gear, and the bar is what gives way.
        variant === "compact" &&
          "h-8 w-[76px] gap-1 rounded-full px-1.5 text-xs font-bold max-[400px]:w-[56px]",
        variant === "labelled" &&
          "gap-2 rounded-2xl px-4 py-2 text-sm font-bold shadow-[0_4px_0_rgba(0,0,0,0.08)] active:translate-y-1 active:shadow-none",
        variant === "stacked" && "h-9 w-12 flex-col gap-0 rounded-xl text-[10px] font-bold leading-none",
        className,
      )}
    >
      <Gauge
        className={cn(
          "shrink-0 text-primary",
          variant === "labelled" ? "h-4 w-4" : "h-3.5 w-3.5",
          variant === "compact" && "max-[400px]:hidden",
        )}
        aria-hidden
      />
      {variant === "labelled" && <span className="font-semibold text-muted-foreground">Speed</span>}
      <span data-testid={`${testId}-label`} className="whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}
