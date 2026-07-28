---
name: Sentry Expo plugin needs @sentry/cli as a direct dep under pnpm
description: EAS iOS build fails at "Upload Debug Symbols to Sentry" phase in this pnpm monorepo unless @sentry/cli is a direct devDependency of the mobile package.
---

The @sentry/react-native Expo plugin's Xcode phase "Upload Debug Symbols to Sentry" runs `node -e require.resolve('@sentry/cli/package.json')` from `ios/`. Under pnpm, @sentry/cli is nested in the virtual store beneath @sentry/react-native and is NOT resolvable from the app package, so the phase dies with MODULE_NOT_FOUND and fastlane reports only "unknown error".

**Why:** pnpm's strict node_modules layout; first hit on the first production iOS build after adding the Sentry plugin (July 2026, build 24 errored; build 25 succeeded after the fix).

**How to apply:** keep `@sentry/cli` (version matching @sentry/react-native's dependency, e.g. 2.55.0) as a direct devDependency of the mobile package. Diagnose EAS "unknown fastlane error" by fetching `artifacts.xcodeBuildLogsUrl` from `eas build:view <id> --json` with `curl --compressed` (signed URLs expire in ~15 min; without --compressed you get undecoded bytes) and grepping for `PhaseScriptExecution ... nonzero exit`.
