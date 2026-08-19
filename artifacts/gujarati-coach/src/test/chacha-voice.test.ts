import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { speakChachaLine, __resetChachaVoiceQueueForTests } from "@/lib/chachaVoice";
import { getChachaAudioElement, __resetBlessedAudioElementsForTests } from "@/lib/iosAudio";

/**
 * Task #1095: Chacha-ji's lines are queued, never overlapped.
 *
 * His three lines arrive from three unrelated events (dialog open, arrival
 * response, close), so without a queue the gift would talk over the greeting.
 * These pin the ordering contract and the fail-silent behaviour, this is
 * flavour dialogue, so every failure path resolves the queue rather than
 * stalling the lines behind it.
 */

/** Minimal HTMLAudioElement stand-in whose playback we finish by hand. */
class MockAudio {
  static instances: MockAudio[] = [];
  src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => Promise.resolve());
  constructor() {
    MockAudio.instances.push(this);
  }
  /** Simulate the clip reaching its end. */
  finish() {
    this.onended?.();
  }
}

const clip = (id: string) => ({ audioBase64: id, format: "mp3" });

/** Let queued promise callbacks run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Chacha-ji's line queue", () => {
  beforeEach(() => {
    MockAudio.instances = [];
    vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio);
    __resetBlessedAudioElementsForTests();
    __resetChachaVoiceQueueForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never starts a line while the previous one is still speaking", async () => {
    const started: string[] = [];
    speakChachaLine(clip("GREET"), { onStart: () => started.push("greeting") });
    speakChachaLine(clip("GIFT"), { onStart: () => started.push("gift") });
    await flush();

    // The gift is queued but silent: the greeting still has the floor.
    expect(started).toEqual(["greeting"]);

    const el = getChachaAudioElement() as unknown as MockAudio;
    expect(el.src).toContain("GREET");

    el.finish();
    await flush();

    expect(started).toEqual(["greeting", "gift"]);
    expect(el.src).toContain("GIFT");
  });

  it("speaks every line through the one blessed element, never a fresh one", async () => {
    speakChachaLine(clip("GREET"));
    await flush();
    (getChachaAudioElement() as unknown as MockAudio).finish();
    speakChachaLine(clip("FARE"));
    await flush();

    // A per-play element carries no WebKit blessing and would be silent on iOS.
    expect(MockAudio.instances).toHaveLength(1);
  });

  it("releases the queue when a line is refused, so the ones behind it still speak", async () => {
    __resetBlessedAudioElementsForTests();
    const el = getChachaAudioElement() as unknown as MockAudio;
    el.play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));

    const started: string[] = [];
    speakChachaLine(clip("GREET"), { onStart: () => started.push("greeting") });
    speakChachaLine(clip("FARE"), { onStart: () => started.push("farewell") });
    await flush();
    await flush();

    expect(started).toEqual(["greeting", "farewell"]);
  });

  it("reports each line's start and end so the caption stays in step", async () => {
    const events: string[] = [];
    speakChachaLine(clip("GREET"), {
      onStart: () => events.push("start"),
      onEnd: () => events.push("end"),
    });
    await flush();
    expect(events).toEqual(["start"]);

    (getChachaAudioElement() as unknown as MockAudio).finish();
    await flush();
    expect(events).toEqual(["start", "end"]);
  });
});
