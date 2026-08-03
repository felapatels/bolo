import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parses a CSS <time> value ("1500ms", "1.5s", ".26s") into milliseconds.
 *
 * WHY THIS EXISTS (prod splash blackout, August 3, 2026): the production
 * CSS minifier rewrites time units for byte savings ("1500ms" becomes
 * "1.5s", "8000ms" becomes "8s"). A unit-blind parseFloat then reads "8s"
 * as the number 8, and any JS that treats that as milliseconds turns an
 * 8-second failsafe into an 8-MILLISECOND one. Dev serves unminified CSS
 * and jsdom returns "" (falling back), so the bug is invisible everywhere
 * except the deployed build. Every JS read of a stylesheet timing var MUST
 * go through this helper.
 *
 * Returns `fallback` when the value is missing, non-numeric, or <= 0.
 * A unitless number is treated as milliseconds.
 */
export function cssTimeMs(raw: string, fallback: number): number {
  const value = raw.trim();
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  if (value.endsWith("ms")) return parsed;
  if (value.endsWith("s")) return parsed * 1000;
  return parsed;
}
