---
name: Mascot outfits (Chai sink)
description: How a bought outfit reaches every mascot surface, why ownership and equipped state are stored differently, and the test traps the crossfading mascot sets.
---

## Ownership is a ledger row; "wearing" is a column

An outfit is bought once with Chai and owned forever. Ownership is derived by
reading back a single spend ledger row whose refId is `outfit:<id>` — server-
minted, never client-supplied — so a reinstall or a brand-new client changes
nothing. What the bird is currently WEARING is a separate nullable column on the
user's token-state row; unequipping clears it and never touches the ledger.

**Why:** the generic token-spend route mints a timestamp refId when the client
omits one, which cannot dedupe a replay. A sink that must charge once ever
needs its own route with a derived refId, plus a `FOR UPDATE` lock on the
token-state row taken BEFORE ANY of the decision reads (the unique ledger index
dedups replays of the SAME item, not two different items racing one balance).

**Ownership must be read AFTER the lock, not before.** Reading it first looks
harmless — it is only an early exit — but a second request for the same item
that read "not owned" and then queued on the lock wakes to the winner's debited
balance and refuses for insufficient funds something the learner already owns.
Every read that feeds the decision belongs inside the serialised view. Witness
it with a held-lock test: hold the row in one transaction, start the racer,
commit the winning purchase, then release.

**How to apply:** any future once-ever cosmetic sink follows the same shape —
own route, derived refId, insert `onConflictDoNothing`, debit after. Refusals
are 409 (`insufficient_tokens`, `<thing>_not_owned`), never 402: a cosmetic is
not a plan boundary and must not raise an upgrade prompt.

## Resolution by pose + outfit, in one resolver per platform

Surfaces render the mascot component and know nothing about outfits; the
component asks a single resolver for `(pose, outfit)` and falls back to
canonical art whenever the outfit does not ship that pose. Mobile has TWO
renderers (the plain mascot and the talking one) — a change to one is only half
the job. Mobile asset maps must be literal `require()` strings (Metro resolves
at build time). The canonical-mascot rule still holds: an outfit is an
owner-supplied alternate set of the SAME poses, never new art.

The equipped value rides the existing wallet/token query through a context
provider that defaults to null outside the provider, so signed-out chrome and
unit tests render canonical Bolo. Mutations must invalidate BOTH the outfit
catalog and the token query keys, or the shop updates while the rest of the app
stays undressed.

## Test traps

- The mascot CROSSFADES: mid-transition both the outgoing and incoming images
  are mounted, and DOM order does not tell you which is which (the exiting node
  keeps its slot). Do not assert "first" or "last" image after an interaction —
  stub the mascot to report its `outfit` prop and pin the real component
  separately at fresh mount.
- Bolo is decorative art with an empty alt, so he has no `img` ROLE — query him
  by tag or testid.
- Adding a provider to the authed layout breaks every mobile test whose
  full-replacement `@workspace/api-client-react` mock lacks the hook and its
  query-key helper; patch those factories in the same pass.
- Both Chai glyph censuses (web and mobile `chai-stall.test.tsx`) count
  `<ChaiGlyph` per file and must list any new Chai surface.
