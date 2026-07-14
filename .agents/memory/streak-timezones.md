---
name: Streak time-zone bucketing
description: How streak/"today" day math uses the learner's stored IANA time zone
---

Streaks and "attempts today" bucket by the learner's *local* calendar day, not UTC.

- `users.timezone` (nullable IANA name) is the stored zone; null falls back to UTC.
- Validation happens only at write time (account preferences PATCH, via `Intl.DateTimeFormat` construction); day math trusts stored values and throws on garbage — no silent UTC fallback.
- `loadEntitlements` attaches `userTimezone` to the request so routes don't re-query.
- Day-walking uses pure "YYYY-MM-DD" string arithmetic (UTC-noon anchor) so DST never skips/double-counts a day.
- Clients auto-report the device zone (device wins) during the once-per-load account reconcile in each app's language context — nothing else writes it.

**Why:** an evening attempt in a negative-offset zone lands on the next UTC day, breaking streaks off-by-one.
**How to apply:** any new day-bucketed learner metric must use `localDayKey`/the stored zone, and any new users-table test DDL list needs the `timezone` column.
