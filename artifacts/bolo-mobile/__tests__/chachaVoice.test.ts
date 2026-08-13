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

  beforeEach(() => {
    jest.clearAllMocks();
    __resetChachaVoiceQueueForTests();
    finishers = [];
    (playBase64Audio as jest.Mock).mockImplementation(
      async (_b64: string, _fmt: string, onDone: () => void) => {
        finishers.push(onDone);
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

    expect(started).toEqual(['greeting', 'farewell']);
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
});
