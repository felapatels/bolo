import { useState } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import {
  useUpdateAccountProfile,
  getGetAccountQueryKey,
} from "@workspace/api-client-react";
import { Mascot } from "@/components/mascot";

/**
 * One-time home prompt shown when the signed-in user has no first name yet.
 * Saving goes through the existing PATCH /account/profile dual-write (Clerk +
 * users.display_name) so every consumer updates, then reloads the Clerk user
 * so the greeting picks up the new name immediately. Dismissal persists in
 * localStorage and the prompt never nags again; Settings remains the edit
 * path.
 */
export const NAME_PROMPT_DISMISSED_KEY = "bolo.namePromptDismissed";

function loadDismissed(): boolean {
  try {
    return window.localStorage.getItem(NAME_PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    window.localStorage.setItem(NAME_PROMPT_DISMISSED_KEY, "1");
  } catch {
    // Storage unavailable; the prompt may reappear next visit, which is safe.
  }
}

export function NamePromptCard() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const updateProfile = useUpdateAccountProfile();
  const [dismissed, setDismissed] = useState<boolean>(() => loadDismissed());
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || user.firstName || dismissed) return null;

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
      await updateProfile.mutateAsync({ data: { displayName: trimmed } });
      await user.reload();
      await queryClient.invalidateQueries({ queryKey: getGetAccountQueryKey() });
      persistDismissed();
      setDismissed(true);
    } catch {
      setError("Couldn't save that. Please try again.");
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
          What should Bolo call you?
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            data-testid="name-prompt-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
            placeholder="Your name"
            aria-label="Your name"
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
          You can change this any time in Settings.
        </p>
      </div>
      <button
        data-testid="name-prompt-dismiss"
        onClick={dismiss}
        aria-label="Dismiss name prompt"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
