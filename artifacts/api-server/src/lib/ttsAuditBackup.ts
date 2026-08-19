/**
 * Backup of cached phrase takes the audit is about to overwrite.
 *
 * An overwrite is the one irreversible thing the sweep does: the row holds the
 * audio inline, so replacing it destroys the previous take, and a production
 * database is not covered by workspace checkpoints. If the judge is wrong about
 * a language, a full sweep would rewrite that language's whole library with
 * nothing to compare against afterwards.
 *
 * So every replaced take is copied to R2 first, alongside a sidecar recording
 * why it was judged bad. The copy is a precondition, not a courtesy: when the
 * upload fails the caller must keep the old row rather than overwrite blind
 * (WARN-swallowed storage tees have failed 100% silently here before).
 */
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client } from "./r2Client";

export type ReplacedTakeBackup = {
  phraseId: number;
  languageCode: string;
  cacheKey: string;
  audio: Buffer;
  format: "mp3" | "wav";
  nativeScript: string;
  /** The verdict that condemned the take, so a restore decision has the evidence. */
  verdict: { status: string; heard: string; coverage: number | null };
  /** ISO timestamp; passed in so callers can group a run's backups. */
  runAt: string;
};

/** Where a replaced take lands, so a restore can find it from the report alone. */
export function replacedTakeKey(b: Pick<ReplacedTakeBackup, "languageCode" | "phraseId">, runAt: string): string {
  const stamp = runAt.replace(/[:.]/g, "-");
  return `tts-audit-replaced/${b.languageCode}/${b.phraseId}-${stamp}`;
}

export type BackupFn = (backup: ReplacedTakeBackup) => Promise<string>;

/**
 * Copy a condemned take to R2 and return its object key.
 *
 * Throws when R2 is not configured or the upload fails, the audit treats that
 * as "cannot safely replace this clip" and leaves the cache row alone.
 */
export async function backupReplacedTake(backup: ReplacedTakeBackup): Promise<string> {
  const r2 = getR2Client();
  if (!r2) throw new Error("R2 is not configured, refusing to overwrite a take with no backup");

  const bucket = process.env.R2_BUCKET_NAME!;
  const base = replacedTakeKey(backup, backup.runAt);
  const audioKey = `${base}.${backup.format}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: audioKey,
      Body: backup.audio,
      ContentType: backup.format === "wav" ? "audio/wav" : "audio/mpeg",
    }),
  );
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${base}.json`,
      Body: Buffer.from(
        JSON.stringify(
          {
            phraseId: backup.phraseId,
            languageCode: backup.languageCode,
            nativeScript: backup.nativeScript,
            cacheKey: backup.cacheKey,
            audioKey,
            verdict: backup.verdict,
            replacedAt: backup.runAt,
          },
          null,
          2,
        ),
        "utf-8",
      ),
      ContentType: "application/json",
    }),
  );

  return audioKey;
}
