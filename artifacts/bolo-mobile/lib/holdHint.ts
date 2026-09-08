/**
 * Has this learner ever actually HELD the record button?
 *
 * WHY THIS EXISTS. Reported from a real session on 2026-09-07: "everyone always
 * asks, now what do i do. or they tap the mic button and let go." The hint under
 * the button has read "Hold and say it out loud" since it was built, and people
 * still tap, because nobody reads a caption before they touch the thing it is
 * captioning. The first-run rings are what fixes that, and this flag is what
 * stops them running forever.
 *
 * SUCCESS IS THE ONLY THING THAT CLEARS IT. Not opening practice, not tapping,
 * not seeing the hint: a completed hold. Someone who taps five times and gives
 * up still gets the rings next session, which is the whole point of a hint.
 *
 * Per device via AsyncStorage, same pattern as lib/soundPref.ts. Client-local
 * and not synced: a learner on a new phone can have the reminder again, which
 * is cheap and correct rather than a bug.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const HOLD_HINT_KEY = 'bolo.hasHeldToRecord';

/** True once the learner has completed at least one hold-to-record gesture. */
export async function loadHasHeldToRecord(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HOLD_HINT_KEY)) === 'yes';
  } catch {
    // A storage failure must not pin the rings on forever: treat an unreadable
    // flag as "they know", because a returning learner seeing the hint again is
    // a smaller cost than a first-timer never seeing it is a win.
    return true;
  }
}

export async function markHasHeldToRecord(): Promise<void> {
  try {
    await AsyncStorage.setItem(HOLD_HINT_KEY, 'yes');
  } catch {
    // Best effort. The rings stop for this session either way, because the
    // component's own state has already moved.
  }
}
