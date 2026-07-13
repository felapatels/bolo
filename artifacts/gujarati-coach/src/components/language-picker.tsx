import { useState } from "react";
import { useLocation } from "wouter";
import { Check, ChevronDown, Globe, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLanguage, nativeTextProps } from "@/lib/language-context";
import { useEntitlements, upgradeHref } from "@/lib/entitlements";
import { PlusPill } from "@/components/plus";

export function LanguagePicker() {
  const { languages, activeLang, activeLanguage, setActiveLang } = useLanguage();
  const { isLanguageAllowed } = useEntitlements();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
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
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a language</DialogTitle>
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
                    // Locked-but-visible: invite the upgrade instead of erroring.
                    // A single locked language is cheapest to unlock with the
                    // One Language tier, so preselect it and pre-pick this one.
                    setOpen(false);
                    setLocation(
                      upgradeHref({ plan: "one_language", lang: lang.code }),
                    );
                    return;
                  }
                  setActiveLang(lang.code);
                  setOpen(false);
                }}
                className={cn(
                  "relative flex items-center justify-between gap-2 rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98]",
                  selected
                    ? "border-primary bg-primary/5"
                    : locked
                      ? "border-card-border bg-muted/40 hover:border-primary/40"
                      : "border-card-border bg-white hover:border-primary/40",
                )}
              >
                <div className="min-w-0">
                  <span
                    className={cn(
                      "block text-xl font-bold leading-tight truncate",
                      locked ? "text-muted-foreground" : "text-foreground",
                    )}
                    style={native.style}
                    dir={native.dir}
                  >
                    {lang.nativeName}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <span className="truncate">{lang.name}</span>
                    {locked && <PlusPill />}
                  </span>
                </div>
                {selected ? (
                  <Check className="w-5 h-5 text-primary shrink-0" />
                ) : locked ? (
                  <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
