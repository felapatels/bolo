---
name: Publish schema diff source
description: How Replit publish computes the prod schema delta for this repo, and the FK-ordering bug
---
The publish schema sync's delta includes committed-but-unapplied migrations, so it appears to read the committed drizzle migration chain, not only the live dev DB.
**Why:** Staging a migration by committing it unapplied (0027 FK re-add) kept the ADD CONSTRAINT in the publish delta and publish 1 failed repeatedly; removing it from the tree made publish succeed.
**How to apply:** Never stage a migration by leaving it unapplied. To exclude something from a publish delta, it must be out of the migration tree entirely (preserve via git history). Separately: the diff engine ordered a composite FK before the unique constraint it references (support ticket filed July 29, 2026; publishing blocked pending response). Migration-stage publish failures produce NO deployment logs; the generated-migrations panel in the Publish UI is the only pre-flight visibility. explainSchemaDiff persistently failed here ("cancelled by client").
