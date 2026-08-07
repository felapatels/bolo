---
name: Porting web overlays onto a native stack
description: Why a faithful web-overlay port needs a focus guard and an on-demand sheet mount on React Navigation stacks.
---

# Porting a web overlay onto a native stack

A web page-level overlay can rely on navigation UNMOUNTING it: clicking its CTA
leaves the page, so the overlay's own state machine never gets another turn. On
a React Navigation / Expo Router stack the pushed screen sits ON TOP of a still
mounted parent, and a React Native `Modal` renders app-wide.

**Rule:** when an overlay's CTA navigates, set a "left for a moment" flag that
the open-decision effect respects, and clear it from `useFocusEffect`. Without
it, advancing the stage machine before navigating re-opens the next beat
instantly, floating over the screen the learner just launched.

**Why:** discovered porting the zone-closeout celebration to mobile. Web's beat
1 CTA is a link; mobile's is a `router.push`, and the map stays mounted under
the game.

**How to apply:** any ported overlay/dialog whose action navigates away —
celebrations, upsells, tour steps. Test it by asserting the overlay is gone
after the press, then remounting to prove the next beat is still owed.

## Companion: sheets that run queries

Host an on-demand sheet as `{open && <Sheet visible …/>}`, not
`<Sheet visible={open} …/>`. A `visible={false}` Modal still mounts the
component, so its data hooks run on every parent render — which both fetches
data nobody asked for and detonates full-replacement API mocks in every
existing test that renders the parent.
