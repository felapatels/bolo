/**
 * Script Trace: the stroke engine, extracted 2026-08-20.
 *
 * WHY THIS IS A PACKAGE AND NOT TWO COPIES. This is the one thing in the
 * product that nobody else has, and it was living inside the web artifact with
 * a 4803-line hand-maintained duplicate inside the mobile one. The two had
 * already drifted, which is the failure CLAUDE.md warns about under "Reuse
 * before you write": a second definition of the same thing is the defect.
 *
 * Everything here is PURE. No React, no DOM, no react-native, no imports of any
 * kind outside this directory. That is what made the extraction safe rather
 * than a refactor, and it is worth keeping true: the moment something in here
 * needs a platform, it belongs in the artifact that has one.
 *
 * What stays in the apps: the canvas, the pen, the screens, the chrome. Those
 * are genuinely different on web and on a phone and always will be.
 */
export * from "./stroke-scoring";
export * from "./order-gates";
export * from "./scripts";
export * from "./trace-levels";
export * from "./trace-stops";
export * from "./letter-stops";
export * from "./letter-match";
export * from "./trace-feedback";
export * from "./pen-strokes";
export * from "./stray-haptics";
export * from "./devanagari-strokes";
export * from "./provisional-strokes";
export * from "./contributed-strokes";
export * from "./chapters";
export * from "./authoring";
export * from "./passages";
