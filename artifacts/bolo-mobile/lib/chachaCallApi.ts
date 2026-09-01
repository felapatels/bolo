import { getConfiguredAuthToken, getConfiguredBaseUrl } from '@workspace/api-client-react';

/**
 * The client for Chacha-ji's call.
 *
 * HAND-ROLLED RATHER THAN GENERATED, DELIBERATELY. The call routes are in
 * lib/api-spec/openapi.yaml since build 20 (this client predates that, and
 * was written while the spec owed them), so orval hooks exist for them now.
 * This file stays because the turn is two requests with a streaming header
 * between them, which is not a shape a react-query mutation models well, and
 * because it uses the generated client's OWN base URL and token getter, so
 * there is one source of both and nothing here can drift from the rest of the
 * app. The types below mirror the spec's ChachaCall* schemas; the spec is the
 * contract, so change it first.
 *
 * THE TURN IS TWO REQUESTS AND THAT IS NOT AN OVERSIGHT. The POST answers in
 * about 30 ms with a URL so the player can start pulling before the model has
 * said a word; his WORDS are not known at that moment, and React Native's
 * fetch cannot stream a response body to deliver them later. So the captions
 * come from a second request that BLOCKS until the turn is recorded. Two
 * requests, no polling loop, and the learner hears him at about one second
 * instead of three.
 */

export interface CallBeat {
  id: string;
  index: number;
  /** His words, in the language this call is fixed to. */
  text: string;
  /**
   * The romanization beneath them. Null when the script cannot be
   * transliterated honestly, and null when it would only repeat the line.
   *
   * CANNED BEATS CARRY ONE NOW. They used to be a single Hinglish string in
   * Latin letters, so there was nothing to transliterate; his hello and his
   * farewell are in the learner's own script since 2026-08-28.
   */
  romanized: string | null;
  english: string | null;
  canned: boolean;
  isFinal: boolean;
}

export interface CallBackdrop {
  id: 'driving' | 'backseat';
  video: string;
  poster: string;
  seconds: number;
}

/**
 * TWO CALLS, NOT ONE. `journey` is the unsolicited interruption: five questions
 * and he says goodbye, bounded because nobody asked for it. `game` is the one
 * on the games hub, chosen as often as the learner likes and capped at twenty
 * turns. Defaulting to `journey` is the safe direction: the shorter call.
 */
export type CallMode = 'journey' | 'game';

export interface CallStart {
  callId: string;
  mode: CallMode;
  /**
   * The language the call is FIXED to, for the line under the clock. From the
   * session rather than the client's live context: the call is pinned at
   * creation so a learner switching language mid-call keeps talking to the same
   * Chacha-ji, which makes the current context the wrong answer in exactly the
   * case this line exists for.
   */
  languageName?: string | null;
  beat: CallBeat;
  backdrop: CallBackdrop;
  learnerTurns: number;
  /**
   * Whether the phone may show the learner their own camera. A server flag,
   * so it can be turned off without a build; absent and false both mean off,
   * and nothing on the phone may default it on ("i don't want the camera in
   * the call", 1.0.5 build 520). Optional here for a server older than the
   * field; the spec marks it required.
   */
  selfView?: boolean;
  audioBase64: string | null;
  format: string | null;
}

export interface CallTurnStarted {
  callId: string;
  audioUrl: string;
}

export interface CallTurnResult {
  index: number;
  text: string;
  romanized: string | null;
  canned: boolean;
  /**
   * What the server heard the learner say, in the language's own script.
   *
   * MIRRORED ON SCREEN SINCE 2026-08-28, with the romanization and a plain
   * English reading beside it (owner: "I want to see what was captured when i
   * spoke, romanized native script" and "and english meaning"). It is a mirror,
   * never a mark: nothing compares it to anything and there is no verdict here.
   */
  heard: string;
  heardRomanized?: string | null;
  heardEnglish?: string;
  next: { id: string; index: number; canned: boolean } | null;
  over: boolean;
  /**
   * Chai credited for the turn the learner just answered, journey calls only.
   * Server-authoritative and only ever non-zero when THIS request was the one
   * that inserted the ledger row, so a retried turn cannot show a second "+1"
   * for chai nobody received.
   */
  chaiEarned?: number;
  /**
   * XP credited for that turn, GAME calls only. One currency each: chai is
   * what he gives you for picking up when HE rang, XP is what every other game
   * on the hub pays for playing it (owner, 2026-08-28).
   */
  xpEarned?: number;
  /**
   * Whether he heard the learner say anything at all.
   *
   * SENT EXPLICITLY RATHER THAN INFERRED FROM `heard`, which is a transcript
   * and can be empty for a dozen reasons. It is what decides whether the turn
   * earned, so the client must not be second-guessing it. Optional so an older
   * server simply leaves the miss unreported instead of one being invented.
   */
  heardSomething?: boolean;
}

export interface CallEnded {
  callId: string;
  outcome: 'answered' | 'abandoned';
  turns: number;
  text: string;
  romanized: string | null;
  english: string | null;
  audioBase64: string | null;
  format: string | null;
}

export class CallApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'CallApiError';
    this.status = status;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getConfiguredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * THE API IS MOUNTED AT /api AND THE BASE URL IS ONLY THE DOMAIN.
 *
 * app.ts does `app.use("/api", router)`, and the generated client carries the
 * prefix in each operation path (`/api/healthz`, `/api/languages`) rather than
 * in the base. This client has to do the same.
 *
 * It did not, for a while, and the failure would have been horrible to read:
 * every request would have gone to https://<domain>/openai/... , missed the API
 * entirely, hit the web app's catch-all, come back 200 with a page of HTML, and
 * died in res.json() as a parse error. It looked like a working client because
 * nothing on this Mac ever pointed at a real server: Metro here runs without
 * EXPO_PUBLIC_DOMAIN, so setBaseUrl is never called and every call failed at
 * `base()` long before the path mattered.
 */
const API_PREFIX = '/api';

function base(): string {
  const b = getConfiguredBaseUrl();
  if (!b) throw new CallApiError(0, 'API base URL is not configured');
  return b;
}

/** Headers a progressive-audio GET needs. Exported because playStreamingAudio
 * fetches that URL itself and has to carry the session with it. */
export async function callAudioHeaders(): Promise<Record<string, string>> {
  return authHeaders();
}

/**
 * Absolute URL for a path the server handed back relative.
 *
 * The audio URL comes back as `/openai/chat/audio/<id>`, which is the path
 * WITHIN the api router, so it needs the same prefix everything else does.
 */
export function absoluteCallUrl(path: string): string {
  return `${base()}${API_PREFIX}${path}`;
}

async function request<T>(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<T | null> {
  const res = await fetch(`${base()}${API_PREFIX}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(await authHeaders()),
      ...(init.headers ?? {}),
    },
  });
  // 204 is a real answer on the caption route: the turn is not ready and the
  // client shows no caption rather than an error over a call it can still hear.
  if (res.status === 204) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new CallApiError(res.status, detail || `Call request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/**
 * Wake the server before the learner taps Answer.
 *
 * THE DEPLOYMENT SCALES TO ZERO. `.replit` sets deploymentTarget "autoscale",
 * and the boot measured off the deploy log on 2026-09-01 is
 *
 *     +0.0s   process starts, /api returns 500
 *     +8.5s   server listening
 *     +23s    startup seeding pipeline finishes
 *
 * A learner who calls into that window gets "Chacha-ji could not get through",
 * which is what the owner hit on TestFlight build 533; a second attempt minutes
 * later worked with nothing changed. The call screen rings for a few seconds
 * before Answer is even possible, so that ringing is free time to spend waking
 * the container.
 *
 * Fire and forget on purpose: this is a head start, never a gate. If it fails
 * the call proceeds exactly as it did, and startCall's own retry is the thing
 * that actually has to hold.
 */
export function warmCallServer(): void {
  void fetch(`${base()}${API_PREFIX}/healthz`, { method: 'GET' }).catch(() => {});
}

/**
 * Retry a cold or flaky start, because ONE failure here ends the call outright.
 *
 * Only worth retrying what a cold container actually produces: a thrown fetch
 * (connection refused or reset while the port is not open yet) and a 5xx. A 401
 * or any other 4xx is a real answer and retrying it just delays the truth by a
 * couple of seconds.
 */
const RETRYABLE_START_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [700, 1600];

function worthRetrying(err: unknown): boolean {
  if (err instanceof CallApiError) return err.status >= 500;
  return true; // a network throw, which is what a closed port looks like
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** He rings. Returns his canned hello, already synthesized. */
export async function startCall(mode: CallMode = 'journey'): Promise<CallStart> {
  let last: unknown;
  for (let attempt = 0; attempt < RETRYABLE_START_ATTEMPTS; attempt++) {
    try {
      return await startCallOnce(mode);
    } catch (err) {
      last = err;
      if (!worthRetrying(err) || attempt === RETRYABLE_START_ATTEMPTS - 1) throw err;
      await wait(RETRY_BACKOFF_MS[attempt] ?? 1600);
    }
  }
  throw last;
}

async function startCallOnce(mode: CallMode): Promise<CallStart> {
  return (await request<CallStart>('/openai/chacha-call/start', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  }))!;
}

/**
 * The learner's clip goes up; an audio URL comes straight back.
 * `X-Audio-Stream: url` is what asks for the fast shape.
 */
export async function sendTurn(
  callId: string,
  audioBase64: string,
  format: 'wav' | 'mp3' = 'wav',
): Promise<CallTurnStarted> {
  return (await request<CallTurnStarted>(
    `/openai/chacha-call/${callId}/turn`,
    {
      method: 'POST',
      headers: { 'X-Audio-Stream': 'url' },
      body: JSON.stringify({ audioBase64, format }),
    },
  ))!;
}

/**
 * His words for one turn. BLOCKS on the server until they exist, so this is a
 * single request rather than a poll. Null when the server gave up waiting, in
 * which case the caption stays empty and the call carries on.
 */
export async function fetchTurn(
  callId: string,
  index: number,
): Promise<CallTurnResult | null> {
  return request<CallTurnResult>(`/openai/chacha-call/${callId}/turn/${index}`);
}

/** Hang up. Returns his canned farewell. */
export async function endCall(callId: string): Promise<CallEnded> {
  return (await request<CallEnded>(`/openai/chacha-call/${callId}/end`, {
    method: 'POST',
  }))!;
}
