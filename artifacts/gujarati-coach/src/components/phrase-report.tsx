import { useState } from "react";
import { Flag } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useReportPhrase } from "@workspace/api-client-react";

// Spec B2: the four report reasons, in display order. Values match the
// server's PHRASE_REPORT_REASONS enum.
const REASONS = [
  { value: "translation_wrong", label: "Translation wrong" },
  { value: "transliteration_wrong", label: "Transliteration wrong" },
  { value: "audio_wrong", label: "Audio wrong" },
  { value: "other", label: "Other" },
] as const;
type ReasonValue = (typeof REASONS)[number]["value"];

/**
 * Low-prominence flag affordance on the practice phrase card (Spec B2).
 * Two taps total: tap the flag, tap a reason. The optional note (280 chars)
 * is never required. Submission is fire-and-forget: the thanks toast shows
 * immediately, failures are silent, and nothing about the practice flow
 * changes based on report state.
 */
export function PhraseReportButton({
  phraseId,
}: {
  phraseId: number | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const report = useReportPhrase();

  if (!phraseId) return null;

  const submit = (reason: ReasonValue) => {
    const trimmed = note.trim();
    // Fire-and-forget (Spec B2): optimistic thanks, no spinner, failures
    // silent. The server derives language_code/stage from the phrase row.
    report.mutate(
      {
        id: phraseId,
        data: { reason, ...(trimmed ? { note: trimmed } : {}) },
      },
      { onError: () => {} },
    );
    setOpen(false);
    setNote("");
    toast({ description: "Thanks, we'll check it" });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setNote("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Report a problem with this phrase"
          className="shrink-0 self-start p-2 -m-1 text-muted-foreground/40 hover:text-muted-foreground focus-visible:text-muted-foreground transition-colors"
        >
          <Flag className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="text-sm font-semibold text-foreground mb-2">
          What's wrong with this phrase?
        </p>
        <div className="flex flex-col gap-1.5" role="group">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => submit(r.value)}
              className="text-left text-sm text-foreground rounded-lg border border-card-border px-3 py-2 hover:bg-muted active:scale-[0.99] transition-colors"
            >
              {r.label}
            </button>
          ))}
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          placeholder="Optional note"
          aria-label="Optional note"
          className="mt-2 h-16 text-sm resize-none"
        />
      </PopoverContent>
    </Popover>
  );
}
