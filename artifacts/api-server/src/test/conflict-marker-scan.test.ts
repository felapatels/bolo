// ---------------------------------------------------------------------------
// Conflict-marker tripwire fixture tests.
//
// Proves the scanner (scripts/check-conflict-markers.mjs) both CATCHES real
// merge conflict markers and PASSES legitimate content -- specifically a
// markdown setext underline of exactly seven equals signs, which is not in
// marker position. Exercised via subprocess in throwaway git repos, covering
// both integration points: --staged (the pre-commit hook) and the default
// tracked-tree scan (the pre-step inside the canonical test commands).
//
// Marker sequences are built via String.repeat so this file never trips the
// scanner itself.
// ---------------------------------------------------------------------------
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const SCANNER = fileURLToPath(
  new URL("../../../../scripts/check-conflict-markers.mjs", import.meta.url),
);

const OPEN = "<".repeat(7);
const MID = "=".repeat(7);
const CLOSE = ">".repeat(7);

function run(cwd: string, args: string[]) {
  return spawnSync("node", [SCANNER, ...args], { cwd, encoding: "utf8" });
}

function gitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "cmscan-"));
  const init = spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  return dir;
}

function stage(dir: string) {
  const add = spawnSync("git", ["add", "-A"], { cwd: dir, encoding: "utf8" });
  assert.equal(add.status, 0, add.stderr);
}

test("tripwire catches staged and tracked conflict markers", () => {
  const dir = gitRepo();
  try {
    writeFileSync(
      join(dir, "broken.ts"),
      `const a = 1;\n${OPEN} HEAD\nconst b = 2;\n${MID}\nconst b = 3;\n${CLOSE} theirs\n`,
    );
    stage(dir);

    const staged = run(dir, ["--staged"]);
    assert.equal(staged.status, 1, `--staged should fail, got ${staged.status}: ${staged.stderr}`);
    assert.match(staged.stderr, /broken\.ts:2/);
    assert.match(staged.stderr, /broken\.ts:4/); // seven-equals IS flagged in marker position
    assert.match(staged.stderr, /broken\.ts:6/);

    const tree = run(dir, []);
    assert.equal(tree.status, 1, `tree scan should fail, got ${tree.status}: ${tree.stderr}`);
    assert.match(tree.stderr, /broken\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tripwire passes clean content including a markdown setext underline", () => {
  const dir = gitRepo();
  try {
    // A lone seven-equals line NOT in marker position (no opener above it):
    // legitimate markdown heading underline, must not be flagged.
    writeFileSync(join(dir, "notes.md"), `Title\n${MID}\n\nSome body text.\n`);
    writeFileSync(join(dir, "code.ts"), "export const ok = true;\n");
    stage(dir);

    const staged = run(dir, ["--staged"]);
    assert.equal(staged.status, 0, `--staged should pass, got ${staged.status}: ${staged.stderr}`);

    const tree = run(dir, []);
    assert.equal(tree.status, 0, `tree scan should pass, got ${tree.status}: ${tree.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
