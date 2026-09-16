// THE 3D BIRD IN REAL SCREENS (chat, lessons, the tailor), opt-in by build:
// EXPO_PUBLIC_BOLO3D=on.
//
// IN ITS OWN FILE, WITH NO IMPORTS, ON PURPOSE. Screens read this at module
// load; lib/bolo3d.ts requires a .glb and an .html, which jest cannot load.
// Off, every screen draws the 2D <Mascot> exactly as before, the 3D components
// are never required, and react-native-webview never loads, so the suites and
// any release build made without the flag see today's app.
//
// Compared to the string because Metro inlines an unset public variable as "".
export const BOLO3D_IN_SCREENS = process.env.EXPO_PUBLIC_BOLO3D === 'on';

/**
 * The 3D bird's screen components, REQUIRED WHEN A SCREEN FIRST RENDERS, never
 * when a module loads. Null unless the build asked for her.
 *
 * MEASURED, NOT ASSUMED (2026-09-16, log probes and a cold reload): expo-router
 * evaluates EVERY route module at launch, so the module-level requires chat,
 * the lesson and the tailor were written with all ran before anything was
 * tapped, and brought react-native-webview in at launch with them. The runtime
 * must never ride the launch path (ledger X92); a call made while rendering
 * cannot. The require stays inside this function, so it still costs nothing
 * with the flag off and under jest.
 */
export function bolo3dSurfaces(): typeof import('../components/bolo3d/surfaces') | null {
  if (!BOLO3D_IN_SCREENS) return null;
  return require('../components/bolo3d/surfaces') as typeof import('../components/bolo3d/surfaces');
}

// The labs (app/bolo-lab.tsx, app/bolo-lab-screens.tsx) are internal: on in
// development builds, and in a release build only when it was made with
// EXPO_PUBLIC_BOLO3D_LAB=on.
export const BOLO3D_LAB_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_BOLO3D_LAB === 'on';
