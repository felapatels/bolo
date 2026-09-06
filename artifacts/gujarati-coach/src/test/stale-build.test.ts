// THE WHITE PAGE A PUBLISH USED TO CAUSE (owner, 2026-09-06: "when i first
// logged in i got stuck on a blank white page until i refreshed"). These pin
// the two halves of the recovery: recognising the failure, and refusing to
// loop on it. See lib/staleBuild.ts for how the failure happens.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { looksLikeStaleChunk, reloadForStaleBuild } from "@/lib/staleBuild";

const RELOAD_KEY = "bolo.staleBuildReloadAt";

describe("recognising a chunk that is no longer on the server", () => {
  // The real messages, as the three engines word them. A publish rewrites
  // every hash and the host answers the old path with index.html, so what the
  // browser reports is either a failed import or an HTML MIME type.
  it.each([
    "TypeError: Failed to fetch dynamically imported module: https://bolo-india.app/assets/welcome-abc123.js",
    "TypeError: error loading dynamically imported module: /assets/welcome-abc123.js",
    "TypeError: Importing a module script failed.",
    'TypeError: Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
  ])("matches %s", (message) => {
    expect(looksLikeStaleChunk(new Error(message.replace(/^\w+Error: /, "")))).toBe(true);
  });

  it("does not match an ordinary application error", () => {
    expect(looksLikeStaleChunk(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(looksLikeStaleChunk(new Error("Network request failed"))).toBe(false);
  });

  it("survives a thrown value that is not an Error", () => {
    expect(looksLikeStaleChunk(null)).toBe(false);
    expect(looksLikeStaleChunk(undefined)).toBe(false);
    expect(looksLikeStaleChunk({ nope: true })).toBe(false);
    expect(looksLikeStaleChunk("failed to fetch dynamically imported module")).toBe(true);
  });
});

describe("the cooldown, which is the whole of the safety", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
  });
  afterEach(() => {
    window.sessionStorage.clear();
    vi.useRealTimers();
  });

  it("reloads the first time and records when it did", () => {
    expect(reloadForStaleBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(Number(window.sessionStorage.getItem(RELOAD_KEY))).toBeGreaterThan(0);
  });

  it("REFUSES a second reload inside the window, because a loop is worse than a white page", () => {
    expect(reloadForStaleBuild()).toBe(true);
    expect(reloadForStaleBuild()).toBe(false);
    expect(reloadForStaleBuild()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("recovers by itself once the window has passed", () => {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now() - 60_000));
    expect(reloadForStaleBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // Private mode and "block site data" are the real cases here, and both throw
  // on the ACCESS, not on the call, which is why the store is replaced whole
  // rather than spied on a prototype the test environment may not share.
  const withStorage = (stub: Partial<Storage>, run: () => void) => {
    const real = window.sessionStorage;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: stub,
    });
    try {
      run();
    } finally {
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        value: real,
      });
    }
  };

  it("treats an unreadable sessionStorage as 'already reloaded', never as 'go ahead'", () => {
    withStorage(
      {
        getItem: () => {
          throw new Error("private mode");
        },
        setItem: () => {},
      },
      () => {
        expect(reloadForStaleBuild()).toBe(false);
        expect(reload).not.toHaveBeenCalled();
      },
    );
  });

  it("does not reload when it cannot record having done so", () => {
    withStorage(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      },
      () => {
        expect(reloadForStaleBuild()).toBe(false);
        expect(reload).not.toHaveBeenCalled();
      },
    );
  });
});
