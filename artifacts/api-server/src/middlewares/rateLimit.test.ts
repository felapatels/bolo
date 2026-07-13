import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { createRateLimit } from "./rateLimit";

// Drives the shared rate-limit middleware through a real Express app so the
// exact wiring the routes use (status code, JSON body, per-key buckets) is what
// gets exercised. No DB or network involved, so it's fast and deterministic.

function makeApp(
  max: number,
  windowMs: number,
): { app: Express; setUser: (id: string) => void } {
  let currentUser = "user_a";
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = currentUser;
    next();
  });
  app.use(createRateLimit({ windowMs, max }));
  app.get("/ping", (_req, res) => {
    res.json({ ok: true });
  });
  return { app, setUser: (id) => (currentUser = id) };
}

async function listen(app: Express): Promise<{ server: Server; url: string }> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

test("allows requests up to the limit, then returns 429", async () => {
  const { app } = makeApp(5, 60_000);
  const { server, url } = await listen(app);
  try {
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${url}/ping`);
      assert.equal(res.status, 200, `request ${i + 1} should be allowed`);
    }
    const blocked = await fetch(`${url}/ping`);
    assert.equal(blocked.status, 429);
    const body = (await blocked.json()) as { error?: string };
    assert.equal(typeof body.error, "string");
    assert.ok((body.error ?? "").length > 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("throttles each user independently (separate buckets)", async () => {
  const { app, setUser } = makeApp(3, 60_000);
  const { server, url } = await listen(app);
  try {
    setUser("heavy_user");
    for (let i = 0; i < 3; i++) {
      assert.equal((await fetch(`${url}/ping`)).status, 200);
    }
    assert.equal((await fetch(`${url}/ping`)).status, 429);

    // A different user has a fresh budget and is unaffected by the first.
    setUser("fresh_user");
    assert.equal((await fetch(`${url}/ping`)).status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("recording at human speed within a rolling window is never blocked", async () => {
  // A short window means older hits age out; steady, human-paced requests should
  // all pass rather than accumulating toward the cap.
  const { app } = makeApp(2, 40);
  const { server, url } = await listen(app);
  try {
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${url}/ping`);
      assert.equal(res.status, 200, `spaced request ${i + 1} should pass`);
      await new Promise((r) => setTimeout(r, 45));
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
