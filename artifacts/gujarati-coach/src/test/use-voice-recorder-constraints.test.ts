/**
 * Guards the explicit microphone processing settings used for speech capture.
 *
 * The defect this pins: `getUserMedia({ audio: true })` lets the browser pick,
 * and browsers enable noise suppression and automatic gain control by default.
 * Both damage pronunciation scoring — suppression smears aspiration and
 * fricatives, AGC lifts the room tone the server profiles from the silent
 * opening of each hold-to-talk clip. Echo cancellation stays ON so the coach's
 * voice through the speakers is subtracted during barge-in.
 *
 * Every acquisition path must carry the same constraints, or the processing a
 * clip was recorded with would depend on which path happened to open the mic:
 * the pre-warm, the lazy fallback inside startRecording, and the background
 * re-warm fired after each stop.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useVoiceRecorder,
  SPEECH_AUDIO_CONSTRAINTS,
} from "@workspace/integrations-openai-ai-react";

function makeFakeStream(id = "stream"): MediaStream {
  const tracks = [
    { id: `${id}-track`, readyState: "live" as const, stop: vi.fn() },
  ];
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks,
  } as unknown as MediaStream;
}

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
  }

  start() {
    this.state = "recording";
    Promise.resolve().then(() => this.onstart?.());
  }

  stop() {
    this.state = "inactive";
    Promise.resolve().then(() => this.onstop?.());
  }
}

let getUserMediaMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getUserMediaMock = vi.fn(async () => makeFakeStream());
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

describe("useVoiceRecorder – microphone processing settings", () => {
  test("browser noise suppression and gain control are off, echo cancellation on", () => {
    // Pinned as values, not as a reference to the exported object, so a
    // silent flip of any one flag fails here rather than passing trivially.
    expect(SPEECH_AUDIO_CONSTRAINTS).toEqual({
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });

  test("prepare() pre-warms the mic with the explicit constraints", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.prepare();
    });

    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: SPEECH_AUDIO_CONSTRAINTS,
    });
  });

  test("startRecording's lazy acquisition uses the same constraints", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    // No prepare() first: startRecording must open the mic itself.
    await act(async () => {
      await result.current.startRecording();
    });

    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: SPEECH_AUDIO_CONSTRAINTS,
    });
  });

  test("the background re-warm after a stop uses the same constraints", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.startRecording();
    });
    await act(async () => {
      await result.current.stopRecording();
    });

    // Call 1 = lazy acquisition, call 2 = the post-stop re-warm.
    expect(getUserMediaMock).toHaveBeenCalledTimes(2);
    for (const call of getUserMediaMock.mock.calls) {
      expect(call[0]).toEqual({ audio: SPEECH_AUDIO_CONSTRAINTS });
    }
  });

  test("no acquisition path falls back to the browser's own defaults", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.prepare();
    });
    await act(async () => {
      await result.current.startRecording();
    });
    await act(async () => {
      await result.current.stopRecording();
    });

    expect(getUserMediaMock.mock.calls.length).toBeGreaterThan(0);
    for (const call of getUserMediaMock.mock.calls) {
      expect(call[0]).not.toEqual({ audio: true });
    }
  });
});
