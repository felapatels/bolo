---
name: api-client mock factories
description: Shared per-platform mock helpers for @workspace/api-client-react tests — the rule, why, and migration traps.
---

# api-client mock helpers

**The rule:** Never full-replacement-mock `@workspace/api-client-react` inline in a test file. Each platform has ONE shared test helper exporting idle-safe defaults for every hook; test factories spread it and override only what they exercise. The helpers are typed exhaustively (`satisfies` over the client's export keys), so a hook added to the client without a helper entry is a typecheck error on BOTH platforms — update both helpers, not just the one whose screens use the hook.

**Why:** Full-replacement factories made every new hook import in a shared screen break dozens of test files at mock-init time.

**How to apply:** New client hook → add an idle default + its QueryKey entry to each platform's helper.

**Traps:**
- Scripted whole-file rewrites of test files can corrupt multiline bodies. After any scripted migration, run the full suite — transform errors are the tell.
- RNTL v13 skips aria-hidden subtrees; queries that pass on web may find nothing on mobile.
