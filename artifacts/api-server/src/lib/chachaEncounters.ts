import {
  db,
  chachaEncountersTable,
  attemptsTable,
  phrasesTable,
  lessonGroupProgressTable,
  lessonGroupsTable,
} from "@workspace/db";
import { and, eq, sql, desc, lt, inArray } from "drizzle-orm";
import { grantTokensDetailed } from "./tokenService";
import {
  TOKEN_EARN_CHACHA_ENCOUNTER,
  type TokenReason,
} from "./tokenEconomy";
import { MASTERY_THRESHOLD } from "./progressMetrics";
import {
  OUTFIT_CATALOG,
  listOwnedOutfits,
  type OutfitId,
  type OutfitKind,
} from "./outfits";
import { getUnlockedGroupIds } from "./lessonGroupAccess";
import {
  encounterStationsInZone,
  stationCarriesCall,
} from "./chachaCallTrigger";
import { isEncounterStation, encounterOrdinal } from "./journeyStations";

// Chacha-ji's roadside stall: he turns up trackside every fourth station,
// pours the learner a chai, and sometimes says a phrase they already know.
//
// Everything here is derived, not stored twice. Where he stands is arithmetic
// on the global station index; whether he offers something is arithmetic on
// how many encounters this learner has had in this language; the gift is a
// token ledger row. The only new state is one row per arrival (see
// chacha_encounters), which exists so a revisit shows the same encounter
// rather than a fresh one.

// The cadence lives in journeyStations.ts so the phone call's trigger can read
// it without importing this module, which needs the trigger back. Re-exported
// here so every existing importer is untouched.
export {
  ENCOUNTER_FIRST_STATION,
  ENCOUNTER_STRIDE,
  isEncounterStation,
  encounterOrdinal,
} from "./journeyStations";
/** An offer rides along on every third encounter, at most. */
export const OFFER_EVERY = 3;
/** Chai per first arrival. Roughly one garment across a finished journey. */
export const ENCOUNTER_CHAI = TOKEN_EARN_CHACHA_ENCOUNTER;
export const CHACHA_REASON: TokenReason = "earn_chacha_encounter";
/** Spoken lines are short by design: one to three words, phrase stage only. */
export const SPOKEN_MIN_WORDS = 1;
export const SPOKEN_MAX_WORDS = 3;

/**
 * Ledger ref for the gift. Language-scoped and station-scoped, so the same
 * station number in a different language is a different gift, and arriving
 * twice anywhere is the same one.
 */
export function encounterRefId(languageCode: string, station: number): string {
  return `${languageCode}:station-${station}`;
}

export interface SpokenPhrase {
  id: number;
  nativeScript: string;
  romanized: string | null;
  english: string;
}

export interface EncounterOffer {
  outfitId: OutfitId;
  name: string;
  tagline: string;
  cost: number;
  kind: OutfitKind;
}

export interface EncounterResult {
  station: number;
  ordinal: number;
  /** True only when THIS arrival paid the Chai. Drives the celebration. */
  granted: boolean;
  chaiGranted: number;
  balance: number;
  phrase: SpokenPhrase | null;
  offer: EncounterOffer | null;
  /**
   * True when THIS arrival is the one where his phone rings.
   *
   * One per zone, at a station chosen by hash rather than by a stored roll, so
   * a learner who backs out and returns meets it at the same stop. Zone 1 is
   * fixed at station 3 for every language: "after stop 2, so there is enough
   * content behind him".
   *
   * IT IS AN OFFER, NOT AN EVENT. The chai, the line and the gift are settled
   * before this is computed and none of them depend on it, so a learner who
   * ignores the ringing keeps everything the encounter already gave them.
   */
  callsNow: boolean;
}

/**
 * The map's global station order, reproduced server-side.
 *
 * The clients build it by querying the six zones in `JOURNEY_ZONES` order and
 * flattening, sorting each zone's groups phrase-stage before sentence-stage
 * and then by position. `categories.sort_order` (0..5) is that same zone
 * order, and a lesson group is stage-homogeneous, so one window function
 * reproduces the flattened list exactly. Verified against the live Gujarati
 * journey: 59 stations, zone 1 occupying 1..11.
 *
 * Deriving it here rather than trusting a client-sent index is what keeps the
 * gift bounded: a station that does not exist cannot be arrived at.
 */
async function stationRow(
  languageCode: string,
  station: number,
): Promise<{ lessonGroupId: number; categoryId: number } | null> {
  const res = await db.execute(sql`
    WITH grouped AS (
      SELECT lg.id,
             lg.category_id,
             lg.position,
             c.sort_order,
             COALESCE(MAX(CASE WHEN p.stage = 'sentence' THEN 1 ELSE 0 END), 0) AS stage_rank
      FROM lesson_groups lg
      JOIN categories c ON c.id = lg.category_id
      LEFT JOIN phrases p ON p.lesson_group_id = lg.id
      WHERE lg.language_code = ${languageCode}
      GROUP BY lg.id, lg.category_id, lg.position, c.sort_order
    ), ordered AS (
      SELECT id, category_id,
             ROW_NUMBER() OVER (ORDER BY sort_order, stage_rank, position) AS station
      FROM grouped
    )
    SELECT id, category_id FROM ordered WHERE station = ${station}
  `);
  const row = (res.rows as { id: number; category_id: number }[])[0];
  return row
    ? { lessonGroupId: Number(row.id), categoryId: Number(row.category_id) }
    : null;
}

/**
 * The zone containing a station, and the span of stations in it.
 *
 * `categories.sort_order` (0..5) IS the zone order, so the zone number is that
 * plus one. Zone boundaries are not constants: they fall out of how many lesson
 * groups a zone has, which differs per language, which is why this is a query
 * rather than a table of ranges.
 *
 * Built for the phone call, which rings once per zone and needs to know which
 * of a zone's encounter stations is the one that carries it.
 */
export async function zoneRangeForStation(
  languageCode: string,
  station: number,
): Promise<{ zone: number; firstStation: number; lastStation: number } | null> {
  const res = await db.execute(sql`
    WITH grouped AS (
      SELECT lg.id,
             lg.category_id,
             lg.position,
             c.sort_order,
             COALESCE(MAX(CASE WHEN p.stage = 'sentence' THEN 1 ELSE 0 END), 0) AS stage_rank
      FROM lesson_groups lg
      JOIN categories c ON c.id = lg.category_id
      LEFT JOIN phrases p ON p.lesson_group_id = lg.id
      WHERE lg.language_code = ${languageCode}
      GROUP BY lg.id, lg.category_id, lg.position, c.sort_order
    ), ordered AS (
      SELECT sort_order,
             ROW_NUMBER() OVER (ORDER BY sort_order, stage_rank, position) AS station
      FROM grouped
    )
    SELECT sort_order,
           MIN(station) AS first_station,
           MAX(station) AS last_station
    FROM ordered
    WHERE sort_order = (SELECT sort_order FROM ordered WHERE station = ${station})
    GROUP BY sort_order
  `);
  const row = (res.rows as {
    sort_order: number;
    first_station: number;
    last_station: number;
  }[])[0];
  if (!row) return null;
  return {
    zone: Number(row.sort_order) + 1,
    firstStation: Number(row.first_station),
    lastStation: Number(row.last_station),
  };
}

/**
 * The one to three word test, run on the SAME normalized text the phrase
 * uniqueness index is built on (trimmed, collapsed whitespace), so "what
 * counts as one phrase" and "how long is it" never disagree about spacing.
 */
const normalizedWords = sql`
  array_length(
    string_to_array(
      lower(regexp_replace(btrim(${phrasesTable.nativeScript}), '\\s+', ' ', 'g')),
      ' '
    ),
    1
  )
`;

/**
 * A short phrase this learner already owns, preferring one they have
 * mastered, falling back to one from a stop they have finished.
 *
 * The fallback is narrowed to phrases they can actually see: a completed stop
 * can still hold premium rows a free learner has never been shown, and having
 * Chacha-ji recite locked content would be a content leak dressed as charm.
 *
 * Selection is deterministic per station (hashed on phrase id plus station)
 * rather than random, so a retried request cannot produce a second answer;
 * `excludePhraseId` keeps him off the same line two encounters running.
 */
export async function selectSpokenPhrase(opts: {
  userId: string;
  languageCode: string;
  extendedLibrary: boolean;
  excludePhraseId: number | null;
  station: number;
}): Promise<SpokenPhrase | null> {
  const { userId, languageCode, extendedLibrary, excludePhraseId, station } =
    opts;

  const shortPhrase = and(
    eq(phrasesTable.languageCode, languageCode),
    eq(phrasesTable.stage, "phrase"),
    sql`${normalizedWords} BETWEEN ${SPOKEN_MIN_WORDS} AND ${SPOKEN_MAX_WORDS}`,
  );
  const notLastTime =
    excludePhraseId == null
      ? sql`TRUE`
      : sql`${phrasesTable.id} <> ${excludePhraseId}`;
  // Deterministic shuffle: stable for a given (phrase, station) pair, but a
  // different winner at the next station.
  const stationOrder = sql`md5(${phrasesTable.id}::text || ':' || ${station}::text)`;

  const columns = {
    id: phrasesTable.id,
    nativeScript: phrasesTable.nativeScript,
    romanized: phrasesTable.romanized,
    english: phrasesTable.english,
  };

  // Pool A: mastered. Mastery is the house definition — best attempt score at
  // or above the threshold — read straight off attempts rather than re-derived.
  const [mastered] = await db
    .select(columns)
    .from(phrasesTable)
    .where(
      and(
        shortPhrase,
        notLastTime,
        sql`EXISTS (
          SELECT 1 FROM ${attemptsTable} a
          WHERE a.phrase_id = ${phrasesTable.id}
            AND a.user_id = ${userId}
            AND a.language_code = ${languageCode}
            AND a.score >= ${MASTERY_THRESHOLD}
        )`,
      ),
    )
    .orderBy(stationOrder)
    .limit(1);
  if (mastered) return mastered;

  // Pool B: anything from a stop they have finished. `completed` is latched in
  // lesson_group_progress, and tested_out counts as finished too.
  const finished = await db
    .select({ groupId: lessonGroupProgressTable.lessonGroupId })
    .from(lessonGroupProgressTable)
    .innerJoin(
      lessonGroupsTable,
      eq(lessonGroupsTable.id, lessonGroupProgressTable.lessonGroupId),
    )
    .where(
      and(
        eq(lessonGroupProgressTable.userId, userId),
        eq(lessonGroupsTable.languageCode, languageCode),
        inArray(lessonGroupProgressTable.status, ["completed", "tested_out"]),
      ),
    );
  if (finished.length === 0) return null;

  const [fallback] = await db
    .select(columns)
    .from(phrasesTable)
    .where(
      and(
        shortPhrase,
        notLastTime,
        inArray(
          phrasesTable.lessonGroupId,
          finished.map((f) => f.groupId),
        ),
        extendedLibrary ? sql`TRUE` : eq(phrasesTable.premium, false),
      ),
    )
    .orderBy(stationOrder)
    .limit(1);
  return fallback ?? null;
}

/**
 * What he can offer right now, or nothing.
 *
 * Both filters are hard: never something already owned, never something the
 * balance cannot cover. When nothing qualifies he simply has nothing to sell
 * today — that is an ordinary encounter, not an error. Cheapest-first keeps
 * the offer reachable rather than aspirational.
 */
export function selectOffer(
  ownedIds: readonly OutfitId[],
  balance: number,
): EncounterOffer | null {
  const affordable = OUTFIT_CATALOG.filter(
    (item) => !ownedIds.includes(item.id) && item.cost <= balance,
  );
  if (affordable.length === 0) return null;
  const pick = affordable.reduce((best, item) =>
    item.cost < best.cost ? item : best,
  );
  return {
    outfitId: pick.id,
    name: pick.name,
    tagline: pick.tagline,
    cost: pick.cost,
    kind: pick.kind,
  };
}

export class UnknownStationError extends Error {
  constructor() {
    super("unknown_station");
  }
}

/**
 * The learner has not got this far yet. Where he stands is arithmetic, so a
 * caller could otherwise post every qualifying index in every seeded language
 * and collect the chai without ever practising — including in a language their
 * plan has not opened, whose later stops are unreachable for exactly that
 * reason. Reach is read from the same unlock derivation the phrase-serving
 * routes use, so it cannot disagree with what the map lets them board.
 */
export class StationNotReachedError extends Error {
  constructor() {
    super("station_not_reached");
  }
}

/**
 * Arrive at an encounter station.
 *
 * Idempotent twice over: the encounter row is unique on (user, language,
 * station) and the gift rides the ledger's own (user, reason, ref) index, so
 * a revisit, a double tap or two devices at once all produce one gift and one
 * story. Only the arrival that actually inserted the ledger row reports
 * `granted`, which is what the celebration hangs off.
 */
export async function arriveAtEncounter(opts: {
  userId: string;
  languageCode: string;
  station: number;
  extendedLibrary: boolean;
}): Promise<EncounterResult> {
  const { userId, languageCode, station, extendedLibrary } = opts;
  if (!isEncounterStation(station)) throw new UnknownStationError();
  const resolved = await stationRow(languageCode, station);
  if (!resolved) throw new UnknownStationError();

  // He only pours for a learner standing at a stop they have actually opened.
  const { unlockedGroupIds } = await getUnlockedGroupIds(
    userId,
    resolved.categoryId,
    languageCode,
  );
  if (!unlockedGroupIds.has(resolved.lessonGroupId)) {
    throw new StationNotReachedError();
  }

  const ordinal = encounterOrdinal(station);
  const offersThisTime = ordinal % OFFER_EVERY === 0;

  const existing = await db
    .select({
      phraseId: chachaEncountersTable.phraseId,
    })
    .from(chachaEncountersTable)
    .where(
      and(
        eq(chachaEncountersTable.userId, userId),
        eq(chachaEncountersTable.languageCode, languageCode),
        eq(chachaEncountersTable.station, station),
      ),
    )
    .limit(1);

  let phrase: SpokenPhrase | null = null;
  let granted = false;
  let balance = 0;

  if (existing.length > 0) {
    // A revisit replays the recorded line rather than choosing a new one.
    phrase = await loadPhrase(existing[0].phraseId);
    // The encounter row and the ledger row are written in that order, so a
    // request that finds the row already there can still be the one that pays:
    // it lost the race to insert but won the race to pour. The grant's own
    // verdict decides who celebrates, never the presence of the row.
    const detailed = await grantTokensDetailed(
      userId,
      CHACHA_REASON,
      encounterRefId(languageCode, station),
      ENCOUNTER_CHAI,
    );
    granted = detailed.granted;
    balance = detailed.state.balance;
  } else {
    const [previous] = await db
      .select({ phraseId: chachaEncountersTable.phraseId })
      .from(chachaEncountersTable)
      .where(
        and(
          eq(chachaEncountersTable.userId, userId),
          eq(chachaEncountersTable.languageCode, languageCode),
          lt(chachaEncountersTable.station, station),
        ),
      )
      .orderBy(desc(chachaEncountersTable.station))
      .limit(1);

    phrase = await selectSpokenPhrase({
      userId,
      languageCode,
      extendedLibrary,
      excludePhraseId: previous?.phraseId ?? null,
      station,
    });

    const inserted = await db
      .insert(chachaEncountersTable)
      .values({
        userId,
        languageCode,
        station,
        kind: offersThisTime ? "offer" : "gift",
        phraseId: phrase?.id ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: chachaEncountersTable.id });

    // Lost a race with a concurrent arrival: adopt the line that won, so both
    // requests describe the same encounter.
    if (inserted.length === 0) {
      const [winner] = await db
        .select({ phraseId: chachaEncountersTable.phraseId })
        .from(chachaEncountersTable)
        .where(
          and(
            eq(chachaEncountersTable.userId, userId),
            eq(chachaEncountersTable.languageCode, languageCode),
            eq(chachaEncountersTable.station, station),
          ),
        )
        .limit(1);
      phrase = await loadPhrase(winner?.phraseId ?? null);
    }

    const detailed = await grantTokensDetailed(
      userId,
      CHACHA_REASON,
      encounterRefId(languageCode, station),
      ENCOUNTER_CHAI,
    );
    granted = detailed.granted;
    balance = detailed.state.balance;
  }

  // The offer is priced against the balance AFTER the gift lands, so the chai
  // he just poured counts towards what he is about to offer.
  const offer = offersThisTime
    ? selectOffer(await listOwnedOutfits(userId), balance)
    : null;

  /**
   * Does his phone ring at this stop?
   *
   * COMPUTED LAST, AND NOTHING ABOVE DEPENDS ON IT, deliberately. The chai, the
   * line and the offer are all settled by now, so a learner who lets it ring
   * out keeps everything this encounter already gave them, and a failure in
   * here cannot cost them a gift. Which is why it swallows: a zone lookup that
   * falls over means no call, never a failed arrival.
   */
  let callsNow = false;
  try {
    const zoneRange = await zoneRangeForStation(languageCode, station);
    if (zoneRange) {
      callsNow = stationCarriesCall(
        userId,
        languageCode,
        zoneRange.zone,
        encounterStationsInZone(zoneRange.firstStation, zoneRange.lastStation),
        station,
      );
    }
  } catch {
    callsNow = false;
  }

  return {
    station,
    ordinal,
    granted,
    // WHAT WAS ACTUALLY POURED, not the tariff. This returned ENCOUNTER_CHAI on
    // every response, so a learner re-opening a stall the ledger had already
    // paid saw "+3" beside a balance that had not moved (owner, build 29:
    // "make sure it doesn't add more chai each time"). It never did add more;
    // the number was lying about it.
    chaiGranted: granted ? ENCOUNTER_CHAI : 0,
    balance,
    phrase,
    offer,
    // HE RINGS ONCE. callsNow was a pure station test and ignored `granted`,
    // so every revisit to the call station rang him again the moment the stall
    // closed. The map's own rule is "he never asks twice"; the call inherits it.
    callsNow: granted && callsNow,
  };
}

async function loadPhrase(phraseId: number | null): Promise<SpokenPhrase | null> {
  if (phraseId == null) return null;
  const [row] = await db
    .select({
      id: phrasesTable.id,
      nativeScript: phrasesTable.nativeScript,
      romanized: phrasesTable.romanized,
      english: phrasesTable.english,
    })
    .from(phrasesTable)
    .where(eq(phrasesTable.id, phraseId))
    .limit(1);
  return row ?? null;
}
