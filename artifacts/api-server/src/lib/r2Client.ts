/**
 * r2Client.ts
 * Returns an S3Client pointed at the project's Cloudflare R2 bucket, or null
 * when any required credential is absent.  The null guard makes every feature
 * that depends on this module completely inert in dev/CI environments where the
 * four R2 secrets have not been set.
 *
 * The client is constructed once and cached after the first successful call.
 * Build-32 voice-contribution storage work should import getR2Client() from
 * this module so that credential management stays in one place.
 */

import { S3Client } from "@aws-sdk/client-s3";

let _client: S3Client | undefined;

/**
 * Returns a configured S3Client for Cloudflare R2, or null when any of the
 * four required environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME) is absent or empty.
 *
 * The client is lazily constructed and cached, subsequent calls return the
 * same instance.  Do NOT cache a null return: re-evaluate on every call so
 * that credentials injected after startup (e.g. in test setup) are picked up.
 */
export function getR2Client(): S3Client | null {
  if (_client) return _client;

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    return null;
  }

  _client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    // Cloudflare R2 rejects the AWS SDK's automatic CRC32 trailing checksum
    // on binary bodies with InvalidArgument (400). WHEN_REQUIRED restricts
    // checksum injection to operations that mandate it, which PutObject does
    // not, without this, every real-sized clip upload fails while small
    // string-body probes pass.
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  return _client;
}

/**
 * Reset the cached client.  Intended for use in tests that need to swap
 * credentials between test cases.  Do not call in production code.
 * @internal
 */
export function _resetR2ClientForTest(): void {
  _client = undefined;
}
