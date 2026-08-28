/**
 * CANONICAL PCM WAV DECODING, and nothing else.
 *
 * Split out of audioNoise.ts on 2026-08-28. It lived there happily until
 * pronunciationCompare.ts needed the same decode, and importing audioNoise
 * dragged in `convertToWav` from the OpenAI integrations package, which builds
 * an API client at module load and THROWS WITHOUT AN API KEY. So reading the
 * bytes of a WAV file required credentials for a service it never calls.
 *
 * This module imports nothing. That is the point: decoding a container format
 * is not an AI operation and must not be gated behind one. It also means the
 * comparison engine is testable on a laptop with no secrets at all.
 */
export interface PcmView {
  samples: Int16Array;
  sampleRate: number;
}

/**
 * Reads canonical PCM WAV bytes (as produced by convertToWav: 16 kHz mono
 * s16le) into sample values. Walks the RIFF chunk list rather than assuming a
 * 44-byte header, and takes channel 0 when a file is multi-channel.
 *
 * Returns null for anything that is not 16-bit PCM WAV.
 *
 * EXPORTED 2026-08-28 for pronunciationCompare.ts, which needs the same decode
 * to line a learner's attempt up against a native reference clip. One decoder,
 * not two.
 */
export function readPcm16(buffer: Buffer): PcmView | null {
  if (buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataLength = 0;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (chunkId === "fmt " && body + 16 <= buffer.length) {
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (chunkId === "data") {
      dataStart = body;
      // A streamed WAV can declare a bogus size; trust the real byte count.
      dataLength = Math.min(chunkSize, Math.max(0, buffer.length - body));
      break;
    }
    offset = body + chunkSize + (chunkSize % 2);
  }

  if (dataStart < 0 || sampleRate <= 0 || channels <= 0) return null;
  if (bitsPerSample !== 16) return null;

  const frameBytes = 2 * channels;
  const frameCount = Math.floor(dataLength / frameBytes);
  if (frameCount <= 0) return null;

  const samples = new Int16Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    // Channel 0 only: convertToWav emits mono, and for anything else one
    // channel is a faithful enough sample of the room.
    samples[i] = buffer.readInt16LE(dataStart + i * frameBytes);
  }
  return { samples, sampleRate };
}
