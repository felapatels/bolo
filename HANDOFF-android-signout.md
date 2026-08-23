# Handoff: Bolo Android sign-out bug, 2026-08-22 night

Written for the agent picking this up. Read it before touching anything. Everything
below was measured on a real device or read out of installed source, not inferred.

---

## 1. Orientation

- **Repo:** `/Users/aakeshpatel/bolo`, remote `github.com/felapatels/bolo`, branch `main`.
- **Mobile app:** `artifacts/bolo-mobile`, Expo SDK 54, RN 0.81.5, Hermes, Fabric/New Arch,
  TurboModules. Package `com.bolo.mobile`.
- **iOS is LIVE on the App Store** (1.0.1). Do not destabilise it.
- **Android is internal-testing only.** Nothing user-facing is at risk there.
- **Web** is `artifacts/gujarati-coach`, served at **bolo-india.app** from Replit
  (repl `replit.com/@aakeshp/Bolo`). Deploys are a manual **Republish**; the Repl pulls
  from GitHub `main` via its Git pane.
- **The user works locally, not in Replit.** Replit is a deploy target.

**Read `CLAUDE.md` at the repo root.** It carries hard-won rules, including: verify by
content not commit message, never rewrite history on main, prefer
`pnpm install --frozen-lockfile`, both platforms or say why not, read the test before
changing it.

---

## 2. State right now

- **HEAD:** `0301e0b1`. **14 commits unpushed to `origin/main`.** Push them.
- **Build 426 was launched from `0301e0b1`** and was still running at handoff.
  Check with `npx eas build:list --platform android --limit 1 --non-interactive`.
- **The phone has build 424, which CRASHES AT LAUNCH.** It is unusable until 426
  installs. Device: Samsung **SM-A176U1**, Android 16, connected over adb
  (`adb devices` works; serial `R5GL50EFQVK`).
- **Working tree clean** apart from untracked `artifacts/bolo-social-clips/campaign-*`
  and `scripts/gen-*-campaign.mjs`, which are not mine and not part of this work.

---

## 3. Two bugs were worked tonight

### 3a. Android chai shop showed no packs — FIXED and CONFIRMED ON DEVICE

`Purchases.getProducts()` in `react-native-purchases` 9.15.2 **defaults to the
SUBSCRIPTION category.** Chai packs are one-time products, and Google Play keeps
subscriptions and one-time products in **two separate catalogues**, so the query returned
nothing and `useChaiPacksSellable` correctly hid the shop. iOS never showed it because
StoreKit has one catalogue and ignores the argument.

Fixed at **three** call sites by passing `Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION`:

```
components/ChaiPackShop.tsx   useChaiPacksSellable   the "should the shop appear" probe
components/ChaiPackShop.tsx   the shop's own fetch   tiles and prices
contexts/PurchasesContext.tsx purchaseChaiPack       the lookup before purchasing
```

The third was found by the test suite, not by reading. The mock in
`__tests__/chai-pack-shop.test.tsx` now models Play's split catalogue (returns `[]` for the
wrong category) in **both** the module factory and the `beforeEach` override, so the guard
actually bites. Verified both directions: remove the argument, 5 of 14 fail; restore, 14 pass.

**Confirmed on the device on build 422: three packs with prices appear.**

**STILL UNPROVEN:** an actual Android *purchase*. That exercises `purchaseChaiPack` and has
never run against Play. **Do not test it until License testing is set up** in Play Console
(Settings → License testing), or the tester is charged real money.

### 3b. Android session vanishes ~43 s after sign-in — DIAGNOSED, FIX IN FLIGHT

**Symptom.** Sign in, sit on the homepage, and roughly 43 seconds later the app redirects
to the sign-in screen. Reproducible on demand. Foreground, idle, no interaction.

**It is deterministic, not flaky:**

```
build 422, @clerk/expo 3.7.4   session held 43033 ms
build 423, @clerk/expo 3.7.8   session held 43747 ms
```

0.7 s apart across two SDK versions. A timer, not a race in the "sometimes" sense.

---

## 4. What was RULED OUT, each with evidence

| Ruled out | Evidence |
|---|---|
| **A crash** | `adb logcat`: zero FATAL, zero tombstones, twice. The app pid survives the bounce. The only process kills in the captures are `Killing ... (adj 900): remove task`, which is the user swiping the app away. |
| **Server-side revocation** | Clerk dashboard **Logs** tab shows `sign_in.created`, `sign_in.completed`, `session.created` around every bounce and **zero** revocation or expiry events. |
| **Clerk session settings** | Inactivity timeout **off**, maximum lifetime **7 days**, custom session token claims `{}`. |
| **App-initiated sign-out** | Nothing calls `signOut()` except two explicit buttons on the account screen. `app/(app)/_layout.tsx` only obeys `isSignedIn`. |
| **SecureStore failure** | `lib/clerkTokenCache.ts` is an instrumented replacement for Clerk's cache that reports any throw **before** doing the same delete. **It has never fired.** No keystore errors for the app uid at bounce time either; the only ones in the captures are on a fresh install, before either key exists. |
| **Android 16 specifically** | No evidence at all. One device tested. Two other agents asserted OS-level causes with confident, unsupported detail. Do not chase this. |

---

## 5. The mechanism, captured

Sentry breadcrumbs from build 423 (`lark-enterprises-llc`, project `bolo-mobile`,
issue **BOLO-MOBILE-T**):

```
12:46:25.379   XHR GET clerk.bolo-india.app/v1/client?..._is_native=1   [200]
12:46:25.380   XHR GET clerk.bolo-india.app/v1/client?..._is_native=1   [200]   <- 1 ms later
12:46:25.448   tokenCache saveToken
12:46:25.449   tokenCache saveToken                                              <- 1 ms later
12:46:25.568   SessionVanishedError                                              <- 119 ms later
```

Both cache breadcrumbs carried `tokenBytes`, which **only `saveToken` logs** — `getToken`
logs `result`, `clearToken` logs nothing. So **nothing was cleared. Clerk WROTE a token,
twice, and 119 ms later stopped believing there was a session.**

**Why.** `@clerk/expo` since v3.0.0 runs **two Clerk clients**: the JS one (clerk-js) and an
embedded native Android one (`com.clerk.api.Clerk`, via `expo.modules.clerk.ClerkExpoModule`,
both confirmed in the device log). `ClerkProvider` keeps them agreed through
`useSyncableTokenCache`, `useNativeClientBootstrap` and `useNativeClientEventSync`
(see `node_modules/@clerk/expo/dist/provider/`). The client JWT rotates on every FAPI call,
the native side answers with a stale one, the refetched `/v1/client` comes back without a
session, and `isSignedIn` flips.

**Confirmed by a second opinion (Replit Fable), whose read matched the breadcrumbs and who
cited upstream `clerk/javascript` issue #9217 and PR #9438 (foreground refresh disabled,
shipped ~`@clerk/expo` 4.2.8). That PR targets a lifecycle trigger and probably does NOT
cover this idle-foreground variant. Treat the issue number as unverified; I could not
check it.**

---

## 6. What has been tried, in order

1. **`@clerk/expo` 3.7.4 → 3.7.8** (commit `00d28b81`). **Did not fix it.** Timing moved 0.7 s.
2. **Autolinking exclusion on Android** (commit `9ef1d25e`), matching the `apple` exclusion
   that has been in `artifacts/bolo-mobile/package.json` **since 2026-07-14** and is very
   likely why **iOS has never shown this bug**. **Build 424 crashed at launch:**

   ```
   FATAL EXCEPTION: mqt_v_native
   JavascriptException: Error: Cannot find native module 'ClerkExpo'
   ```

   **Why:** Android's spec uses `requireNativeModule` (throws) while every other platform
   uses `requireOptionalNativeModule` (returns null), and `dist/utils/native-module.js`
   wraps only the property access on line 19, not the `require` on line 4. The throw escapes.
3. **`pnpm patch` to fix that one word** (commit `0a0fdbd3`). **Build 425 died in 20 s:**
   `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`. **The EAS builder runs pnpm 10.14.0; this Mac runs
   11.22.0**, and they keep `patchedDependencies` in different files with no shared value.
   pnpm 11 refuses the pnpm 10 location outright.
4. **Postinstall script instead** (commit `0301e0b1`), `scripts/patch-clerk-android-specs.mjs`,
   wired as root `postinstall`. Version-independent. **Verified on a real install:**
   `postinstall: made 2 Android spec(s) fail soft instead of throwing`. **This is what
   build 426 is testing.**

---

## 7. What to do next

**First, check build 426.**

| Outcome | Next step |
|---|---|
| **Install phase passes and it launches, no bounce** | The exclusion is the fix. **Push the 14 commits.** Consider whether iOS should keep its exclusion permanently (it already does). Write the finding into `CLAUDE.md`. |
| **Launches, still bounces** | The exclusion is not the fix. The **renamed diagnostic fields** (`cacheOp`, `cacheKey`, `payloadBytes`, `credentialState`, commit `b5a6c391`) now survive Sentry's scrubbing, so the next `SessionVanishedError` shows **whether both writes hit the SAME key with different payloads** (the desync) or two different keys (everyone has been chasing a coincidence). **That has never been established and it is the single most valuable unknown.** |
| **Crashes on a different native module** | Add it to `TARGETS` in the postinstall script. The three view specs (`NativeClerkAuthView`, `NativeClerkUserButtonView`, `NativeClerkUserProfileView`) use `requireNativeView` and are currently unreachable, since `dist/index.js` never mentions them and the app imports only from `'@clerk/expo'` root. |
| **Install still fails** | Read the log via the Expo MCP `build_logs` tool, not the signed URL (it is compressed in a format that resisted decoding). |

**If none of it works:** the last resort is `@clerk/expo` **2.19.0**, verified to have **no
`android/` directory at all** and peers accepting Expo 54 and React 19. It forfeits five
months of fixes, so it is a genuine last resort.

**Either way, this is an upstream bug and Clerk should get the report.** The strongest
finding to send them, which neither second-opinion agent had: **the JS-only escape hatch
that works on iOS is broken on Android by one word**, `requireNativeModule` vs
`requireOptionalNativeModule`, because `loadNativeModule()`'s try/catch is one line below
the throw.

---

## 8. Loose ends, unrelated to the sign-out

- **"Gujurati" is misspelled on the live App Store listing.** Correct spelling is
  "Gujarati". App name is version-scoped metadata, so it needs a new version submission.
  It also hurts App Store search for the exact query they most want.
- **Three stale `EXPO_PUBLIC_REVENUECAT_*` keys in `.replit`** (`goog_CoJRNhxx...`,
  `appl_yoQNlJ...`, `test_NMSyWV...`) do not match the EAS values. They affect only the
  Replit dev environment. `REVENUECAT_PROJECT_ID = proja487649a` **is correct** (the
  dashboard is `projects/a487649a`) and the server only null-checks it anyway.
- **Two `Published your App` commits** sit unpushed in the Repl's Git pane. Harmless
  deploy markers.
- **`AudioRecorder.prepareToRecordAsync has been rejected`** is now on **2 users** in
  Sentry, so it is no longer just the emulator that was blamed earlier.
- **Commit `63503b92` is mislabeled.** Its subject says "Record the versionCode for build
  425" but it also carries the revert of the pnpm patch. Not amended, because this repo
  does not rewrite history on main. Read its diffstat.
- **No `expo-updates` and no `expo-dev-client`.** Every JS-only change costs a 21-minute
  build. Adding EAS Update would be the single biggest workflow win here. Local Gradle
  builds are also blocked: **`ANDROID_HOME` unset and no JDK installed** (`java` is missing),
  though the SDK is at `~/Library/Android/sdk` with build-tools 36.

---

## 9. Reference

**Android monetization, all completed and verified tonight:**

- Play products: `bolo_chai_cutting` $1.99, `bolo_chai_kulhad` $4.99, `bolo_chai_kettle` $9.99,
  all active. Subscription `bolo_plus` with base plans `monthly` $12.99 and `annual` $89.99,
  each with a 7-day trial offer.
- RevenueCat project **Bolo!** (`app.revenuecat.com/projects/a487649a`). Apps:
  `Bolo! (App Store)` `appd05f1f47b5`, `Bolo! Android` `appa9440d8168`.
  Offering **`default`**: `$rc_monthly`, `$rc_annual` (now Apple **and** Android),
  `family_monthly`, `family_annual` (Apple only, Family is held on both stores).
  **There is no `one_language` offering at all**, so that tier has never been live anywhere.
- Entitlements: **`plus`** (All-Access, 4 products), `family` (2 products). Chai packs
  deliberately carry **no** entitlement, matching iOS.
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_GxpModAJjugOitOqRPvVCngJcdc` set in EAS
  production. RTDN connected and **verified receiving**: topic
  `projects/bolo-503815/topics/Play-Store-Notific…`, "Last received 2026-08-22 5:36 p.m. UTC".
- **Known risk, unverified:** the server resolves chai by **exact** product-id match
  (`getChaiPackByAppleProductId`). Play imported the packs with **bare** ids, matching iOS, so
  it should be fine, and `f210e213` makes a paid-but-ungranted purchase **loud** rather than
  silent. Confirm on the first real Android purchase by reading the webhook payload.

**Play Console:** developer account **LARK Software**, id `8863396312101627827`, app id
`4973240849664270024`, at `/u/1/`. `eas.json` now submits with
`track: internal, releaseStatus: completed`, so builds roll themselves out.

**Operational gotchas learned the hard way tonight:**

- Play can take several minutes to serve a new internal build. Force it with
  `adb shell am force-stop com.android.vending` then
  `adb shell am start -a android.intent.action.VIEW -d "market://details?id=com.bolo.mobile"`.
- Sentry's default scrubbing strips any key containing **"token"** or **"auth"** from extras
  and breadcrumb data. Tags survive. Put anything load-bearing in the error **message**.
- `eas build:view <id>` is not valid syntax in eas-cli 22.2.0. Use `eas build:list`.
- Never tell the user to paste a `!`-prefixed command into their terminal. `!` is a Claude
  Code prompt prefix; in zsh it is history expansion and it mangled a command into an
  unrelated rollcall build.
- The `.aab` cannot be installed on a phone and does not need re-uploading; `--auto-submit`
  already sent it.
