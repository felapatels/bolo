---
name: RNTL query, matcher and hydration traps (bolo-mobile)
description: Three ways a correct RN component fails its own test in this repo — exact-match text, a11y-hidden subtrees, and async-hydrated UI.
---

# RNTL traps that look like product bugs

All three below produced failing tests against code that was behaving correctly.
Recognise them before "fixing" the component.

## 1. `toHaveTextContent` is an EXACT match here

It does **not** do substring matching in this setup. `toHaveTextContent('+3 Chai')`
fails against a chip that renders an icon node too (received `icon-coffee+3 Chai`),
and `toHaveTextContent('kept your Chai')` fails against the full sentence.

**How to apply:** assert a regex (`/\+3 Chai/`) whenever the element renders more
than the exact string you care about — icons, sibling nodes, or a longer sentence.

## 2. Queries skip a11y-hidden subtrees

An element carrying `accessibilityElementsHidden` /
`importantForAccessibility="no-hide-descendants"` is invisible to `getByTestId`,
even though the debug dump prints it in full — which makes the failure read as
"the element did not render".

**Why:** decorative art (a glyph inside a labelled Pressable) *should* be hidden
from assistive tech, so the component is right and the query is wrong.

**How to apply:** pass `{ includeHiddenElements: true }` as the query options.
Do not strip the a11y props to make a test pass.

## 3. AsyncStorage-hydrated UI cannot be asserted synchronously

Any behaviour gated on a hydrated storage read (a once-per-session auto-open, a
"seen" suppression) is still off during the synchronous `render()`, so a plain
`expect(...)` right after render sees nothing and looks like dead code.

**How to apply:** `await waitFor(...)` for the first appearance. A hook exposing
`hydrated` should gate anything that can burn a one-shot; the test must then wait
for that same flag rather than the component dropping the gate.
