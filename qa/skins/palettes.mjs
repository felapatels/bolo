// Task #1117 — PROVISIONAL train-skin palettes for the friend-row mock.
//
// These are NOT the shipping set. The owner still owes four skin names and
// their palettes; nothing here is named, priced, or proposed. They exist only
// so the mock has four visibly different liveries to measure, and they are
// labelled by number and by colour everywhere they appear.
//
// Each palette pins the FOUR roles the engine art actually reads:
//   chassis -> --color-foreground   (cab roof, smokebox, running board, wheels)
//   body    -> --color-primary      (cab body, boiler)
//   trim    -> --color-secondary    (funnel lip, steam dome, cowcatcher)
//   steam   -> --color-card-border  (steam puffs; invisible in a parked frame)
// The white highlights (window, boiler bands, wheel hubs, coupling rod) and
// the headlamp (currentColor) are OUTSIDE the palette and are never touched.
//
// P3 is deliberately indigo-adjacent in the body role: it is the hard case the
// owner asked for, sitting close to the indigo self-row background (#4F46E5
// light / #7C7BF0 dark). It must not be adjusted to make any test pass.

export const PALETTES = [
  {
    id: "P1",
    label: "P1 — copper (provisional)",
    chassis: "#3F2A12",
    body: "#B45309",
    trim: "#F59E0B",
    steam: "#FDE68A",
  },
  {
    id: "P2",
    label: "P2 — forest (provisional)",
    chassis: "#14251A",
    body: "#15803D",
    trim: "#86EFAC",
    steam: "#DCFCE7",
  },
  {
    id: "P3",
    label: "P3 — indigo-adjacent (provisional, the hard case)",
    chassis: "#1E1B4B",
    body: "#5B54EA",
    trim: "#818CF8",
    steam: "#E0E7FF",
  },
  {
    id: "P4",
    label: "P4 — rose (provisional)",
    chassis: "#3F0A1B",
    body: "#BE123C",
    trim: "#FDA4AF",
    steam: "#FFE4E6",
  },
];

/**
 * Opacity of the background-treatment engine. Chosen ONCE, before any
 * measurement, from the existing decorative-wash precedent in the Chai wallet
 * (row washes run 0x1A–0x2E, i.e. 10–18% — this sits just above them because
 * the engine is line-art rather than a flat wash). It is a fixed input to the
 * experiment: raising it to rescue a failing reading is explicitly barred.
 */
export const BACKGROUND_TREATMENT_OPACITY = 0.25;

/** Engine box for each treatment (the art's own 64x42 aspect, always). */
export const ENGINE_BOX = {
  // Treatment A: beside the mascot, in-flow, so it costs layout width.
  inline: { width: 64, height: 42 },
  // Treatment C: in the row background, costs no layout width, so it can be
  // larger than the inline engine without touching the name column.
  background: { width: 88, height: 57.75 },
  // Reference plate for the naming test (condition 4).
  reference: { width: 160, height: 105 },
};

/**
 * Sample points in the engine's own 64x42 viewBox, one per VISIBLE palette
 * role. Each sits well inside a single painted shape, clear of the white
 * highlights, the eye and the headlamp.
 *
 * `steam` has no entry: the steam puffs rest at opacity 0, so in a parked
 * engine — which is what a leaderboard row would render — only three of the
 * four palette roles are visible at all.
 */
export const ROLE_SAMPLES = {
  body: { x: 33, y: 21 }, // boiler, between the two white bands
  chassis: { x: 47.5, y: 25 }, // smokebox front, below the eye
  trim: { x: 45, y: 6 }, // flared funnel lip
};

/** The five rows every treatment renders. */
export const ROWS = [
  { key: "self", rank: 1, name: "You", isSelf: true, xp: 1840, palette: "P3" },
  { key: "meera", rank: 2, name: "Meera Shah", isSelf: false, xp: 1610, palette: "P1" },
  { key: "arjun", rank: 3, name: "Arjun Deshpande", isSelf: false, xp: 1195, palette: "P2" },
  { key: "priya", rank: 4, name: "Priyanka Venkatesh", isSelf: false, xp: 980, palette: "P4" },
  { key: "dev", rank: 5, name: "Dev Patel", isSelf: false, xp: 640, palette: null },
];
