# Android Parity Build Design Spec

**Status:** Pre-implementation spec for reference by Aakesh.
**Gate:** All tasks in Section 7 begin only after iOS build 31 clears external beta and is stable.
**Scope:** Spec document only. No code changes, no dependency installs, no EAS builds, no Play Console actions.

---

## 1. Baseline

Task 42 already established the Android baseline in `artifacts/bolo-mobile/app.json` and `artifacts/bolo-mobile/eas.json`:

- Package name: `com.bolo.mobile`
- Initial `versionCode`: 1
- Adaptive icon: `assets/images/adaptive-icon.png`, background `#fffdf0`
- Permissions declared: `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `CAMERA`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`
- EAS production profile: `buildType: "app-bundle"`, `autoIncrement: true`
- EAS submit target: internal track, draft release status
- New Architecture: `newArchEnabled: true`

This spec builds on that baseline without repeating it from scratch.

---

## 2. Native Parity Risk Audit

### 2.1 Audio Session Layer

**File:** `artifacts/bolo-mobile/lib/audio.ts`

The audio layer uses two session modes (`RECORDING_MODE` / `PLAYBACK_MODE`) and `setAudioModeAsync` from `expo-audio`. On iOS these map to `AVAudioSession` categories (`playAndRecord` vs `playback`) and are the workaround for the earpiece routing problem: keeping recording warm routes coach audio to the earpiece, so the layer flips to playback-only mode for coach clips and flips back when they finish.

On Android:
- `expo-audio` wraps Android `AudioFocus` and `AudioAttributes` via ExoPlayer (playback) and MediaRecorder (recording). The `setAudioModeAsync` call is cross-platform and sets audio focus appropriately.
- Android does not route to the earpiece when recording is active. Speaker routing on Android is handled by the platform based on `AudioAttributes.USAGE_MEDIA` -- the iOS-specific routing problem does not exist on Android.
- The `needsModeFlip` guard in `playBase64Audio`, `playStreamingAudio`, and `playAssetAudio` is already platform-gated: `const needsModeFlip = Platform.OS === 'ios' && recordingSessionActive`. These flips are a no-op on Android.
- The `playbackModeToken` guard and `keepAudioSessionActive` option are expo-audio constructs that pass through on Android without effect (Android manages audio focus independently). No Android-specific code is needed.

**Label:**
- Speaker routing end-to-end on Android: **needs-verification** (verify coach audio plays from speaker, not earpiece, during a practice session on a real Android device with recording active)
- Recording mode flag semantics: **expected-fine**
- `keepAudioSessionActive` and token guard: **expected-fine**

---

### 2.2 Recording Preset (16 kHz, Mono, 32 kbps, M4A)

**File:** `artifacts/bolo-mobile/lib/audio.ts`, `RECORDING_PRESET`

The preset is:
```
sampleRate: 16000, numberOfChannels: 1, bitRate: 32000
```
spread from `RecordingPresets.HIGH_QUALITY`, with iOS-specific fields also set.

On Android, `expo-audio` uses MediaRecorder with AAC-LC in an M4A/MP4 container at the same settings. The expo-audio API unifies the recording preset across platforms, so no Android-specific code is needed for the preset.

Whisper resamples to 16 kHz internally regardless of input, so the 16 kHz source avoids unnecessary upload bytes on both platforms.

**Label:** **expected-fine** -- verify after first physical Android recording that the Whisper API receives the correct audio and returns a transcription (one spot-check in Section 6 checklist is sufficient).

---

### 2.3 Haptics

**File:** `artifacts/bolo-mobile/lib/haptics.ts`

`expo-haptics` maps `ImpactFeedbackStyle.Light/Medium/Heavy` to Android `Vibrator`/`VibrationEffect` on API 26+. The guard `Platform.OS === 'web'` already excludes web; native Android runs through. Used in: `BadgeUnlockScreen`, review result, practice result, `SpeedRound`, `TrainEngine`.

**Label:** **expected-fine** on Android API 26+. The app already declares `MODIFY_AUDIO_SETTINGS` and no vibration permission is required for `VibrationEffect`. Minimum SDK implications: if `android.minSdkVersion` is set below 26, haptics degrade silently on older devices (no crash). Since the recommended minimum is API 28 (see Section 8), this is not a concern.

---

### 2.4 Safe Area / Status Bar Insets

**Files:** `artifacts/bolo-mobile/components/Screen.tsx`, `artifacts/bolo-mobile/app/(app)/journey.tsx`

`Screen.tsx` uses `useSafeAreaInsets()` from `react-native-safe-area-context` and applies `insets.top` as top padding on native. The web fallback (`67px`) is already behind a `Platform.OS === 'web'` guard.

`journey.tsx` computes `headerTopInset = Platform.OS === 'web' ? 67 : insets.top` separately because the journey header opts out of `Screen`'s padding and manages its own inset.

`react-native-safe-area-context` covers Android display cutouts via the `WindowInsetsCompat` API. `insets.top` returns the full status bar + cutout height on Android, not just the notch equivalent.

**Label:** **needs-verification** -- confirm that no screen applies a hardcoded `paddingTop` value (bypassing safe-area) on an Android device with a display cutout. Pay particular attention to screens that do not use `<Screen>` and manage their own top padding. The journey header pattern is correct; audit any direct `paddingTop: 24` or `paddingTop: 44` constants elsewhere.

---

### 2.5 Ticket/Train SVG and Yoga Sizing

**File:** `artifacts/bolo-mobile/components/journey/TicketParts.tsx`

The sizing contract is documented at line 12 of that file: after a build-28 regression where a percentage-height `<Svg>` in normal flow inflated Yoga unboundedly, all SVG rendering in the ticket fittings now uses `onLayout`-measured numeric dimensions inside absolutely-positioned wrappers. No percentage heights exist in the current code.

On Android, Yoga and `react-native-svg` behave identically to iOS for fixed numeric dimensions. With `newArchEnabled: true`, both platforms run the same Fabric/JSI Yoga version.

**Label:** **needs-verification** on a physical Android device -- the fix was verified on iOS only. The Yoga engine version difference between New Arch and Old Arch narrows the risk (both iOS and Android use the same Fabric Yoga when `newArchEnabled: true`). Confirm the home hero pass and journey header both render at card height, not full-screen.

---

### 2.6 Glow and Shadow Effects

**Files:**
- `artifacts/bolo-mobile/components/journey/JourneyPassCard.tsx` (lines 489-497, 529-533): `shadowColor`, `shadowOpacity: 0.9`, `shadowRadius: 14` for the glow overlay; outer card shadow with `elevation: 6`
- `artifacts/bolo-mobile/components/MilestoneToast.tsx` (lines 104-108): `shadowColor`, `shadowOpacity: 0.18`, `elevation: 8`
- `artifacts/bolo-mobile/components/XpArc.tsx` (lines 142-146): `shadowColor`, `shadowOpacity: 0.15`, `elevation: 3`
- `artifacts/bolo-mobile/components/journey/JourneyScreen` (via `StopGlowPulse`): animated `shadowColor` on the station glow ring

On iOS, `shadowColor`/`shadowOpacity`/`shadowRadius` render the drop shadow and glow. On Android, these properties are silently ignored by the RN renderer. Only `elevation` produces a shadow on Android, and it uses Material Design elevation rules (single ambient light source, no color tinting).

Specific impact:

| Component | iOS effect | Android result | Action |
|---|---|---|---|
| `JourneyPassCard` glow overlay | Colored glow pulse (accent color, opacity 0.9) | No glow visible; the animated view exists but casts no colored light | needs-work |
| `JourneyPassCard` outer card shadow | Drop shadow (`elevation: 6` also present) | Generic gray shadow via `elevation: 6` -- looks reasonable | expected-fine |
| `MilestoneToast` | Drop shadow (`elevation: 8` also present) | Generic gray shadow -- acceptable | expected-fine |
| `XpArc` score ring | Drop shadow (`elevation: 3` also present) | Generic gray shadow -- acceptable | expected-fine |
| `StopGlowPulse` station ring | Colored pulsing glow border | Pulsing opacity on a colored border -- visible but no glow spread | needs-verification |

**Label:** **needs-work** for `JourneyPassCard` glow overlay. Recommended fix: replace or supplement `shadowColor`/`shadowOpacity` on the glow element with a React Native Skia `<Shadow>` blur or add an `elevation`-based outer ring with the accent color using a border approach. A simpler fallback: on Android, increase the glow view's `borderWidth` and animate it with the same accent color to simulate the outline glow. No third-party shadow library is required.

The card/toast/arc drop shadows are **expected-fine** because they already have `elevation` set.

---

### 2.7 Ticket Tear Elevation

**File:** `artifacts/bolo-mobile/components/journey/TicketParts.tsx` and `app/(app)/journey.tsx`

The ticket tear halves use `elevation` ordering for stacking. On Android, `elevation` and `zIndex` interact differently than iOS: Android renders elevated views in elevation order within a stacking context, and `zIndex` is honored within the same parent but `elevation` can override it when shadows are cast between siblings.

**Label:** **needs-verification** on a physical Android device -- confirm that the tear halves stack correctly (top half visually above bottom half or vice versa) and that no shadow from the lower half renders on top of the upper half during the animation.

---

### 2.8 Reduced Motion

**File:** `artifacts/bolo-mobile/lib/motionPrefs.ts`

`AccessibilityInfo.isReduceMotionEnabled()` and `reduceMotionChanged` events work on Android, mapping to the "Remove animations" setting in Accessibility options. Reanimated's `useReducedMotion()` hook also uses this Android API.

**Label:** **expected-fine**

---

### 2.9 Keyboard Avoidance in Chat

**File:** `artifacts/bolo-mobile/app/(app)/(tabs)/chat.tsx` (line 1666)

```
behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
```

The `height` behavior is the Android path. Known edge cases: `height` mode can produce incorrect results with certain Android IMEs (Gboard, Samsung keyboard) in split-screen mode, and on some OEM keyboards that animate in rather than resize the window.

**Label:** **needs-verification** on a physical Android device with Gboard. Verify that:
1. The text input field scrolls above the keyboard when focused
2. The message list is not clipped when the keyboard is open
3. The hold-to-record button remains reachable above the keyboard

---

### 2.10 Font Loading -- Meetei Mayek

**File:** `artifacts/bolo-mobile/constants/fonts.ts` (lines 91-93, 148-159)

Meetei Mayek is loaded on Android but intentionally skipped on iOS:
```
...(Platform.OS !== 'ios' ? { NotoSansMeeteiMayek_400Regular } : {})
```
This is because iOS ships its own Noto Sans Meetei Mayek system font, while Android does not guarantee one (tofu risk on many devices). The loaded font is `@expo-google-fonts/noto-sans-meetei-mayek`.

**Label:** **needs-verification** -- confirm the font loads without a crash on a real Android device and that Manipuri content (script `mni`) renders without tofu (blank boxes). Also verify the fallback chain for scripts not explicitly mapped in `SCRIPT_FONTS` (e.g. Ol Chiki) resolves to a system font that does not produce tofu.

---

## 3. Auth and Services Config

### 3.1 Clerk / Google OAuth

**File:** `artifacts/bolo-mobile/components/GoogleAuthButton.tsx`

The existing Google OAuth flow uses:
```
redirectUrl: AuthSession.makeRedirectUri({ scheme: 'bolo-mobile' })
```

This produces a custom-scheme redirect URI (`bolo-mobile://`) on Android. The scheme `bolo-mobile` is already declared in `app.json` (`"scheme": "bolo-mobile"`).

**Required Clerk dashboard action (one-time):** Add `bolo-mobile://` (or the full URI that `AuthSession.makeRedirectUri` produces for Android) as an allowed redirect URI in the Clerk dashboard for the Google OAuth Social Connection. The iOS URI is identical in form, so if it is already configured, Android should work without changes. Confirm the exact URI by logging `AuthSession.makeRedirectUri({ scheme: 'bolo-mobile' })` on a test Android build.

**Apple Sign-In:** `artifacts/bolo-mobile/components/AppleAuthButton.tsx` (line 104) already returns `null` on non-iOS:
```
if (Platform.OS !== 'ios') return null;
```
No changes needed. The sign-in screen renders Apple Sign-In only on iOS.

**Production Clerk instance only.** No test-instance configuration for Android is needed.

---

### 3.2 RevenueCat / Google Play Billing

**File:** `artifacts/api-server/src/lib/revenuecatSync.ts`

**Play Console products to create:**

Mirror the iOS All-Access offering. Suggested product IDs (follow RevenueCat convention for Play):

| Product | Play product ID (suggestion) | Billing period | Free trial |
|---|---|---|---|
| All-Access Monthly | `bolo_allaccess_monthly` | 1 month | Match iOS (e.g. 7 days) |
| All-Access Annual | `bolo_allaccess_annual` | 12 months | Match iOS |

Confirm the exact iOS product IDs from the RevenueCat dashboard and mirror them with a `_android` suffix or use Play's own product ID namespace. The RevenueCat offering/entitlement names must remain identical across platforms -- only the underlying store product changes.

**Webhook differences (Play vs App Store):**

The existing webhook handler at `revenuecatSync.ts` already reads the `store` field from RevenueCat events (line 209: `"play_store"`, `"app_store"`, `"stripe"`, `"promotional"`). Behavioral differences to document:

- `INITIAL_PURCHASE` vs `NON_RENEWING_PURCHASE`: Play uses the same RevenueCat event type as iOS (`INITIAL_PURCHASE`) -- RevenueCat normalizes this. No platform branch needed for initial grant.
- **Grace period:** Google Play has a mandatory 3-day billing retry grace period before a subscription lapses. During this period RevenueCat sends a `BILLING_ISSUE` event (not an `EXPIRATION`). The subscription remains active. The current webhook handler must ensure it does not revoke Plus access on `BILLING_ISSUE` alone -- confirm this by reading the current event handler logic.
- **Acknowledgment window:** Play requires subscriptions to be acknowledged within 3 days or they are automatically refunded. RevenueCat handles acknowledgment server-side via its Google Play API integration -- no app code change needed.
- **Pending/DEFERRED transactions:** Play surfaces `PENDING` purchases (e.g. cash payments via Play) as a `PRODUCT_CHANGE` with `DEFERRED` transition. RevenueCat may send a `PRODUCT_CHANGE` event without an immediate `INITIAL_PURCHASE`. The webhook handler should treat a `PRODUCT_CHANGE` from `null` to the All-Access entitlement as a grant. Review the existing handler to confirm `PRODUCT_CHANGE` events are handled.
- **Family sharing:** Google Play does not offer family sharing for subscriptions in the same way as App Store. The family plan entitlements code (owner derives member Plus server-side) is not affected.

**Assessment:** The existing webhook is RevenueCat-normalized and already reads `store` type. Likely no platform branch is needed, but verify grace period and `PRODUCT_CHANGE` handling as noted above.

---

### 3.3 Sentry

**File:** `artifacts/bolo-mobile/lib/sentry.ts`

Sentry is initialized with `EXPO_PUBLIC_SENTRY_DSN` (a single environment variable). `@sentry/react-native` auto-instruments both iOS and Android using the same DSN -- no Android-specific DSN is needed. The `@sentry/react-native/expo` plugin in `app.json` is already configured with organization `lark-enterprises-llc` and project `bolo-mobile`.

**Label:** **expected-fine** -- no changes needed.

---

### 3.4 PostHog

PostHog is initialized in `app/_layout.tsx` via `posthog-react-native`. The library covers both platforms by default using the same project key. No Android-specific configuration is needed.

**Label:** **expected-fine** -- confirm the PostHog key is present in environment and events appear in the PostHog dashboard after a first Android session.

---

## 4. Build and Signing Pipeline

### 4.1 Keystore

EAS manages the Android keystore. One-time setup:

```
eas credentials --platform android
```

This generates a keystore, stores it in EAS, and backs it up to the EAS secrets system. **Warning:** the keystore is permanently bound to the Play listing. Losing it means the existing listing cannot receive updates -- a new listing with a new package name would be required. EAS Secrets automatically backs up the keystore; confirm the backup by downloading it via the EAS dashboard after generation.

### 4.2 versionCode Strategy

`autoIncrement: true` in `eas.json` (production profile) increments `versionCode` on each EAS build. `app.json` currently sets `versionCode: 1`. Since EAS auto-increments at build time, the first production AAB produced by EAS will carry `versionCode: 2`. Play Console accepts any starting value >= 1, so `versionCode: 2` is valid. If a higher starting value is preferred (e.g. to align with iOS `buildNumber: 31`), manually set `versionCode: 31` in `app.json` before the first production build; thereafter `autoIncrement` takes over. This is Aakesh's call -- see Section 8 open questions.

`versionCode` must be strictly monotonically increasing across all Play tracks (internal, alpha, production). EAS enforces this automatically.

### 4.3 AAB Output

Build command:
```
eas build --platform android --profile production
```

This produces a signed AAB via EAS remote build. The `buildType: "app-bundle"` is already set in `eas.json`. No local Android SDK installation is required.

### 4.4 Submission

**Preferred:** `eas submit --platform android` -- uploads the AAB directly to the internal testing track (configured in `eas.json`: `track: "internal"`, `releaseStatus: "draft"`). This requires a Google Play API service account JSON key stored in EAS:

1. Create a service account in the Google Play Console with "Release Manager" permissions.
2. Download the service account JSON file.
3. Store it via: `eas secret:create --scope project --name GOOGLE_SERVICE_ACCOUNT_KEY_JSON --type file --value ./service-account.json`
4. Reference it in `eas.json` under `submit.production.android.serviceAccountKeyPath` (or EAS reads it from the secret automatically if named conventionally).

**Alternative:** Manual upload via Play Console drag-and-drop. This is reliable but does not automate the track/release-status selection.

There is no Transporter equivalent on Android. Play Console accepts AAB upload directly.

---

## 5. Play Console Workstream

Ordered checklist for Aakesh to follow step by step.

1. **Create the app** in Play Console. Package name: `com.bolo.mobile`. Select "App" (not "Game"). Default language: English (United States).

2. **Store listing.** Reuse iOS metadata:
   - App name: "Bolo!" (max 50 chars -- fine)
   - Short description: max 80 chars (iOS subtitle equivalent). Draft: "Learn Indian languages by speaking, not just reading." -- confirm char count before submitting.
   - Full description: max 4000 chars. Adapt the iOS App Store description. Note: Play has no keyword field (keywords are derived from the title and description by Google's algorithm).
   - Category: Education.

3. **Store assets.**
   - Icon: 512x512 PNG (required). The existing `assets/images/icon.png` may need export at exactly 512x512 with no transparency in the outer ring (Play rejects icons with alpha at the edge in some cases -- verify).
   - Feature graphic: 1024x500 PNG (required). This does not exist yet. Create from brand assets: Bolo! logo + mascot on the `#fffdf0` brand background, or a scene from the app. This is a required field and blocks submission.
   - Phone screenshots: minimum 2, maximum 8, per device type. Use the screenshot capture approach from the iOS task (the device-capture harness at 412x824 logical resolution) with Android-frame variants. Minimum: 2 portrait screenshots at 320x568 to 3840x2160 resolution. The 412x824 iOS-equivalent screenshots work if exported at the correct pixel dimensions. Android frame overlays differ from iOS device frames -- use an Android Pixel frame for the feature page screenshots.
   - Tablet screenshots: recommended but not required for launch.

4. **Content rating questionnaire** (IARC). Answer all questions for a language-learning app:
   - Violence: none
   - Sexual content: none
   - Profanity: none
   - Controlled substances: none
   - User-generated content: the app does not allow sharing of user-generated content publicly (audio recordings are sent only to OpenAI for processing and are not stored or shared between users). Answer: no public UGC.
   - Data collection from children: the app is rated 13+ (see step 6). Answer accordingly.
   Expected rating: Everyone / PEGI 3 (suitable for all ages in practice, gated to 13+ by account requirement).

5. **Data safety form.** Draft answers:

   | Data type | Collected? | Shared with third parties? | Encrypted in transit? | User can request deletion? | Notes |
   |---|---|---|---|---|---|
   | Name | Yes (account creation via Clerk) | No (not shared beyond service providers) | Yes | Yes (account deletion) | Displayed in app |
   | Email address | Yes (account creation via Clerk) | No | Yes | Yes | Used for login and notifications |
   | Audio recordings | Yes (sent to OpenAI Whisper for speech recognition) | Yes (OpenAI, as a service provider for processing only) | Yes | N/A -- not stored after processing | Audio is processed and discarded; not retained by the app or OpenAI beyond the API call |
   | Analytics data | Yes (PostHog -- session events, feature usage) | No (PostHog is a first-party analytics provider under data processing agreement) | Yes | No opt-out UI currently (open question -- see Section 8) | Anonymized usage events |
   | Crash data | Yes (Sentry -- stack traces, device info) | No (Sentry is a service provider) | Yes | N/A | Device model, OS version, app version; no PII in stack traces (scrub rules in place) |
   | Coarse location | No | N/A | N/A | N/A | Not collected. The iOS privacy label entry for "Diagnostics + Coarse Location" refers to IP-based location approximation used by Sentry/diagnostics infrastructure, not GPS or network location collected by the app. Confirm with Sentry's data processing documentation before attesting. |
   | Precise location | No | N/A | N/A | N/A | Not collected |
   | Device identifiers | Implicitly (Sentry session ID, PostHog distinct ID) | No | Yes | No -- anonymized | Not linked to identity |

   **Open question:** Audio sent to OpenAI must be disclosed as shared with a third party for processing. This is a service provider relationship, not a data sale. Play data safety allows "service provider" disclosure. Confirm OpenAI's data processing terms cover the Whisper API use before attesting.

6. **Target audience declaration.** Select 13 and over. This is consistent with the iOS age rating (requires account creation with email -- implicitly 13+ per COPPA). Do not select "Designed for children" -- the app is not targeted at children under 13.

7. **App content declarations.**
   - Ads: none (select "My app does not contain ads").
   - Data safety attestation: complete after the draft table in step 5 is verified.

8. **Internal testing track.** Add testers (use the same email list as the TestFlight internal group). Upload the first signed AAB from EAS. The internal track does not require a review period -- testers can install immediately via the Play Store link.

9. **Closed testing track (F&F beta).** After internal validation, promote to a closed testing track (alpha). Note the Play policy: a closed track requires a minimum of 12 opt-in testers and a 14-day testing period before a production release can be submitted. If fewer than 12 testers are available, consider using the open testing track (which has no minimum tester count) or remaining on the internal track for F&F. This is a decision for Aakesh -- see Section 8.

10. **Production release.** After F&F sign-off and the 14-day closed testing period (if using closed track), submit for production review. Play review typically takes 1-3 days for a new app. A staged rollout (e.g. 10% of users) is recommended for the first production release.

---

## 6. Device Test Plan

### Minimum devices

- **Primary:** Mid-range Android with API 33+ (e.g. Pixel 6a, Pixel 7a, Samsung Galaxy A54). Tests the primary target demographic.
- **Secondary:** Small-screen or older Android (e.g. Pixel 4a, API 30). Tests display-cutout and keyboard differences on older display cutout implementations.
- Both devices should run with `newArchEnabled: true` (already set in `app.json`). If a device with an older Hermes version is available (API 28-29), run a subset of the checklist there too.

### Platform-agnostic checks (from iOS 31 checklist)

- [ ] Sign in with Google (complete OAuth flow, session persists after app restart)
- [ ] Confirm Apple Sign-In button is NOT shown on Android
- [ ] Lesson loads for default language (Gujarati)
- [ ] Practice session records audio, receives a band result, haptics fire on result
- [ ] XP awarded and streak incremented after a practice session
- [ ] Review queue loads and a review session completes
- [ ] Journey map renders all six zones with correct lock/unlock states
- [ ] Chat screen opens, Bolo responds to a voice message
- [ ] Local daily reminder notification fires at the scheduled time
- [ ] Account settings: display name, timezone, theme preference persist
- [ ] Paywall / upgrade flow opens (Stripe web checkout via in-app browser)
- [ ] RevenueCat subscription status visible in account subscription screen after purchase

### Android-specific checks (needs-verification items from Section 2)

- [ ] **Speaker routing:** During a practice session with hold-to-record, confirm coach audio plays from the phone speaker (not the earpiece). Record a phrase, receive the band result, tap the coach audio replay button -- audio should come from the speaker.
- [ ] **Recording quality:** Record a phrase and spot-check the Whisper transcription in the result. The transcript should accurately reflect what was said. No garbled or empty transcripts on first attempt.
- [ ] **Keyboard avoidance in chat:** Open the chat screen, tap the text input (or the hold-to-record button), and confirm that the input is visible above the keyboard with no clipping. Test with Gboard and (if available) Samsung keyboard.
- [ ] **SVG/Yoga ticket sizing:** On the home screen and journey screen, confirm the boarding pass header and journey header cards render at their intended height (not full-screen). Test on both primary and secondary devices.
- [ ] **Ticket tear stacking:** Navigate to a lesson from the journey map (triggers the ticket tear animation). Confirm both tear halves stack correctly with the correct visual order.
- [ ] **Shadow and glow rendering:** Open the journey map for the active language. Confirm the boarding pass card has a visible drop shadow (elevation-based, gray). Note that the colored glow pulse will not be visible (needs-work item). Confirm the station glow ring is visible as a pulsing colored border.
- [ ] **Meetei Mayek font:** Switch active language to Manipuri (if available). Confirm text renders without tofu (blank boxes) on Android.
- [ ] **Reduced motion:** Enable "Remove animations" in Android Accessibility settings. Launch the app and confirm that journey map animations (rail pulse, stop glow pulse) do not play.
- [ ] **Haptics:** During a practice session, confirm vibration feedback fires on band results (heavy for perfect/great, light for good/almost, warning pattern for retry). Test on API 26+ device.
- [ ] **Display cutout:** On a device with a display cutout, confirm no content is hidden behind the cutout or status bar on any screen.

---

## 7. Task Breakdown

**Gate:** All tasks below begin only after iOS build 31 clears external beta and is confirmed stable in production.

**Task 1 -- Fix needs-work items from risk audit**
- Shadow/glow: Update `JourneyPassCard.tsx` glow overlay (`components/journey/JourneyPassCard.tsx`) to add an Android-compatible colored glow using `elevation` + border radius approach or React Native Skia `<Shadow>` blur. The `shadowColor`/`shadowOpacity` on the glow view need an Android equivalent.
- Audit all screens for hardcoded `paddingTop` values that bypass safe-area insets.
- Size: Medium (1-2 days). Files: `artifacts/bolo-mobile/components/journey/JourneyPassCard.tsx`, any screen files with hardcoded insets.

**Task 2 -- Clerk Google OAuth Android redirect + Apple Sign-In guard**
- Confirm `bolo-mobile://` redirect URI is registered in Clerk dashboard for Google OAuth.
- Verify `AppleAuthButton` returns null on Android (already in code -- confirm in a real build).
- Size: Small (half day). Files: Clerk dashboard (no code change expected).

**Task 3 -- RevenueCat Play products + webhook verification**
- Create matching subscription products in Play Console.
- Configure the products in the RevenueCat dashboard under the Android app.
- Review `artifacts/api-server/src/lib/revenuecatSync.ts` for grace period and `PRODUCT_CHANGE` handling; add a Play-specific branch only if gaps are found.
- Size: Small to medium (1 day for product setup; 0.5 days for webhook review). Files: `artifacts/api-server/src/lib/revenuecatSync.ts` (if changes needed).

**Task 4 -- Build and sign production AAB via EAS**
- Run `eas credentials --platform android` to generate and back up the keystore.
- Run `eas build --platform android --profile production` to produce the first signed AAB.
- Store the service account JSON for `eas submit` via EAS secrets.
- Size: Small (half day, mostly waiting for EAS build). Files: none (EAS configuration only).

**Task 5 -- Play Console listing and store assets**
- Create the app in Play Console.
- Complete the store listing (name, description, screenshots).
- Create the 1024x500 feature graphic (design task).
- Export and verify the 512x512 icon PNG.
- Complete the content rating questionnaire and data safety form.
- Size: Medium (1 day for listing; 0.5 days for feature graphic design). Files: `assets/store/` (new Android-specific assets).

**Task 6 -- Internal testing track upload + F&F beta**
- Submit the AAB to the internal testing track via `eas submit --platform android`.
- Add F&F testers and promote to closed testing (or open testing -- Aakesh's decision).
- Size: Small (half day, plus waiting for Play review if moving to closed testing).

**Task 7 -- Physical device verification pass**
- Run the full Section 6 checklist on a minimum of two Android devices.
- File bugs for any needs-verification items that fail.
- Size: Medium (1 day of device testing). Blocking gate before Task 8.

**Task 8 -- Production release**
- Promote from closed/open testing to production.
- Stage rollout at 10% initially.
- Monitor Sentry and PostHog for Android-specific crash spikes.
- Size: Small (half day for submission; ongoing monitoring).

---

## 8. Findings and Open Questions

The following items require Aakesh's decision or are open for verification:

1. **Minimum Android OS version.** `app.json` does not set `android.minSdkVersion`. Recommended starting point: API 28 (Android 9, Pie), which covers approximately 95% of active Android devices as of 2026. API 26 minimum would be needed only if haptics on older devices are a priority. Recommendation: set `android.minSdkVersion: 28` in `app.json` before the first production build.

2. **F&F beta track selection.** Play policy requires a closed testing track to have at least 12 opt-in testers for a minimum of 14 days before a production release can be submitted. If the F&F group is smaller than 12, options are: (a) use the open testing track (no minimum tester count, but the app is publicly discoverable); (b) remain on the internal track for F&F and go directly to production after device verification; (c) recruit additional testers to meet the 12-tester minimum. Aakesh to decide.

3. **PostHog analytics opt-out.** Play data safety requires disclosing whether users can request that analytics data collection be stopped. The current app has no opt-out UI for PostHog. Options: (a) add an analytics opt-out toggle in account settings; (b) rely on PostHog's built-in opt-out API (`posthog.optOutCapturing()`) exposed via a settings toggle; (c) disclose "no opt-out" in data safety (allowed, but may affect app store ratings). Recommendation: add a minimal opt-out toggle before production submission.

4. **versionCode starting point.** The first EAS production build auto-increments `versionCode` from 1 to 2. If alignment with iOS `buildNumber: 31` is preferred (for internal tracking), manually set `android.versionCode: 31` in `app.json` before the first production build. Confirm whether this matters for internal tracking before building.

5. **CAMERA permission review.** `app.json` declares `android.permission.CAMERA` and `android.permission.READ_MEDIA_IMAGES` / `android.permission.READ_MEDIA_VIDEO`. These come from the `expo-image-picker` plugin (profile photo capture and selection). If profile photo upload is not yet implemented or is not included in the initial Android launch scope, remove these permissions before submission to avoid Play policy questions about unused permissions. Verify that `expo-image-picker` is actually reachable in the user flow at launch time.

6. **Audio data disclosure (OpenAI Whisper).** The data safety form must disclose that voice audio is sent to OpenAI for speech recognition. Confirm OpenAI's Whisper API data retention policy (as of 2024, OpenAI retains API inputs for 30 days for abuse monitoring by default, with a zero-retention option available via contract). The Play data safety form answer should reflect the actual retention policy. Review OpenAI's API terms before attesting.
