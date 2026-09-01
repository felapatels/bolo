import { startCall, warmCallServer } from '@/lib/chachaCallApi';

jest.mock('@workspace/api-client-react', () => ({
  getConfiguredBaseUrl: () => 'https://bolo-india.app',
  getConfiguredAuthToken: async () => 'tok',
}));

/**
 * THE COLD START, and why one failed fetch must not end a call.
 *
 * `.replit` sets deploymentTarget "autoscale", so the container scales to zero.
 * The boot measured off the deploy log on 2026-09-01 is
 *
 *     +0.0s   process starts, /api returns 500
 *     +8.5s   server listening
 *     +23s    startup seeding pipeline finishes
 *
 * The owner answered into that window on TestFlight build 533 and got "The call
 * ended. Chacha-ji could not get through". A second attempt minutes later
 * worked, on the same binary and the same server, with nothing changed.
 *
 * Everything else was ruled out against production while it was broken: the
 * route is deployed (401 unauthenticated), tts_cache.spoken_text exists, his
 * Hindi hello is cached under the digest the code computes today, and the
 * server does return the backdrop the client reads. What was left was timing.
 *
 * These pin the two halves of the fix. They matter more than most: the call is
 * MOBILE ONLY, there is no /call route in the web app at all, so no browser
 * session will ever exercise this and nobody will notice by accident.
 */
describe('chacha call survives a cold server', () => {
  const ok = {
    callId: 'c1',
    languageName: 'Hindi',
    languageCode: 'hi',
    backdrop: { id: 'driving' },
    beat: { id: 'hello', index: 0, text: 'namaste', romanized: 'namaste' },
  };
  const jsonOk = () =>
    Promise.resolve({ ok: true, status: 200, json: async () => ok } as unknown as Response);
  const status = (code: number) =>
    Promise.resolve({
      ok: false,
      status: code,
      text: async () => 'boom',
    } as unknown as Response);

  afterEach(() => jest.restoreAllMocks());

  it('retries a closed port and gets the call up', async () => {
    // What a container with no port open actually looks like from the client:
    // fetch rejects outright rather than answering.
    const fetchMock = jest
      .fn()
      .mockReturnValueOnce(Promise.reject(new TypeError('Network request failed')))
      .mockReturnValueOnce(jsonOk());
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(startCall('journey')).resolves.toMatchObject({ callId: 'c1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 5xx from a half-booted server', async () => {
    const fetchMock = jest
      .fn()
      .mockReturnValueOnce(status(500))
      .mockReturnValueOnce(status(502))
      .mockReturnValueOnce(jsonOk());
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(startCall('game')).resolves.toMatchObject({ callId: 'c1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  /**
   * A 401 IS AN ANSWER, NOT A COLD SERVER. Retrying it would delay the truth by
   * a couple of seconds and tell the learner nothing new, and this is the case
   * that separates "the server is waking up" from "you are not signed in".
   */
  it('does not retry a 401', async () => {
    const fetchMock = jest.fn().mockReturnValue(status(401));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(startCall()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up rather than retrying forever', async () => {
    const fetchMock = jest.fn().mockReturnValue(status(503));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(startCall()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  /**
   * The warm ping is fire and forget BY DESIGN: it runs while he rings, and a
   * failure there must never surface or block, because the retry above is what
   * actually has to hold. A throw from this would take down the call screen it
   * was added to protect.
   */
  it('warms the server without throwing when the ping fails', () => {
    global.fetch = jest
      .fn()
      .mockReturnValue(Promise.reject(new Error('still down'))) as unknown as typeof fetch;
    expect(() => warmCallServer()).not.toThrow();
  });

  it('warms an unauthenticated health path under /api', () => {
    const fetchMock = jest.fn().mockReturnValue(jsonOk());
    global.fetch = fetchMock as unknown as typeof fetch;
    warmCallServer();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://bolo-india.app/api/healthz',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
