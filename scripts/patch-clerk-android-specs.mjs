// Makes @clerk/expo's Android module specs fail soft, the way every other
// platform's already do.
//
// WHY THIS EXISTS, and why it is a script rather than `pnpm patch`.
//
// The bug. @clerk/expo runs a JS Clerk client and, since v3.0.0, an embedded
// native one, kept agreed by useNativeClientBootstrap / useNativeClientEventSync.
// On Android that pair races: two concurrent GETs to /v1/client one millisecond
// apart, two token writes, and the session gone 119 ms later. Reproduced
// deterministically on builds 422 and 423 at 43033 ms and 43747 ms, unmoved by
// @clerk/expo 3.7.4 -> 3.7.8.
//
// The workaround. Excluding the native module from autolinking makes
// dist/utils/native-module.js return null and every sync path no-op. That is
// how this app's iOS build has run since 2026-07-14 and why iOS never showed
// the bug. Android could not do the same because of one word:
//
//     NativeClerkModule.js          requireOptionalNativeModule   -> null
//     NativeClerkModule.android.js  requireNativeModule           -> THROWS
//
// and native-module.js wraps only the property access, not the require above
// it, so the throw escapes and build 424 died at launch with
// "Cannot find native module 'ClerkExpo'".
//
// Why not `pnpm patch`. It writes patchedDependencies into pnpm-workspace.yaml
// on pnpm 11, which is what runs here, and into package.json on pnpm 10, which
// is what the EAS builder runs. pnpm 11 refuses to read the old location
// outright ("The pnpm field in package.json is no longer read by pnpm"), so
// there is no single config that satisfies both, and build 425 died on
// ERR_PNPM_LOCKFILE_CONFIG_MISMATCH. A postinstall script does not care which
// pnpm is running.
//
// Safety. Returning null where the code currently throws cannot make any caller
// worse off, and it is what the surrounding code already expects: Clerk's own
// ClerkGoogleOneTapSignIn.js null-checks its import and raises a friendly
// "native module is not available" error, which can only run if the require
// returns null. Idempotent, and silent when there is nothing to do.
//
// Remove this the day Clerk ships the fix upstream.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'node_modules', '.pnpm');

const TARGETS = [
  'dist/specs/NativeClerkModule.android.js',
  'dist/specs/NativeClerkGoogleSignIn.android.js',
];

function patchFile(path) {
  let src;
  try {
    src = readFileSync(path, 'utf8');
  } catch {
    return false;
  }
  if (!src.includes('expo.requireNativeModule')) return false;
  writeFileSync(
    path,
    src.replace(/expo\.requireNativeModule/g, 'expo.requireOptionalNativeModule'),
  );
  return true;
}

let patched = 0;
let dirs = [];
try {
  dirs = readdirSync(STORE).filter((d) => d.startsWith('@clerk+expo@'));
} catch {
  // No pnpm store yet (fresh clone before install). Nothing to do.
}
for (const dir of dirs) {
  const pkg = join(STORE, dir, 'node_modules', '@clerk', 'expo');
  try {
    statSync(pkg);
  } catch {
    continue;
  }
  for (const target of TARGETS) {
    if (patchFile(join(pkg, target))) patched += 1;
  }
}

if (patched > 0) {
  console.log(
    `patch-clerk-android-specs: made ${patched} Android spec(s) fail soft instead of throwing`,
  );
}
