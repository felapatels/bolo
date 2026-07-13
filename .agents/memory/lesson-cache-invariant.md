---
name: Lesson cache invariant
description: Rules for the AI-generated lesson cache so a failed generation can never serve a permanently broken (empty) lesson.
---

# Lesson cache invariant

AI-generated lessons for a (language_code, category_id) pair are cached in
`lessons` + `phrases` and reused forever. Two rules keep that cache from ever
serving a broken lesson:

1. **Insert the lesson row and its phrases atomically** (one DB transaction). A
   partial write that commits a `lessons` row with zero `phrases` is a poisoned
   entry that would then serve empty on every future open.
2. **Never serve a cached lesson that has zero phrases.** Treat an empty cached
   lesson as poisoned: (re)generate and fill it (reuse the existing lesson id,
   lock it `FOR UPDATE` so concurrent recoveries don't double-insert).
3. **Let generation failure propagate before any DB write** so nothing is cached
   and the caller can surface a retry-able error; a later open then succeeds.

**Why:** generation is a network AI call that can fail or (historically) leave a
half-written lesson. Without these rules a single bad generation would brick a
topic forever with no recovery path.

**How to apply:** any change to lesson creation / caching (currently
`getOrCreateLessonPhrases`) must preserve all three. The generator is injected as
a parameter (default = real `generateLesson`) purely so this behavior can be
tested without OpenAI.
