---
name: Screenshot tool breaks <img> in mockup-sandbox
description: Agent Screenshot tool renders public-dir <img> tags as broken placeholders even when the server serves them fine
---

The agent Screenshot tool shows broken-image placeholders (alt text + icon) for `<img>` tags pointing at mockup-sandbox `public/` assets, even though the dev server serves the PNGs correctly (curl 200 image/png) and real browsers load them.

**Why:** unknown tool-side quirk — not size (persists at 256px), not path (root-absolute `/__mockup/...` verified), not file corruption.

**How to apply:** don't chase "broken image" fixes off Screenshot-tool output alone. Verify empirically with Nix chromium 138 (`/nix/store/qa9…-chromium-138…/bin/chromium --headless=new --no-sandbox --virtual-time-budget=8000`) and a throwaway `--dump-dom` page whose `<img onload>` writes `LOADED <naturalWidth>` into the DOM. Older ungoogled-chromium builds (92/98) segfault or hang here; use 138. Headless chromium also lacks emoji fonts (boxes) — that's local-only, not an app bug.
