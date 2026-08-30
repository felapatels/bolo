import { speakChachaLine, __resetChachaVoiceQueueForTests } from '@/lib/chachaVoice';
import { playBase64Audio } from '@/lib/audio';

/**
 * Task #1095: Chacha-ji's lines are queued, never overlapped.
 *
 * His three lines arrive from three unrelated events (dialog open, arrival
 * response, dismissal), so without a queue the gift would talk over the
 * greeting. These pin the ordering contract and the fail-silent behaviour —
 * this is flavour dialogue, so every failure path releases the queue rather
 * than stalling the lines behind it.
 */

jest.mock('@/lib/audio', () => ({
  playBase64Audio: jest.fn(),
}));

const clip = (id: string) => ({ audioBase64: id, format: 'mp3' });

/** Let queued promise callbacks run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Chacha-ji's line queue", () => {
  /** Resolves each playback by hand so we control when a line "ends". */
  let finishers: Array<() => void>;
  /** The player's own "sound is out" signal per line, captured for the last case. */
  let starters: Array<() => void>;
  let holdSound = false;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetChachaVoiceQueueForTests();
    finishers = [];
    starters = [];
    (playBase64Audio as jest.Mock).mockImplementation(
      async (_b64: string, _fmt: string, onDone: () => void, onStart?: () => void) => {
        finishers.push(onDone);
        starters.push(onStart ?? (() => {}));
        // The player reports sound at once in these tests, so the ordering
        // pins below read as they always did. The last case holds it back.
        if (!holdSound) onStart?.();
        return { stop: jest.fn() };
      },
    );
  });

  it('never starts a line while the previous one is still speaking', async () => {
    const started: string[] = [];
    speakChachaLine(clip('GREET'), { onStart: () => started.push('greeting') });
    speakChachaLine(clip('GIFT'), { onStart: () => started.push('gift') });
    await flush();

    // The gift is queued but silent: the greeting still has the floor.
    expect(started).toEqual(['greeting']);
    expect(playBase64Audio).toHaveBeenCalledTimes(1);

    finishers[0]();
    await flush();

    expect(started).toEqual(['greeting', 'gift']);
    expect((playBase64Audio as jest.Mock).mock.calls[1][0]).toBe('GIFT');
  });

  it('releases the queue when a line fails, so the ones behind it still speak', async () => {
    (playBase64Audio as jest.Mock).mockRejectedValueOnce(new Error('no audio session'));

    const started: string[] = [];
    speakChachaLine(clip('GREET'), { onStart: () => started.push('greeting') });
    speakChachaLine(clip('FARE'), { onStart: () => started.push('farewell') });
    await flush();
    await flush();

    // INVERTED (build 25): a line that never sounds never reports a start,
    // because onStart is the player's own "sound is out" signal now. The
    // queue still releases, which is what this case guards.
    expect(started).toEqual(['farewell']);
  });

  it("reports each line's start and end so the caption stays in step", async () => {
    const events: string[] = [];
    speakChachaLine(clip('GREET'), {
      onStart: () => events.push('start'),
      onEnd: () => events.push('end'),
    });
    await flush();
    expect(events).toEqual(['start']);

    finishers[0]();
    await flush();
    expect(events).toEqual(['start', 'end']);
  });

  it("keeps onStart shut until the player says the sound is out (build 25)", async () => {
    // The mouth on the call is driven by this. It used to fire at the line's
    // turn in the queue, before the clip was written or decoded, so he mimed
    // ahead of his own voice; the owner saw it on 1.0.6.
    holdSound = true;
    const events: string[] = [];
    speakChachaLine(clip('GREET'), { onStart: () => events.push('start') });
    await flush();
    expect(playBase64Audio).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
    starters[0]!();
    expect(events).toEqual(['start']);
    holdSound = false;
  });
});
