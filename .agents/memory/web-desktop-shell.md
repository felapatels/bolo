---
name: gujarati-coach web desktop shell & motion vocabulary
description: How the web app frames authenticated pages for desktop and where the shared motion primitives live.
---

# Desktop shell & motion vocabulary (gujarati-coach web)

Authenticated primary pages (Home, Friends, Progress) are wrapped by an
`AppShell` in `App.tsx`. `AppShell` renders a persistent left sidebar
(`DesktopNav`) shown only at `lg`+ and insets content with `lg:pl-64`; the
existing `BottomNav` is now `lg:hidden` (mobile-only). Page bodies keep their own
internal layout — the shell only provides the frame + branded background
(`.app-surface` in `index.css`).

**Why:** desktop pages previously looked like a phone (narrow column + bottom
bar). This is the foundation the "desktop app pages" and "desktop landing"
tasks build on — reuse the shell and the motion vocabulary rather than inventing
new ones.

**How to apply:** New authenticated app pages that should show persistent nav go
inside `<AppShell>` in `App.tsx`. Focused/full-screen flows (practice, lesson
detail, upgrade) intentionally stay outside the shell.

## Shared motion primitives — `src/lib/motion.tsx`
Central motion vocabulary mirroring the launch video's feel: `springs` presets,
`mascotEntrance`/`floatIdle` helpers, and `FloatingTag` / `SoundWavePulse`
components. Prefer these over one-off transitions.

**Why:** keeps the app's motion consistent and brand-aligned.

**How to apply:** Every animated primitive must self-gate on
`useReducedMotion()` — the global `prefers-reduced-motion` CSS reset in
`index.css` only neutralizes CSS-driven animation/transition, NOT framer-motion's
rAF-driven values, so JS motion that doesn't check the hook will keep moving for
reduced-motion users.
