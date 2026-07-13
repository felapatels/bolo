# Bolo! Mobile — Google Play Store submission guide

Everything needed to produce a release **AAB** and fill out the Google Play
Console listing for Bolo! Mobile. The iOS equivalent lives in the App Store
task; this file only covers Android.

## 1. App identity (already configured in `app.json`)

| Field | Value | Where |
| --- | --- | --- |
| Application ID | `com.bolo.mobile` | `expo.android.package` |
| Version name | `1.0.0` | `expo.version` |
| Version code | `1` | `expo.android.versionCode` |

Bump `versionCode` by **1 for every upload** to Play (Play rejects a re-used
code). With the `production` profile in `eas.json` (`autoIncrement: true`), EAS
handles this automatically; the value in `app.json` is the local floor.

## 2. Permissions

The app only needs the **microphone** so learners can record and score their
pronunciation (via `expo-audio`). It is declared and justified through the
`expo-audio` plugin (`microphonePermission`) and pinned explicitly:

```jsonc
"permissions": ["android.permission.RECORD_AUDIO"]
```

`expo-location` and `expo-image-picker` are transitive dependencies that are
**not used** by any screen, so the permissions they would otherwise inject are
stripped via `android.blockedPermissions` (location, camera, external storage,
media). This keeps the Play data-safety form honest — the only sensitive
permission is the microphone.

**Data safety form:** declare that audio is recorded and sent to the backend
for pronunciation scoring, is not shared with third parties, and is not stored
beyond the scoring request. No location, contacts, photos, or advertising IDs
are collected.

## 3. Listing assets (`assets/store/android/`)

| Asset | File | Spec | Status |
| --- | --- | --- | --- |
| High-res icon | `play-store-icon.png` | 512×512, 32-bit PNG | ✅ generated |
| Feature graphic | `feature-graphic.png` | 1024×500 PNG | ✅ generated |
| Phone screenshots | `screenshots/*.jpg` | 2–8 images, ≤2:1 ratio | ⚠️ see below |

The icon and feature graphic are generated from the brand SVGs
(`assets/branding/icon.svg` + `adaptive-icon.svg`) and are fully reproducible:

```bash
bash scripts/gen-store-assets.sh
```

### Screenshots

`screenshots/01-sign-in.jpg` and `02-sign-up.jpg` are real captures of the
app's onboarding at a Play-compliant 412×824 (≈2:1). Before publishing, add a
few **feature** screenshots (a lesson category list, a practice/recording
screen, the progress/badges screen). Those live behind auth and are best
captured on a device/emulator running the internal build:

```bash
# with an emulator or device running the preview/production build
adb exec-out screencap -p > screenshots/03-practice.png
```

Play requires **at least 2** phone screenshots; the two onboarding shots
already satisfy the minimum, but the feature shots make a much stronger
listing.

## 4. Building the release AAB with EAS

Build profiles are defined in `eas.json`:

- `development` — dev client APK for debugging on device
- `preview` — internal-distribution APK for QA / sideloading
- `production` — **app-bundle (AAB)** for the Play Store, `autoIncrement` on

```bash
# one-time
npm i -g eas-cli
eas login
eas build:configure          # links the project to your Expo account

# produce the Play Store artifact
eas build --platform android --profile production
```

EAS manages the upload signing key by default (Play App Signing). Download the
resulting `.aab` from the build page (or use `eas submit`).

## 5. Submitting

```bash
eas submit --platform android --profile production --path <build.aab>
```

The `submit.production` profile targets the **internal** test track with a
**draft** release status so nothing goes public accidentally. Promote to
closed/open testing or production from the Play Console once QA passes.

> First-ever submission must be uploaded/created in the Play Console manually
> (create the app entry, accept agreements, set up the store listing with the
> assets above). After the app exists, `eas submit` handles subsequent uploads.
