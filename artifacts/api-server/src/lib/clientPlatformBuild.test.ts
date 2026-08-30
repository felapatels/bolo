/**
 * THE BUILD TAG, tested in its own file for a reason worth recording:
 * attemptNoiseFields.test.ts imports something that reaches @workspace/db, so
 * it needs DATABASE_URL and cannot run on a Mac. This one imports nothing but
 * the pure parser, so it runs anywhere, like presence and errorPulse do.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildFromUserAgent, BUILD_FLAG_PREFIX } from "./clientPlatform";

describe("buildFromUserAgent", () => {
  // app.json sets expo.name "Bolo!" and ios.buildNumber "528", and NSURLSession
  // builds its agent as "<CFBundleName>/<CFBundleVersion> CFNetwork/... Darwin/...".
  test("reads the build off a real iOS agent", () => {
    assert.equal(buildFromUserAgent("Bolo!/528 CFNetwork/1568.100.1 Darwin/24.1.0"), "528");
  });

  // THE ONE A LOOSER MATCH WOULD GET WRONG. CFNetwork and Darwin are themselves
  // name/number tokens, so anchoring on the FIRST token is load bearing.
  test("never reports the networking stack's version as the app's", () => {
    assert.equal(buildFromUserAgent("CFNetwork/1568.100.1 Darwin/24.1.0"), null);
    assert.equal(buildFromUserAgent("Darwin/24.1.0 CFNetwork/1568.100.1"), null);
  });

  // OkHttp carries nothing about the app. No parsing recovers what was never
  // sent, and pretending otherwise would invent a number.
  test("android is null, not a guess", () => {
    assert.equal(buildFromUserAgent("okhttp/4.12.0"), null);
  });

  test("a browser is null", () => {
    assert.equal(
      buildFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
      ),
      null,
    );
  });

  test("nothing to read is null rather than a throw", () => {
    assert.equal(buildFromUserAgent(undefined), null);
    assert.equal(buildFromUserAgent(null), null);
    assert.equal(buildFromUserAgent(""), null);
    assert.equal(buildFromUserAgent("   "), null);
  });

  // A dotted version is not a build number. Reporting "1" from "1.0.6" would be
  // worse than reporting nothing, because it would look like a real answer.
  test("a dotted version is refused rather than truncated", () => {
    assert.equal(buildFromUserAgent("Bolo!/1.0.6 CFNetwork/1568.100.1"), null);
  });

  test("an absurd number is refused, so junk cannot land in the column", () => {
    assert.equal(buildFromUserAgent("Bolo!/12345678901234 CFNetwork/1568.100.1"), null);
  });

  test("the tag prefix is what the reader will look for", () => {
    assert.equal(BUILD_FLAG_PREFIX, "build:");
  });
});
