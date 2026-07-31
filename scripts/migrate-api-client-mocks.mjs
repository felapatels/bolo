/**
 * migrate-api-client-mocks.mjs
 *
 * Refactors all vi.mock / jest.mock("@workspace/api-client-react", ...) blocks
 * to spread apiClientMockDefaults and override only what each test exercises.
 *
 * Web (vitest): converts to async factory + `await import("@/test-helpers/api-client-mock")`
 * Mobile (jest): converts to sync factory + `require('../test-helpers/api-client-mock')`
 *
 * Usage:
 *   node scripts/migrate-api-client-mocks.mjs [--dry-run]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Entry-level boilerplate detection
// An entry is safe to remove if its value references no test-local state and
// matches one of the known idle-default patterns.
// ---------------------------------------------------------------------------

/** True if the entry text references test-local mutable state. */
function isTestSpecific(entryText) {
  // References to mockState or the hoisted `h` var
  if (/mockState\./.test(entryText)) return true;
  // h.something (test-local hoisted state) - must be a value reference, not a
  // property name like `isError` or `isFetching`.
  if (/\bh\.[a-zA-Z]/.test(entryText)) return true;
  // Stateful React hooks inside the factory (useState, useEffect)
  if (/React(?:Actual)?\.useState|ReactActual/.test(entryText)) return true;
  return false;
}

/** True if this entry is pure idle boilerplate covered by the shared defaults. */
function isBoilerplate(entryText) {
  if (isTestSpecific(entryText)) return false;

  const normalized = entryText.replace(/\s+/g, " ").trim();

  // Query key getters returning a literal array
  // e.g. `getListXxxQueryKey: (...) => [...]`
  if (/^get[A-Z][A-Za-z]+QueryKey\s*:\s*(?:\([^)]*\)\s*=>\s*\[)/.test(normalized)) {
    // The array must contain only string/number literals (no references)
    const arrowPart = normalized.replace(/^get[A-Za-z]+QueryKey\s*:\s*/, "");
    if (/^\([^)]*\)\s*=>\s*\[['"\d\w\s,.:]*\]/.test(arrowPart)) return true;
    if (/^\(\)\s*=>\s*\[['"\w\s,]*\]/.test(arrowPart)) return true;
    if (/^\(\.\.\.[^)]+\)\s*=>\s*\[/.test(arrowPart)) return true;
    // Paranoid fallback: if no test-local refs, trust it's boilerplate
    if (!isTestSpecific(normalized)) return true;
  }

  // Simple ApiError pass-through (no status/data fields)
  if (/^ApiError\s*:\s*class ApiError extends Error\s*\{\s*\}/.test(normalized)) return true;

  // useGetAccount: () => ({ data: undefined })
  if (/^useGetAccount\s*:\s*\(\)\s*=>\s*\(\{\s*data\s*:\s*undefined\s*\}\)/.test(normalized)) return true;

  // useGetProgressSummary idle variants
  if (
    /^useGetProgressSummary\s*:\s*(?:jest|vi)\.fn\(\(\)\s*=>\s*\(\{\s*data\s*:\s*undefined,\s*isLoading\s*:\s*false\s*\}\)\)/.test(normalized)
  ) return true;
  if (
    /^useGetProgressSummary\s*:\s*\(\)\s*=>\s*\(\{\s*data\s*:\s*undefined,\s*isLoading\s*:\s*false\s*\}\)/.test(normalized)
  ) return true;

  // Generic idle query shape: data: undefined + isLoading: false
  // Matches hooks returning the standard idle query object
  if (
    /^use[A-Z][A-Za-z]+\s*:\s*\(\)\s*=>\s*\(\{.*data\s*:\s*undefined.*isLoading\s*:\s*false/.test(normalized) &&
    !isTestSpecific(normalized)
  ) return true;

  // useListCategoryLessonGroups returning empty lessonGroups
  if (
    /^useListCategoryLessonGroups\s*:\s*\(\)\s*=>\s*\(\{.*lessonGroups\s*:\s*\[\]/.test(normalized) &&
    !isTestSpecific(normalized)
  ) return true;
  if (
    /^useListCategoryLessonGroups\s*:\s*\(\)\s*=>\s*\(\{.*data\s*:\s*\{.*lessonGroups\s*:\s*\[\]/.test(normalized) &&
    !isTestSpecific(normalized)
  ) return true;

  // useReportPhrase: () => ({ mutate: jest.fn() }) or vi.fn()
  if (
    /^useReportPhrase\s*:\s*\(\)\s*=>\s*\(\{\s*mutate\s*:\s*(?:jest|vi)\.fn\(\)\s*\}\)/.test(normalized) &&
    !isTestSpecific(normalized)
  ) return true;

  // useSubmitLessonGroupTestout idle (no React.useState)
  if (
    /^useSubmitLessonGroupTestout\s*:\s*\(\)\s*=>\s*\(\{.*mutate\s*:\s*(?:jest|vi)\.fn\(\)/.test(normalized) &&
    !isTestSpecific(normalized)
  ) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Extract balanced block starting at a position that points at "{"
// Returns the index just past the closing char.
// ---------------------------------------------------------------------------
function findMatchingClose(src, start, open, close) {
  let depth = 0;
  let inStr = false;
  let strChar = "";
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\" ) { i += 2; continue; }
      if (ch === strChar) inStr = false;
    } else {
      if (ch === "'" || ch === '"' || ch === "`") { inStr = true; strChar = ch; }
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return i;
      }
    }
    i++;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Split the contents of a return object into top-level entries.
// Each element is the full text of one entry (key: value,).
// ---------------------------------------------------------------------------
function splitEntries(objectBody) {
  const entries = [];
  let depth = 0;
  let inStr = false;
  let strChar = "";
  let start = 0;

  for (let i = 0; i < objectBody.length; i++) {
    const ch = objectBody[i];
    if (inStr) {
      if (ch === "\\") { i++; continue; }
      if (ch === strChar) inStr = false;
    } else {
      if (ch === "'" || ch === '"' || ch === "`") { inStr = true; strChar = ch; }
      else if (/[{([<]/.test(ch)) depth++;
      else if (/[})\]>]/.test(ch)) depth--;
      else if (ch === "," && depth === 0) {
        const entry = objectBody.slice(start, i).trim();
        if (entry) entries.push(entry);
        start = i + 1;
      }
    }
  }
  // Last entry (possibly no trailing comma)
  const last = objectBody.slice(start).trim();
  if (last) entries.push(last);

  return entries;
}

// ---------------------------------------------------------------------------
// Process a single web (vitest) test file
// ---------------------------------------------------------------------------
function processWebFile(filePath, content) {
  const MODULE = "@workspace/api-client-react";
  // Match both sync and async factories
  const syncRe = /vi\.mock\("@workspace\/api-client-react",\s*\(\)\s*=>\s*\(\{/g;
  const asyncRe = /vi\.mock\("@workspace\/api-client-react",\s*async\s*\(\)\s*=>\s*\{/g;

  let result = content;

  // ---- Handle sync factory: `() => ({...})` ----
  let match;
  const syncPattern = /vi\.mock\("@workspace\/api-client-react",\s*\(\)\s*=>\s*\(\{/g;
  const chunks = [];
  let lastEnd = 0;

  while ((match = syncPattern.exec(content)) !== null) {
    const matchStart = match.index;
    const bodyStart = match.index + match[0].length - 1; // points at opening `{`
    const bodyEnd = findMatchingClose(content, bodyStart, "{", "}");
    if (bodyEnd === -1) continue;

    // Find the closing `));` after the body
    let after = bodyEnd + 1;
    // Expect `) )` style: the outer `(` before `{` was at bodyStart-1
    // The outer closing is bodyEnd+1 which should be `)`, then `)`, then `;`
    const tail = content.slice(bodyEnd + 1, bodyEnd + 5);

    // Extract object body (between outermost { and })
    const objectBody = content.slice(bodyStart + 1, bodyEnd);

    // Parse entries
    const entries = splitEntries(objectBody);
    const kept = entries.filter((e) => !isBoilerplate(e));

    // Determine closing -- typically `));`
    let closeStr = "))\n;";
    const afterBody = content.slice(bodyEnd).match(/^\}\s*\)\s*\)\s*;?/);
    const trailingClose = afterBody ? afterBody[0] : "));\n";

    const keptBlock = kept.length > 0
      ? kept.map((e) => "    " + e + (e.endsWith(",") ? "" : ",")).join("\n") + "\n"
      : "";

    const replacement =
      `vi.mock("${MODULE}", async () => {\n` +
      `  const { apiClientMockDefaults } = await import(\n` +
      `    "@/test-helpers/api-client-mock"\n` +
      `  );\n` +
      `  return {\n` +
      `    ...apiClientMockDefaults,\n` +
      (keptBlock ? keptBlock : "") +
      `  };\n` +
      `})`;

    // Find the real end of the entire mock call (include trailing `);`)
    // The content from match.index to after trailingClose
    const rawEnd = bodyEnd + trailingClose.length;

    chunks.push(content.slice(lastEnd, matchStart));
    chunks.push(replacement + (trailingClose.includes(";") ? ";" : ""));
    lastEnd = rawEnd;
  }

  if (chunks.length === 0) {
    // No sync factories found -- check for async factories
    result = processWebAsyncFactory(content, MODULE);
    return result;
  }

  chunks.push(content.slice(lastEnd));
  result = chunks.join("");

  // Also handle any async factories in the result
  result = processWebAsyncFactory(result, MODULE);
  return result;
}

/** Add spread to existing async factories that don't already have it. */
function processWebAsyncFactory(content, MODULE) {
  // Detect async factory that already has a return statement
  const asyncRe = /vi\.mock\("@workspace\/api-client-react",\s*async\s*\(\)\s*=>\s*\{/g;
  let match;
  const chunks = [];
  let lastEnd = 0;

  while ((match = asyncRe.exec(content)) !== null) {
    const bodyStart = match.index + match[0].length - 1; // the `{`
    const bodyEnd = findMatchingClose(content, bodyStart, "{", "}");
    if (bodyEnd === -1) continue;

    const bodyContent = content.slice(bodyStart + 1, bodyEnd);

    // Skip if already has apiClientMockDefaults
    if (bodyContent.includes("apiClientMockDefaults")) {
      continue;
    }

    // Find the `return {` inside the body
    const returnMatch = /return\s*\{/.exec(bodyContent);
    if (!returnMatch) continue;

    const retObjStart = returnMatch.index + returnMatch[0].length - 1; // `{`
    const retObjEnd = findMatchingClose(bodyContent, retObjStart, "{", "}");
    if (retObjEnd === -1) continue;

    const retObjBody = bodyContent.slice(retObjStart + 1, retObjEnd);
    const entries = splitEntries(retObjBody);
    const kept = entries.filter((e) => !isBoilerplate(e));

    // Gather the preamble (before `return {`)
    const preamble = bodyContent.slice(0, returnMatch.index).trimEnd();
    // Check if it already imports the helper
    const needsImport = !preamble.includes("apiClientMockDefaults");

    const keptBlock = kept.length > 0
      ? kept.map((e) => "    " + e + (e.endsWith(",") ? "" : ",")).join("\n") + "\n"
      : "";

    const importLine = needsImport
      ? `  const { apiClientMockDefaults } = await import(\n    "@/test-helpers/api-client-mock"\n  );\n`
      : "";

    const newBody =
      `\n` +
      (preamble ? preamble + "\n" : "") +
      importLine +
      `  return {\n` +
      `    ...apiClientMockDefaults,\n` +
      (keptBlock ? keptBlock : "") +
      `  };\n`;

    const fullMatch = content.slice(match.index, bodyEnd + 1);
    const replacement =
      `vi.mock("${MODULE}", async () => {` +
      newBody +
      `})`;

    chunks.push(content.slice(lastEnd, match.index));
    chunks.push(replacement + (content[bodyEnd + 1] === ";" ? ";" : ""));
    lastEnd = bodyEnd + (content[bodyEnd + 1] === ";" ? 2 : 1);
  }

  if (chunks.length === 0) return content;
  chunks.push(content.slice(lastEnd));
  return chunks.join("");
}

// ---------------------------------------------------------------------------
// Process a single mobile (jest) test file
// ---------------------------------------------------------------------------
function processMobileFile(filePath, content) {
  const MODULE = "@workspace/api-client-react";
  // Match patterns: single or double quotes
  const pattern = /jest\.mock\(['"]@workspace\/api-client-react['"]\s*,\s*\(\)\s*=>\s*\(\{/g;

  let match;
  const chunks = [];
  let lastEnd = 0;

  while ((match = pattern.exec(content)) !== null) {
    const matchStart = match.index;
    const bodyStart = match.index + match[0].length - 1; // opening `{`
    const bodyEnd = findMatchingClose(content, bodyStart, "{", "}");
    if (bodyEnd === -1) continue;

    const objectBody = content.slice(bodyStart + 1, bodyEnd);

    // Skip if already has apiClientMockDefaults
    if (objectBody.includes("apiClientMockDefaults")) {
      continue;
    }

    // Parse entries
    const entries = splitEntries(objectBody);
    const kept = entries.filter((e) => !isBoilerplate(e));

    const keptBlock = kept.length > 0
      ? kept.map((e) => "    " + e + (e.endsWith(",") ? "" : ",")).join("\n") + "\n"
      : "";

    const replacement =
      `jest.mock('${MODULE}', () => {\n` +
      `  const { apiClientMockDefaults } = require('../test-helpers/api-client-mock');\n` +
      `  return {\n` +
      `    ...apiClientMockDefaults,\n` +
      (keptBlock ? keptBlock : "") +
      `  };\n` +
      `})`;

    // Find real end (after `));`)
    const trailingMatch = content.slice(bodyEnd).match(/^\s*\)\s*\)\s*;?/);
    const trailingClose = trailingMatch ? trailingMatch[0] : "));";
    const rawEnd = bodyEnd + trailingClose.length;

    chunks.push(content.slice(lastEnd, matchStart));
    chunks.push(replacement + (trailingClose.includes(";") ? ";" : ""));
    lastEnd = rawEnd;
  }

  if (chunks.length === 0) return content;
  chunks.push(content.slice(lastEnd));
  return chunks.join("");
}

// ---------------------------------------------------------------------------
// File discovery + processing
// ---------------------------------------------------------------------------
function processDir(dir, processFileFn, ext = ".test.tsx") {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(ext) || f.endsWith(".test.ts"));
  let changed = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const original = fs.readFileSync(filePath, "utf8");

    // Only process files that actually mock the module
    if (!original.includes("@workspace/api-client-react")) continue;

    // Skip if already migrated
    if (original.includes("apiClientMockDefaults")) {
      console.log(`  SKIP (already migrated): ${file}`);
      continue;
    }

    const updated = processFileFn(filePath, original);
    if (updated === original) {
      console.log(`  UNCHANGED: ${file}`);
      continue;
    }

    console.log(`  UPDATED: ${file}`);
    changed++;
    if (!DRY) {
      fs.writeFileSync(filePath, updated, "utf8");
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const webDir = path.join(ROOT, "artifacts/gujarati-coach/src/test");
const mobileDir = path.join(ROOT, "artifacts/bolo-mobile/__tests__");

console.log(`\n=== Web (vitest) ===`);
const webChanged = processDir(webDir, processWebFile);

console.log(`\n=== Mobile (jest) ===`);
const mobileChanged = processDir(mobileDir, processMobileFile);

console.log(`\n--- Done: ${webChanged} web + ${mobileChanged} mobile files updated${DRY ? " (DRY RUN)" : ""} ---\n`);
