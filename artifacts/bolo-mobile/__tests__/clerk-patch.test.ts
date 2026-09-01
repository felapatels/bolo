import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * THE CLERK PATCHES ARE A STRING MATCH. THIS IS WHAT NOTICES WHEN THEY STOP.
 *
 * scripts/patch-clerk-android-specs.mjs rewrites two things inside
 * @clerk/expo on every install, and both are load-bearing:
 *
 *   1. the Android module specs, so an excluded native module returns null
 *      instead of throwing at launch (build 424 died on that);
 *   2. syncDeviceTokenToCache, so a NULL device token stops wiping the cached
 *      client JWT. Excluding the native module makes that token permanently
 *      null, and wiping the JWT hands the next /v1/client a brand new empty
 *      client with no sign-up attempt on it.
 *
 * Both are `src.replace(...)` against exact strings in a compiled bundle. A
 * @clerk/expo bump that reformats either line makes the script quietly match
 * nothing, report nothing, and leave the app unpatched — which is the same
 * failure mode as never having written it. It is currently pinned at ^3.7.8,
 * so the first minor bump is the moment this matters.
 *
 * Reviewed by a peer session on 2026-09-01, whose words are worth keeping:
 * "it silently stops applying on any @clerk/expo bump past 3.7.8 (string
 * match, no test pins it)". This is the pin.
 *
 * WHEN CLERK FIXES THE TWO-CLIENT BUG UPSTREAM, DELETE BOTH PATCHES AND THIS
 * TEST TOGETHER WITH THE AUTOLINKING EXCLUSIONS, NOT SEPARATELY. Clearing the
 * JWT on a null device token is CORRECT native-sign-out propagation once a
 * native module is present to produce that null deliberately. The patch is
 * only right while `expo.autolinking.{apple,android}.exclude` carries
 * @clerk/expo in artifacts/bolo-mobile/package.json, which the first test
 * below asserts, so the two can never drift apart unnoticed.
 */

const clerkExpoDir = dirname(require.resolve('@clerk/expo/package.json'));
const read = (rel: string) => readFileSync(join(clerkExpoDir, rel), 'utf8');

describe('the @clerk/expo patches are still applied', () => {
  test('the autolinking exclusions that make the patches correct are still there', () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
    );
    const exclude = pkg.expo?.autolinking ?? {};
    expect(exclude.apple?.exclude).toContain('@clerk/expo');
    expect(exclude.android?.exclude).toContain('@clerk/expo');
  });

  test('a null device token no longer clears the cached client JWT', () => {
    const src = read('dist/provider/nativeClientSync.js');
    // The destructive line the patch removes. Its return means an in-flight
    // sign-up survives a 401 instead of losing its attempt to a fresh client.
    expect(src).not.toContain(
      'await tokenCache?.clearToken?.(src_constants.CLERK_CLIENT_JWT_KEY);',
    );
    // And the patch's own marker, so this fails loudly if the shape of the
    // file changed rather than passing because the string merely moved.
    expect(src).toContain('patched by scripts/patch-clerk-android-specs.mjs');
    // The half that must NOT be lost: a real token is still saved.
    expect(src).toContain(
      'await tokenCache?.saveToken(src_constants.CLERK_CLIENT_JWT_KEY, deviceToken);',
    );
  });

  test('the Android specs fail soft instead of throwing at launch', () => {
    for (const spec of [
      'dist/specs/NativeClerkModule.android.js',
      'dist/specs/NativeClerkGoogleSignIn.android.js',
    ]) {
      const src = read(spec);
      expect(src).not.toContain('expo.requireNativeModule');
      expect(src).toContain('expo.requireOptionalNativeModule');
    }
  });
});
