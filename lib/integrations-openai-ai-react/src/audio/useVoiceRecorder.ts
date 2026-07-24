/**
 * React hook for voice recording using MediaRecorder API.
 * Negotiates a supported MIME type across browsers (Chrome, Firefox, Safari).
 * Optionally auto-stops after a period of silence once the user has spoken.
 */
import { useRef, useCallback, useState, useEffect } from "react";

export type RecordingState = "idle" | "recording" | "stopped";

export interface StartRecordingOptions {
  /** Called once when trailing silence is detected after the user has spoken. */
  onSilence?: () => void;
  /** How long silence must persist (ms) before auto-stopping. Default 1500. */
  silenceDurationMs?: number;
  /** RMS level (0-1) below which audio is considered silence. Default 0.015. */
  silenceThreshold?: number;
  /** Minimum time (ms) of speech required before auto-stop can arm. Default 300. */
  minSpeechMs?: number;
}

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];

function getSupportedMimeType(): string | undefined {
  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return undefined;
}

export function useVoiceRecorder() {
  const [state, setState] = useState<RecordingState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string | undefined>(undefined);

  // Pre-warmed microphone stream, so startRecording doesn't have to wait on
  // permission prompts / device acquisition at click time (which clips the
  // first syllables of speech).
  const streamRef = useRef<MediaStream | null>(null);

  // Cancellation token for background prewarm getUserMedia calls.
  // Incremented whenever we abort or start a new prewarm, so a stale
  // resolution that races with a newer recording or an unmount can detect it
  // is no longer the owner and immediately stops the orphaned tracks.
  const prewarmTokenRef = useRef(0);

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const isStreamLive = (stream: MediaStream | null): stream is MediaStream =>
    !!stream && stream.getTracks().some((t) => t.readyState === "live");

  /**
   * Acquire the microphone ahead of time. Call this when the recording UI
   * mounts so that startRecording can begin capturing immediately.
   * Rejects if permission is denied — callers may ignore that and let
   * startRecording surface the error at click time.
   */
  const prepare = useCallback(async (): Promise<void> => {
    if (isStreamLive(streamRef.current)) return;
    releaseStream();
    streamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
  }, [releaseStream]);

  // Silence detection
  const audioContextRef = useRef<AudioContext | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onSilenceRef = useRef<(() => void) | null>(null);

  const cleanupSilenceDetection = useCallback(() => {
    if (pollTimerRef.current != null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    onSilenceRef.current = null;
  }, []);

  const startRecording = useCallback(
    async (options?: StartRecordingOptions): Promise<void> => {
      // Use the pre-warmed stream when available; fall back to acquiring one
      // now (e.g. if prepare() was never called or the device went away).
      let stream = streamRef.current;
      if (!isStreamLive(stream)) {
        // Cancel any in-flight prewarm promise before releasing streamRef so
        // the stale resolved value doesn't overwrite the stream we're about
        // to set below.
        prewarmTokenRef.current++;
        releaseStream();
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      }
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      // Only report "recording" once the recorder has actually started
      // capturing, so UIs don't show a recording indicator prematurely.
      await new Promise<void>((resolve, reject) => {
        recorder.onstart = () => resolve();
        recorder.onerror = () => reject(new Error("Recorder failed to start"));
        recorder.start(100);
      });
      setState("recording");

      // Optional: auto-stop when the user stops talking.
      if (options?.onSilence) {
        onSilenceRef.current = options.onSilence;
        const silenceDurationMs = options.silenceDurationMs ?? 1500;
        const threshold = options.silenceThreshold ?? 0.015;
        const minSpeechMs = options.minSpeechMs ?? 300;

        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          const audioContext = new AudioCtx();
          audioContextRef.current = audioContext;
          // The context is created after `await getUserMedia(...)`, i.e.
          // outside the click gesture's task — browsers may start it in the
          // "suspended" state, where the analyser reads permanent silence and
          // auto-stop can never arm. Resume explicitly before analysing.
          if (audioContext.state === "suspended") {
            await audioContext.resume();
          }
          if (audioContext.state !== "running") {
            throw new Error("AudioContext failed to start");
          }
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 2048;
          source.connect(analyser);
          const data = new Uint8Array(analyser.fftSize);

          const startedAt = performance.now();
          let hasSpoken = false;
          let silenceStart: number | null = null;

          const tick = () => {
            if (!audioContextRef.current) return;
            if (audioContextRef.current.state !== "running") return;
            analyser.getByteTimeDomainData(data);
            let sumSq = 0;
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128;
              sumSq += v * v;
            }
            const rms = Math.sqrt(sumSq / data.length);
            const now = performance.now();

            if (rms > threshold) {
              if (now - startedAt > minSpeechMs) hasSpoken = true;
              silenceStart = null;
            } else if (hasSpoken) {
              if (silenceStart == null) {
                silenceStart = now;
              } else if (now - silenceStart >= silenceDurationMs) {
                const cb = onSilenceRef.current;
                cleanupSilenceDetection();
                cb?.();
                return;
              }
            }
          };
          // A timer (not requestAnimationFrame) so detection keeps running
          // when the tab is throttled/backgrounded and rAF stops firing.
          pollTimerRef.current = setInterval(tick, 50);
        } catch {
          // If audio analysis is unavailable, fall back to manual stop.
          cleanupSilenceDetection();
        }
      }
    },
    [cleanupSilenceDetection],
  );

  const stopRecording = useCallback((): Promise<Blob> => {
    cleanupSilenceDetection();
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== "recording") {
        resolve(new Blob());
        return;
      }

      recorder.onstop = () => {
        const blobType = mimeTypeRef.current ?? recorder.mimeType ?? "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });

        // Stop the recorder's own stream tracks directly. Relying on
        // streamRef.current here would be a race: a concurrent prewarm promise
        // may have already overwritten streamRef with a *different* stream
        // between startRecording and this onstop callback, leaving the
        // recorder's actual stream tracks alive (mic leak). A fresh stream per
        // recording also eliminates iOS/Safari WebKit audio corruption when the
        // same MediaStream is reused across multiple MediaRecorder instances.
        recorder.stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        // Pre-warm a fresh stream for the next recording. Guard with a
        // cancellation token so a stale resolved promise cannot overwrite
        // streamRef if startRecording has already claimed it, or abortRecording
        // has unmounted.
        const myToken = ++prewarmTokenRef.current;
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((s) => {
            // Only adopt this prewarm stream if:
            //   1. No newer prewarm/abort has started (token still matches).
            //   2. No stream is already live — startRecording may have grabbed
            //      one between stopRecording and this resolution (rapid
            //      stop→start race), or abortRecording may have unmounted.
            if (prewarmTokenRef.current !== myToken || streamRef.current !== null) {
              // Stale: release the orphaned stream immediately so we don't
              // hold the microphone open with no cleanup path.
              s.getTracks().forEach((t) => t.stop());
              return;
            }
            streamRef.current = s;
          })
          .catch(() => {
            // Will re-acquire lazily at the next startRecording call.
          });

        setState("stopped");
        resolve(blob);
      };

      recorder.stop();
    });
  }, [cleanupSilenceDetection]);

  // Discard the recording and release all hardware/audio resources without
  // resolving a blob. Safe to call multiple times and when nothing is active.
  const abortRecording = useCallback(() => {
    // Invalidate any in-flight background prewarm so its resolution cannot
    // overwrite streamRef after we've released everything here.
    prewarmTokenRef.current++;
    cleanupSilenceDetection();
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      try {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== "inactive") recorder.stop();
        recorder.stream.getTracks().forEach((t) => t.stop());
      } catch {
        // Ignore teardown errors — the goal is just to release resources.
      }
      mediaRecorderRef.current = null;
    }
    chunksRef.current = [];
    releaseStream();
    setState("idle");
  }, [cleanupSilenceDetection, releaseStream]);

  // Guarantee teardown if the component unmounts mid-recording (e.g. the user
  // navigates away), so the mic stream, AudioContext, and RAF loop don't leak.
  // abortRecording increments prewarmTokenRef so any in-flight getUserMedia
  // rewarm that resolves after unmount stops its tracks immediately.
  useEffect(() => {
    return () => abortRecording();
  }, [abortRecording]);

  return { state, prepare, startRecording, stopRecording, abortRecording };
}
