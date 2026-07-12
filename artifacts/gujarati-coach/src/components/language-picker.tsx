import { useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLanguage, nativeTextProps } from "@/lib/language-context";

export function LanguagePicker() {
  const { languages, activeLang, activeLanguage, setActiveLang } = useLanguage();
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
            return (
              <button
                key={lang.code}
                onClick={() => {
                  setActiveLang(lang.code);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98]",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-card-border bg-white hover:border-primary/40",
                )}
              >
                <div className="min-w-0">
                  <span
                    className="block text-xl font-bold text-foreground leading-tight truncate"
                    style={native.style}
                    dir={native.dir}
                  >
                    {lang.nativeName}
                  </span>
                  <span className="block text-xs font-medium text-muted-foreground truncate">
                    {lang.name}
                  </span>
                </div>
                {selected && (
                  <Check className="w-5 h-5 text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
