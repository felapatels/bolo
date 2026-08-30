// The flashback lightbox: the words and the dialog. The copy and the rule for
// when it shows live in lib/flashback-lightbox.ts. Same shell as the
// first-word primer, so the two beats on the practice page read as one
// family. Mobile twin: components/FlashbackLightbox.tsx.
import { ArrowRight } from "lucide-react";
import { Mascot } from "@/components/mascot";
import { Button } from "@/components/ui/button";
import { FLASHBACK_LIGHTBOX_COPY } from "@/lib/flashback-lightbox";

export function FlashbackLightbox({
  open,
  onEnter,
  onSkip,
}: {
  open: boolean;
  onEnter: () => void;
  onSkip: () => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="flashback-lightbox-title"
      data-testid="flashback-lightbox"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
    >
      <div className="w-full max-w-sm rounded-3xl border border-card-border bg-card p-6 text-center shadow-lg">
        <div className="flex justify-center">
          <Mascot pose="thumbsup" size={96} />
        </div>
        <p className="mt-3 text-[11px] font-black uppercase tracking-[1.4px] text-primary">
          {FLASHBACK_LIGHTBOX_COPY.eyebrow}
        </p>
        <h2 id="flashback-lightbox-title" className="mt-1 text-2xl font-extrabold text-foreground">
          {FLASHBACK_LIGHTBOX_COPY.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{FLASHBACK_LIGHTBOX_COPY.body}</p>
        <Button size="lg" className="mt-5 w-full" onClick={onEnter} data-testid="flashback-lightbox-enter">
          {FLASHBACK_LIGHTBOX_COPY.enter}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={onSkip}
          data-testid="flashback-lightbox-skip"
          className="mt-3 px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          {FLASHBACK_LIGHTBOX_COPY.skip}
        </button>
      </div>
    </div>
  );
}
