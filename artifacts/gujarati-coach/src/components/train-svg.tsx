import type { CSSProperties } from "react";

/**
 * Characterful side-profile steam engine, drawn inline so it tints with
 * `currentColor` (set `color` to the journey line's accent). Faces right —
 * the direction of travel down the line. Interim treatment for demo day; the
 * bespoke artwork-batch train replaces it later (no raster art here by spec).
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
      style={style}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {/* cab roof */}
      <rect x="0" y="4" width="21" height="4.5" rx="2.25" fill="currentColor" />
      {/* cab body */}
      <rect x="2" y="7.5" width="17" height="21" rx="2" fill="currentColor" />
      {/* cab window */}
      <rect x="5" y="11" width="11" height="8" rx="2" fill="white" opacity="0.92" />
      {/* boiler */}
      <rect x="17" y="14" width="33" height="14.5" rx="7" fill="currentColor" />
      {/* smokebox front */}
      <rect x="45" y="12.5" width="9.5" height="16" rx="3.5" fill="currentColor" />
      {/* funnel (flared) */}
      <path d="M40.5 6.5h9l-1.6 7h-5.8z" fill="currentColor" />
      <rect x="39.5" y="4.5" width="11" height="3" rx="1.5" fill="currentColor" />
      {/* steam dome */}
      <path d="M27 14v-3.2a4 4 0 0 1 8 0V14z" fill="currentColor" />
      {/* friendly eye on the smokebox */}
      <circle cx="50.5" cy="17.5" r="2.6" fill="white" opacity="0.95" />
      <circle cx="51.3" cy="17.9" r="1.2" fill="currentColor" />
      {/* headlamp */}
      <rect x="54" y="18.5" width="2.5" height="4" rx="1" fill="currentColor" />
      {/* running board */}
      <rect x="1" y="28.5" width="56" height="3" rx="1.5" fill="currentColor" />
      {/* cowcatcher */}
      <path d="M56 28.5 63.5 36H56z" fill="currentColor" />
      {/* wheels — white hubs keep them legible on tinted bodies */}
      <circle cx="11" cy="35.5" r="5.5" fill="currentColor" />
      <circle cx="11" cy="35.5" r="2.2" fill="white" opacity="0.9" />
      <circle cx="26" cy="35.5" r="5.5" fill="currentColor" />
      <circle cx="26" cy="35.5" r="2.2" fill="white" opacity="0.9" />
      <circle cx="40" cy="35.5" r="5.5" fill="currentColor" />
      <circle cx="40" cy="35.5" r="2.2" fill="white" opacity="0.9" />
      <circle cx="51.5" cy="36.5" r="4.5" fill="currentColor" />
      <circle cx="51.5" cy="36.5" r="1.8" fill="white" opacity="0.9" />
      {/* coupling rod */}
      <rect x="9" y="34.5" width="33" height="2" rx="1" fill="white" opacity="0.55" />
    </svg>
  );
}
