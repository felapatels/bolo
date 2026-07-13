---
name: App/Play store submission assets
description: How store listing prep works for the Expo mobile artifact (icons, feature graphic, screenshots, permissions, EAS profiles)
---

# Store submission prep (Bolo! Mobile / Expo)

Applies to Google Play and (pending) Apple App Store prep for `artifacts/bolo-mobile`.

- **Listing graphics are generated from brand SVGs, not hand-drawn.**
  `scripts/gen-store-assets.sh` renders the 512×512 icon + 1024×500 feature
  graphic from `assets/branding/*.svg` with ImageMagick (`magick`), using the
  bundled Bricolage Grotesque TTFs under `node_modules/@expo-google-fonts/`.
  ImageMagick renders these brand SVGs (gradients/clip-paths) fine at high
  `-density`. Outputs go to `assets/store/<platform>/`.

- **Screenshots of authed feature screens can't be captured via the
  non-interactive Screenshot tool.** It only does static captures and can't log
  in through Clerk. Onboarding (sign-in/sign-up) renders cleanly on Expo web and
  can be captured that way; feature screens (lessons, practice, progress) must be
  captured from a device/emulator on the internal build.
  **Why:** the app gates everything behind Clerk auth and the tool can't interact.

- **Unused Expo deps inject Android permissions.** `expo-location` and
  `expo-image-picker` are installed but unused; their permissions are stripped
  via `android.blockedPermissions` in `app.json`. Only `RECORD_AUDIO`
  (expo-audio, for pronunciation scoring) is genuinely needed.
  **How to apply:** when adding an Expo module, check whether it auto-adds a
  permission you don't use and block it, or the Play data-safety form becomes wrong.

- **EAS `production` profile builds an AAB with `autoIncrement`** so Play's
  unique-versionCode rule is satisfied automatically; `app.json versionCode` is
  just the local floor. See `PLAY_STORE.md` for the full build/submit flow.
