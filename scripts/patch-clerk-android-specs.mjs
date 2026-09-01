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

/**
 * SECOND PATCH, BUILD 27: stop a missing native module from WIPING THE CLIENT.
 *
 * The bug it fixes, seen by a real person trying to sign up on 2026-09-01:
 *
 *     No sign up was found with id sua_3IhsKmW5mxqagxLyIrWEGrWZ7Na
 *
 * The chain, all inside dist/provider/nativeClientSync.js:
 *
 *   1. NativeClientSync installs its handleUnauthenticated monkey patch
 *      whenever isNative(), regardless of its own `enabled` prop. Excluding
 *      the native module does not stop it being installed.
 *   2. Any 401 runs that patch. During SIGN-UP the learner is unauthenticated
 *      by definition, and they have to leave the app to fetch the emailed code
 *      and come back, which is exactly when a token refresh can 401.
 *   3. It calls readNativeDeviceToken(), which returns null because the module
 *      is excluded on both platforms here.
 *   4. syncDeviceTokenToCache(cache, null) then runs
 *
 *          await tokenCache?.clearToken?.(CLERK_CLIENT_JWT_KEY)
 *
 *      CLEARING the client JWT.
 *   5. The next GET /v1/client has no client JWT, so Clerk issues a BRAND NEW
 *      EMPTY client, and an empty client has no sign-up attempt on it. The
 *      attempt the learner is halfway through is simply gone.
 *
 * CLAUDE.md carried this as a latent hazard, unproven, one data point from the
 * Play pre-launch crawler. This is the second data point and a much better one:
 * a real device, a real person, and a sign-up they could not finish.
 *
 * THE FIX IS ONE WORD OF SEMANTICS. A null device token means "the native side
 * has nothing to say", which is permanently true when the module is excluded.
 * It does NOT mean "there is no token". Clearing on null is only correct while
 * the native side is the source of truth, and here there is no native side at
 * all, so the JS client's own token is the only truth there is. Leave it alone.
 *
 * Deliberately NOT disabling the monkey patch itself: it still forwards to
 * Clerk's own handleUnauthenticated, which is the behaviour a JS-only client
 * should have. Only the destructive branch goes.
 *
 * REVERT THIS WITH THE AUTOLINKING EXCLUSIONS, NEVER ON ITS OWN. Clearing the
 * JWT on a null device token is CORRECT native-sign-out propagation the moment
 * a native module exists to produce that null deliberately. This patch is only
 * right while `expo.autolinking.{apple,android}.exclude` carries @clerk/expo,
 * so the day Clerk fixes the two-client bug upstream, both go together.
 *
 * IT IS A STRING MATCH AND IT FAILS SILENTLY. A @clerk/expo bump that
 * reformats the line makes this match nothing, report nothing, and leave the
 * app unpatched, which is indistinguishable from never having written it.
 * __tests__/clerk-patch.test.ts is the pin: it asserts the destructive line is
 * gone, the marker is present, the save half survives, and the exclusions that
 * justify all of it are still in package.json. Both risks were named by a peer
 * session reviewing this on 2026-09-01.
 */
function patchDeviceTokenClear(path) {
  let src;
  try {
    src = readFileSync(path, 'utf8');
  } catch {
    return false;
  }
  const CLEAR = 'await tokenCache?.clearToken?.(src_constants.CLERK_CLIENT_JWT_KEY);';
  if (!src.includes(CLEAR)) return false;
  writeFileSync(
    path,
    src.replace(
      CLEAR,
      '/* patched by scripts/patch-clerk-android-specs.mjs (build 27): a null\n' +
        '\t   device token means the native module is absent, not that the client\n' +
        '\t   has no token. Clearing here wiped an in-flight sign-up attempt. */\n' +
        '\treturn;',
    ),
  );
  return true;
}

let patched = 0;
let cleared = 0;
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
  if (patchDeviceTokenClear(join(pkg, 'dist/provider/nativeClientSync.js'))) {
    cleared += 1;
  }
}

if (patched > 0) {
  console.log(
    `patch-clerk-android-specs: made ${patched} Android spec(s) fail soft instead of throwing`,
  );
}
if (cleared > 0) {
  console.log(
    `patch-clerk-android-specs: stopped ${cleared} copy(s) wiping the client JWT when the native module is absent`,
  );
}
