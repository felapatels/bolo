import { useState, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadGameAudioPref, saveGameAudioPref } from "@/lib/gameAudioPref";

/**
 * Shared game audio preference hook. Default unmuted; persists per browser
 * via localStorage (lib/gameAudioPref.ts). Muted games skip synthesis calls
 * entirely, not just playback - callers guard their speak/prefetch paths.
 */
export function useGameAudio(): { soundOn: boolean; toggle: () => void } {
  const [soundOn, setSoundOn] = useState<boolean>(() => loadGameAudioPref());
  const toggle = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      saveGameAudioPref(next);
      return next;
    });
  }, []);
  return { soundOn, toggle };
}

/** Mute toggle rendered in every game's play surface. */
export function GameMuteButton({
  soundOn,
  onToggle,
  active,
  className,
}: {
  soundOn: boolean;
  onToggle: () => void;
  /** Hotfix 3 item 7b: true while a game clip is audibly playing; the button
   *  wears the practice surfaces' green active treatment (bg-secondary,
   *  white icon) so "sound is on AND playing" reads at a glance. */
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="game-mute-btn"
      aria-label={soundOn ? "Mute game audio" : "Unmute game audio"}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors",
        active
          ? "border-transparent bg-secondary text-white shadow-sm"
          : "border-border bg-card text-muted-foreground hover:bg-muted",
        className,
      )}
    >
      {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
    </button>
  );
}
