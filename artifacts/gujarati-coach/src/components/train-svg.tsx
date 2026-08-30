import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * THE CANONICAL TRAIN, AND IT IS A PAINTING NOW (build 21). Owner, with the
 * picture: "here is the train image, use it and replace our canonical
 * train." A blue-and-gold steam locomotive with a red cowcatcher and its own
 * plume of steam, cropped from the full train (public/journey/train-full.png
 * keeps the carriages for anything that wants the whole train). Its
 * nameplate was painted "भारतीय रेल" and is blanked to plain red in the
 * asset: painted text is the poster trap, and Devanagari on the Tamil line
 * is the wrong script. The app can write on the plate later.
 *
 * This replaced an inline svg side-profile engine drawn in brand tokens
 * (indigo body, teal trim, slate chassis, spoked wheels that turned on
 * `.animate-train-drive` and `.animate-train-bob`, three steam puffs, a
 * headlamp on currentColor so a surface could tint it). A painting has one
 * paint: the wheel and steam keyframes in index.css no longer find their
 * classes here, the drive and bob still move the whole engine through the
 * parent's class, and `color` on a wrapper tints nothing. Mobile twin:
 * bolo-mobile/components/journey/TrainEngine.tsx, the same picture.
 *
 * The file keeps its name so the eleven imports keep resolving; the module
 * is the canonical train, whatever it is drawn with.
 *
 * SIZING is the caller's, as before: a height class with `w-auto` keeps the
 * picture's own aspect; a box of both keeps it contained, resting on the
 * box's bottom edge so the stack and steam take the headroom above the
 * body, the way the old svg's steam did.
 */
export const TRAIN_LOCO_SRC = `${import.meta.env.BASE_URL}journey/train-loco.png`;
export const TRAIN_FULL_SRC = `${import.meta.env.BASE_URL}journey/train-full.png`;

export function TrainEngine({
  className,
  style,
  title,
}: {
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <img
      src={TRAIN_LOCO_SRC}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      draggable={false}
      data-testid="train-engine"
      className={cn("select-none object-contain object-bottom", className)}
      style={style}
    />
  );
}
