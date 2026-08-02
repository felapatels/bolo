// Pins the audio-unlock primer's RE-PRIME contract (back-navigation fix):
// primeAudioUnlock must play a fresh silent buffer inside EVERY calling
// gesture, never once-per-page-load. The original once-flag meant a re-entry
// gesture (leave a lesson, come back) did nothing, and if iOS had
// deactivated the page's audio session in between, the first coach autoplay
// rejected and the phrase stayed unspoken until the replay tap.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { primeAudioUnlock } from "@/lib/iosAudio";

const starts: number[] = [];
const closes: Array<() => void> = [];

class FakeAudioContext {
  destination = {};
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return {
      buffer: null as unknown,
      connect: vi.fn(),
      start: (when: number) => {
        starts.push(when);
      },
      onended: null as null | (() => void),
    };
  }
  close() {
    closes.push(() => undefined);
    return Promise.resolve();
  }
}

describe("primeAudioUnlock re-prime contract", () => {
  beforeEach(() => {
    starts.length = 0;
    closes.length = 0;
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  test("plays a fresh silent buffer on every call, not once per page load", () => {
    primeAudioUnlock();
    expect(starts).toHaveLength(1);
    // The back-navigation gesture: a second entry into a session later in
    // the same page load must prime again.
    primeAudioUnlock();
    primeAudioUnlock();
    expect(starts).toHaveLength(3);
  });

  test("swallows a missing AudioContext without throwing (tap-to-hear stays the fallback)", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => primeAudioUnlock()).not.toThrow();
    expect(starts).toHaveLength(0);
  });
});
