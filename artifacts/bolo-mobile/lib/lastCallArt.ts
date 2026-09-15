// LAST CALL'S ART, AS METRO ASSETS.
//
// Art pass, 2026-09-14. Which passenger has which sign box, and the rotation,
// live in @workspace/script-trace (last-call-passengers.ts) so web and mobile
// agree; this file only turns an id into a bundled asset, because require()
// has to be written literally for Metro to find the file.
//
// Web twin: gujarati-coach src/lib/last-call-art.ts (public URLs).
import type { LastCallPassengerId } from '@workspace/script-trace';

/** The first-person doorway film. 1080x1920, 3.54s, silent, cut as a seamless loop. */
export const LAST_CALL_FILM = require('../assets/games/last-call/last-call-platform.mp4') as number;
/** The film's frame 0: the poster under the film, and the whole backdrop under Reduce Motion. */
export const LAST_CALL_POSTER = require('../assets/games/last-call/last-call-platform.jpg') as number;
export const LAST_CALL_FILM_W = 1080;
export const LAST_CALL_FILM_H = 1920;

export const LAST_CALL_PASSENGER_ART: Record<LastCallPassengerId, number> = {
  grandmother: require('../assets/games/last-call/passenger-grandmother.webp') as number,
  student: require('../assets/games/last-call/passenger-student.webp') as number,
  businessman: require('../assets/games/last-call/passenger-businessman.webp') as number,
  schoolgirl: require('../assets/games/last-call/passenger-schoolgirl.webp') as number,
  farmer: require('../assets/games/last-call/passenger-farmer.webp') as number,
  mother: require('../assets/games/last-call/passenger-mother.webp') as number,
};
