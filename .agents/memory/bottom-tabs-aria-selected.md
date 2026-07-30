---
name: bottom-tabs v7 custom tabBarButton prop shape
description: react-navigation bottom-tabs v7 passes aria-selected, not accessibilityState, to custom tabBarButton renderers on native
---

Rule: a custom `tabBarButton` component must read the selected flag from the `'aria-selected'` prop first, with `accessibilityState?.selected` only as a legacy fallback.

**Why:** build 29 shipped a dead nav-bird hold-to-talk trigger. `focused` was computed from `accessibilityState?.selected`, but the installed `@react-navigation/bottom-tabs` v7 passes `'aria-selected': focused` and no `accessibilityState` to custom tabBarButtons on native, so `focused` was always false on device. Every jest suite stayed green because the tab bar renderer mocks passed `accessibilityState: { selected }` - the exact wrong shape.

**How to apply:**
- When consuming tabBarButton props, accept both shapes: `ariaSelected ?? accessibilityState?.selected ?? false`.
- When mocking the tab bar renderer in tests, pass the REAL v7 shape (`'aria-selected'`), never `accessibilityState`. A mock that invents the prop shape can hide a total feature outage while showing green.
- Unconditional press styling (scale animation) masks a dead focused branch on device; keep at least one behavior (haptic or handler call) inside the focused gate under test.
