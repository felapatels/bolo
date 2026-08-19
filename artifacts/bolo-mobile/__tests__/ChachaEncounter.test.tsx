import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ChachaEncounterDialog } from '@/components/journey/ChachaEncounter';
import { isChachaEncounterStation } from '@/lib/chachaMemory';
import { speakChachaLine, stopChachaVoice } from '@/lib/chachaVoice';
import { loadCoachVoicePref } from '@/lib/coachVoicePref';
import type { ChachaEncounterResult } from '@workspace/api-client-react';

// Chacha-ji's stall is read only: the phrase is shown and spoken, never
// scored. These pin the placement rule, the contract copy word for word, and
// the one thing that must never fire twice, the celebration, which belongs to
// the call that actually paid the Chai.

// Task #1095: his three spoken lines. The mock is a FULL replacement, so every
// hook the dialog reaches for has to be declared here.
const CHACHA_LINES = [
  { key: 'greeting', text: 'Aao, aao. Chai piyo.', english: 'Come, come. Have some chai.', audioBase64: 'R1JFRVQ=', format: 'mp3' },
  { key: 'gift', text: 'Yeh lo. Garam hai.', english: "Here you go. It's hot.", audioBase64: 'R0lGVA==', format: 'mp3' },
  { key: 'farewell', text: 'Phir aana, beta.', english: 'Come again, beta.', audioBase64: 'RkFSRQ==', format: 'mp3' },
];

const mockUseGetChachaLines = jest.fn(() => ({ data: { lines: CHACHA_LINES } }));

// The phrase card's coach-voice path, unchanged by this task. It resolves so a
// test may actually press "Hear the phrase" and watch where the audio goes.
const mockSynthesize = jest.fn(async () => ({ audioBase64: 'UEhSQVNF', format: 'mp3' }));

jest.mock('@workspace/api-client-react', () => ({
  useGetTokens: () => ({ data: { balance: 13 }, refetch: jest.fn() }),
  useBuyOutfit: () => ({ mutate: jest.fn(), isPending: false }),
  useSynthesizeSpeech: () => ({ mutateAsync: mockSynthesize }),
  useGetChachaLines: (...args: unknown[]) => mockUseGetChachaLines(...(args as [])),
  getGetChachaLinesQueryKey: () => ['/openai/chacha-lines'],
}));

// His voice is observed, not played: these pin WHICH line speaks at WHICH
// moment. The queue's own ordering guarantee lives in chachaVoice.test.ts.
jest.mock('@/lib/chachaVoice', () => ({
  speakChachaLine: jest.fn(),
  stopChachaVoice: jest.fn(),
  __resetChachaVoiceQueueForTests: jest.fn(),
}));

jest.mock('@/lib/coachVoicePref', () => ({
  loadCoachVoicePref: jest.fn(async () => true),
  saveCoachVoicePref: jest.fn(async () => {}),
  COACH_VOICE_PREF_KEY: 'bolo.coachVoice',
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', script: 'Gujarati' },
  }),
}));

jest.mock('@/lib/audio', () => ({
  playBase64Audio: jest.fn(async () => ({ stop: jest.fn() })),
}));

jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn() }));

const COLORS = {
  foreground: '#111111',
  mutedForeground: '#555555',
  card: '#ffffff',
  border: '#dddddd',
  muted: '#eeeeee',
  primary: '#0d9488',
  primaryForeground: '#ffffff',
  background: '#ffffff',
};

function encounterOf(overrides: Partial<ChachaEncounterResult> = {}): ChachaEncounterResult {
  return {
    station: 3,
    ordinal: 1,
    granted: false,
    chaiGranted: 3,
    balance: 13,
    phrase: null,
    offer: null,
    ...overrides,
  } as ChachaEncounterResult;
}

function renderEncounter(
  encounter: ChachaEncounterResult | null,
  handlers: { onDismiss?: () => void; onDecline?: () => void } = {},
) {
  return render(
    <ChachaEncounterDialog
      encounter={encounter}
      colors={COLORS}
      languageName="Gujarati"
      onDismiss={handlers.onDismiss ?? jest.fn()}
      onDecline={handlers.onDecline ?? jest.fn()}
    />,
  );
}

describe('Chacha-ji station placement', () => {
  it('places him at every fourth station from the third', () => {
    expect([3, 7, 11, 15, 51].every(isChachaEncounterStation)).toBe(true);
  });

  it('leaves every other station alone', () => {
    expect([1, 2, 4, 5, 6, 8, 9, 10, 12].some(isChachaEncounterStation)).toBe(false);
  });
});

describe('ChachaEncounterDialog', () => {
  it('renders nothing when there is no encounter', () => {
    renderEncounter(null);
    expect(screen.queryByTestId('chacha-dialog')).toBeNull();
  });

  it('pours the chai in the contract copy', () => {
    renderEncounter(encounterOf({ granted: true, balance: 13 }));

    expect(screen.getByText("Chacha-ji's Chai Stall")).toBeTruthy();
    expect(screen.getByText('Chacha-ji pours you a chai.')).toBeTruthy();
    expect(screen.getByTestId('chacha-granted-text')).toHaveTextContent('+3');
    expect(screen.getByText('Balance: 13')).toBeTruthy();
    expect(screen.getByText('Thanks, Chacha-ji')).toBeTruthy();
  });

  it('celebrates only when this visit actually paid the Chai', () => {
    renderEncounter(encounterOf({ granted: true }));
    expect(screen.getByTestId('milestone-toast')).toBeTruthy();

    screen.unmount();

    renderEncounter(encounterOf({ granted: false }));
    expect(screen.queryByTestId('milestone-toast')).toBeNull();
  });

  it('shows the phrase to read and hear, with nothing to answer', () => {
    renderEncounter(
      encounterOf({
        phrase: { id: 91, nativeScript: 'કેમ છો', romanized: 'kem chho', english: 'How are you' },
      }),
    );

    expect(screen.getByTestId('chacha-phrase-native')).toHaveTextContent('કેમ છો');
    expect(screen.getByTestId('chacha-phrase-romanized')).toHaveTextContent('kem chho');
    expect(screen.getByTestId('chacha-phrase-english')).toHaveTextContent('How are you');
    expect(screen.getByTestId('play-phrase-audio')).toBeTruthy();
  });

  it('keeps the stall shut when the server sent no offer', () => {
    renderEncounter(encounterOf({ ordinal: 2 }));

    expect(screen.queryByText('Not today, Chacha-ji')).toBeNull();
    expect(screen.queryByText('Come back soon, beta.')).toBeNull();
  });

  it('closes on his own line when an offer round finds nothing to sell', () => {
    renderEncounter(encounterOf({ station: 11, ordinal: 3 }));

    expect(screen.getByTestId('chacha-closing-line')).toHaveTextContent('Come back soon, beta.');
    expect(screen.getByText('Thanks, Chacha-ji')).toBeTruthy();
  });

  it('offers the item with its price beside the tin, and a way out', () => {
    renderEncounter(
      encounterOf({
        station: 11,
        ordinal: 3,
        balance: 13,
        offer: {
          outfitId: 'chai-apron',
          name: 'Chai Apron',
          tagline: 'Stall-side stripes',
          cost: 5,
          kind: 'garment',
        },
      }),
    );

    expect(screen.getByText('Chai Apron')).toBeTruthy();
    expect(screen.getByText('Stall-side stripes')).toBeTruthy();
    expect(screen.getByText('Price')).toBeTruthy();
    expect(screen.getByText('You have')).toBeTruthy();
    expect(screen.getByText('Buy Chai Apron')).toBeTruthy();
    expect(screen.getByText('Not today, Chacha-ji')).toBeTruthy();
    expect(screen.queryByText('Thanks, Chacha-ji')).toBeNull();
  });
});

/**
 * Task #1095: Chacha-ji speaks his own three lines at the stall.
 *
 * Same three moments, same order, same gating and same on-screen text as the
 * web app. Nothing here is scored, recorded or graded, and the phrase card
 * stays on its own untouched coach-voice path.
 */
describe("Chacha-ji's spoken lines", () => {
  /** Keys of the lines handed to the queue so far, in order. */
  const spoken = () =>
    (speakChachaLine as jest.Mock).mock.calls.map(([clip]) => {
      const found = CHACHA_LINES.find((l) => l.audioBase64 === clip.audioBase64);
      return found?.key ?? 'unknown';
    });

  /** The coach-voice preference is read from AsyncStorage, so let it land. */
  const settle = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (loadCoachVoicePref as jest.Mock).mockResolvedValue(true);
    mockUseGetChachaLines.mockReturnValue({ data: { lines: CHACHA_LINES } });
  });

  it('greets on open, with his line and its English meaning on screen', async () => {
    (speakChachaLine as jest.Mock).mockImplementation((_clip, hooks) => {
      hooks?.onStart?.();
    });

    renderEncounter(encounterOf());
    await settle();

    expect(spoken()).toContain('greeting');
    await waitFor(() => {
      expect(screen.getByTestId('chacha-spoken-line-text')).toHaveTextContent(
        'Aao, aao. Chai piyo.',
      );
    });
    expect(screen.getByTestId('chacha-spoken-line-english')).toHaveTextContent(
      'Come, come. Have some chai.',
    );
  });

  it('adds the gift line after the greeting when the Chai was actually granted', async () => {
    renderEncounter(encounterOf({ granted: true }));
    await settle();

    // Order matters: the queue speaks them in the order they were handed over,
    // so the gift follows the greeting rather than talking over it.
    expect(spoken()).toEqual(['greeting', 'gift']);
  });

  it('skips the gift line on a revisit that granted nothing', async () => {
    renderEncounter(encounterOf({ granted: false }));
    await settle();

    expect(spoken()).toContain('greeting');
    expect(spoken()).not.toContain('gift');
  });

  it('does not speak the farewell when the learner leaves with Thanks, Chacha-ji', async () => {
    const onDismiss = jest.fn();
    renderEncounter(encounterOf({ granted: true }), { onDismiss });
    await settle();
    expect(spoken()).not.toContain('farewell');

    fireEvent.press(screen.getByTestId('chacha-dismiss-btn'));

    // The farewell was removed deliberately: it was queued here and
    // the route changed on the next line, so it played over the
    // lesson that followed.
    expect(spoken()).not.toContain('farewell');
    expect(stopChachaVoice).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('does not speak the farewell when the learner leaves with Not today, Chacha-ji', async () => {
    const onDecline = jest.fn();
    renderEncounter(
      encounterOf({
        station: 11,
        ordinal: 3,
        offer: {
          outfitId: 'chai-apron',
          name: 'Chai Apron',
          tagline: 'Stall-side stripes',
          cost: 5,
          kind: 'garment',
        },
      }),
      { onDecline },
    );
    await settle();

    fireEvent.press(screen.getByTestId('chacha-decline-btn'));

    // The farewell was removed deliberately: it was queued here and
    // the route changed on the next line, so it played over the
    // lesson that followed.
    expect(spoken()).not.toContain('farewell');
    expect(stopChachaVoice).toHaveBeenCalled();
    expect(onDecline).toHaveBeenCalled();
  });

  it('says each line at most once per encounter', async () => {
    renderEncounter(encounterOf({ granted: true }));
    await settle();

    fireEvent.press(screen.getByTestId('chacha-dismiss-btn'));
    fireEvent.press(screen.getByTestId('chacha-dismiss-btn'));

    expect(spoken()).toEqual(['greeting', 'gift']);
  });

  it('stops the voice when the dialog unmounts, not just on a close tap', async () => {
    const result = renderEncounter(encounterOf({ granted: true }));
    await settle();

    result.unmount();

    expect(stopChachaVoice).toHaveBeenCalled();
  });

  it("is completely silent, and asks for nothing, when Bolo's voice is off", async () => {
    (loadCoachVoicePref as jest.Mock).mockResolvedValue(false);
    mockUseGetChachaLines.mockReturnValue({ data: undefined } as never);

    renderEncounter(encounterOf({ granted: true }));
    await settle();

    expect(speakChachaLine).not.toHaveBeenCalled();
    // The request is suppressed too, not merely its playback.
    const opts = mockUseGetChachaLines.mock.calls.at(-1)?.[0] as never as {
      query: { enabled: boolean };
    };
    expect(opts.query.enabled).toBe(false);
    expect(screen.queryByTestId('chacha-spoken-line')).toBeNull();

    fireEvent.press(screen.getByTestId('chacha-dismiss-btn'));
    expect(speakChachaLine).not.toHaveBeenCalled();
  });

  it('leaves the phrase card on the unchanged coach-voice path', async () => {
    renderEncounter(
      encounterOf({
        phrase: { id: 91, nativeScript: 'કેમ છો', romanized: 'kem chho', english: 'How are you' },
      }),
    );
    await settle();

    // The phrase button exists and is separate from his lines: pressing it
    // never routes through Chacha's player.
    fireEvent.press(screen.getByTestId('play-phrase-audio'));
    await settle();

    expect(spoken()).toEqual(['greeting']);
  });
});
