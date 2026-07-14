---
name: Active language cross-device sync
description: How the active learning language stays in sync between a device's local store and the server account.
---

# Active language cross-device sync

The active learning language is server-authoritative for cross-device sync
(persisted via `activeLanguage` on `PATCH /account/preferences`, returned by
`GET /account`), but each client keeps a local mirror (mobile: AsyncStorage
`bolo.activeLang`; web: localStorage same key) so the choice applies instantly
and survives offline.

**Rule:** reconcile server → local exactly once per session, and only *after*
the local store has hydrated. A choice saved on another device wins; if the
account has never recorded one, seed it from the local value.

**Why:** if you reconcile before the async local load finishes, the local
hydration lands *after* and clobbers the freshly-adopted server value — silently
undoing cross-device sync. Gate reconciliation on a `hydrated` flag.

**How to apply:**
- Mobile: `contexts/LanguageContext.tsx` gates a one-shot reconcile on both
  `hydrated` (AsyncStorage load done) and `account.data`. `setActiveLang` writes
  local + fires a background `PATCH` (failure swallowed — local still drives the
  session). Adopting the server's own value uses a local-only path (no push-back
  loop). Entitlement/validity corrections go through `setActiveLang` so the fix
  also syncs up.
- Web (`gujarati-coach`): the account page pushes on change, but the web
  `LanguageContext` does NOT yet reconcile *from* the server on load — so web
  only propagates changes outward, it doesn't adopt another device's choice on
  launch.
