import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { prewarmMicIfGranted } from "@/lib/micPermission";

// ---------------------------------------------------------------------------
// Pin: the mic prewarm must follow the permission state for as long as the
// recording surface is mounted, not just sample it once at mount.
//
// Repro that motivated the change: a learner opens practice with the mic still
// blocked, turns it on from the browser's site settings, and keeps pressing.
// The screen had only prewarmed at mount, so it stayed cold — every press paid
// a full device acquisition, finished after the click released, and was
// discarded by the hold guard. The bird looked dead until the page reloaded.
// ---------------------------------------------------------------------------

type Listener = () => void;

class FakePermissionStatus {
  state: PermissionState;
  listeners = new Set<Listener>();
  constructor(state: PermissionState) {
    this.state = state;
  }
  addEventListener(_type: string, fn: Listener) {
    this.listeners.add(fn);
  }
  removeEventListener(_type: string, fn: Listener) {
    this.listeners.delete(fn);
  }
  /** Simulate the browser flipping the permission and notifying listeners. */
  flip(state: PermissionState) {
    this.state = state;
    for (const fn of [...this.listeners]) fn();
  }
}

const original = navigator.permissions;

function installPermissions(status: FakePermissionStatus | null) {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: status
      ? { query: vi.fn().mockResolvedValue(status) }
      : { query: vi.fn().mockRejectedValue(new Error("unsupported descriptor")) },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: original,
  });
});

describe("prewarmMicIfGranted", () => {
  test("prewarms immediately when permission is already granted", async () => {
    const status = new FakePermissionStatus("granted");
    installPermissions(status);
    const prepare = vi.fn().mockResolvedValue(undefined);

    prewarmMicIfGranted(prepare);
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
  });

  test("never prompts a first-time learner at mount", async () => {
    const status = new FakePermissionStatus("prompt");
    installPermissions(status);
    const prepare = vi.fn().mockResolvedValue(undefined);

    prewarmMicIfGranted(prepare);
    // Let the query promise settle before asserting the negative.
    await Promise.resolve();
    await Promise.resolve();
    expect(prepare).not.toHaveBeenCalled();
  });

  test("prewarms when the learner grants the mic mid-session", async () => {
    const status = new FakePermissionStatus("prompt");
    installPermissions(status);
    const prepare = vi.fn().mockResolvedValue(undefined);

    prewarmMicIfGranted(prepare);
    await vi.waitFor(() => expect(status.listeners.size).toBe(1));

    status.flip("granted");
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  test("a revoke does not prewarm, and a later grant still does", async () => {
    const status = new FakePermissionStatus("granted");
    installPermissions(status);
    const prepare = vi.fn().mockResolvedValue(undefined);

    prewarmMicIfGranted(prepare);
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));

    status.flip("denied");
    expect(prepare).toHaveBeenCalledTimes(1);

    status.flip("granted");
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  test("the cleanup stops listening, so an unmounted screen never reopens the mic", async () => {
    const status = new FakePermissionStatus("prompt");
    installPermissions(status);
    const prepare = vi.fn().mockResolvedValue(undefined);

    const cancel = prewarmMicIfGranted(prepare);
    await vi.waitFor(() => expect(status.listeners.size).toBe(1));

    cancel();
    expect(status.listeners.size).toBe(0);
    status.flip("granted");
    expect(prepare).not.toHaveBeenCalled();
  });

  test("an unsupported descriptor is skipped without throwing", async () => {
    installPermissions(null);
    const prepare = vi.fn().mockResolvedValue(undefined);

    expect(() => prewarmMicIfGranted(prepare)()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(prepare).not.toHaveBeenCalled();
  });
});
