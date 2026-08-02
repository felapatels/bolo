// Server-side feature flags derived from environment variables.
// All flags default to OFF. Toggling a flag requires a server restart.
// No scoring-v2 or other feature coupling in code — the coupling is ops
// discipline only (deploy the flag alongside the feature it gates).

/**
 * Part A: Polish re-runs and all-top-band stamps on the journey map.
 * Set POLISH_ENABLED=true in the server environment to activate.
 * Default: false. Must stay false until scoring v2 lands.
 */
export const POLISH_ENABLED = process.env.POLISH_ENABLED === "true";

/**
 * Chunk 4: cross-zone progression gate. When true, a zone (category) unlocks
 * only when the preceding zone in global sortOrder is complete for the
 * (user, language): every group completed or tested_out. Zone test-out is the
 * designed escape valve and ships in the same commit.
 * Set CROSS_ZONE_GATE_ENABLED=true in the server environment to activate.
 * Default: false (missing means off). MUST stay false until a store-approved
 * mobile build containing the zone test-out entry point is live.
 */
// Mutable so __setCrossZoneGateForTests can flip it for gate-on integration
// tests without a process restart. ESM live binding: importers of
// CROSS_ZONE_GATE_ENABLED always read the current value of the let.
let _crossZoneGateEnabled: boolean =
  process.env.CROSS_ZONE_GATE_ENABLED === "true";
export { _crossZoneGateEnabled as CROSS_ZONE_GATE_ENABLED };

/** Test-only: override the cross-zone gate flag. Reset to false in after(). */
export function __setCrossZoneGateForTests(value: boolean): void {
  _crossZoneGateEnabled = value;
}
