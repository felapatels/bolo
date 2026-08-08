-- Data migration, no DDL.
--
-- The pagdi shipped before Bolo had a head slot, so anyone already wearing it
-- is wearing it out of the GARMENT slot. The clients now resolve a garment as
-- the base pose image and an accessory as an overlay, so that stale value
-- renders the hat as a whole-bird costume and blocks them from wearing an
-- outfit with it. Re-home it once.
--
-- Guarded on the accessory slot being empty so this can never overwrite a
-- choice made after the two-slot release.
UPDATE "user_token_state"
SET "equipped_accessory" = 'pagdi',
    "equipped_outfit" = NULL
WHERE "equipped_outfit" = 'pagdi'
  AND "equipped_accessory" IS NULL;
