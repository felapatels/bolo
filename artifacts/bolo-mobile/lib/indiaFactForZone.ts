/**
 * THE BOARD'S DAILY FACT, the deterministic per-zone pick.
 *
 * Web twin: factForZone in gujarati-coach/src/lib/india-facts.ts. Ported for
 * the carved station board's DID YOU KNOW strip (chat 11): mobile's panel
 * carried only the city and the stop count while web's carried the fact, and
 * the owner asked for the board to match web. Same selection arithmetic so the
 * two platforms show the SAME fact for the same zone on the same day.
 *
 * The pool reads mobile's own bundled indiaFacts.json (the loader facts).
 * Web's fact list has since grown past the shared 100, so a tag needle that
 * matches no bundled fact simply never tags anything here: the preference
 * order (region match, then railways-tagged, then the full set) is identical.
 * Pure lookup, zero network calls, no Date.now() at module scope.
 */
import indiaFacts from '@/data/indiaFacts.json';

const FACTS: string[] = indiaFacts;

type FactTags = { region?: string; line?: string };

/** Literal text needle to region name, exactly as the fact spells it. */
const REGION_TAG_RULES: ReadonlyArray<readonly [needle: string, region: string]> = [
  ['Chail, Himachal Pradesh', 'Himachal Pradesh'],
  ['city of Varanasi', 'Varanasi'],
  ['based in Mumbai', 'Mumbai'],
  ['Dal Lake in Srinagar', 'Srinagar'],
  ["India's Meghalaya", 'Meghalaya'],
  ["Bihar's Nalanda", 'Bihar'],
  ['Konark Sun Temple in Odisha', 'Odisha'],
  ['Kerala backwaters', 'Kerala'],
  ['stands in Gujarat', 'Gujarat'],
  ["India's Jaipur", 'Jaipur'],
  ['city of Leh', 'Leh'],
  ['city of Hyderabad', 'Hyderabad'],
  ['Amber Fort in Rajasthan', 'Rajasthan'],
  ['skies of Gujarat', 'Gujarat'],
  ['city of Mumbai', 'Mumbai'],
  ['Rajasthan hosts the Pushkar', 'Rajasthan'],
  ['Andaman and Nicobar', 'Andaman and Nicobar Islands'],
  ['city of Chennai', 'Chennai'],
  ['Red Fort in Delhi', 'Delhi'],
  ['city of Mysore', 'Mysore'],
  ["India's Nagaland", 'Nagaland'],
  ['Kaziranga National Park in Assam', 'Assam'],
  ['Golden Temple in Amritsar', 'Amritsar'],
  ['city of Kolkata', 'Kolkata'],
  ['festival in Jaisalmer', 'Jaisalmer'],
];

/** Facts explicitly about the railways apply to every journey line. */
const LINE_TAG_RULES: ReadonlyArray<readonly [needle: string, line: string]> = [
  ['The Indian Railways', 'Indian Railways'],
];

/** Sparse map: fact index to its tags, built once from the literal rules so
 *  the tags can never drift from the fact wording. */
const FACT_TAGS: ReadonlyMap<number, FactTags> = (() => {
  const map = new Map<number, FactTags>();
  FACTS.forEach((fact, i) => {
    const tags: FactTags = {};
    for (const [needle, region] of REGION_TAG_RULES) {
      if (fact.includes(needle)) tags.region = region;
    }
    for (const [needle, line] of LINE_TAG_RULES) {
      if (fact.includes(needle)) tags.line = line;
    }
    if (tags.region || tags.line) map.set(i, tags);
  });
  return map;
})();

const DAY_MS = 86_400_000;

/** Region-tagged matches keep their exclusive pool; untagged zones rotate the
 *  full set so the zoneIndex stride separates zones (web hotfix Item 4). */
function factPoolForZone(geoName: string, lineName: string): number[] {
  const regionMatches: number[] = [];
  const lineTagged: number[] = [];
  for (const [i, tags] of FACT_TAGS) {
    if (tags.region && (geoName.includes(tags.region) || lineName.includes(tags.region))) {
      regionMatches.push(i);
    } else if (tags.line) {
      lineTagged.push(i);
    }
  }
  return regionMatches.length > 0
    ? [...regionMatches, ...lineTagged]
    : FACTS.map((_, i) => i);
}

/** Deterministic daily fact for a journey zone; `salt` separates surfaces. */
export function factForZone(opts: {
  zoneIndex: number;
  geoName: string;
  lineName: string;
  salt?: number;
  now?: number;
}): string {
  const { zoneIndex, geoName, lineName, salt = 0 } = opts;
  const now = opts.now ?? Date.now();
  const pool = factPoolForZone(geoName, lineName);
  const day = Math.floor(now / DAY_MS);
  const pick = pool[(day + zoneIndex * 7 + salt) % pool.length]!;
  return FACTS[pick]!;
}
