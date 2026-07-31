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
