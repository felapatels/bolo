---
name: Expo Router typed routes lag new files
description: Why typecheck fails on a just-created route/screen until the dev server regenerates route types.
---

# Expo Router typed routes lag newly-created screens

`router.push('/(app)/foo')` fails typecheck (`Argument of type '"/(app)/foo"' is not
assignable...`) right after you create `app/(app)/foo.tsx`, because expo-router's
generated `.expo/types/router.d.ts` union hasn't been regenerated yet.

**Why:** typed routes are generated from the file tree by the Metro/dev server, not by `tsc`.
A brand-new route file isn't in the union until generation runs.

**How to apply:** restart the artifact's expo dev workflow (it regenerates
`.expo/types/router.d.ts`) *before* re-running `tsc`. Don't cast the href to work around it —
the restart is the correct fix and keeps route types honest.
