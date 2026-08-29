// The first-word lightbox: the words and the dialog. The rules, the copy and
// the ordering with the badge celebration live in lib/first-word-primer.ts.
import { ArrowRight } from "lucide-react";
import { Mascot } from "@/components/mascot";
import { Button } from "@/components/ui/button";
import { FIRST_WORD_PRIMER_COPY } from "@/lib/first-word-primer";

export function FirstWordPrimer({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  if (!open) return null;
  return (
    // An OPAQUE ground, not a dim: the score is already laid out underneath
    // and "right before they see their score" means not a glimpse of it.
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-word-primer-title"
      data-testid="first-word-primer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6"
    >
      <div className="w-full max-w-sm rounded-3xl border border-card-border bg-card p-6 text-center shadow-lg">
        <div className="flex justify-center">
          <Mascot pose="cheer" size={96} />
        </div>
        <h2
          id="first-word-primer-title"
          className="mt-3 text-2xl font-extrabold text-foreground"
        >
          {FIRST_WORD_PRIMER_COPY.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {FIRST_WORD_PRIMER_COPY.body}
        </p>
        <Button
          size="lg"
          className="mt-5 w-full"
          onClick={onDismiss}
          data-testid="first-word-primer-cta"
        >
          {FIRST_WORD_PRIMER_COPY.cta}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
