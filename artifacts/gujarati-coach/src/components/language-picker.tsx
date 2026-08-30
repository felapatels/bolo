import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Check, ChevronDown, Globe, Search, X } from "lucide-react";
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
import { foldForSearch, loadRecentLanguages, recordRecentLanguage } from "@/lib/recent-languages";

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

  /**
   * SEARCH AND A RECENT ROW (mobile build 20, here 2026-08-30 on the owner's
   * "Language switcher on web should have the same search and recent
   * functionality as mobile"). The picker is 22 languages in a two-column
   * grid, eleven rows of scrolling; a learner looking for Marathi had to
   * scroll and hope.
   *
   * A REOPENED PICKER STARTS EMPTY: the search text is cleared on every
   * opening, and the recent list is reloaded on the same beat, so a switch
   * made a moment ago is in the row when they come back.
   */
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setRecent(loadRecentLanguages());
  }, [open]);
  // Matches the ENGLISH name and the NATIVE name, because a learner who reads
  // the script will type in it, and the grid shows both. Case and diacritics
  // fold, so "gujarati" finds "Gujarātī".
  const q = foldForSearch(query.trim());
  const filtered = q
    ? languages.filter(
        (l) =>
          foldForSearch(l.name).includes(q) ||
          foldForSearch(l.nativeName ?? "").includes(q) ||
          foldForSearch(l.code).includes(q),
      )
    : languages;
  // The row that saves the scroll. Hidden while searching, because a filtered
  // grid is already the short list, and hidden when it would only repeat the
  // language the learner is already on.
  const recentLanguages = q
    ? []
    : recent
        .filter((code) => code !== activeLang)
        .map((code) => languages.find((l) => l.code === code))
        .filter((l): l is (typeof languages)[number] => Boolean(l))
        .slice(0, 3);

  const pick = (code: string, locked: boolean) => {
    recordRecentLanguage(code);
    if (locked) {
      // Locked-but-visible: open this language's journey map in showroom
      // mode, a browsable teaser with an upgrade path, instead of bouncing
      // straight to the paywall.
      setActiveLang(code);
      choose(code);
      setOpen(false);
      setLocation("/journey");
      return;
    }
    setActiveLang(code);
    choose(code);
    setOpen(false);
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
          {/* WHAT THIS SCREEN DOES, unconditionally (mobile's line). It
              answers the question a picker actually raises, "do I lose what
              I have done": progress, streaks and mastery are keyed per
              language server-side, so switching keeps every language's work
              separately. */}
          <p className="text-xs font-medium text-muted-foreground" data-testid="picker-subtitle">
            Tap a language to switch. Each one keeps its own progress.
          </p>
          {/* One shared note instead of a per-tile badge, so tile rows have
              room to show every English name in full at narrow widths. */}
          {/* A LOCKED LANGUAGE IS NOT A WALL, AND THIS USED TO SAY IT WAS.
              "Locked languages need All-Access" is false: every Free user gets
              a lifetime teaser on EVERY locked language — the first few phrases
              of its Greetings group, with the whole pipeline behind them (TTS,
              speaking, scoring, XP). See TEASER_LIMIT in api-server's
              lib/teaser.ts. The picker was talking a learner out of the exact
              thing the landing page sells them as "a free taste of all 22
              languages".
              NO NUMBER ON PURPOSE. TEASER_LIMIT lives on the server and is not
              exposed through the API, so a "first 3 phrases" here would be a
              copy of a constant this artifact cannot see, and would go stale
              silently the day it changes. */}
          {languages.some((l) => !isLanguageAllowed(l.code)) && (
            <p className="text-xs font-medium text-muted-foreground">
              Locked languages start with a free taste. All-Access opens the rest.
            </p>
          )}
        </DialogHeader>
        {/* SEARCH. 22 languages is eleven rows of two, and a learner who
            knows what they want should not have to scroll for it.
            autoCorrect off: language names are exactly the words a keyboard
            likes to "fix". */}
        <label className="flex items-center gap-2 rounded-2xl border border-border bg-muted px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            data-testid="language-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search languages"
            aria-label="Search languages"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query.length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="shrink-0 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
        {recentLanguages.length > 0 && (
          <div data-testid="language-recent" className="space-y-2">
            {/* "RECENT", NOT "RECENTLY PRACTISED": see lib/recent-languages.ts. */}
            <p className="text-[10px] font-extrabold tracking-[1.4px] text-muted-foreground">RECENT</p>
            <div className="flex flex-wrap gap-2">
              {recentLanguages.map((l) => {
                const locked = !isLanguageAllowed(l.code);
                return (
                  <button
                    key={l.code}
                    type="button"
                    data-testid={`language-recent-${l.code}`}
                    aria-label={`Switch to ${l.name}`}
                    onClick={() => pick(l.code, locked)}
                    className="rounded-full border-[1.5px] bg-card px-3 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted"
                    style={{ borderColor: getJourneyLine(l.code).accent }}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {q && filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="language-no-match">
            No language matches "{query.trim()}".
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1 -mr-1">
          {filtered.map((lang) => {
            const native = nativeTextProps(lang);
            const selected = lang.code === activeLang;
            const locked = !isLanguageAllowed(lang.code);
            // The tile wears its language's RAIL LINE ACCENT, the same
            // colour its boarding pass and journey map use. Picking a
            // language is picking a line. Mobile has worn this since
            // chat 13; web is catching up.
            //
            // A BORDER, not an absolute stripe. A 5px positioned box
            // cannot trace a rounded-3xl corner and renders as a
            // crescent; border-l-4 follows the radius natively and needs
            // no clipping. Locked tiles keep the accent at full
            // strength: the stripe is the invitation to preview.
            const accent = getJourneyLine(lang.code).accent;
            return (
              <button
                key={lang.code}
                onClick={() => pick(lang.code, locked)}
                className={cn(
                  // pr-8 clears the corner glyph; the English name below gets
                  // the full tile width and never truncates.
                  // MIN-HEIGHT IS LOAD-BEARING. Without it the tile shrinks
                  // to its natural height and the chip row overlaps the
                  // native name. Matches mobile's minHeight 104 / 128, and
                  // justify-end sits the content at the bottom of the taller
                  // box the way mobile's justifyContent: 'flex-end' does.
                  "relative flex flex-col justify-end rounded-3xl border border-l-4 p-3 pr-8 text-left shadow-sm transition-all active:scale-[0.98]",
                  native.isNastaliq ? "min-h-[128px]" : "min-h-[104px]",
                  selected
                    ? "border-primary bg-primary/5"
                    : locked
                      ? "border-card-border/70 bg-muted/40 hover:border-primary/30"
                      : "border-card-border/70 bg-card hover:border-primary/30",
                )}
                style={{ borderLeftColor: accent }}
              >
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
