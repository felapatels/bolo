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

## 2a. Privacy policy (required)

Google Play and the App Store both require a publicly hosted privacy-policy URL
before an app that records audio can be published. Bolo! records the learner's
voice (microphone → backend) for pronunciation scoring, so the URL is mandatory.

The policy is hosted on the Bolo! web app (`artifacts/gujarati-coach`) at the
public route **`/privacy`** — it is served for both signed-in and signed-out
visitors, so it works as a public link.

| Environment | URL |
| --- | --- |
| Production (use this in the store listings) | `https://<your-deployed-web-domain>/privacy` |
| Replit dev preview | `https://<REPLIT_DEV_DOMAIN>/privacy` |

Replace `<your-deployed-web-domain>` with the domain the Bolo! web artifact is
published to (Replit deployment domain or a custom domain). Paste that URL into:

- **Play Console** → App content → Privacy policy
- **App Store Connect** → App Privacy → Privacy Policy URL

The policy covers what is collected (email via Clerk auth, audio recordings for
pronunciation scoring, learning progress), how it is used, that audio is not
shared with third parties or retained beyond scoring, and how to contact us /
delete data.

## 2b. Terms of Service (recommended)

App stores expect a Terms of Service / EULA in addition to the privacy policy,
especially for apps with paid subscriptions (Bolo! Plus). The terms are hosted
on the Bolo! web app (`artifacts/gujarati-coach`) at the public route
**`/terms`** — served for both signed-in and signed-out visitors, so it works
as a public link.

| Environment | URL |
| --- | --- |
| Production (use this in the store listings) | `https://<your-deployed-web-domain>/terms` |
| Replit dev preview | `https://<REPLIT_DEV_DOMAIN>/terms` |

Replace `<your-deployed-web-domain>` with the domain the Bolo! web artifact is
published to. Paste that URL into:

- **Play Console** → Store listing → (App details / EULA where a terms URL is
  requested) and into the app's subscription/paid-content details
- **App Store Connect** → App Information → **License Agreement** (or use the
  standard Apple EULA), and reference it in the subscription metadata

The terms cover acceptable use, subscription and billing terms (auto-renewal,
cancellation, refunds, app-store billing), disclaimers and limitation of
liability, and how to contact us.

## 3. Listing assets (`assets/store/android/`)

| Asset | File | Spec | Status |
| --- | --- | --- | --- |
| High-res icon | `play-store-icon.png` | 512×512, 32-bit PNG | ✅ generated |
| Feature graphic | `feature-graphic.png` | 1024×500 PNG | ✅ generated |
| Phone screenshots (raw) | `screenshots/*.jpg` | 412×824, ≤2:1 ratio | ✅ 9 captured |
| Phone screenshots (listing) | `screenshots-framed/*.jpg` | 1080×1920, ≤2:1 ratio | ✅ generated |

The icon and feature graphic are generated from the brand SVGs
(`assets/branding/icon.svg` + `adaptive-icon.svg`) and are fully reproducible:

```bash
bash scripts/gen-store-assets.sh
```

### Screenshots

`screenshots/` holds nine real captures of the app, all at a Play-compliant
**412×824** (exactly 2:1, within the ≤2:1 ratio and 320–3840px-per-side rules):

| File | Screen |
| --- | --- |
| `01-sign-in.jpg` | Onboarding — sign in |
| `02-sign-up.jpg` | Onboarding — create account |
| `03-home-topics.jpg` | Home — streak/stats + lesson topics list (Hindi) |
| `04-practice.jpg` | Practice — phrase card + record button (Hindi) |
| `05-progress.jpg` | Progress — mastery, stats, badges entry |
| `06-badges.jpg` | Badges — earned + in-progress achievements |
| `07-home-topics-gujarati.jpg` | Home — topics list in **Gujarati** (ગુજરાતી) |
| `08-practice-tamil.jpg` | Practice — phrase card in **Tamil** (தமிழ்) |
| `09-topic-phrases-bengali.jpg` | Topic — phrase list in **Bengali** (বাংলা) |

Screenshots 07–09 show the same screens in **non-Hindi scripts** to make Bolo!'s
headline differentiator — all 22 official Indian languages — obvious at a glance
to a shopper scrolling the listing.

The four feature screens (03–06) live behind Clerk auth and real learner data,
so they were captured from the app's **web build** (Expo/react-native-web
renders the same component tree and styling as the device) with representative
demo content, sized to the phone spec. They faithfully show the production UI.

If you want captures with device status-bar chrome, re-take them on an
emulator/device running the internal build (the app renders identically):

```bash
# with an emulator or device running the preview/production build, signed in
adb exec-out screencap -p > screenshots/03-home-topics.png
```

### Branded, captioned screenshots (upload these)

The raw `screenshots/*.jpg` are bare app frames. `gen-store-assets.sh` also
generates **branded, captioned** versions into `screenshots-framed/` — each raw
capture is wrapped in an on-brand cream→mint gradient with the Bolo! mark,
wordmark, and a short benefit headline above a rounded phone plate with a soft
shadow. Pairing every screenshot with a caption (instead of a bare screen dump)
is a well-known Play/App Store install-conversion lever.

Each framed image is **1080×1920** (9:16 = 1.78:1 — inside Play's ≤2:1 ratio and
320–3840px-per-side rules). Headlines:

| File | Headline |
| --- | --- |
| `01-sign-in.jpg` | Your language journey starts here |
| `02-sign-up.jpg` | Create your free account in seconds |
| `03-home-topics.jpg` | Speak 22 Indian languages |
| `04-practice.jpg` | Get instant pronunciation feedback |
| `05-progress.jpg` | Track every streak and milestone |
| `06-badges.jpg` | Earn badges as you master phrases |
| `07-home-topics-gujarati.jpg` | Learn in Gujarati, Hindi & more |
| `08-practice-tamil.jpg` | Practice real Tamil conversations |
| `09-topic-phrases-bengali.jpg` | Master everyday Bengali phrases |

**Upload the `screenshots-framed/` images to the listing** (the raw ones stay as
the reproducible source captures). Play accepts **2–8** phone screenshots, so
pick the strongest 8 — e.g. drop `01-sign-in` and lead with `03`, `04`, `05`,
`06`, `07`, `08`, `09`, `02`. Re-run `bash scripts/gen-store-assets.sh` to
regenerate every frame after a re-capture or a copy tweak.

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
