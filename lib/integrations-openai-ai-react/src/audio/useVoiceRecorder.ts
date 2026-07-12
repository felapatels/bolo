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

  // Silence detection
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const onSilenceRef = useRef<(() => void) | null>(null);

  const cleanupSilenceDetection = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    onSilenceRef.current = null;
  }, []);

  const startRecording = useCallback(
    async (options?: StartRecordingOptions): Promise<void> => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

      recorder.start(100);
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
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
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
        recorder.stream.getTracks().forEach((t) => t.stop());
        setState("stopped");
        resolve(blob);
      };

      recorder.stop();
    });
  }, [cleanupSilenceDetection]);

  // Discard the recording and release all hardware/audio resources without
  // resolving a blob. Safe to call multiple times and when nothing is active.
  const abortRecording = useCallback(() => {
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
  }, [cleanupSilenceDetection]);

  // Guarantee teardown if the component unmounts mid-recording (e.g. the user
  // navigates away), so the mic stream, AudioContext, and RAF loop don't leak.
  useEffect(() => {
    return () => abortRecording();
  }, [abortRecording]);

  return { state, startRecording, stopRecording, abortRecording };
}
