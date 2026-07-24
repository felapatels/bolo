/**
 * Regression tests for useVoiceRecorder stream-ownership race condition.
 *
 * The race: stopRecording's onstop fires a background getUserMedia prewarm;
 * if startRecording begins before that promise resolves, it claims streamRef,
 * then the stale prewarm overwrites streamRef — and the next releaseStream
 * stops the wrong stream, leaving the active recorder's tracks live (mic leak).
 *
 * The fix: always stop recorder.stream tracks directly on stop (not streamRef),
 * and guard the prewarm with a generation counter so stale promises discard
 * their own stream instead of overwriting a live one.
 */
import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVoiceRecorder } from "@workspace/integrations-openai-ai-react";

// ---------------------------------------------------------------------------
// Fake track — tracks stop() calls and readyState
// ---------------------------------------------------------------------------
function makeFakeTrack(id = "t"): {
  id: string;
  readyState: "live" | "ended";
  stop: ReturnType<typeof vi.fn>;
} {
  const t = { id, readyState: "live" as "live" | "ended", stop: vi.fn() };
  t.stop.mockImplementation(() => {
    t.readyState = "ended";
  });
  return t;
}

type FakeTrack = ReturnType<typeof makeFakeTrack>;

function makeFakeStream(id = "stream"): { stream: MediaStream; tracks: FakeTrack[] } {
  const tracks = [makeFakeTrack(`${id}-track`)];
  const stream = {
    getTracks: () => tracks,
    getAudioTracks: () => tracks,
  } as unknown as MediaStream;
  return { stream, tracks };
}

// ---------------------------------------------------------------------------
// Class-based MediaRecorder mock (vi.fn() cannot be used as a constructor)
// ---------------------------------------------------------------------------
// The most-recently-constructed recorder instance is stored here so tests can
// trigger onstart/onstop callbacks.
let lastRecorder: MockMediaRecorder | null = null;

class MockMediaRecorder {
  stream: MediaStream;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: null | ((e: { data: Blob }) => void) = null;
  onstart: null | (() => void) = null;
  onerror: null | (() => void) = null;
  onstop: null | (() => void) = null;

  constructor(stream: MediaStream) {
    this.stream = stream;
    lastRecorder = this;
  }

  start() {
    this.state = "recording";
    // Fire onstart asynchronously (matches real MediaRecorder behaviour).
    Promise.resolve().then(() => this.onstart?.());
  }

  stop() {
    this.state = "inactive";
    Promise.resolve().then(() => this.onstop?.());
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
let getUserMediaMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  lastRecorder = null;
  getUserMediaMock = vi.fn();

  Object.defineProperty(global.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: getUserMediaMock },
  });

  (global as Record<string, unknown>).MediaRecorder = MockMediaRecorder;
  (MockMediaRecorder as unknown as { isTypeSupported: (t: string) => boolean })
    .isTypeSupported = () => false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function doRecordCycle(
  result: { current: ReturnType<typeof useVoiceRecorder> },
): Promise<Blob> {
  await act(async () => {
    await result.current.startRecording();
  });
  let blob!: Blob;
  await act(async () => {
    blob = await result.current.stopRecording();
  });
  return blob;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("useVoiceRecorder – stream ownership on rapid stop/start cycles", () => {
  test("stop resolves a valid Blob for each recording in a consecutive pair", async () => {
    const { stream: s1 } = makeFakeStream("s1");
    const { stream: s2 } = makeFakeStream("s2");
    const { stream: s3 } = makeFakeStream("prewarm1");
    // call order: startRecording→s1, prewarm after stop→s2, startRecording→s3(or prewarm)
    getUserMediaMock
      .mockResolvedValueOnce(s1)
      .mockResolvedValueOnce(s2)
      .mockResolvedValueOnce(s3);

    const { result } = renderHook(() => useVoiceRecorder());

    const blob1 = await doRecordCycle(result);
    const blob2 = await doRecordCycle(result);

    expect(blob1).toBeInstanceOf(Blob);
    expect(blob2).toBeInstanceOf(Blob);
  });

  test("recorder's own stream tracks are stopped on stop, not a stale streamRef", async () => {
    // s1 used for recording; s2 is the prewarm that arrives after stop.
    const { stream: s1, tracks: tracks1 } = makeFakeStream("s1");
    const { stream: s2 } = makeFakeStream("prewarm");
    getUserMediaMock
      .mockResolvedValueOnce(s1)   // startRecording fallback (prepare not called)
      .mockResolvedValueOnce(s2);  // prewarm after stop

    const { result } = renderHook(() => useVoiceRecorder());

    await doRecordCycle(result);

    // s1's track must be stopped (it was recorder.stream at onstop time).
    expect(tracks1[0].stop).toHaveBeenCalled();
    expect(tracks1[0].readyState).toBe("ended");
  });

  test("stale prewarm stream is discarded when second recording starts first", async () => {
    // prewarmStream resolves *after* the second startRecording has already
    // acquired lateStream — so the stale prewarm must discard its own tracks.
    let resolvePrewarm!: (s: MediaStream) => void;
    const { stream: earlyStream } = makeFakeStream("early");
    const { stream: prewarmStream, tracks: prewarmTracks } = makeFakeStream("prewarm");
    const { stream: lateStream } = makeFakeStream("late");

    let callIndex = 0;
    getUserMediaMock.mockImplementation(async () => {
      callIndex++;
      if (callIndex === 1) return earlyStream;
      if (callIndex === 2) {
        // The prewarm that fires after the first stop — resolve it late.
        return new Promise<MediaStream>((res) => {
          resolvePrewarm = () => res(prewarmStream);
        });
      }
      return lateStream;
    });

    const { result } = renderHook(() => useVoiceRecorder());

    // First record cycle.
    await doRecordCycle(result);

    // Second cycle starts before the prewarm resolves.
    const secondCyclePromise = doRecordCycle(result);

    // Resolve the stale prewarm.
    await act(async () => {
      resolvePrewarm();
      // Let microtasks settle so the prewarm .then() fires.
      await Promise.resolve();
    });

    await secondCyclePromise;

    // The stale prewarm stream's tracks must be stopped (discarded, not used).
    expect(prewarmTracks[0].stop).toHaveBeenCalled();
  });

  test("abortRecording stops the recorder stream and leaves no live tracks", async () => {
    const { stream, tracks } = makeFakeStream("abort");
    getUserMediaMock.mockResolvedValueOnce(stream);

    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      result.current.abortRecording();
    });

    expect(tracks[0].stop).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });
});
