// The bazaar palette: FIXED scene colours, deliberately not design tokens.
//
// Every surface that paints a piece of India — the Bolo Bazaar storefront, the
// Chai wallet's art tiles, the chai stall band — draws from this one list so
// the app's warm register stays consistent instead of each screen inventing
// its own saffron. These colours do NOT flip with the theme: like the chai
// stall's art, they are a painted scene and must read the same in light and
// dark mode. Controls, text and chrome around them stay on the design tokens,
// which is what keeps contrast and dark mode working.
import type { CSSProperties } from "react";

/**
 * First Class gold engine: four CSS-var pins, applied on a wrapper around the
 * TrainEngine only. Distinct from INDIA.gold / ExpressTile which uses #F0A32B
 * with navy chassis + teal trim. This palette is all-gold — a monochrome
 * burnished engine — so it reads as a different object on a screen showing both.
 *
 * Apply with `className="contents"` so the wrapper is invisible to layout.
 */
export const FIRST_CLASS_GOLD_VARS = {
  "--color-foreground": "#6B4A0F", // chassis: burnished bronze ironwork
  "--color-primary": "#E8B93C",   // body: old gold
  "--color-secondary": "#FFE39A", // trim: gold leaf
  "--color-card-border": "#FFF6E0", // steam: warm cream
} as CSSProperties;

export const INDIA = {
  /** Sun-bleached plaster a storefront is painted on. */
  wall: "#FBF1DF",
  /** Awning stripe: the red of a market tarpaulin. */
  stripe: "#C2410C",
  /** The cloth between the stripes. */
  cloth: "#FFF7EA",
  /** Signboard enamel: the deep green of an old shop board. */
  board: "#14503F",
  /** The shadow under that green — spend buttons press into it. */
  boardDeep: "#0C3428",
  /** Marigold: torans, board edging, price flags, festival dots. */
  gold: "#F0A32B",
  /** Painted lettering. */
  cream: "#FFF7EA",
  /** Counter and platform timber. */
  timber: "#8A5A32",
  /** The shadowed underside of that timber. */
  timberShade: "#6E4526",
  /** Ink for text sitting on plaster. */
  ink: "#6B4A2F",
  /** Late-afternoon platform sky, top to bottom. */
  skyHigh: "#FFE7BC",
  skyLow: "#F7C169",
  /** Express indigo, the fast end of the palette. */
  express: "#4F46E5",
  expressDeep: "#6D28D9",
  /** Night blue for chassis ironwork on warm and indigo tiles alike. */
  iron: "#241E4E",
  /** Peacock teal trim. */
  peacock: "#0E9AA7",
} as const;
