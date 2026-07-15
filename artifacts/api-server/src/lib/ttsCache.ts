import { createHash } from "node:crypto";

/** Stable cache key: SHA-256 hex of the three synthesis inputs. */
export function ttsCacheKey(
  text: string,
  voice: string,
  languageName?: string,
): string {
  return createHash("sha256")
    .update(text)
    .update("\x00")
    .update(voice)
    .update("\x00")
    .update(languageName?.trim() ?? "")
    .digest("hex");
}
