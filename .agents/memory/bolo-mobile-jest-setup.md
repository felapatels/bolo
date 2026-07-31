---
name: bolo-mobile jest/RNTL setup
description: How the Expo mobile app's component tests are wired and the non-obvious gotchas that block them.
---

# Component testing in artifacts/bolo-mobile

The mobile (Expo) app uses **jest-expo + @testing-library/react-native** for
component tests (`__tests__/**/*.test.tsx`, run via
`pnpm --filter @workspace/bolo-mobile run test`). Config in `jest.config.js`
(preset `jest-expo`, `moduleNameMapper` for the `@/*` alias) + `jest-setup.js`.

## Version / dependency gotchas
- **Use @testing-library/react-native v13, not v14.** v14 depends on a package
  literally named `test-renderer` (React 19's new renderer). v13 uses
  `react-test-renderer` (pin `19.1.0` to match the catalog react), which resolves
  cleanly in this pnpm workspace.
- **The shipped `react-native-reanimated/mock` is broken** in this build — it
  `require`s a `./src/mock` that isn't published. Provide a hand-rolled reanimated
  mock in `jest-setup.js`: `Animated.{View,Text,ScrollView}` passthroughs that
  drop `entering/exiting/layout` props, a self-returning Proxy for layout builders
  (`FadeInDown.duration().delay()`), and no-op worklet hooks.
- **Mock `@expo/vector-icons` and `expo-haptics` in jest-setup.** Importing
  `@expo/vector-icons` pulls in `expo-font` → `expo-modules-core`, which throws
  `__fbBatchedBridgeConfig is not set` on the native bridge at import time. Stub
  every icon set with a plain View via a Proxy.

## Mocking pattern (mirrors the web friends test)
- Drive the real screen but `jest.mock('@workspace/api-client-react', ...)`
  returning a hoisted mutable `mockState` object; reset it in `beforeEach`.
- **Define `ApiError` INSIDE the jest.mock factory**, then value-import it in the
  test. ES `import` of the screen is hoisted above any top-level `class`, so a
  module-scope `MockApiError` is still in TDZ / undefined when the factory runs —
  the screen's `err instanceof ApiError` then throws "Right-hand side of
  'instanceof' is not an object".
- Mock heavy presentational wrappers (`@/components/Screen`, `Mascot`,
  `KeyboardAwareScrollViewCompat`) and `@/constants/fonts` (avoids loading ~15
  @expo-google-fonts packages). Keep interactive primitives (`PressableScale`,
  `ChunkyButton`) real so press + accessibility wiring is exercised.
- Mobile mutations are called as `.mutate(vars, { onSuccess, onError })` (not
  `mutateAsync` like web) — the mutation mock's `mutate` must invoke those cbs.
- `Alert.alert` confirmations (remove friend): `jest.spyOn(Alert,'alert')` and
  invoke the button's `onPress` from `alertSpy.mock.calls[0][2]`.

## Keep tests out of the app typecheck
`tsconfig.json` excludes `**/__tests__/**`, `jest.config.js`, `jest-setup.js` so
test-only globals don't couple into `pnpm typecheck` (the whole-project check).
Note the app typecheck reads the referenced lib's built `dist` — run the full
`pnpm run typecheck` (which builds libs first) to check, not the standalone
filter which sees stale dist.

## Haptics
- Shared tap-feedback helper lives in `lib/haptics.ts`; jest's expo-haptics stub returns undefined from impactAsync/notificationAsync, so fire-and-forget calls must go through Promise.resolve(...) (plain `.catch()` on the return value crashes tests).
- PressableScale fires a light haptic on press by default (`haptic` prop: light|medium|none) — do not add per-screen haptics on top of it or taps double-fire.

## Mock-factory blast radius for new generated hooks

- Adding a new `@workspace/api-client-react` hook import to a shared component (e.g. something on home) breaks EVERY existing test whose `jest.mock` factory enumerates the module's exports — ~38 files at once.
- Fix pattern: script-patch the stubs into the TOP of each `() => ({ ... })` factory; later duplicate keys win in object literals, so file-specific mock overrides are unaffected. Watch for the odd factory written as `() => { return {...} }` (block body) — the insert regex must skip or handle it.
- Playwright-against-Expo-web notes: qa/node_modules has playwright-core (ESM ignores NODE_PATH); RN Modal overlays don't hide the page underneath from `getByText`, so target modal rows by their unique subtitle (e.g. "Gujarati · Gujarati"), not the native-script name that also appears on the home pill.

## Reanimated mock specifics worth relying on
- `useReducedMotion` in the jest-setup reanimated mock returns false but is
  `jest.spyOn`-able from a test (`jest.spyOn(require('react-native-reanimated'), 'useReducedMotion').mockReturnValue(true)`)
  to drive reduced-motion branches without a separate mock file.
- `useAnimatedProps` in the setup mock EXECUTES the worklet once at render.
  Worklets must therefore tolerate a synchronous first call (no `.value` writes
  that assume UI-thread context); in exchange, tests see the initial derived
  props for free.
- rn-svg is NOT globally mocked — each test file that renders svg components
  needs a local `jest.mock('react-native-svg', ...)` including every primitive
  the component tree uses (Rect, Pattern, Line, Path, Circle...). A missing
  primitive renders as undefined and RNTL throws a cryptic element-type error.
- Assert "no percentage sizing" regressions via
  `expect(JSON.stringify(screen.toJSON())).not.toContain('"%')` — but never
  `JSON.stringify` a host element's `props.children` (circular fiber refs).

## onLayout-gated UI renders empty in jest
Components that render children only after an `onLayout` measurement (e.g. the
Word Match card grid sizes cards from the measured grid box) show an EMPTY
container in jest because RNTL never fires layout events. Dispatch it manually
before asserting on the children:
`fireEvent(screen.getByTestId('word-match-grid'), 'layout', { nativeEvent: { layout: { width: 400, height: 600 } } })`.
