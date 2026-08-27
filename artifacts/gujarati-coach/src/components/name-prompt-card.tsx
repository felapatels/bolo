import { useState } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import {
  useUpdateAccountProfile,
  useGetAccount,
  getGetAccountQueryKey,
} from "@workspace/api-client-react";
import { Mascot } from "@/components/mascot";

/**
 * One-time home prompt for the PUBLIC USERNAME.
 *
 * IT USED TO ASK FOR A DISPLAY NAME. Changed 2026-08-25: "the username prompt
 * should be on the homepage instead of the display name prompt". The display
 * name is private and Clerk already has a first name for most learners, so
 * that prompt was asking for something the app mostly had. The username is the
 * one the app cannot derive and cannot default: it is what other learners see,
 * and until it exists the learner appears on no global surface at all.
 *
 * A NEW DISMISSAL KEY, DELIBERATELY. Anybody who dismissed the old name prompt
 * would otherwise never be shown this one, and they are exactly the population
 * that needs asking: every existing account has username null. Reusing the key
 * would have silently excluded them.
 *
 * DISMISSIBLE, AND THAT IS THE POINT. A username is opt-in by an act; a prompt
 * that cannot be closed is not a choice. Settings remains the edit path.
 */
export const USERNAME_PROMPT_DISMISSED_KEY = "bolo.usernamePromptDismissed";
/** The retired key. Kept named so nobody reuses it and re-suppresses the new prompt. */
export const NAME_PROMPT_DISMISSED_KEY = "bolo.namePromptDismissed";

function loadDismissed(): boolean {
  try {
    return window.localStorage.getItem(USERNAME_PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    window.localStorage.setItem(USERNAME_PROMPT_DISMISSED_KEY, "1");
  } catch {
    // Storage unavailable; the prompt may reappear next visit, which is safe.
  }
}

export function NamePromptCard() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const updateProfile = useUpdateAccountProfile();
  const { data: account } = useGetAccount();
  const [dismissed, setDismissed] = useState<boolean>(() => loadDismissed());
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Waits for the account rather than assuming: showing the prompt while the
  // profile is still loading would flash it at somebody who already has a name.
  const profile = account?.profile;
  if (!user || !profile || profile.username || dismissed) return null;

  const dismiss = () => {
    persistDismissed();
    setDismissed(true);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile.mutateAsync({ data: { username: trimmed } });
      await queryClient.invalidateQueries({ queryKey: getGetAccountQueryKey() });
      persistDismissed();
      setDismissed(true);
    } catch (err) {
      // THE SERVER'S OWN SENTENCE. Only it knows which rule broke: shape, a
      // reserved word, the profanity screen, or a name already taken. A
      // generic "try again" sends the learner round the same loop.
      const data = (err as { data?: { error?: string } } | null)?.data;
      setError(data?.error ?? "Couldn't save that. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="name-prompt-card"
      className="mt-5 flex items-start gap-4 rounded-2xl border border-card-border bg-card p-4 shadow-sm"
    >
      <Mascot pose="wave" size={56} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-base font-extrabold text-foreground">
          Pick a username
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          This is the name other learners see on the Everyone board and feed.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            data-testid="name-prompt-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
            placeholder="Your username"
            aria-label="Your username"
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <button
            data-testid="name-prompt-save"
            onClick={() => void save()}
            disabled={!name.trim() || saving}
            className="h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          You can change this any time in Settings, or skip and stay anonymous.
        </p>
      </div>
      <button
        data-testid="name-prompt-dismiss"
        onClick={dismiss}
        aria-label="Dismiss username prompt"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
