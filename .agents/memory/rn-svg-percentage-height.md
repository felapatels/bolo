---
name: rn-svg percentage sizing in normal flow
description: Percentage-sized react-native-svg elements in normal layout flow inflate native Yoga layout unboundedly while Expo web looks perfect
---

# Percentage-sized Svg in normal flow blows up native layout

**Rule:** Never render a react-native-svg `<Svg>` with percentage `width`/`height` as a normal-flow child. If the Svg must fill a container, either (a) put it inside an absolutely-positioned wrapper bounded by a definite-size parent, or (b) measure the container via `onLayout` and pass numeric dimensions (render nothing until measured).

**Why:** Build 28 shipped `<Svg width={2} height="100%">` in the ticket perforation strip (an `alignSelf:'stretch'` child of a content-sized row). On web, 100% of an indefinite parent resolves to auto — looked perfect in Expo web and every chromium probe. On a real iPhone, Yoga asks rn-svg to measure the node and the percentage height inflated the strip → row → card until BOTH ticket surfaces (home hero + journey header) filled the entire screen. Plain RN `View` styles with `height:'100%'` are fine (Yoga resolves them); the trap is specifically rn-svg **props** on a measured node in flow.

**How to apply:**
- Auditing: `grep -rn '"100%"' components/ app/` and check each rn-svg hit — normal-flow = bug, absoluteFill inside a definite parent = OK (e.g. Scenery's vista has fixed height 56).
- Ticket fittings (`TicketParts.tsx`) document this as a sizing contract; `__tests__/ticket-sizing.test.tsx` pins it (no Svg pre-measure, numeric dims post-measure, absolute wrappers).
- Belt: presentational cards that must never fill the screen carry explicit `maxHeight` caps (home pass 240, journey header 140) so a future unbounded child can't reproduce a full-screen ticket.
- Native-only layout bugs like this are invisible to every verification path available in this workspace (jest, Expo web, chromium shots) — real Yoga resolution needs a device/simulator. Say so explicitly in reports and lean on style-contract tests + belts.
