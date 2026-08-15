/**
 * A row avatar: a learner's mascot, dressed, cropped into a circle.
 *
 * Lifted out of pages/leaderboard.tsx now that a second surface (the activity
 * feed) shows the same face. The crop numbers are the point of sharing it: they
 * were settled by looking at rendered thumbnails, and a second hand-tuned copy
 * would drift the moment either was touched.
 *
 * `outfit`/`accessory` are passed EXPLICITLY (null included). Left undefined,
 * <Mascot> falls back to the *viewer's* equipped outfit, which would paint every
 * friend in the reader's own clothes.
 *
 * Decorative: the name is always beside it as real text, so there is no alt.
 */
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";

/** The default row size, unchanged from the leaderboard it came from. */
export const ROW_AVATAR_PX = 56;

// The 1024 frame windowed to the bird minus her feet, so a garment reads at
// thumbnail size. Fractions, not pixels: the offsets scale with whatever size
// the caller asks for.
const ROW_CROP = { frame: 1024, window: 745, x: 125, y: 55 } as const;
const ROW_MASCOT_POSE = "wave" as const;

export function MascotAvatar({
  user,
  size = ROW_AVATAR_PX,
  className,
}: {
  user: {
    displayName: string | null;
    equippedOutfit?: string | null;
    equippedAccessory?: string | null;
  };
  /** Diameter of the circle in px. The crop scales with it. */
  size?: number;
  className?: string;
}) {
  const mascotPx = Math.round((size * ROW_CROP.frame) / ROW_CROP.window);
  const left = -Math.round((ROW_CROP.x / ROW_CROP.frame) * mascotPx);
  const top = -Math.round((ROW_CROP.y / ROW_CROP.frame) * mascotPx);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-primary/15",
        className,
      )}
      style={{ width: size, height: size }}
      data-testid="row-mascot"
      data-outfit={user.equippedOutfit ?? "none"}
      data-accessory={user.equippedAccessory ?? "none"}
    >
      <div className="absolute" style={{ left, top }}>
        <Mascot
          pose={ROW_MASCOT_POSE}
          size={mascotPx}
          idle="none"
          ambient="calm"
          outfit={user.equippedOutfit ?? null}
          accessory={user.equippedAccessory ?? null}
        />
      </div>
    </div>
  );
}
