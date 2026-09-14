import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { APP_DOMAIN } from "./appDomain";
import {
  clerkClientForRequest,
  clerkSecretKeyForHost,
  clerkSecretKeyForRequest,
} from "./clerkInstance";

// X100, 2026-09-14. Every backend Clerk call used the default client, which
// reads the development secret, so production learners were looked up in the
// wrong instance: no names, and deletions that never reached Clerk. The old
// rule was only ever exercised against one hostname at a time, which any shape
// passes. These ask about BOTH hosts in the same test.

const BOTH = { CLERK_SECRET_KEY: "sk_test_dev", CLERK_SECRET_KEY_PROD: "sk_live_prod" };

test("the custom domain gets the production secret and every other host the development one", () => {
  assert.equal(clerkSecretKeyForHost(APP_DOMAIN, BOTH), "sk_live_prod");
  assert.equal(clerkSecretKeyForHost(`www.${APP_DOMAIN}`, BOTH), "sk_live_prod");
  assert.equal(clerkSecretKeyForHost(APP_DOMAIN.toUpperCase(), BOTH), "sk_live_prod");
  assert.equal(clerkSecretKeyForHost("bolo.replit.app", BOTH), "sk_test_dev");
  assert.equal(clerkSecretKeyForHost("", BOTH), "sk_test_dev");
});

test("an unset production slot falls back to the one secret on every host", () => {
  const one = { CLERK_SECRET_KEY: "sk_live_only" };
  assert.equal(clerkSecretKeyForHost(APP_DOMAIN, one), "sk_live_only");
  assert.equal(clerkSecretKeyForHost("bolo.replit.app", one), "sk_live_only");
});

test("the request's forwarded host decides, first hop only", () => {
  const saved = { dev: process.env.CLERK_SECRET_KEY, prod: process.env.CLERK_SECRET_KEY_PROD };
  process.env.CLERK_SECRET_KEY = BOTH.CLERK_SECRET_KEY;
  process.env.CLERK_SECRET_KEY_PROD = BOTH.CLERK_SECRET_KEY_PROD;
  try {
    const onDomain = { headers: { "x-forwarded-host": `${APP_DOMAIN}, internal`, host: "x.replit.app" } };
    const onPreview = { headers: { host: "x.replit.app" } };
    assert.equal(clerkSecretKeyForRequest(onDomain), "sk_live_prod");
    assert.equal(clerkSecretKeyForRequest(onPreview), "sk_test_dev");

    // THE BUG ITSELF: the two hosts must get two different backend clients,
    // and each host must keep getting the same one.
    const a = clerkClientForRequest(onDomain);
    const b = clerkClientForRequest(onPreview);
    assert.notEqual(a, b, "production and development must not share a Clerk client");
    assert.equal(clerkClientForRequest(onDomain), a);
  } finally {
    if (saved.dev === undefined) delete process.env.CLERK_SECRET_KEY;
    else process.env.CLERK_SECRET_KEY = saved.dev;
    if (saved.prod === undefined) delete process.env.CLERK_SECRET_KEY_PROD;
    else process.env.CLERK_SECRET_KEY_PROD = saved.prod;
  }
});

// The census. The default client is how X100 happened, and nothing about it
// looks wrong at a call site. Any source file importing `clerkClient` from
// @clerk/express fails here; resolve through clerkClientForRequest instead.
test("no source file uses @clerk/express's default clerkClient except clerkInstance itself", () => {
  const root = join(import.meta.dirname, "..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
      const rel = relative(root, path);
      if (rel === join("lib", "clerkInstance.ts")) continue;
      const src = readFileSync(path, "utf8");
      if (/import\s*\{[^}]*\bclerkClient\b[^}]*\}\s*from\s*["']@clerk\/express["']/.test(src)) offenders.push(rel);
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});
