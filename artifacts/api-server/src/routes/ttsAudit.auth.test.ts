/**
 * The audit endpoint deletes and re-synthesizes cached audio for the whole
 * catalog, and it lives in the router's PUBLIC section (an operator driving it
 * has no user session). Its shared secret is therefore the only thing standing
 * between the internet and a bulk rewrite of every clip, these tests pin that
 * it fails closed in every direction, and that nothing expensive runs before
 * the check.
 */
import { test, mock, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";

let auditRuns = 0;

mock.module("../lib/ttsCacheAudit", {
  namedExports: {
    DEFAULT_BATCH_SIZE: 40,
    auditPhraseAudioBatch: async () => {
      auditRuns++;
      return {
        audited: 0,
        verified: 0,
        unverifiable: 0,
        notCached: 0,
        evicted: 0,
        replaced: 0,
        findings: [],
        nextPhraseId: null,
      };
    },
  },
});

const { default: ttsAuditRouter } = await import("./ttsAudit");

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  // The real app attaches a request logger; the route reports failures through it.
  (req as unknown as { log: unknown }).log = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  next();
});
app.use(ttsAuditRouter);

const server: Server = app.listen(0);
const { port } = server.address() as AddressInfo;
const url = `http://127.0.0.1:${port}/tts-audit/batch`;

after(() => server.close());

const originalAuditSecret = process.env.TTS_AUDIT_SECRET;
const originalSessionSecret = process.env.SESSION_SECRET;

beforeEach(() => {
  auditRuns = 0;
  process.env.TTS_AUDIT_SECRET = "correct-horse-battery-staple";
});

after(() => {
  if (originalAuditSecret === undefined) delete process.env.TTS_AUDIT_SECRET;
  else process.env.TTS_AUDIT_SECRET = originalAuditSecret;
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSessionSecret;
});

async function post(headers: Record<string, string>, body: unknown = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("a request with no secret is rejected and runs nothing", async () => {
  const res = await post({});
  assert.equal(res.status, 401);
  assert.equal(auditRuns, 0);
});

test("a wrong secret is rejected", async () => {
  const res = await post({ "x-audit-secret": "wrong" });
  assert.equal(res.status, 401);
  assert.equal(auditRuns, 0);
});

test("a secret of the right length but wrong content is rejected", async () => {
  const res = await post({ "x-audit-secret": "correct-horse-battery-stapl3" });
  assert.equal(res.status, 401);
  assert.equal(auditRuns, 0);
});

test("the endpoint fails closed when no secret is configured at all", async () => {
  delete process.env.TTS_AUDIT_SECRET;
  delete process.env.SESSION_SECRET;
  // An empty header must not satisfy an unset secret.
  const res = await post({ "x-audit-secret": "" });
  assert.equal(res.status, 401);
  assert.equal(auditRuns, 0);
});

test("the correct secret runs a batch", async () => {
  const res = await post({ "x-audit-secret": "correct-horse-battery-staple" });
  assert.equal(res.status, 200);
  assert.equal(auditRuns, 1);
  const body = (await res.json()) as { nextPhraseId: number | null };
  assert.equal(body.nextPhraseId, null);
});

test("malformed batch arguments are rejected before any work", async () => {
  const secret = { "x-audit-secret": "correct-horse-battery-staple" };
  for (const body of [
    { afterPhraseId: -1 },
    { afterPhraseId: 1.5 },
    { limit: 0 },
    { limit: 5000 },
    { languageCodes: "gu" },
    { languageCodes: [""] },
  ]) {
    const res = await post(secret, body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
  assert.equal(auditRuns, 0);
});
