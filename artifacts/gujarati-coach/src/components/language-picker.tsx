import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Check, ChevronDown, Globe } from "lucide-react";
import { GoldChip } from "@/components/gold-chip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLanguage, nativeTextProps } from "@/lib/language-context";
import { getJourneyLine } from "@/lib/journeyLines";
import { useEntitlements } from "@/lib/entitlements";
import { useExplicitLanguageChoice } from "@/lib/language-step";

type LanguagePickerProps = {
  /** Optional external open state — pass both open + onOpenChange to control from outside. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional custom trigger element. Falls back to the default Globe button. */
  trigger?: ReactNode;
};

/**
 * The two chips on a locked language card, borrowed from the games hub
 * (pages/games/index.tsx) at a smaller size. There is no shared token
 * behind either colour: the games hub types the same literals inline, so
 * this copies them rather than inventing a third value.
 *
 * TWO CHIPS, not one, because gold alone reads as a wall. Every language
 * gives a real free taste and the paywall says so out loud ("You've had
 * your free taste of Gujarati"). The green invites, the gold explains what
 * comes after. Neither fact is obvious from the other.
 *
 * ONE DELIBERATE DIFFERENCE from the games rule. There, gold labels the
 * CONTENT and shows on a gated card even to a subscriber, which reads fine
 * on a mixed catalog. Here 21 of 22 languages are All-Access, so that rule
 * would paint gold on almost every card for someone who already owns them
 * all. On this surface the pair means "locked to YOU", so it renders only
 * when the language is actually locked.
 */
function FreeTasteChip({ label = "Free taste" }: { label?: string } = {}) {
  return (
    <span className="inline-flex w-fit items-center whitespace-nowrap rounded-full bg-gradient-to-b from-[#4ADE80] to-[#16A34A] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white shadow-[0_1px_0_rgba(0,0,0,0.28)] ring-1 ring-white/70">
      {label}
    </span>
  );
}

/**
 * The free-tier language's own chip. The server names that language
 * (entitlements.freeLanguage) because allowedLanguages cannot: for a paid
 * learner every code is allowed, so the free one is indistinguishable. It
 * describes the LANGUAGE rather than the viewer, so it renders on every plan.
 */
function IncludedFreeBadge({ testId }: { testId: string }) {
  return (
    <span
      data-testid={testId}
      aria-label="Included free"
      className="mt-1.5 flex flex-wrap items-center gap-1"
    >
      <FreeTasteChip label="Included free" />
    </span>
  );
}

function AllAccessBadge({ testId }: { testId: string }) {
  return (
    <span
      data-testid={testId}
      aria-label="Free taste, then All-Access"
      className="mt-1.5 flex flex-wrap items-center gap-1"
    >
      <FreeTasteChip />
      {/* The gold pill lives in components/gold-chip.tsx now that friend rows
          wear the same one for First Class. Same shape, one definition. */}
      <GoldChip>All-Access</GoldChip>
    </span>
  );
}

export function LanguagePicker({ open: openProp, onOpenChange, trigger }: LanguagePickerProps = {}) {
  const { languages, activeLang, activeLanguage, setActiveLang } = useLanguage();
  const { isLanguageAllowed, freeLanguage } = useEntitlements();
  // An explicit pick here is a real choice: persist it (and the B1
  // hasChosenLanguage flag) server-side, fire-and-forget, so the choice
  // follows the learner across devices and the selection step never re-shows.
  const { choose } = useExplicitLanguageChoice();
  const [, setLocation] = useLocation();
  const [internalOpen, setInternalOpen] = useState(false);

  // Support both controlled (open + onOpenChange passed in) and uncontrolled usage.
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = (val: boolean) => {
    setInternalOpen(val);
    onOpenChange?.(val);
  };

  const defaultTrigger = (
    <button
      className="flex items-center gap-2 rounded-2xl bg-card border border-card-border px-4 h-12 shadow-[0_4px_0_rgba(0,0,0,0.08)] active:translate-y-1 active:shadow-none transition-all"
      title="Change language"
    >
      <Globe className="w-5 h-5 text-primary" />
      <span className="font-bold text-foreground text-sm max-w-[7rem] truncate">
        {activeLanguage?.name ?? "Language"}
      </span>
      <ChevronDown className="w-4 h-4 text-muted-foreground" />
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a language</DialogTitle>
          {/* One shared note instead of a per-tile badge, so tile rows have
              room to show every English name in full at narrow widths. */}
          {languages.some((l) => !isLanguageAllowed(l.code)) && (
            <p className="text-xs font-medium text-muted-foreground">
              Locked languages need All-Access
            </p>
          )}
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1 -mr-1">
          {languages.map((lang) => {
            const native = nativeTextProps(lang);
            const selected = lang.code === activeLang;
            const locked = !isLanguageAllowed(lang.code);
            // The tile wears its language's RAIL LINE ACCENT, the same
            // colour its boarding pass and journey map use. Picking a
            // language is picking a line. Mobile has worn this since
            // chat 13; web is catching up. Locked tiles keep the accent
            // at full strength: the stripe is the invitation to preview.
            const accent = getJourneyLine(lang.code).accent;
            return (
              <button
                key={lang.code}
                onClick={() => {
                  if (locked) {
                    // Locked-but-visible: open this language's journey map in
                    // showroom mode — a browsable teaser with an upgrade path —
                    // instead of bouncing straight to the paywall.
                    setActiveLang(lang.code);
                    choose(lang.code);
                    setOpen(false);
                    setLocation("/journey");
                    return;
                  }
                  setActiveLang(lang.code);
                  choose(lang.code);
                  setOpen(false);
                }}
                className={cn(
                  // pr-8 clears the corner glyph; the English name below gets
                  // the full tile width and never truncates.
                  // overflow-hidden is LOAD-BEARING: the 5px rail cannot
                  // trace a rounded-3xl corner, so it overhangs unless the
                  // tile clips. Mobile hit exactly this in 646fbe3 and
                  // solved it the same way. pl-3 becomes pl-4 to clear
                  // the stripe.
                  "relative flex flex-col overflow-hidden rounded-3xl border py-3 pl-4 pr-8 text-left shadow-sm transition-all active:scale-[0.98]",
                  selected
                    ? "border-primary bg-primary/5"
                    : locked
                      ? "border-card-border/70 bg-muted/40 hover:border-primary/30"
                      : "border-card-border/70 bg-card hover:border-primary/30",
                )}
              >
                <span
                  aria-hidden="true"
                  data-testid={`lang-rail-${lang.code}`}
                  className="absolute inset-y-0 left-0 w-[5px]"
                  style={{ backgroundColor: accent }}
                />
                {/* Lock state is a single compact corner glyph — no
                    full-width badge, so names always render in full. */}
                {selected ? (
                  <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-primary" />
                ) : null}
                <span
                  className={cn(
                    "block w-full text-xl font-bold",
                    // Nastaliq glyphs (Kashmiri, Urdu, Sindhi) cascade
                    // vertically — leading-tight clips them. Give them
                    // relaxed overflow instead of clipping.
                    native.isNastaliq
                      ? "overflow-visible"
                      : "leading-tight truncate",
                    locked ? "text-muted-foreground" : "text-foreground",
                  )}
                  style={native.style}
                  dir={native.dir}
                >
                  {lang.nativeName}
                </span>
                <span className="mt-0.5 block w-full text-xs font-medium text-muted-foreground">
                  {lang.name}
                </span>
                {/* Explicit branches: the free language is never locked, but
                    say so in the code rather than leaning on that. */}
                {locked ? (
                  <AllAccessBadge testId={`picker-locked-${lang.code}`} />
                ) : lang.code === freeLanguage ? (
                  <IncludedFreeBadge testId={`picker-free-${lang.code}`} />
                ) : null}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
