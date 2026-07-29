---
name: EAS iOS build & submit flow
description: How to build and submit the Bolo! iOS binary from this repl (EXPO_TOKEN, polling, ASC caveat)
---

- `EXPO_TOKEN` secret authenticates eas-cli non-interactively (`pnpm exec eas whoami`); eas-cli is a devDependency of bolo-mobile.
- Production env vars (`EXPO_PUBLIC_DOMAIN`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` pk_live) live in EAS `production` environment — check with `eas env:list --environment production`.
- `eas build -p ios -e production --non-interactive --no-wait` auto-bumps `expo.ios.buildNumber` in app.json (appVersionSource local) — commit the bump.
- Don't `--wait` in ShellExec (5-min cap); poll with `eas build:view <id>` and, for submissions, the GraphQL API: `POST https://api.expo.dev/graphql` query `submissions{byId(submissionId:"..."){status error{message}}}` (no CLI submit:list command exists). Submissions can sit IN_QUEUE ~45+ min during EAS partial outages.
- Signing + ASC API key are stored on EAS servers; `eas submit -p ios --id <buildId> --non-interactive --no-wait` uploads to App Store Connect/TestFlight.
- ~~EXPO_PUBLIC_CLERK_PROXY_URL requirement~~ OBSOLETE since July 28, 2026: the Clerk production instance now serves `clerk.<domain>` via CNAME with valid TLS, and CNAME + proxy are mutually exclusive. The proxy var was deliberately DELETED from EAS production — do not re-add it. Production env should carry DOMAIN, pk_live key, EXPO_PUBLIC_SENTRY_DSN, EXPO_PUBLIC_POSTHOG_KEY.
- Submissions can land ERRORED with `error: null` and `logsUrl: null` in GraphQL, and wait-mode CLI shows only "Something went wrong when submitting your app to Apple App Store Connect" (seen July 29, 2026: three in a row for build 26 while Expo AND Apple status pages were green, one day after an identical submission succeeded). No error detail is retrievable with EXPO_TOKEN alone; suspect the EAS-stored ASC API key or a transient EAS↔Apple failure. Stop after ~3 attempts and hand to the owner (check the key under ASC → Users and Access → Integrations, or retry later).
- **Caveat:** eas submit only uploads the binary. Attaching it to a version and clicking "Submit for Review" happens in appstoreconnect.apple.com by the owner (ascAppId 6790907772).
