---
name: Games-route geometry is unverifiable in tests
description: Why layout bugs on /games and the game screens survive a green suite, and the browser-probe recipe that actually catches them.
---

# Geometry on the auth-gated games routes

An `aspect-ratio` on a grid child is only meaningful together with the column
count that gives the child its width. Gate them behind the SAME breakpoint, or
neither: a square applied unconditionally under a two-up-at-480px grid becomes a
full-width square on every phone narrower than that.

**Why:** the hub redesign shipped exactly this. At 390pt the card measured
358×358 — most of the viewport, content stranded top and bottom by
`justify-between` — and it survived a fully green suite for weeks.

**How to apply:** whenever you touch card/tile shape on `/games` or a game
screen, measure it in a real browser at a named width. Do not accept a class
assertion as the check:

- jsdom has no layout engine and never compiles Tailwind, so `aspect-ratio`
  never resolves and every element measures 0×0. Height cannot be asserted.
- The routes are auth-gated, so the `qa/*.mjs` probes were never pointed at
  them and nothing geometric there has ever been covered.
- Probe recipe (dev + owner account + manual only, per the Clerk headless auth
  rule): playwright installed under `/tmp/pw` with the script placed in that
  same dir (NODE_PATH does not work for ESM), `executablePath` = the Nix
  chromium, `--no-sandbox`, a fresh single-use Clerk sign-in ticket opened at
  `/sign-in?__clerk_ticket=…`, then `getBoundingClientRect()` +
  `getComputedStyle()` on `[data-testid^="game-card-"]`. Run it once before the
  fix and once after so the report carries both numbers.
