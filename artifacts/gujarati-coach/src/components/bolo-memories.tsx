import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import {
  useGetAccountMemories,
  useForgetAccountMemories,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

/**
 * WHAT BOLO REMEMBERS, AND THE WAY TO MAKE HIM STOP.
 *
 * Bolo began keeping notes between sessions on 2026-08-27. `GET` and `DELETE
 * /account/memories` shipped with the feature, and then nothing on any client
 * called them: web wrote memories about learners, said nothing about it, and
 * offered no way to look. Mobile at least carried a disclosure. Many of these
 * learners are children, so this is a privacy control, not a settings toy.
 *
 * IT RENDERS EVEN WHEN THE LIST IS EMPTY, unlike `BlockedLearnersList` next to
 * it. Hiding the section until there is something in it reproduces the exact
 * silence being fixed: a parent looking for what is held would find no section
 * and learn nothing, and "nothing is held" is the answer they came for.
 *
 * THE SENTENCES ARE ENGLISH whatever language the lesson was in, because they
 * are written to be read by the model. That reads oddly next to a Gujarati
 * lesson, so the copy says so rather than leaving it to be puzzled over.
 */
export function BoloMemories() {
  const { data, isLoading, isError } = useGetAccountMemories();
  const forget = useForgetAccountMemories();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const memories = data?.memories ?? [];

  async function handleForget() {
    try {
      const res = await forget.mutateAsync();
      await queryClient.invalidateQueries();
      toast({
        title: "Bolo forgot everything",
        description:
          res.forgotten === 1
            ? "1 note deleted."
            : `${res.forgotten} notes deleted.`,
      });
    } catch {
      toast({
        title: "Could not clear the notes",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-4" data-testid="bolo-memories">
      <p className="text-sm text-muted-foreground">
        Bolo keeps a few short notes about you so he can pick up where you left
        off. He writes them in English whatever language you are learning,
        because the notes are for him rather than for you. He never keeps a
        recording or a transcript of anything you say.
      </p>

      {isLoading && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="bolo-memories-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking what Bolo has written down...
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive" data-testid="bolo-memories-error">
          Could not load Bolo's notes just now. Please try again later.
        </p>
      )}

      {!isLoading && !isError && memories.length === 0 && (
        <p
          className="rounded-2xl border border-border p-3 text-sm text-muted-foreground"
          data-testid="bolo-memories-empty"
        >
          Bolo has not written anything down about you yet.
        </p>
      )}

      {memories.length > 0 && (
        <ul className="space-y-2" data-testid="bolo-memories-list">
          {memories.map((m) => (
            <li
              key={m.id}
              data-testid={`bolo-memory-${m.id}`}
              className="rounded-2xl border border-border p-3"
            >
              <p className="text-sm text-foreground">{m.memory}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatRemembered(m.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {memories.length > 0 && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full"
              data-testid="bolo-memories-forget"
              disabled={forget.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Make Bolo forget everything
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Make Bolo forget everything?</AlertDialogTitle>
              <AlertDialogDescription>
                {/* All or nothing, because the endpoint is. Saying so up front
                    beats letting someone hunt for a per-note delete. */}
                This deletes all {memories.length}{" "}
                {memories.length === 1 ? "note" : "notes"} Bolo has kept about
                you. He will still chat exactly as before, he just starts again
                not knowing you. Your progress, badges and friends are not
                affected. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={forget.isPending}>
                Keep them
              </AlertDialogCancel>
              <AlertDialogAction
                data-testid="bolo-memories-forget-confirm"
                onClick={(e) => {
                  e.preventDefault();
                  void handleForget();
                }}
                disabled={forget.isPending}
              >
                {forget.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Forget everything"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

/**
 * "Remembered on 5 August 2026". A bad or missing date must never take the
 * section down: the sentence is the thing the learner came to read, and a
 * timestamp is a nicety beside it.
 */
function formatRemembered(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Remembered earlier";
  return `Remembered on ${d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;
}
