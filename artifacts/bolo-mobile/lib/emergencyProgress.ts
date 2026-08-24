// What this phone knows about the Emergency. Twin of the web's
// src/lib/emergency-progress.ts, and the KEYS ARE DELIBERATELY IDENTICAL so the
// two files stay readable side by side even though they can never share a
// store.
//
// ASYNC, unlike the web twin, and that is the one real difference. AsyncStorage
// returns promises where localStorage does not, so callers have to read the
// flag in an effect and hold it in state. Everything else about the rules is
// the same and is documented once, on the web file:
//
//   SEEN unlocks Skip, and is set when the film REACHES ITS END rather than
//   when it starts. A learner who backgrounds the app a second into the
//   mandatory first showing has not watched it.
//
//   PASSED records that the drill has been cleared.
//
//   NOT KEYED ON LANGUAGE. The film and the interruption are the same in every
//   language and only the five phrases differ; keying per language would replay
//   the mandatory showing on a language switch, which reads as a bug.
//
// Every call is wrapped. AsyncStorage throws on a full disk and on some
// Android OEM builds, and a storage failure must never take a game down with
// it. A failed read is "never seen", which keeps the first showing mandatory:
// erring toward showing the film is the safe direction, because the opposite
// silently hands out a skip.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'bolo.emergency';

function key(journey: number, zone: number, fact: 'seen' | 'passed'): string {
  return `${PREFIX}.${fact}.j${journey}z${zone}`;
}

async function read(k: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(k)) === '1';
  } catch {
    return false;
  }
}

async function write(k: string): Promise<void> {
  try {
    await AsyncStorage.setItem(k, '1');
  } catch {
    /* best effort; the in-session state still applies */
  }
}

/** Has the film for this zone ever been watched to the end? */
export function hasSeenEmergency(journey: number, zone: number): Promise<boolean> {
  return read(key(journey, zone, 'seen'));
}

/** Call when the film ENDS, never when it starts. */
export function markEmergencySeen(journey: number, zone: number): Promise<void> {
  return write(key(journey, zone, 'seen'));
}

/** Has this zone's drill ever been cleared? */
export function hasPassedEmergency(journey: number, zone: number): Promise<boolean> {
  return read(key(journey, zone, 'passed'));
}

/** Call on a win, never on a loss. */
export function markEmergencyPassed(journey: number, zone: number): Promise<void> {
  return write(key(journey, zone, 'passed'));
}
