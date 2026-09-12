# Compact mobile daily gift

Owner requested one horizontal resting row across all six mobile apps: gift art, reminder/range, and compact Shop button. Then requested larger gift art. The new DailyGiftRow component is identical across the six forks; regional cards supply their own artwork, currency range, claim callback and existing shop destination. Gift art uses an 80-point slot and retains tier artwork. Opened receipt/celebration content remains in the existing regional card.

A locked tap never calls the claim callback. It wiggles the box, then raises/scales the existing instruction and springs it back without moving the layout or taking the text offscreen. Repeated taps restart the sequence; unmount stops it. Reduce Motion skips animation while retaining the reminder, haptic and spoken accessibility announcement. Shopping is a separate 48-point touch target. India also distinguishes a pending claim from a locked gift.

All six mobile typechecks passed. No suites or release builds. India simulator row visually inspected, including the larger gift revision. Changes remain local for visual iteration; web and backend gift/economy logic are unchanged. Existing expanded receipt UI remains available after a successful claim.
