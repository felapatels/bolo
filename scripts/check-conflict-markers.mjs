#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Conflict-marker tripwire.
//
// Rejects git merge conflict markers that were accidentally committed or
// staged (the failure mode: a stale task-branch re-merge landed committed
// conflict markers on main, Aug 2026). Three entry points:
//
//   node scripts/check-conflict-markers.mjs                 # scan tracked files (pre-step in canonical test commands)
//   node scripts/check-conflict-markers.mjs --staged        # scan staged files (pre-commit hook)
//   node scripts/check-conflict-markers.mjs --install-hook  # write .git/hooks/pre-commit (run by root "prepare")
//
// Marker-position precision: a line is a violation only when it BEGINS a
// conflict marker sequence -- seven "<" or seven ">" followed by a space or
// end-of-line. A line of exactly seven "=" is only a violation when it sits
// inside an open "<" region (i.e. in marker position); a bare seven-equals
// line elsewhere (e.g. a markdown setext underline) is legitimate.
//
// No literal marker sequences appear in this file (built via repeat), so the
// scanner never flags itself.
// ---------------------------------------------------------------------------
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OPEN = "<".repeat(7);
const MID = "=".repeat(7);
const CLOSE = ">".repeat(7);
const openRe = new RegExp("^" + OPEN + "( |$)");
const closeRe = new RegExp("^" + CLOSE + "( |$)");

/**
 * Scan file content for conflict markers in marker position.
 * Returns [{ line, marker }] (1-based line numbers).
 */
export function scanContent(text) {
  const hits = [];
  let inOpen = false;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (openRe.test(line)) {
      inOpen = true;
      hits.push({ line: i + 1, marker: OPEN });
    } else if (closeRe.test(line)) {
      hits.push({ line: i + 1, marker: CLOSE });
      inOpen = false;
    } else if (line === MID && inOpen) {
      hits.push({ line: i + 1, marker: MID });
    }
  }
  return hits;
}

function git(args, opts = {}) {
  return spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
}

function repoRoot() {
  const r = git(["rev-parse", "--show-toplevel"]);
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

function report(violations) {
  for (const v of violations) {
    process.stderr.write(`${v.file}:${v.line}: conflict marker in marker position (${v.marker})\n`);
  }
  process.stderr.write(
    `\nconflict-marker tripwire: ${violations.length} marker line(s) found. ` +
      "Resolve the merge conflict(s) before committing/testing.\n",
  );
}

function scanStaged() {
  const list = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]);
  if (list.status !== 0) {
    process.stderr.write(list.stderr || "conflict-marker tripwire: git diff --cached failed\n");
    process.exit(2);
  }
  const files = list.stdout.split("\0").filter(Boolean);
  const violations = [];
  for (const file of files) {
    const show = git(["show", ":0:" + file]);
    if (show.status !== 0) continue; // unmerged/absent index entry etc.
    if (show.stdout.includes("\0")) continue; // binary
    for (const hit of scanContent(show.stdout)) violations.push({ file, ...hit });
  }
  if (violations.length > 0) {
    report(violations);
    process.exit(1);
  }
}

function scanTree() {
  const root = repoRoot();
  if (root === null) return; // not a git repo (e.g. deployed artifact) -- nothing to scan
  // Fast prefilter: only files containing an opener/closer line can have
  // markers in marker position (a lone seven-equals line is legitimate).
  const grep = git(["grep", "-I", "-l", "-E", `^(${OPEN}|${CLOSE})( |$)`, "--", "."], { cwd: root });
  if (grep.status === 1) return; // no matches -- clean
  if (grep.status !== 0) {
    process.stderr.write(grep.stderr || "conflict-marker tripwire: git grep failed\n");
    process.exit(2);
  }
  const violations = [];
  for (const file of grep.stdout.split("\n").filter(Boolean)) {
    const text = readFileSync(join(root, file), "utf8");
    for (const hit of scanContent(text)) violations.push({ file, ...hit });
  }
  if (violations.length > 0) {
    report(violations);
    process.exit(1);
  }
}

function installHook() {
  // Never fail an install: this runs from the root "prepare" script, and
  // environments without a git dir (production deploys) must not break.
  try {
    const root = repoRoot();
    if (root === null) return;
    const hooksPathRel = git(["rev-parse", "--git-path", "hooks"], { cwd: root }).stdout.trim();
    if (!hooksPathRel) return;
    const hookFile = resolve(root, hooksPathRel, "pre-commit");
    const content =
      "#!/bin/sh\n" +
      "# conflict-marker tripwire (generated; source: scripts/check-conflict-markers.mjs)\n" +
      'exec node "$(git rev-parse --show-toplevel)/scripts/check-conflict-markers.mjs" --staged\n';
    if (existsSync(hookFile)) {
      const existing = readFileSync(hookFile, "utf8");
      if (!existing.includes("conflict-marker tripwire")) {
        process.stderr.write(
          "conflict-marker tripwire: a foreign pre-commit hook exists; not overwriting. " +
            "Chain it manually to scripts/check-conflict-markers.mjs --staged\n",
        );
        return;
      }
      if (existing === content) return; // already installed, current version
    }
    writeFileSync(hookFile, content);
    chmodSync(hookFile, 0o755);
  } catch {
    // best-effort
  }
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  const mode = process.argv[2];
  if (mode === "--staged") scanStaged();
  else if (mode === "--install-hook") installHook();
  else scanTree();
}
