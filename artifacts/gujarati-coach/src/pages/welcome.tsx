import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Play } from "lucide-react";
import { useGetAccount } from "@workspace/api-client-react";
import { LanguagePicker } from "@/components/language-picker";
import { Mascot } from "@/components/mascot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WALKTHROUGH_STEPS, useFinishWalkthrough } from "@/lib/walkthrough";

// THE WALKTHROUGH, build 19: the language picker over card one, then four
// cards, each one Bolo in a pose, a title and two lines. Next advances; the
// last card's button and Skip both leave for home and retire the walkthrough
// for this account (lib/walkthrough.ts). Mobile twin: app/(app)/welcome.tsx.
export default function Welcome() {
  const [, setLocation] = useLocation();
  const finish = useFinishWalkthrough();
  const [index, setIndex] = useState(0);

  // STEP ONE IS THE LANGUAGE PICKER, the same dialog home's Practicing card
  // opens, with its search and coloured tiles. Once, over card one, for an
  // account that has not chosen; the ref stops a close without a pick from
  // reopening it.
  const account = useGetAccount();
  const chosen = account.data?.preferences?.learning?.hasChosenLanguage;
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerOpenedRef = useRef(false);
  useEffect(() => {
    if (chosen === false && !pickerOpenedRef.current) {
      pickerOpenedRef.current = true;
      setPickerOpen(true);
    }
  }, [chosen]);

  const step = WALKTHROUGH_STEPS[index]!;
  const last = index === WALKTHROUGH_STEPS.length - 1;

  const leave = (reason: "done" | "skipped") => {
    finish(reason, index);
    setLocation("/app");
  };

  const next = () => {
    if (last) {
      leave("done");
      return;
    }
    setIndex(index + 1);
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <LanguagePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        trigger={<span className="hidden" aria-hidden="true" />}
      />
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 py-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => leave("skipped")}
            data-testid="walkthrough-skip"
            className="text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <Mascot pose={step.pose} size={168} />
          <h1
            data-testid="walkthrough-title"
            className="mt-3 text-3xl font-extrabold text-foreground"
          >
            {step.title}
          </h1>
          <p className="max-w-sm text-base leading-relaxed text-muted-foreground">
            {step.body}
          </p>
          {/* The current dot is a pill, not only a colour: state is never
              carried by hue alone here. */}
          <div data-testid="walkthrough-dots" className="mt-2 flex gap-2" aria-hidden="true">
            {WALKTHROUGH_STEPS.map((s, i) => (
              <span
                key={s.key}
                data-testid={i === index ? "walkthrough-dot-current" : "walkthrough-dot"}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === index ? "w-6 bg-primary" : "w-2 bg-border",
                )}
              />
            ))}
          </div>
        </div>

        <div className="pb-6 pt-3">
          <Button
            size="lg"
            className="w-full"
            onClick={next}
            data-testid="walkthrough-next"
          >
            {last ? "Let's go" : "Next"}
            {last ? (
              <Play className="ml-2 h-4 w-4" />
            ) : (
              <ArrowRight className="ml-2 h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
