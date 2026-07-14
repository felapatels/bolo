---
name: Expo Go native-module crashes
description: Diagnosing hard crashes / render errors in Expo Go caused by native-module mismatches (expo-image, missing peer deps).
---
- A crash at 100% bundle download with no red screen, or a render error like "ViewManagerAdapter_ExpoImage ... must be a function (received undefined)", means a JS package references a native view the installed Expo Go build doesn't expose — not a code bug in the screen.
**Why:** expo-image's native view failed to resolve in the user's Expo Go, hard-crashing the Account screen; expo-doctor also found expo-audio missing its expo-asset peer (crashes outside Go).
**How to apply:** run `npx expo-doctor` and `npx expo install --check` first; for simple avatars/images prefer React Native's built-in Image over expo-image; after task merges also pkill expo + restart workflow and have the user delete the cached project entry inside Expo Go before rescanning.
