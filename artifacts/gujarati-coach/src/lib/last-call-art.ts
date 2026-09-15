// LAST CALL'S ART, AS PUBLIC URLS.
//
// Art pass, 2026-09-14. Which passenger has which sign box, and the rotation,
// live in @workspace/script-trace (last-call-passengers.ts) so web and mobile
// agree; this file only turns an id into a URL under public/games/last-call.
// BASE_URL is honoured for the same reason bazaar-welcome.tsx honours it: the
// app can be served under a sub-path.
//
// Mobile twin: bolo-mobile lib/lastCallArt.ts (Metro require()s).
import type { LastCallPassengerId } from "@workspace/script-trace";

const BASE = `${import.meta.env.BASE_URL}games/last-call/`;

/** The first-person doorway film. 1080x1920, 3.54s, silent, cut as a seamless loop. */
export const LAST_CALL_FILM_SRC = `${BASE}last-call-platform.mp4`;
/** The film's frame 0: the poster under the film, and the whole backdrop under Reduce Motion. */
export const LAST_CALL_POSTER_SRC = `${BASE}last-call-platform.jpg`;
export const LAST_CALL_FILM_W = 1080;
export const LAST_CALL_FILM_H = 1920;

export const lastCallPassengerSrc = (id: LastCallPassengerId): string => `${BASE}passenger-${id}.webp`;
