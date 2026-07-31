---
name: api-client test mock factories are full replacements
description: Adding a new hook import to a shared screen breaks dozens of test files; patch all mock factories in one scripted pass
---

# Full-replacement api-client mock factories

Nearly every web (vitest) and mobile (jest) UI test mocks `@workspace/api-client-react` with a FULL-replacement factory (`() => ({ ... })`, no importOriginal spread). Consequence: importing a NEW hook in a widely-tested screen (practice, journey, home) instantly breaks every test file that imports that screen.

**Symptoms differ by runner:** vitest fails loudly at import time (`No "<hook>" export is defined on the mock`); jest silently yields `undefined` and fails later with `undefined is not a function` when the hook is called.

**How to apply (web/vitest — SOLVED):** every gujarati-coach factory now spreads `artifacts/gujarati-coach/src/test/api-client-mock.ts` → `baseApiClientMock()` FIRST (per-file overrides win). The base derives its surface from `vi.importActual` at runtime — `get*QueryKey` → key fns, `use*` → `idleHook()` (merged query+mutation shape), rest passes through real — so newly generated hooks are covered automatically. New web test files must use this pattern. Mobile (jest) factories are still full replacements: after adding hook imports to a shared screen, patch affected jest factories in one scripted pass (match the exact `jest.mock('@workspace/api-client-react', () => ({` opening line); target only test files that import the screen.

**Related RNTL trap:** RNTL v13 default queries skip `aria-hidden` subtrees; assert decorative elements with `{ includeHiddenElements: true }`.

**Stateful mutation stubs:** to drive a component that reads mutation state (`.data`/`.isError`) from a mocked hook, back the mock with `React.useState` inside the factory (require/import react in the factory) and flip it in `mutate()` — the component re-renders naturally, no act() gymnastics.
