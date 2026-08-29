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

/**
 * THE LEARNER'S OWN CAMERA ON A CHACHA-JI CALL (build 17). When true, the
 * call's start response says `selfView: true` and the phone mounts its front
 * camera preview in the corner of the call; when false, or missing, the phone
 * mounts nothing and can never prompt for the camera during a call.
 *
 * Off by default on the owner's word, 2026-08-28: "i don't want the camera in
 * the call. That is going to cause an approval delay and I will need to change
 * terms etc." The permission string in app.json still describes the camera as
 * being for a profile picture or a QR code, which is accurate only while this
 * stays false. Flip it only after that string is fixed and a build carrying
 * the fix is approved. Set CHACHA_CALL_SELF_VIEW_ENABLED=true to turn it on.
 * Default: false (missing means off).
 */
export const CHACHA_CALL_SELF_VIEW_ENABLED =
  process.env.CHACHA_CALL_SELF_VIEW_ENABLED === "true";
