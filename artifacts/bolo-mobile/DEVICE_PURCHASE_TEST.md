# On-device Plus purchase test — pre-App Store checklist

RevenueCat is fully provisioned for this project (`projad047e4e`). All products,
entitlements (`plus`, `one_language`), and the `default` + `one_language`
offerings exist; the public SDK keys and server env vars are wired up in Replit.
What remains is the live store test that only a real device can run.

## One-time setup left for you (dashboard + stores)

1. **RevenueCat webhook** — Dashboard → Project *Bolo!* → Integrations →
   Webhooks → **+ New**:
   - URL: `https://bolo-india.app/api/revenuecat/webhook`
   - Authorization header value: the exact `REVENUECAT_WEBHOOK_AUTH` secret you
     saved in Replit.
2. **Republish the app** so production picks up the new env vars/secrets
   (`REVENUECAT_PROJECT_ID`, `REVENUECAT_WEBHOOK_AUTH`, entitlement ids).
3. **App Store Connect** (bundle id `com.bolo.mobile`):
   - Create auto-renewable subscriptions `bolo_plus_monthly`, `bolo_plus_annual`,
     `bolo_one_language_monthly`, `bolo_one_language_annual`.
   - Set real prices. ⚠ The annual prices in RevenueCat's Test Store
     ($59.99 / $49.99) are placeholders — confirm real annual pricing first.
   - Add a **7-day free trial** introductory offer to the two Plus products
     (the paywall reads the trial label from store metadata automatically).
   - Upload the App Store Connect API key / shared secret in RevenueCat's
     iOS app settings (`app88290f90ef`) so receipts validate.
   - Create a **Sandbox tester** account (Users & Access → Sandbox Testers).
4. **Google Play** (package `com.bolo.mobile`): mirror the four subscriptions
   with base plans `monthly` / `annual`, connect Play service credentials in
   RevenueCat's Android app settings (`app4e3347bece`), and add your Gmail as a
   license tester.
5. Build & install via TestFlight / internal testing track (EAS build —
   sandbox purchases don't work in Expo Go; Expo Go uses the Test Store key).

## Device test script (iOS sandbox; repeat the purchase steps on Android)

Sign in to the device with the sandbox tester (iOS: Settings → App Store →
Sandbox Account). Use a **fresh Free account** in the app.

### 1. Paywall sanity
- [ ] Open the paywall: real store prices show for monthly + annual, and the
      **7-day free trial** label appears on the all-access tier.
- [ ] Tier toggle shows both One Language and All-Access.

### 2. Cancel path
- [ ] Start a monthly purchase, then cancel on the system sheet.
- [ ] App returns to the paywall cleanly — no error banner, no spinner stuck.

### 3. Monthly purchase → unlock (no manual reload)
- [ ] Buy **Plus monthly**; complete the sandbox payment sheet.
- [ ] "You're in!" appears and the paywall closes by itself.
- [ ] Locked languages become selectable immediately.
- [ ] Plus teasers / upgrade prompts disappear.
- [ ] Daily-lesson cap banner is gone.
- [ ] RevenueCat dashboard shows the sandbox transaction; server logs show the
      webhook `INITIAL_PURCHASE` returning 200.

### 4. Restore on fresh install
- [ ] Delete the app, reinstall from TestFlight, sign in to the same account.
- [ ] Tap **Restore purchases** on the paywall → Plus is restored.

### 5. Annual purchase
- [ ] With a *second* fresh account (or after the sandbox sub expires), buy
      **Plus annual** and re-verify step 3's unlock behavior.

### 6. One Language tier (optional but recommended)
- [ ] Buy One Language monthly with a chosen language; verify only Hindi + that
      language unlock, and the paywall then offers only the all-access upgrade.

## If something fails
- Purchase succeeds but app stays Free → check the webhook: RevenueCat
  dashboard → Webhooks → event log (look for non-200s), and production server
  logs. The reconcile-on-read backstop should still flip the account within one
  entitlements fetch — if it doesn't, verify `REVENUECAT_PROJECT_ID` is set in
  production.
- No offerings / empty paywall → the store products aren't approved/active yet,
  or the bundle id of the build doesn't match `com.bolo.mobile`.
