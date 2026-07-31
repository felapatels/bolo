---
name: "@workspace/db mock completeness"
description: The language-hint test mocks @workspace/db with a static namedExports list; adding schema tables without updating this mock breaks the test.
---

## Rule
Any test that uses `mock.module("@workspace/db", { namedExports: { ... } })` must include every table that the dynamically-imported route module's import line references.

## Why
`--experimental-test-module-mocks` serves the mock as the real module when the route is dynamically imported inside `before()`. The static named-binding check (ESM link-time) fails if the mock's namedExports doesn't declare the name — producing `SyntaxError: The requested module '@workspace/db' does not provide an export named '...'`.

This burned the language-hint test when `zoneConversationStampsTable` was added to `openai.ts`'s import line (Task #948) but not to the mock. The mock was written against an older schema.

## How to apply
- When adding a new table to any route that is dynamically imported by a mock-using test: also add `newTable: {}` to the mock's namedExports.
- The only file currently doing this: `artifacts/api-server/src/routes/openai.pronunciation.language-hint.test.ts` line 131.
- Known gaps in that mock (tables in schema but absent from mock): `dailyQuizCompletionsTable`, `dailyQuizzesTable`, `lessonGroupProgressTable`, `lessonGroupTestoutsTable`, `phraseReportsTable`, `scriptTraceProgressTable`, `userItemMemoryTable`.
- Phantom entry (in mock, removed from schema): `phraseScheduleTable`.
- Long-term fix: Task #922's release slot should introduce a shared `@workspace/db` mock factory so there's one place to update.
