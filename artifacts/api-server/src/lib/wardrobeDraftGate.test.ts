// THE GUARD FOR A FIELD THAT LOOKED LIKE A GATE AND GATED NOTHING.
//
// scripts/wardrobe/manifest.json marks each item "shipped" or "draft". Until
// 2026-09-07 the ONLY code that read `status` was the wardrobe script's `list`
// command printing it, so a draft item was generated straight into
// OUTFIT_CATALOG and offered to learners at full ACCESSORY_COST. India shipped
// `pink-beanie2` that way, and every fork carries the same script.
//
// This test is deliberately about the RELATIONSHIP between two files rather
// than about any one item, so it keeps biting as the wardrobe grows. It reads
// the manifest as data and the generated catalogue through its own module.
//
// PURE ON PURPOSE. No database, so it runs in CI's api-pure job on every push,
// which is the difference between a guard and a comment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { OUTFIT_CATALOG, OUTFIT_IDS } from "./outfits.catalog.gen";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, "../../../../scripts/wardrobe/manifest.json");

type ManifestItem = { id: string; status?: string };

function manifestItems(): ManifestItem[] {
  return JSON.parse(readFileSync(MANIFEST, "utf8")).items as ManifestItem[];
}

test("a draft wardrobe item is never in the catalogue the shop sells from", () => {
  const drafts = manifestItems().filter((it) => it.status === "draft");
  const forSale = OUTFIT_CATALOG.map((o) => o.id);
  for (const draft of drafts) {
    assert.equal(
      forSale.includes(draft.id as (typeof forSale)[number]),
      false,
      `${draft.id} is status "draft" and is on sale in OUTFIT_CATALOG`,
    );
  }
});

test("a draft wardrobe item KEEPS its id, so anything already bought still resolves", () => {
  // The ids and the catalogue answer different questions. Dropping a draft from
  // OUTFIT_IDS would make an id a learner already owns fail validation, which
  // is a worse bug than the one being fixed.
  const drafts = manifestItems().filter((it) => it.status === "draft");
  const ids = OUTFIT_IDS as readonly string[];
  for (const draft of drafts) {
    assert.equal(
      ids.includes(draft.id),
      true,
      `${draft.id} vanished from OUTFIT_IDS; an owner of it can no longer be validated`,
    );
  }
});

test("every shipped manifest item IS in the catalogue", () => {
  // The other direction, so a future filter cannot quietly drop everything and
  // leave both tests above passing against an empty shop.
  const shipped = manifestItems().filter((it) => it.status !== "draft");
  const forSale = OUTFIT_CATALOG.map((o) => String(o.id));
  for (const item of shipped) {
    assert.equal(
      forSale.includes(item.id),
      true,
      `${item.id} is shipped and missing from OUTFIT_CATALOG`,
    );
  }
  assert.ok(shipped.length > 0, "the manifest has no shipped items at all");
});
