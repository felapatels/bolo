import { describe, test, expect } from "vitest";
import {
  SCRIPT_BY_LANGUAGE,
  SCRIPT_NAMES,
  AUTHORED_GLYPHS,
  SCRIPT_ORDER_TIP,
  PLAYABLE_GLYPH_FLOOR,
  scriptFor,
  glyphsForLanguage,
  traceReadyFor,
  playableScripts,
  scriptsOnRealData,
  unlockOrder,
  DEVANAGARI_PROTOTYPE_GLYPHS,
} from "@workspace/script-trace";
import { JOURNEY_LINES } from "@/lib/journeyLines";

// ---------------------------------------------------------------------------
// The script table is the arithmetic that makes authored stroke data
// affordable: the unit is the SCRIPT, not the language. It is also the gate
// that keeps a three-letter tracing game out of the roster.
// ---------------------------------------------------------------------------

describe("every language the app teaches has a script", () => {
  test("all 22 line languages are mapped", () => {
    // JOURNEY_LINES is the authoritative list of what the app teaches, so a
    // language added there without a script here would silently have no
    // tracing path at all rather than an unwritten one.
    for (const code of Object.keys(JOURNEY_LINES)) {
      expect(scriptFor(code), `${code} has no script mapped`).toBeDefined();
    }
  });

  test("there are 22 mappings and no strays", () => {
    expect(Object.keys(SCRIPT_BY_LANGUAGE)).toHaveLength(22);
    for (const code of Object.keys(SCRIPT_BY_LANGUAGE)) {
      expect(JOURNEY_LINES[code], `${code} is mapped but is not a taught language`).toBeDefined();
    }
  });

  test("every script used has a human name", () => {
    for (const script of new Set(Object.values(SCRIPT_BY_LANGUAGE))) {
      expect(SCRIPT_NAMES[script]).toBeTruthy();
    }
  });
});

describe("THE ARITHMETIC: one script buys many languages", () => {
  test("Devanagari alone covers eight languages", () => {
    const deva = Object.entries(SCRIPT_BY_LANGUAGE)
      .filter(([, s]) => s === "devanagari")
      .map(([code]) => code)
      .sort();
    expect(deva).toEqual(["brx", "doi", "hi", "kok", "mai", "mr", "ne", "sa"]);
  });

  test("twelve scripts cover all twenty-two languages", () => {
    // This is the number that made deriving from fonts look necessary. It is
    // twelve authored sets, not twenty-two.
    expect(new Set(Object.values(SCRIPT_BY_LANGUAGE)).size).toBe(12);
  });

  test("Manipuri is Meetei Mayek, not Bengali", () => {
    // Pinned because it is the easy thing to get wrong: Manipuri WAS written
    // in Bengali script historically, and the languages table declares Meetei
    // Mayek and ships a Meetei Mayek font. Tracing has to teach the letterforms
    // a learner will actually meet.
    expect(scriptFor("mni")).toBe("meitei");
    expect(scriptFor("bn")).toBe("bengali");
    expect(scriptFor("as")).toBe("bengali");
  });

  test("unlockOrder ranks the next script by how many languages it buys", () => {
    const order = unlockOrder();
    expect(order[0]!.script).toBe("devanagari");
    expect(order[0]!.languages).toHaveLength(8);
    // Descending, so the planning answer is always the top row.
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.languages.length).toBeGreaterThanOrEqual(
        order[i]!.languages.length,
      );
    }
  });
});

describe("THE GATE: provenance, now that everything is playable", () => {
  test("the prototype data is deliberately below the playable floor", () => {
    // Three approximate glyphs exist to exercise the format. RETARGETED
    // 2026-08-23: this used to read AUTHORED_GLYPHS.devanagari, which is now
    // 48 font-derived glyphs because the roster layers guesses over the
    // prototypes. The claim being made was always about the PROTOTYPES, so it
    // asserts on them directly now instead of on whatever currently wins.
    expect(DEVANAGARI_PROTOTYPE_GLYPHS.length).toBeLessThan(PLAYABLE_GLYPH_FLOOR);
  });

  test("tracing is offered in every language", () => {
    // INVERTED TWICE on 2026-08-23, and the second time is a product decision
    // rather than a discovery. It first asserted NO language offered tracing
    // (true while only prototypes existed), then only Gujarati (true once a
    // speaker traced 45 letters). The call was then made to keep all 22 on,
    // using font-derived guesses until real handwriting arrives for each.
    //
    // So playability is no longer the thing worth guarding. PROVENANCE is,
    // and that is what the rest of this block now pins.
    for (const code of Object.keys(SCRIPT_BY_LANGUAGE)) {
      expect(traceReadyFor(code), `${code} should offer tracing`).toBe(true);
    }
    expect(playableScripts().length).toBe(Object.keys(SCRIPT_NAMES).length);
  });

  test("only a real hand counts as real, and the rest admit they are guesses", () => {
    // The load-bearing assertion of the whole arrangement. A font guess that
    // stopped being labelled would be indistinguishable from a speaker's
    // handwriting, and would teach a child a stroke order nobody uses.
    expect(scriptsOnRealData()).toEqual(["gujarati"]);

    for (const g of glyphsForLanguage("gu")) {
      expect(g.provisional, `gu ${g.id} is real handwriting`).toBeFalsy();
    }
    for (const code of Object.keys(SCRIPT_BY_LANGUAGE)) {
      if (scriptFor(code) === "gujarati") continue;
      const glyphs = glyphsForLanguage(code);
      expect(glyphs.length).toBeGreaterThanOrEqual(PLAYABLE_GLYPH_FLOOR);
      for (const g of glyphs) {
        expect(g.provisional, `${code} ${g.id} must admit it is a guess`).toBe(true);
      }
    }
  });

  test("unlockOrder still names the next script worth finding a speaker for", () => {
    // It ranks by provenance now, not by playability. Gujarati is done, so the
    // answer is the script that buys the most languages after it.
    const order = unlockOrder();
    expect(order.map((o) => o.script)).not.toContain("gujarati");
    expect(order[0]!.script).toBe("devanagari");
  });

  test("an unknown language code is handled, not thrown at", () => {
    expect(scriptFor("__nope__")).toBeUndefined();
    expect(glyphsForLanguage("__nope__")).toEqual([]);
    expect(traceReadyFor("__nope__")).toBe(false);
  });

  test("the floor is a session, not a token gesture", () => {
    // Below a dozen a learner exhausts the game in one sitting, which reads as
    // broken rather than short.
    expect(PLAYABLE_GLYPH_FLOOR).toBeGreaterThanOrEqual(12);
  });

  test("Devanagari data flows to all eight of its languages once it lands", () => {
    // Not a hypothetical: the same array is served to each, so authoring once
    // really does unlock eight.
    const deva = ["hi", "mr", "ne", "mai", "doi", "kok", "sa", "brx"];
    for (const code of deva) {
      expect(glyphsForLanguage(code)).toBe(AUTHORED_GLYPHS.devanagari);
    }
  });
});

describe("authored data is well formed wherever it exists", () => {
  test.each(Object.entries(AUTHORED_GLYPHS))("%s glyphs are usable", (_script, glyphs) => {
    for (const g of glyphs ?? []) {
      expect(g.id.trim()).toBeTruthy();
      expect(g.char.trim()).toBeTruthy();
      expect(g.strokes.length).toBeGreaterThan(0);
      for (const stroke of g.strokes) {
        // A stroke needs two points to have a direction at all.
        expect(stroke.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test.each(Object.entries(AUTHORED_GLYPHS))("%s glyph ids are unique", (_script, glyphs) => {
    const ids = (glyphs ?? []).map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("every script tells its author the right order rule", () => {
  test("all twelve have a tip", () => {
    for (const script of new Set(Object.values(SCRIPT_BY_LANGUAGE))) {
      expect(SCRIPT_ORDER_TIP[script]?.trim(), `${script} has no order tip`).toBeTruthy();
    }
  });

  test("the head-line scripts and the no-head-line script do not share copy", () => {
    // Gujarati's whole difference from Devanagari is the absent head-line. A
    // shared or copy-pasted tip here would teach a stroke that does not exist.
    expect(SCRIPT_ORDER_TIP.gujarati).not.toEqual(SCRIPT_ORDER_TIP.devanagari);
    expect(SCRIPT_ORDER_TIP.gujarati.toLowerCase()).toContain("no head-line");
    for (const s of ["devanagari", "bengali", "gurmukhi"] as const) {
      expect(SCRIPT_ORDER_TIP[s].toLowerCase()).toContain("last");
    }
  });
});
