/**
 * The story engine: one mechanic behind the clip game and the storybook.
 *
 * Pure. No React, no DOM, no database. The corpus lookup that turns a concept
 * into a phrase is passed IN, so web, mobile and a test can each supply their
 * own and this stays the single definition of how a scene resolves and how the
 * story moves. Same arrangement as lib/script-trace, and for the same reason:
 * the two clients are hand-maintained twins and anything defined in one of them
 * becomes two different things within a week.
 */
export * from "./types";
export * from "./engine";
export * from "./scenes";
