// Canonical @workspace/db mock factory for node:test suites.
//
// Why this exists: tests that call mock.module("@workspace/db", ...) used to
// hand-roll their namedExports list. A single missing name fails the WHOLE
// test file at ESM link time (not at an assertion) as soon as any transitive
// import references it — and the hand-rolled lists silently drift every time
// the schema barrel gains an export.
//
// The `satisfies DbValueExports` clause below is the drift guard:
// DbValueExports is derived from the real module's type surface via a
// TYPE-ONLY import (the real module is never executed here, so no pg Pool is
// created). When lib/db adds or removes an export, typecheck fails HERE, in
// exactly one place, instead of a test file failing cryptically at link time.
// The same clause rejects phantom keys that don't exist in the real schema.
//
// Usage:
//
//   import { createDbMockExports } from "../test/dbMock";
//   mock.module("@workspace/db", {
//     namedExports: createDbMockExports({
//       db: { query: { phrasesTable: { findFirst: async () => myStub } } },
//     }),
//   });
//
// Tables are inert `{}` sentinels — they are only ever passed as arguments to
// drizzle helpers by code under test. `db` defaults to a throwing proxy so a
// test that forgets to override it fails with a descriptive message instead
// of silently returning undefined rows.

import type * as Db from "@workspace/db";
// Imported from the standalone subpath, NOT the barrel: these are pure string
// helpers with no database import, so pulling them in here cannot create a pg
// Pool the way importing "@workspace/db" itself would.
import {
  normalizePhraseText,
  isDuplicatePhraseTextError,
  PHRASE_TEXT_UNIQUE_INDEX,
} from "@workspace/db/phrase-text";

type DbValueExports = { [K in keyof typeof Db]: unknown };

function throwingDb(): unknown {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(
          `dbMock: db.${String(prop)} was accessed, but this test did not ` +
            `override \`db\`. Pass createDbMockExports({ db: { ... } }) with ` +
            `the query stubs the code under test needs.`,
        );
      },
    },
  );
}

export function createDbMockExports(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = {
    // Runtime handles.
    db: throwingDb(),
    pool: { end: async () => {}, query: async () => ({ rows: [] }) },

    // Tables — inert sentinels, must track the schema barrel exactly.
    attemptsTable: {},
    badgesTable: {},
    categoriesTable: {},
    chachaEncountersTable: {},
    chatTurnsTable: {},
    contactSubmissionsTable: {},
    dailyQuizCompletionsTable: {},
    dailyQuizzesTable: {},
    familyPlansTable: {},
    familySeatsTable: {},
    friendInvitesTable: {},
    friendshipsTable: {},
    gameSessionsTable: {},
    languagesTable: {},
    lessonGenerationsTable: {},
    lessonGroupProgressTable: {},
    lessonGroupsTable: {},
    lessonGroupTestoutsTable: {},
    lessonsTable: {},
    phraseReportsTable: {},
    phrasesTable: {},
    referralRedemptionsTable: {},
    scriptTraceProgressTable: {},
    signalWavesTable: {},
    ttsCacheTable: {},
    userAbilityTable: {},
    userItemMemoryTable: {},
    usersTable: {},
    xpLedgerTable: {},
    zoneConversationStampsTable: {},
    zoneTestoutsTable: {},
    tokenLedgerTable: {},
    userTokenStateTable: {},
    insertTokenLedgerSchema: {},
    insertUserTokenStateSchema: {},

    // Insert schemas and misc consts exported by the barrel.
    insertAttemptSchema: {},
    insertCategorySchema: {},
    insertLanguageSchema: {},
    insertLessonGroupProgressSchema: {},
    insertLessonGroupSchema: {},
    insertLessonGroupTestoutSchema: {},
    insertZoneTestoutSchema: {},
    insertLessonSchema: {},
    insertPhraseReportSchema: {},
    insertPhraseSchema: {},
    lessonGenerationKindEnum: {},
    PHRASE_REPORT_REASONS: [],

    // Phrase-text normalization: the real implementations, not stubs. They are
    // pure string helpers the barrel re-exports, and callers under test rely
    // on them agreeing with the database's unique index.
    normalizePhraseText,
    isDuplicatePhraseTextError,
    PHRASE_TEXT_UNIQUE_INDEX,
  } satisfies DbValueExports;

  return { ...base, ...overrides };
}
