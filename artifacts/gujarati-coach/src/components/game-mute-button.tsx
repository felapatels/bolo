import { useState, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";
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
  className,
}: {
  soundOn: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="game-mute-btn"
      aria-label={soundOn ? "Mute game audio" : "Unmute game audio"}
      className={
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted " +
        (className ?? "")
      }
    >
      {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
    </button>
  );
}
