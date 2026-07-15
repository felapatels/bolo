// Server-side audio duration measurement — used to record how much of the
// weekly Bolo Parrot chat-time cap a turn actually consumes, rather than
// trusting a client-supplied duration.

// Parses a canonical PCM WAV buffer (as produced by
// integrations-openai-ai-server's convertToWav/ensureCompatibleFormat) and
// returns its duration in seconds. Walks the RIFF chunk list rather than
// assuming a fixed 44-byte header, since some encoders insert extra chunks
// (e.g. "LIST") before "data".
export function wavDurationSeconds(buffer: Buffer): number {
  if (buffer.length < 44) return 0;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return 0;

  const byteRate = buffer.readUInt32LE(28);
  if (byteRate <= 0) return 0;

  let offset = 12; // skip "RIFF" size "WAVE"
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      return chunkSize / byteRate;
    }
    // Chunks are padded to even byte boundaries.
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return 0;
}
