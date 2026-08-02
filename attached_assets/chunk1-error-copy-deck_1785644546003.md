# Railway-Voice Error Copy Deck (Chunk 1, item 3)

Purpose: replace every off-voice error string (kitchen metaphors, generic tech-speak) with the railway voice. The agent's job is locating each surface and swapping strings, not writing copy. Rules: warm, second person, railway metaphor held lightly, never blames the user, never exposes technical detail, no em dashes, every card has a recovery action.

## Core error surfaces

LESSON FAILED TO LOAD (replaces "Bolo's chef is still cooking")
Title: The train's running a little late
Body: This stop didn't load. Give it another go and we'll get you boarded.
Primary: Try again | Secondary: Back to the journey

EVALUATION FAILED (scoring request errored, not nocatch)
Title: Signal trouble on the line
Body: We couldn't check that one. Nothing wrong with what you said, just a hiccup on our end.
Primary: Try again

NOCATCH (listener produced nothing usable; keep existing structure, refresh copy)
Title: Didn't catch that one
Body: The mic didn't pick you up clearly that time. Same phrase, one more go.
Tip: Get a little closer to the mic and speak at normal volume.

NETWORK OFFLINE
Title: We've lost the signal
Body: Looks like the connection dropped. Once you're back online, we'll pick up right where you left off.
Primary: Retry

COACH AUDIO FAILED TO PLAY
Title: The announcer's mic cut out
Body: The phrase audio didn't play. Tap to hear it again.
Primary: Play phrase

CHAT TURN FAILED
Title: Bolo missed that one
Body: Your message didn't get through. Send it again and Bolo will pick it right up.
Primary: Try again

MIC PERMISSION DENIED
Title: Bolo can't hear you yet
Body: Speaking practice needs the microphone. Turn it on in your browser or phone settings and come back; we'll be here.
Primary: How to enable | Secondary: Not now

RATE LIMITED (429, test-out throttle etc.)
Title: Catch your breath
Body: You've been moving fast. Take a short break; you can try this again in a few minutes.
(no button beyond dismiss; show Retry-After time if available: "Try again in {n} minutes")

GENERIC UNKNOWN
Title: A bump on the tracks
Body: Something went sideways on our end. It's not you. Try once more.
Primary: Try again

UPGRADE-REQUIRED (locked content 402; align with existing upsell voice, do not invent pricing claims)
Title: This stop needs an All-Access ticket
Body: You've reached content that comes with All-Access. Unlock every language and the full line whenever you're ready.
Primary: See All-Access | Secondary: Back to the journey

## Sweep instructions
1. Grep for the known offenders: chef, cooking, whip up, kitchen, glitched, "on us, not you" (keep the sentiment, use the new strings), and any Title Case tech words (Error, Failed) in user-facing cards.
2. Every replacement uses the exact strings above; if a surface exists that has no entry here, flag it in the report with its current copy rather than improvising.
3. Both themes checked for contrast while touching each card (pairs with item 1 of the chunk).
