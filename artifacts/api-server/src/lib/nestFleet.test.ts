import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { createNestFleetRouters, canReadNest } from "./nestFleet";

// No DB, real identity provider, or real regional service is used by these guards.
// Kept for the release suite; not executed during the owner's typecheck-only iteration.
test("fleet relay is closed without a key, rejects writes and non-allowlisted reads", async () => {
  const previous = process.env.NEST_RELAY_KEY;
  process.env.NEST_RELAY_KEY = "a".repeat(64);
  const leaf = express.Router();
  leaf.get("/nest/summary", (req, res) => { res.json({ authorized: canReadNest(req), filter: req.query.exclOwner }); });
  const { relay, hub } = createNestFleetRouters(leaf);
  const app = express(); app.use(relay); app.use(hub);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    for (const path of ["/nest/relay/summary", "/nest/fleet/apps", "/nest/fleet/sea/summary"]) {
      assert.equal((await fetch(origin + path)).status, 404);
    }
    assert.equal((await fetch(origin + "/nest/relay/summary", { headers: { "X-Nest-Relay-Key": "wrong" } })).status, 404);
    const headers = { "X-Nest-Relay-Key": "a".repeat(64) };
    for (const path of ["page", "mail", "growth", "account", "anything"]) {
      assert.equal((await fetch(origin + "/nest/relay/" + path, { headers })).status, 404);
    }
    assert.equal((await fetch(origin + "/nest/relay/summary", { headers, method: "POST" })).status, 404);
    const response = await fetch(origin + "/nest/relay/summary?exclOwner=0", { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authorized: true, filter: "0" });
    assert.equal(response.headers.get("cache-control"), "no-store");
    delete process.env.NEST_RELAY_KEY;
    assert.equal((await fetch(origin + "/nest/relay/summary", { headers })).status, 404);
  } finally {
    if (previous === undefined) delete process.env.NEST_RELAY_KEY; else process.env.NEST_RELAY_KEY = previous;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
