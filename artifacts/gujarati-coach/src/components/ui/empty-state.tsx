import { Mascot, type MascotPose } from "@/components/mascot";

interface EmptyStateProps {
  title: string;
  body?: string;
  /**
   * When provided, renders the mascot-card layout (bordered card, parrot
   * illustration, smaller title). When omitted, renders the minimal centred
   * layout used inside practice / review screens.
   */
  pose?: MascotPose;
}

/**
 * Flexible empty-state block.
 *
 * With `pose` → bordered card with mascot (friends lists, leaderboard, etc.)
 * Without `pose` → minimal centred text (review queue, practice done-states).
 */
export function EmptyState({ title, body, pose }: EmptyStateProps) {
  if (pose) {
    return (
      <div className="flex flex-col items-center text-center py-8 px-6 bg-white rounded-3xl border border-dashed border-border">
        <Mascot pose={pose} size={80} idle="float" className="mb-3" />
        <p className="text-lg font-bold text-foreground mb-1">{title}</p>
        {body && (
          <p className="text-sm text-muted-foreground max-w-xs">{body}</p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
      <p className="text-2xl font-black text-foreground">{title}</p>
      {body && (
        <p className="text-muted-foreground font-medium text-sm max-w-xs">
          {body}
        </p>
      )}
    </div>
  );
}
