import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildOrderTiles } from "./games";
import { romanizeTranscript } from "../lib/romanizeTranscript";

// R3 (32.1): order_words quiz tiles carry romanized subtitles. These tests
// pin the buildOrderTiles contract:
//  - tiles is a permutation of the phrase's whitespace tokens (multi-word)
//    or whole single-word phrases (fallback path);
//  - tileRomanizations is INDEX-ALIGNED with tiles and the alignment
//    survives the shuffle (the whole point of building pairs first);
//  - token subtitles come from the Task-907 transliterator, fallback-path
//    subtitles reuse the curated per-phrase romanizations;
//  - uncovered scripts yield "" for every tile (clients render no subtitle).

type Phrase = { id: number; nativeScript: string; romanized: string; english: string };

const HINDI: Phrase = {
  id: 1,
  nativeScript: "आप कैसे हैं",
  romanized: "aap kaise hain",
  english: "How are you?",
};

const OTHERS: Phrase[] = [
  { id: 2, nativeScript: "नमस्ते", romanized: "namaste", english: "Hello" },
  { id: 3, nativeScript: "धन्यवाद", romanized: "dhanyavaad", english: "Thank you" },
  { id: 4, nativeScript: "अच्छा", romanized: "achchha", english: "Good" },
];

describe("buildOrderTiles (R3 quiz tile romanization)", () => {
  test("multi-word phrase: tiles are the tokens, subtitles transliterated per token", () => {
    const { tiles, tileRomanizations } = buildOrderTiles(HINDI, OTHERS, "hi");
    assert.deepEqual([...tiles].sort(), ["आप", "कैसे", "हैं"].sort());
    assert.equal(tileRomanizations.length, tiles.length);
    for (let i = 0; i < tiles.length; i++) {
      assert.equal(tileRomanizations[i], romanizeTranscript(tiles[i]!, "hi"));
      assert.ok(tileRomanizations[i]!.length > 0, "Devanagari tokens must romanize");
    }
  });

  test("alignment survives the shuffle on every run", () => {
    for (let run = 0; run < 25; run++) {
      const { tiles, tileRomanizations } = buildOrderTiles(HINDI, OTHERS, "hi");
      for (let i = 0; i < tiles.length; i++) {
        assert.equal(
          tileRomanizations[i],
          romanizeTranscript(tiles[i]!, "hi"),
          `run ${run}: subtitle ${i} must describe tile ${i}`,
        );
      }
    }
  });

  test("single-word fallback: whole-phrase tiles reuse curated romanizations", () => {
    const single: Phrase = { id: 9, nativeScript: "નમસ્તે", romanized: "namaste", english: "Hello" };
    const pool: Phrase[] = [
      { id: 10, nativeScript: "આવજો", romanized: "aavjo", english: "Goodbye" },
      { id: 11, nativeScript: "આભાર", romanized: "aabhar", english: "Thanks" },
    ];
    const curated = new Map(
      [single, ...pool].map((p) => [p.nativeScript, p.romanized]),
    );
    const { tiles, tileRomanizations } = buildOrderTiles(single, pool, "gu");
    assert.equal(tiles.length, 3);
    assert.ok(tiles.includes(single.nativeScript));
    for (let i = 0; i < tiles.length; i++) {
      assert.equal(
        tileRomanizations[i],
        curated.get(tiles[i]!),
        "fallback tiles must carry the curated romanization, not a re-transliteration",
      );
    }
  });

  test("uncovered script (Perso-Arabic): every subtitle is empty", () => {
    const urdu: Phrase = {
      id: 20,
      nativeScript: "آپ کیسے ہیں",
      romanized: "aap kaise hain",
      english: "How are you?",
    };
    const { tiles, tileRomanizations } = buildOrderTiles(urdu, [], "ur");
    assert.equal(tiles.length, 3);
    for (const r of tileRomanizations) {
      assert.equal(r, "", "uncovered scripts must yield no subtitle text");
    }
  });
});
