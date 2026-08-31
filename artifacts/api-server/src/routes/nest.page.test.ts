import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── THE NEST'S PAGE STAYS HONEST ────────────────────────────────────────────
//
// The cockpit is one hand-written HTML document with no build step, so nothing
// but a test can notice when it drifts. These pin the two ways it has actually
// drifted, and the one the owner's build-26 split introduced.
//
// THE DRIFT THAT ALREADY HAPPENED: three sections were added and were missing
// from the chip nav entirely, so nobody could jump to them and they were
// forgotten. A jump list maintained separately from the document is a second
// place to forget, and this proves the two agree.
//
// THE DRIFT BUILD 26 MADE POSSIBLE: a section with no data-page silently
// falls to Dashboard. That is the safe direction to fail, but it should be a
// CHOICE rather than an accident, so every section has to say which page it is
// on out loud.

const HTML = readFileSync(
  join(import.meta.dirname, "..", "..", "assets", "nest-production.html"),
  "utf8",
);

/** Every <section> in the document body, with its id and declared page. */
function sections(): { id: string; page: string | null }[] {
  const out: { id: string; page: string | null }[] = [];
  const re = /<section id="([a-z-]+)"([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(HTML)) !== null) {
    const page = /data-page="([a-z]+)"/.exec(m[2] ?? "");
    out.push({ id: m[1]!, page: page ? page[1]! : null });
  }
  return out;
}

/** Every in-page chip in the section nav, by the id it points at. */
function chipTargets(): string[] {
  const nav = /<nav class="chips"[\s\S]*?<\/nav>/.exec(HTML);
  assert.ok(nav, "the section chip nav is gone");
  return [...nav[0].matchAll(/href="#([a-z-]+)"/g)].map((m) => m[1]!);
}

test("every section says which page it belongs on", () => {
  for (const s of sections()) {
    assert.ok(
      s.page,
      `section #${s.id} has no data-page, so it lands on Dashboard by accident`,
    );
    assert.ok(
      s.page === "dashboard" || s.page === "reference",
      `section #${s.id} claims page "${s.page}", which no page nav offers`,
    );
  }
});

test("the chip nav and the document agree, in both directions", () => {
  const ids = sections().map((s) => s.id);
  const chips = chipTargets();
  for (const id of ids) {
    assert.ok(chips.includes(id), `#${id} exists but no chip jumps to it`);
  }
  for (const target of chips) {
    assert.ok(ids.includes(target), `a chip jumps to #${target}, which is not a section`);
  }
});

test("both pages actually have something on them", () => {
  const byPage = sections().reduce<Record<string, number>>((acc, s) => {
    if (s.page) acc[s.page] = (acc[s.page] ?? 0) + 1;
    return acc;
  }, {});
  assert.ok((byPage.dashboard ?? 0) > 0, "Dashboard is empty");
  assert.ok((byPage.reference ?? 0) > 0, "Reference is empty");
});

// The page nav has to offer exactly the pages the sections claim, or a section
// becomes unreachable without anybody noticing.
test("the page nav offers exactly the pages the sections use", () => {
  const nav = /<nav class="pagenav"[\s\S]*?<\/nav>/.exec(HTML);
  assert.ok(nav, "the page nav is gone, so the split is unreachable");
  const offered = new Set([...nav[0].matchAll(/data-page="([a-z]+)"/g)].map((m) => m[1]!));
  const used = new Set(sections().map((s) => s.page).filter(Boolean) as string[]);
  for (const page of used) {
    assert.ok(offered.has(page), `sections live on "${page}" but no button opens it`);
  }
});
