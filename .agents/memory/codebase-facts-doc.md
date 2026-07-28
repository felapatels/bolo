---
name: Codebase facts document
description: Standing user instruction to maintain docs/CODEBASE-FACTS.md after every task.
---

- `docs/CODEBASE-FACTS.md` is the user's living reference for the BOLO codebase (repo layout, schema, business rules, file paths, working rules).
- **Rule:** at the end of EVERY task, update it with what changed — new files, new components, new behavioral rules, resolved debt, new debt.
- Section numbering is stable and must not change; append within existing sections.
- **Why:** the user pastes its sections at the top of every spec so agents don't re-derive state; a stale entry means the next spec is written against wrong facts.
- Its §9 "Working rules for the agent" (no auto test runs per edit, verify edits by reading back, optional response fields, never decode evaluationToken, one date-bucketing impl, STOP on file/line mismatch) are binding during spec work.
