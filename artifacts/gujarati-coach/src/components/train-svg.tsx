import type { CSSProperties } from "react";

/**
 * Characterful side-profile steam engine in the app's flat playful style,
 * drawn inline with brand palette tokens (indigo body, teal trim, slate
 * chassis). Faces right, the direction of travel down the line.
 *
 * Animatable parts are separate groups/classes driven by index.css:
 * - `.train-wheel` groups (spoked) rotate while a parent carries
 *   `.animate-train-drive` (home ticket) or `.animate-train-bob` (journey
 *   rail marker), so wheel motion inherits the parents' reduced-motion
 *   gating for free.
 * - `.train-steam-1/2/3` puffs rise and fade above the funnel on each
 *   cycle's settle. They are opacity 0 at rest, so the static frame under
 *   prefers-reduced-motion is a clean parked engine.
 *
 * The headlamp keeps `currentColor` so each surface can tint it (white on
 * the accent ticket, line accent inside the journey marker pill).
 */
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
    <svg
      viewBox="0 0 64 42"
      className={className}
      style={{ overflow: "visible", ...style }}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {/* steam puffs above the funnel (rest state: invisible) */}
      <g aria-hidden>
        <circle className="train-steam train-steam-1" cx="45" cy="1.5" r="2.6" fill="var(--color-card-border)" />
        <circle className="train-steam train-steam-2" cx="48.2" cy="-0.8" r="2" fill="var(--color-card-border)" />
        <circle className="train-steam train-steam-3" cx="42.4" cy="-0.2" r="1.6" fill="var(--color-card-border)" />
      </g>
      {/* cab roof */}
      <rect x="0" y="4" width="21" height="4.5" rx="2.25" fill="var(--color-foreground)" />
      {/* cab body */}
      <rect x="2" y="7.5" width="17" height="21" rx="2" fill="var(--color-primary)" />
      {/* cab window */}
      <rect x="5" y="11" width="11" height="8" rx="2" fill="white" opacity="0.95" />
      {/* boiler */}
      <rect x="17" y="14" width="33" height="14.5" rx="7" fill="var(--color-primary)" />
      {/* boiler bands */}
      <rect x="25" y="14.5" width="2" height="13.5" fill="white" opacity="0.22" />
      <rect x="35" y="14.5" width="2" height="13.5" fill="white" opacity="0.22" />
      {/* smokebox front */}
      <rect x="45" y="12.5" width="9.5" height="16" rx="3.5" fill="var(--color-foreground)" />
      {/* funnel (flared) with teal lip */}
      <path d="M40.5 6.5h9l-1.6 7h-5.8z" fill="var(--color-foreground)" />
      <rect x="39.5" y="4.5" width="11" height="3" rx="1.5" fill="var(--color-secondary)" />
      {/* steam dome */}
      <path d="M27 14v-3.2a4 4 0 0 1 8 0V14z" fill="var(--color-secondary)" />
      {/* friendly eye on the smokebox */}
      <circle cx="50.5" cy="17.5" r="2.6" fill="white" opacity="0.95" />
      <circle cx="51.3" cy="17.9" r="1.2" fill="var(--color-foreground)" />
      {/* headlamp (currentColor: tinted by the surface) */}
      <rect x="54" y="18.5" width="2.5" height="4" rx="1" fill="currentColor" />
      {/* running board */}
      <rect x="1" y="28.5" width="56" height="3" rx="1.5" fill="var(--color-foreground)" />
      {/* cowcatcher */}
      <path d="M56 28.5 63.5 36H56z" fill="var(--color-secondary)" />
      {/* spoked wheels: each group rotates about its own center while the
          train drives or bounces (see .train-wheel in index.css) */}
      <g className="train-wheel">
        <circle cx="11" cy="35.5" r="5.5" fill="var(--color-foreground)" />
        <rect x="10.4" y="30.9" width="1.2" height="9.2" rx="0.6" fill="white" opacity="0.7" />
        <rect x="6.4" y="34.9" width="9.2" height="1.2" rx="0.6" fill="white" opacity="0.7" />
        <circle cx="11" cy="35.5" r="2.2" fill="white" opacity="0.9" />
        <circle cx="11" cy="35.5" r="0.9" fill="var(--color-foreground)" />
      </g>
      <g className="train-wheel">
        <circle cx="26" cy="35.5" r="5.5" fill="var(--color-foreground)" />
        <rect x="25.4" y="30.9" width="1.2" height="9.2" rx="0.6" fill="white" opacity="0.7" />
        <rect x="21.4" y="34.9" width="9.2" height="1.2" rx="0.6" fill="white" opacity="0.7" />
        <circle cx="26" cy="35.5" r="2.2" fill="white" opacity="0.9" />
        <circle cx="26" cy="35.5" r="0.9" fill="var(--color-foreground)" />
      </g>
      <g className="train-wheel">
        <circle cx="40" cy="35.5" r="5.5" fill="var(--color-foreground)" />
        <rect x="39.4" y="30.9" width="1.2" height="9.2" rx="0.6" fill="white" opacity="0.7" />
        <rect x="35.4" y="34.9" width="9.2" height="1.2" rx="0.6" fill="white" opacity="0.7" />
        <circle cx="40" cy="35.5" r="2.2" fill="white" opacity="0.9" />
        <circle cx="40" cy="35.5" r="0.9" fill="var(--color-foreground)" />
      </g>
      <g className="train-wheel">
        <circle cx="51.5" cy="36.5" r="4.5" fill="var(--color-foreground)" />
        <rect x="50.95" y="32.7" width="1.1" height="7.6" rx="0.55" fill="white" opacity="0.7" />
        <rect x="47.7" y="35.95" width="7.6" height="1.1" rx="0.55" fill="white" opacity="0.7" />
        <circle cx="51.5" cy="36.5" r="1.8" fill="white" opacity="0.9" />
        <circle cx="51.5" cy="36.5" r="0.8" fill="var(--color-foreground)" />
      </g>
      {/* coupling rod */}
      <rect x="9" y="34.5" width="33" height="2" rx="1" fill="white" opacity="0.55" />
    </svg>
  );
}
