import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Check, ChevronDown, Crown, Globe } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLanguage, nativeTextProps } from "@/lib/language-context";
import { useEntitlements } from "@/lib/entitlements";
import { useExplicitLanguageChoice } from "@/lib/language-step";

type LanguagePickerProps = {
  /** Optional external open state — pass both open + onOpenChange to control from outside. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional custom trigger element. Falls back to the default Globe button. */
  trigger?: ReactNode;
};

export function LanguagePicker({ open: openProp, onOpenChange, trigger }: LanguagePickerProps = {}) {
  const { languages, activeLang, activeLanguage, setActiveLang } = useLanguage();
  const { isLanguageAllowed } = useEntitlements();
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
      className="flex items-center gap-2 rounded-2xl bg-white border border-card-border px-4 h-12 shadow-[0_4px_0_rgba(0,0,0,0.08)] active:translate-y-1 active:shadow-none transition-all"
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
                  "relative flex flex-col rounded-3xl border p-3 pr-8 text-left shadow-sm transition-all active:scale-[0.98]",
                  selected
                    ? "border-primary bg-primary/5"
                    : locked
                      ? "border-card-border/70 bg-muted/40 hover:border-primary/30"
                      : "border-card-border/70 bg-card hover:border-primary/30",
                )}
              >
                {/* Lock state is a single compact corner glyph — no
                    full-width badge, so names always render in full. */}
                {selected ? (
                  <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-primary" />
                ) : locked ? (
                  <Crown
                    className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-secondary"
                    fill="currentColor"
                    aria-label="Needs All-Access"
                    data-testid={`picker-locked-${lang.code}`}
                  />
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
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
