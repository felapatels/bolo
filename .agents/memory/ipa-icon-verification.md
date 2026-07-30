---
name: Verifying what icon an EAS .ipa actually shipped
description: How to settle "wrong app icon" reports empirically by extracting and decoding the AppIcon from the built .ipa, and the caching traps that cause false reports.
---

**Rule:** When someone reports the built iOS app carries the wrong icon, do not reason from source files — extract the icon from the actual .ipa and look at it.

**Why:** July 30, 2026 — build 27 was reported to contain the old green parrot despite byte-canonical sources. The binary was in fact correct; the sighting was display-side (iOS home-screen/TestFlight icon caches survive reinstalls of same-app builds, and TestFlight shows the PREVIOUS build's artwork until Apple re-processes).

**How to apply:**
- `eas build:view <id> --json` → `artifacts.applicationArchiveUrl`; `unzip .ipa "Payload/*/AppIcon*"`.
- MD5 vs the source PNG ALWAYS differs — Xcode's actool re-encodes. Content comparison only.
- The extracted PNGs are Apple CgBI (proprietary: raw deflate `zlib.decompress(data,-15)`, BGRA, alpha-premultiplied, extra CgBI chunk). ImageMagick/ReadFile choke on them; decode with a small Python script (unfilter scanlines, swap BGR, un-premultiply) then view.
- With no committed `ios/` dir, no `.easignore`, and no `app.config.*` override, prebuild consumes exactly `expo.icon`/`expo.ios.icon` from app.json — there is nowhere else an icon can come from.
- Related trap: `eas.json` production `autoIncrement: true` + `appVersionSource: local` bumps app.json's buildNumber at trigger time — pre-bumping by hand yields N+1. Leave the file at N-1 and let the trigger land on N (commit the bump).
