---
name: Map-stack tap swallowing
description: Full-width absolute wrappers layered above buttons silently eat taps; jsdom tests cannot catch it.
---

The rule: in an absolutely-positioned stack (journey map pattern), any full-width wrapper whose z-index sits above interactive elements must be `pointer-events-none`, with `pointer-events-auto` restored on the actual card/content that holds links or buttons. Decorative absolute elements (diamonds, glyph overlays) get `pointer-events-none` unconditionally.

**Why:** The zone-postcard wrapper (z8, left:16/right:16, full band width) sat above the z6 signal buttons and swallowed taps on every zone-boundary signal, which was exactly the held signal a learner reaches. Shipped to prod unseen because jsdom `fireEvent.click` dispatches directly on the target with no hit-testing, so every tap test stayed green.

**How to apply:** When adding layers to a z-indexed absolute stack, reason about geometry overlap explicitly (or probe in a real browser); never trust jsdom click tests to prove tappability. Check hit-target sizes at the same time (44px minimum; p-1 on a small glyph is usually too small).
