---
name: EAS iOS build & submit flow
description: How to build and submit the Bolo! iOS binary from this repl (EXPO_TOKEN, polling, ASC caveat)
---

- `EXPO_TOKEN` secret authenticates eas-cli non-interactively (`pnpm exec eas whoami`); eas-cli is a devDependency of bolo-mobile.
- Production env vars (`EXPO_PUBLIC_DOMAIN`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` pk_live) live in EAS `production` environment — check with `eas env:list --environment production`.
- `eas build -p ios -e production --non-interactive --no-wait` auto-bumps `expo.ios.buildNumber` in app.json (appVersionSource local) — commit the bump.
- Don't `--wait` in ShellExec (5-min cap); poll with `eas build:view <id>` and, for submissions, the GraphQL API: `POST https://api.expo.dev/graphql` query `submissions{byId(submissionId:"..."){status error{message}}}` (no CLI submit:list command exists). Submissions can sit IN_QUEUE ~45+ min during EAS partial outages.
- Signing + ASC API key are stored on EAS servers; `eas submit -p ios --id <buildId> --non-interactive --no-wait` uploads to App Store Connect/TestFlight.
- **Caveat:** eas submit only uploads the binary. Attaching it to a version and clicking "Submit for Review" happens in appstoreconnect.apple.com by the owner (ascAppId 6790907772).
