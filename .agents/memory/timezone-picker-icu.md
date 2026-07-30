---
name: Timezone picker & ICU legacy ids
description: Why "Kolk" found Srednekolymsk — ICU emits Asia/Calcutta, and cmdk's default fuzzy scorer matches subsequences; the fix pattern lives in the web TimezoneSelect.
---

- `Intl.supportedValuesOf('timeZone')` here (417 zones) emits DEPRECATED CLDR ids: Asia/Calcutta not Asia/Kolkata, Europe/Kiev, Asia/Saigon, Asia/Rangoon, Asia/Katmandu, Atlantic/Faeroe, America/Godthab, Pacific/Truk, Pacific/Ponape. Modern spellings still RESOLVE in `Intl.DateTimeFormat` — they're just absent from the enumeration.
- cmdk's default `Command` filter is a subsequence fuzzy scorer: "Kolk" matched Asia/Srednekolymsk (K…OL…K) while the real city had no substring present at all.
- **Fix pattern (shipped in web `timezone-select.tsx`):** modernize ids via an alias map (keep the legacy id as a search keyword), and pass a substring-only `filter`: city-segment prefix (1) > city substring (0.85) > anywhere substring (0.6) > 0, underscores≡spaces. Exported + unit-tested; empirically Kolk→Asia/Kolkata, New→America/New_York, Lond→Europe/London as sole/top hits.
- **How to apply:** any future timezone UI (e.g. mobile account currently has a bare text input) must reuse `canonicalTimezone`/`timezoneMatchScore` — and any cmdk combobox over ids/codes should suspect the default fuzzy scorer when search results look absurd.
