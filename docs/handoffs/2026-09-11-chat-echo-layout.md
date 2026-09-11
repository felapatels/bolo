# India chat echo rejection and loading layout — 2026-09-11

Owner requested the same chat fixes as SEA while SEA publishes. Source:
SEA commit 854933e24a112fdc35bd1c3738235d25660a2862. This is a surgical port
of its chat changes, not a wholesale cherry-pick: that commit also contains
SEA currency purchases, river art and video assets, which do not belong here.
The shared ledger entry for 854933e2 was reviewed before editing.

## Changes

- parrotChat.ts: exact normalized matching rejects the complete romanized,
  native or combined seed list even if STT omitted the language-name prefix.
  At least three distinct supplied seed entries are required. Normal short
  greetings, sentences containing seed words and typed text remain accepted.
  This returns existing noSpeech/hint_echo before transcript SSE, reply, TTS,
  usage billing or memory extraction. No wire names or schema changed.
- Mobile chat.tsx: both recorded-audio reply branches handle noSpeech by
  removing the pending placeholder, releasing the turn and showing the
  existing friendly cant-hear line. No blank learner/parrot turn is appended.
  Existing stale-turn guards and India's mic-metering protection are retained.
- Mobile top layout: replace India's fixed TipCard perch-clearance patch with
  SEA's normal-layout mascot/status band. It grows with first-answer text and
  playback controls; TipCard and transcript follow it. Removed absolute
  positioning/header measurement and compensating transcript margin. The
  actual layout band, style blocks and both no-speech branches match SEA.

India's consent controls, iPad microphone-ring sizing, Chai naming, voice
settings and other region-specific behavior are preserved. The pre-existing
app.json modification was present at start and remains byte-for-byte unchanged.
No other repo was edited for this port.

## Validation and delivery

Mobile and API typechecks passed (their package scripts use tsc --noEmit).
Diff whitespace check passed. Compared relevant source blocks with SEA and
confirmed identical layout/no-speech logic and transcript validator. Added the
SEA echo/valid-speech/typed-input regression definitions plus a Hindi
romanized/native echo case. No tests or suites executed under the owner's
explicit typecheck-only instruction. India simulator playback and silent-hold
behavior have not been exercised against a deployed updated API.

Owner authorized pushing this chat-only port. Backend deployment is needed for
the echo filter; mobile reload/build is needed for response handling/layout.
The delivery commit and SEA source are recorded in the shared ledger.
The affected test definition is parrotChat.test.ts; chat UI regression files
remain relevant to future testing. No universal speech detection guarantee:
noise above the existing mic threshold can still require server rejection.
