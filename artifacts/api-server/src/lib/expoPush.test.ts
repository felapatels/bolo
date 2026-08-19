import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  chunk,
  isExpoPushToken,
  sendExpoPush,
  MAX_BATCH,
  type PushMessage,
} from "./expoPush";

// ---------------------------------------------------------------------------
// The hard part of push is not sending, it is the graveyard: every deleted
// install leaves behind a token that looks valid and will never deliver again.
// A sender that ignores DeviceNotRegistered becomes a machine that mails a dead
// address forever, so what these tests pin is the CLASSIFICATION, not the POST.
// ---------------------------------------------------------------------------

const msg = (to: string): PushMessage => ({ to, title: "t", body: "b" });

function expoReplying(tickets: unknown[], ok = true, status = 200) {
  const calls: unknown[][] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push([url, JSON.parse(String(init.body))]);
    return {
      ok,
      status,
      json: async () => ({ data: tickets }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("isExpoPushToken", () => {
  test("accepts both spellings Expo has used", () => {
    assert.equal(isExpoPushToken("ExponentPushToken[abc123]"), true);
    assert.equal(isExpoPushToken("ExpoPushToken[abc123]"), true);
  });

  test("rejects the shapes that would poison a batch", () => {
    // Expo fails a WHOLE batch on one malformed entry, so a junk token in the
    // table silently costs every other device in that send.
    for (const bad of [
      "",
      "abc123",
      "ExponentPushToken[]",
      "ExponentPushToken[has space]",
      "fcm:APA91b...",
      null,
      42,
    ]) {
      assert.equal(isExpoPushToken(bad), false, `should reject ${String(bad)}`);
    }
  });
});

describe("chunk", () => {
  test("never exceeds Expo's batch limit", () => {
    const batches = chunk(Array.from({ length: 250 }, (_, i) => i));
    assert.deepEqual(batches.map((b) => b.length), [MAX_BATCH, MAX_BATCH, 50]);
  });

  test("an empty list is no batches, not one empty batch", () => {
    assert.deepEqual(chunk([]), []);
  });
});

describe("THE GRAVEYARD: what comes back matters more than what went out", () => {
  test("DeviceNotRegistered is separated from every other failure", async () => {
    const { impl } = expoReplying([
      { status: "ok" },
      { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      { status: "error", message: "nope", details: { error: "MessageTooBig" } },
    ]);
    const out = await sendExpoPush(
      [msg("ExponentPushToken[a]"), msg("ExponentPushToken[b]"), msg("ExponentPushToken[c]")],
      impl,
    );

    assert.deepEqual(out.accepted, ["ExponentPushToken[a]"]);
    // Only this list may be buried. Burying the third would delete a live
    // subscriber over a message that was simply too large.
    assert.deepEqual(out.deviceNotRegistered, ["ExponentPushToken[b]"]);
    assert.deepEqual(out.failed, [
      { token: "ExponentPushToken[c]", error: "MessageTooBig" },
    ]);
  });

  test("A NETWORK FAILURE BURIES NOBODY", async () => {
    // An unreachable Expo says nothing about whether those devices exist. This
    // is the difference between a bad afternoon and losing the whole list.
    const impl = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const out = await sendExpoPush([msg("ExponentPushToken[a]")], impl);

    assert.deepEqual(out.deviceNotRegistered, []);
    assert.deepEqual(out.accepted, []);
    assert.equal(out.failed[0]?.error, "ECONNRESET");
  });

  test("an HTTP error buries nobody either", async () => {
    const { impl } = expoReplying([], false, 503);
    const out = await sendExpoPush([msg("ExponentPushToken[a]")], impl);
    assert.deepEqual(out.deviceNotRegistered, []);
    assert.equal(out.failed[0]?.error, "expo 503");
  });

  test("a missing ticket is a failure, never a death sentence", async () => {
    // Expo answering with fewer tickets than messages is Expo being odd, and
    // guessing "dead" there would delete real subscribers.
    const { impl } = expoReplying([{ status: "ok" }]);
    const out = await sendExpoPush(
      [msg("ExponentPushToken[a]"), msg("ExponentPushToken[b]")],
      impl,
    );
    assert.deepEqual(out.accepted, ["ExponentPushToken[a]"]);
    assert.deepEqual(out.deviceNotRegistered, []);
    assert.deepEqual(out.failed, [{ token: "ExponentPushToken[b]", error: "no ticket" }]);
  });

  test("sending nothing does not call Expo at all", async () => {
    const { impl, calls } = expoReplying([]);
    const out = await sendExpoPush([], impl);
    assert.equal(calls.length, 0);
    assert.deepEqual(out, { accepted: [], deviceNotRegistered: [], failed: [] });
  });

  test("more than a batch is split, and every ticket still lands on its token", async () => {
    const many = Array.from({ length: 150 }, (_, i) => msg(`ExponentPushToken[t${i}]`));
    const impl = (async (_url: string, init: RequestInit) => {
      const batch = JSON.parse(String(init.body)) as PushMessage[];
      return {
        ok: true,
        status: 200,
        // Every third device in each batch is dead.
        json: async () => ({
          data: batch.map((_, i) =>
            i % 3 === 0
              ? { status: "error", details: { error: "DeviceNotRegistered" } }
              : { status: "ok" },
          ),
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const out = await sendExpoPush(many, impl);
    assert.equal(out.accepted.length + out.deviceNotRegistered.length, 150);
    // 100 in the first batch and 50 in the second: indices 0,3,6… of each.
    assert.equal(out.deviceNotRegistered.length, 34 + 17);
    // THE BOUNDARY. Ticket indices restart at zero for each batch, so t100 (the
    // first message of batch two) is dead. If the code paired tickets against a
    // running global index instead, t100 would be index 100, 100 % 3 = 1, and
    // read as alive: the exact off-by-a-batch that silently mails dead devices
    // and buries live ones.
    assert.ok(out.deviceNotRegistered.includes("ExponentPushToken[t100]"));
    assert.ok(!out.deviceNotRegistered.includes("ExponentPushToken[t102]"));
  });
});
