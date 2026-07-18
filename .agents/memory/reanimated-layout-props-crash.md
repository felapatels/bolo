---
name: Reanimated layout props crash (New Architecture)
description: Layout props in useAnimatedStyle cause a hard native crash on Reanimated 3 + Expo Go SDK 54 New Architecture
---

## Rule
Never put layout/geometry props (`position`, `top`, `left`, `right`, `bottom`, `width`, `height`) inside a `useAnimatedStyle` worklet on the New Architecture. They must live in a static `style` prop.

**Why:** On Reanimated 3 + New Architecture (Fabric), worklets run on the UI thread at init time. Layout props are processed by the layout system, not the animation layer — passing them through a worklet causes a hard native crash that takes down the entire Expo Go app. The crash happens at 100% bundle load (worklet initialization), not at render time.

**How to apply:**
- Split the style array: `style={[styles.staticLayout, animatedStyle, { colorOverrides }]}`
- `styles.staticLayout` holds `position`, `top`, `left`, `right`, `bottom`, `borderRadius`, etc.
- `animatedStyle` (from `useAnimatedStyle`) holds only `transform`, `opacity`, and other animatable props.
- This applies to both `Animated.View` from Reanimated and any Reanimated-wrapped component.

## Related: Pressable + Animated.View touch swallowing
Absolutely-positioned `Animated.View` faces inside a `Pressable` intercept touches before the `Pressable` sees them — cards appear to work but never respond to taps. Fix: use `GestureDetector` + `Gesture.Tap()` from `react-native-gesture-handler` (already a dep) which handles taps at the native gesture layer above all animated views. Use `runOnJS(callback)(arg)` to invoke JS-thread handlers from the gesture worklet.

## Related: pointerEvents on Animated.View
- `pointerEvents` as a **JSX prop** on `Animated.View` (Reanimated) → native crash on New Arch (prop form removed in RN 0.76)
- `pointerEvents` in **style** on `Animated.View` (Reanimated) → also crashes (Reanimated doesn't forward style-based pointerEvents through the worklet layer)
- Correct fix: restructure to avoid needing pointerEvents entirely (use GestureDetector above the animated views)
