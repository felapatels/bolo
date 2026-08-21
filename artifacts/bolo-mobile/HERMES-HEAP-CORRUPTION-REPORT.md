# Hermes heap corruption on RN 0.81.5 / New Architecture: GC crash at launch, and a permanently dead animation driver in the runs that survive

**TL;DR** — On Expo SDK 54 (RN 0.81.5, New Architecture, Hermes), release builds of our app show two symptoms we believe are one bug. Roughly one cold start in six dies ~140–300ms in with `EXC_BAD_ACCESS / KERN_INVALID_ADDRESS at 0x2000` inside `HadesGC` evacuation. **In the runs that do not crash, every per-frame native animation callback is permanently dead** — `useFrameCallback` fires exactly once, `withTiming` never advances, and even React Native's own `Animated` with `useNativeDriver: true` never ticks. JS-thread work is unaffected. Debug builds are completely unaffected.

---

## Environment

| | |
|---|---|
| Expo SDK | 54.0.35 |
| React Native | 0.81.5 |
| Hermes | bundled release tarball, `react-native-artifacts-0.81.5-hermes-ios` |
| Hermes bytecode | version 96 |
| New Architecture | **enabled** |
| react-native-reanimated | 4.1.7 (also reproduced on 4.1.1) |
| react-native-worklets | 0.5.1 (SDK 54's pin) |
| Xcode | 17A324, iOS SDK 23A339 |
| Device | iPhone18,2, iOS 26.6.1 (23G83) |
| Build type | **Release only.** Debug builds never reproduce either symptom |
| Package manager | pnpm 11.22.0 workspace monorepo |

---

## Symptom 1: the crash

Two consecutive cold starts, three seconds apart, both from build 280:

```
Exception:   EXC_BAD_ACCESS (SIGSEGV)
Codes:       KERN_INVALID_ADDRESS at 0x0000000000002000
Thread:      com.facebook.react.runtime.JavaScript  (triggered)
ESR:         (Data Abort) byte write Translation fault

hermes::vm::CardTable::updateBoundaries(...)
hermes::vm::HadesGC::HeapSegment::setCellHead(...)
hermes::vm::HadesGC::OldGen::alloc(unsigned int)
hermes::vm::HadesGC::EvacAcceptor<false>::forwardCell<...>(hermes::vm::GCCell*)
hermes::vm::HadesGC::EvacAcceptor<false>::accept(...)
hermes::vm::BaseVisitor::visitArray<HadesGC::EvacAcceptor<false>, false>(...)
hermes::vm::HadesGC::scanDirtyCardsForSegment<false>(...)
hermes::vm::HadesGC::scanDirtyCards<false>(...)
hermes::vm::HadesGC::youngGenEvacuateImpl<...>(...)
hermes::vm::HadesGC::youngGenCollection(...)
hermes::vm::HadesGC::allocSlow(unsigned int)
hermes::vm::GCBase::makeAVariable<DynamicStringPrimitive<char16_t,false>,...>(...)
hermes::vm::StringBuilder::createStringBuilder(...)
hermes::vm::StringPrimitive::concat(...)
hermes::vm::addOp_RJS(...)
hermes::vm::Interpreter::interpretFunction<false,false>(...)
```

**Time from `procLaunch` to `procExit`: 139ms and 295ms.**

The allocating JS operation is arbitrary — here it is a string concat, on other captures it has been a plain property write or an object spread. It also surfaces as `EXC_ARM_DA_ALIGN` in `BaseVisitor::visitArray` instead. **The collector is the detector, not the cause: the heap is already corrupt by the time young-gen evacuation walks it.**

Rate is roughly **1 in 6 cold starts**. It is not deterministic and not tied to any particular screen or user action.

## Symptom 2: every native-driven per-frame callback is dead

This is the part we think makes the report actionable, because it is **100% reproducible** in the runs that do not crash.

We shipped an on-device diagnostic panel to a release build. Results, same binary, same screen, simultaneously:

| probe | result |
|---|---|
| `useFrameCallback` incrementing a shared value | **fires exactly once, then never again** |
| `withTiming` / `withRepeat` driving `useAnimatedStyle` | **never advances past the initial value** |
| shared value stepped from a plain JS `setInterval` | **updates once, then frozen** |
| `runOnJS` round-trip from the UI thread | **works, counter climbs normally** |
| RN `Animated` + `useNativeDriver: true` | **completely flat** |
| RN `Animated` + `useNativeDriver: false` | **works perfectly** |
| `useReducedMotion` (reanimated) and OS Reduce Motion | both `false` |

**Read together:** the worklet runtime is alive and executes code, and the UI thread can call back into JS. What never happens is a **frame**. The single update each probe gets is React's ordinary mount/commit; nothing after it ever arrives.

Note the last two rows. **This is not reanimated-specific.** React Native's own `Animated`, with no worklets involved, is dead on the native driver and alive on the JS driver, **in the same binary, one flag apart**. That is why we think the two symptoms share a cause: a damaged JS heap would plausibly break native-side callback registration silently, and only crash when the collector happens to walk the damaged region.

## Reproduction

We cannot yet offer a minimal repro, and we want to be honest about why: **the failure is not reproducible on demand even in our own app.**

Across **nine release builds** we saw exactly one that animated correctly. Rebuilding that build's **exact commit three separate times** produced a different artifact every time, and all three were broken. The one healthy artifact and the eight broken ones differ in a way we can measure precisely:

| build | animations | Hermes `functionCount` | bytes |
|---|---|---|---|
| **160** | **working** | **44,080** | **8,886,780** |
| 150, 170, 180, 190, 201, 220, 230, 250, 280 | dead | **52,872 – 52,920** | 9,520,604 – 9,526,224 |

**`stringCount` and `identifierCount` are near-identical across all nine** (62,545–62,575 and 34,257–34,271). Builds 160 and 220 are **byte-identical in every file that reaches the bundle** — verified with a full unfiltered diff of the whole repository, the difference being comments, a version string and a build number — and still came out **8,792 functions apart**.

So the same JavaScript is being compiled into materially different bytecode, and the healthy shape has only ever occurred once.

## What we ruled out, by measurement

Each of these was tested and eliminated, not reasoned away:

- **`expo-video`** removed entirely; crash persists.
- **`react-native-worklets`** pinned to SDK 54's 0.5.1; crash persists.
- **reanimated 4.1.7 vs 4.1.1** — identical failure on both. 4.1.1 additionally crashed twice on launch.
- **React Compiler** — toggling `experiments.reactCompiler` locally moves `functionCount` by **6**.
- **Hermes `-O`** — no effect on `functionCount` at all.
- **Toolchain** — Xcode 17A324, SDK 23A339 and build machine 24G90 identical between the healthy and broken builds. Both installed **RNReanimated 4.1.7 and RNWorklets 0.5.1** from the same Maven tarball.
- **Dependencies** — both builds ran `pnpm install --frozen-lockfile`, both resolved **1897 packages**, lockfile byte-identical.
- **Sentry** — `@sentry/react-native` 7.2.0 is a dependency but `withSentryConfig` is never called from `metro.config.js`, so its Metro/babel integration is inert. `annotateReactComponents` defaults to `false`.
- **Device state** — Reduce Motion off, Low Power Mode off, full battery, reproduced across reboots and clean reinstalls.
- **A local `expo export:embed`** on the same source produces **~43,000 functions**, i.e. the healthy shape. **The divergence happens on the build machine, not in the repo.**

## What we are asking

1. **Is this a known Hermes heap corruption on RN 0.81.5 with the New Architecture?** The `CardTable::updateBoundaries` / `setCellHead` path with a `0x2000` write fault seems specific enough to be recognisable.
2. **Could a corrupt JS heap plausibly leave native per-frame callback registration silently broken** while leaving `runOnJS` and JS-thread timers fully functional? If so, symptom 2 becomes a reliable, non-crashing detector for symptom 1, which would be far easier to test against than a 1-in-6 crash.
3. **Is a ~20% swing in Hermes `functionCount` from identical JavaScript expected under any circumstance?** If not, that is a second thing worth explaining, and it is the only observable that has ever correlated with a working build.

We have both `.ipa` artifacts (the one healthy build and a broken one), both `.ips` crash reports, and the full diagnostic component available on request.
