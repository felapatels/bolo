---
name: Reanimated layout props crash (New Architecture)
description: Layout props in useAnimatedStyle cause a hard native crash on Reanimated 3 + Expo Go SDK 54 New Architecture; Reanimated Animated.View also ignores pointerEvents entirely on New Arch
---

## Rule 1: No layout props in useAnimatedStyle
Never put layout/geometry props (`position`, `top`, `left`, `right`, `bottom`, `width`, `height`) inside a `useAnimatedStyle` worklet on the New Architecture. They must live in a static `style` prop.

**Why:** On Reanimated 3 + New Architecture (Fabric), worklets run on the UI thread at init time. Layout props are processed by the layout system, not the animation layer — passing them through a worklet causes a hard native crash that takes down the entire Expo Go app at bundle load, not at render time.

**How to apply:**
- Split the style array: `style={[styles.staticLayout, animatedStyle, { colorOverrides }]}`
- `styles.staticLayout` holds `position`, `top`, `left`, `right`, `bottom`, `borderRadius`, etc.
- `animatedStyle` (from `useAnimatedStyle`) holds only `transform`, `opacity`, and other animatable props.

## Rule 2: Reanimated Animated.View ignores pointerEvents on New Architecture
`pointerEvents="none"` (JSX prop) on a Reanimated `Animated.View` is completely ignored on New Architecture (Fabric). The view intercepts every touch regardless — making anything underneath it (Pressable, GestureDetector) completely untappable.

**Why:** Reanimated 3 Fabric components run through a different prop pipeline that does not forward `pointerEvents` to the native layer on New Arch. Both JSX-prop and style-prop forms fail.

**How to apply:**
- Never rely on `pointerEvents="none"` on a Reanimated `Animated.View` to let touches through.
- The correct fix is to restructure so no Reanimated `Animated.View` sits on top of a touch target.
- For flip cards / overlapping faces: **render only ONE face at a time** (conditional rendering) instead of two overlapping `position:absolute` animated views. This eliminates the problem entirely.
- Use React Native's built-in `Animated` (not Reanimated) when you need animation + touch on the same component — RN's `Animated.View` honours `pointerEvents` correctly on New Arch.
- `GestureDetector` + `Gesture.Tap()` also fails when Reanimated `Animated.View` children are on top — same root cause.

## Rule 3: entering/exiting animations make views invisible on New Arch
`Animated.View` with `entering={FadeInDown}` (or any Reanimated layout animation) starts invisible on New Architecture and never animates in — leaving the view permanently hidden. Replace with a plain `View`.
