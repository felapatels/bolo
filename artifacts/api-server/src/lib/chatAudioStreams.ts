import { randomBytes } from "node:crypto";

// In-memory registry of per-turn chat audio streams.
//
// Mobile clients can't play partial MP3s delivered as SSE `audioChunk` events
// (React Native / Hermes has no MediaSource), but the native players behind
// expo-audio (AVPlayer on iOS, ExoPlayer on Android) DO handle progressive
// HTTP audio natively. So the chat route can register a short-lived stream
// here, tee the ElevenLabs TTS chunks into it, and let the mobile player
// consume it via GET /openai/chat/audio/:streamId as a chunked audio/mpeg
// response — playback starts as soon as the first chunks land, before
// synthesis finishes.
//
// Streams are strictly single-turn and short-lived: they are created when a
// chat turn opts in (X-Audio-Stream: url), served to any number of GETs while
// alive (iOS's AVPlayer fetches the same URL more than once), and swept after
// a TTL so an abandoned stream never leaks memory. This registry
// is process-local by design — the GET always lands on the same process that
// ran the POST because the audio URL is minted by that very response.

export type ChatAudioStream = {
  id: string;
  /** Owner — the GET endpoint refuses to serve any other user. */
  userId: string;
  chunks: Buffer[];
  /** True once the full clip streamed successfully (server-side audioDone). */
  done: boolean;
  /**
   * True when the turn ended without a complete stream (ElevenLabs failed
   * mid-stream and the buffered fallback took over, or the turn errored).
   * The GET endpoint destroys its socket so the native player surfaces an
   * error instead of treating a truncated clip as finished.
   */
  failed: boolean;
  createdAt: number;
  waiters: Set<() => void>;
};

const streams = new Map<string, ChatAudioStream>();

// Generous enough for the slowest realistic turn (LLM + full TTS), short
// enough that abandoned streams don't accumulate.
const STREAM_TTL_MS = 2 * 60_000;

function sweep(): void {
  const now = Date.now();
  for (const [id, s] of streams) {
    if (now - s.createdAt > STREAM_TTL_MS) {
      // Wake any hung reader so its loop can observe the deletion and exit.
      s.failed = true;
      notify(s);
      streams.delete(id);
    }
  }
}

function notify(s: ChatAudioStream): void {
  for (const w of s.waiters) w();
  s.waiters.clear();
}

export function createChatAudioStream(userId: string): ChatAudioStream {
  sweep();
  const s: ChatAudioStream = {
    id: randomBytes(16).toString("hex"),
    userId,
    chunks: [],
    done: false,
    failed: false,
    createdAt: Date.now(),
    waiters: new Set(),
  };
  streams.set(s.id, s);
  return s;
}

export function getChatAudioStream(id: string): ChatAudioStream | undefined {
  sweep();
  return streams.get(id);
}

export function appendChatAudioChunk(s: ChatAudioStream, chunk: Buffer): void {
  if (s.done || s.failed) return;
  s.chunks.push(chunk);
  notify(s);
}

/** Mark the stream complete — every chunk of the clip has been appended. */
export function completeChatAudioStream(s: ChatAudioStream): void {
  if (s.failed) return;
  s.done = true;
  notify(s);
}

/**
 * Mark the stream failed (no-op if it already completed). Safe to call
 * unconditionally at the end of a turn: a turn whose streaming TTS fell back
 * to buffered synthesis never fires audioDone, and its reader must be told
 * to bail out rather than wait for chunks that will never come.
 */
export function failChatAudioStream(s: ChatAudioStream): void {
  if (s.done) return;
  s.failed = true;
  notify(s);
}

export function releaseChatAudioStream(id: string): void {
  streams.delete(id);
}

/** Resolves the next time the stream gains a chunk or changes state. */
export function waitForChatAudioChange(s: ChatAudioStream): Promise<void> {
  if (s.done || s.failed) return Promise.resolve();
  return new Promise((resolve) => s.waiters.add(resolve));
}
