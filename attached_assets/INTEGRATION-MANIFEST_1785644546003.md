# PRE-BUILT WORK PACKAGE: Integration Manifest

Authored outside the workspace so agents place, wire, and gate rather than
design and write. One rule governs all of it: NO full suite runs during
implementation. Typecheck plus targeted tests on new or touched files while
building; exactly ONE full gate (web suite, api canonical, boot smokes,
tripwire) at the END of each chunk. Real-browser or device checks only where
a chunk's gate names them.

## Files in this package

1. chunk1-error-copy-deck.md
   Chunk 1 item 3. Complete railway-voice replacement strings. Agent work:
   locate surfaces, swap strings verbatim, flag any surface with no entry
   rather than improvising. Pairs with the dark-mode contrast sweep (item 1)
   so each card is touched once.

2. chunk1-iosAudio.ts
   Chunk 1 items 4a and 4c, drop-in. Agent work: place in the web lib, call
   primeAudioUnlock from session-entry gesture handlers, add the play().catch
   tap-to-hear fallback, mount the hint per the notes, and separately answer
   item 4b (which API plays coach audio; migrate to an audio element only if
   it is Web Audio today).

3. chunk2-crossScript.ts
   Chunk 2 Stage A, drop-in server module. Agent work: add the sanscript dep
   to api-server if absent, wire normalizeForComparison before similarity as
   a rescue-only max(), add the listed pins, log rescues. The perso-arabic
   limit is documented inside; record it in CODEBASE-FACTS verbatim.

4. chunk5-tokens/token-economy-prebuilt.md
   Chunk 5. Config, schema, service, routes, openapi additions, hook wiring
   table, and the test list. Agent work: place files, GENERATE the migration
   (0033 lesson), one-line dbMock addition, wire the five hooks at its own
   inventoried sites plus the XP-path multiplier, codegen, then the web
   surfaces per the original slice-1 spec (balance chip, spend surfaces,
   section 4.5 vignette with the Chaiwala asset). Tests authored per the
   list, executed at the gate only.

5. chunk6-journey-engagement-spec.md
   Chunk 6, the full design spec. Agent work: Step 0 inventory, STOP for the
   one placement ruling, then build. No authoring of stories needed.

## Not in this package, deliberately
- Chunk 2 Stage B (scoring v2): the brief is already approved and its rubric
  must come verbatim from the repo spec doc; authoring it here risks
  divergence. Gated on calibration passing.
- Chunk 3 (release ops): operational, not authorable.
- Chunk 4 (zone test-out): its spec is being drafted by the planning agent
  from the ten rulings; do not duplicate.
- Chunk 7 (debts): too codebase-entangled to pre-author safely.

## Chunk gate order (unchanged)
Current queue (harvest, calibration) drains first. Then: Chunk 1 gate,
Chunk 2A gate (with 2B firing on calibration pass), Chunk 3 operations,
Chunk 4, Chunk 5 gate, Chunk 6 design STOP then build gate, Chunk 7 batches.
#997 releases in parallel at any point after the queue drains.
