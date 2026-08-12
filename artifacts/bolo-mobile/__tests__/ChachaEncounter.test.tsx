import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ChachaEncounterDialog } from '@/components/journey/ChachaEncounter';
import { isChachaEncounterStation } from '@/lib/chachaMemory';
import type { ChachaEncounterResult } from '@workspace/api-client-react';

// Chacha-ji's stall is read only: the phrase is shown and spoken, never
// scored. These pin the placement rule, the contract copy word for word, and
// the one thing that must never fire twice — the celebration, which belongs to
// the call that actually paid the Chai.

jest.mock('@workspace/api-client-react', () => ({
  useGetTokens: () => ({ data: { balance: 13 }, refetch: jest.fn() }),
  useBuyOutfit: () => ({ mutate: jest.fn(), isPending: false }),
  useSynthesizeSpeech: () => ({ mutateAsync: jest.fn() }),
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

function renderEncounter(encounter: ChachaEncounterResult | null) {
  return render(
    <ChachaEncounterDialog
      encounter={encounter}
      colors={COLORS}
      languageName="Gujarati"
      onDismiss={jest.fn()}
      onDecline={jest.fn()}
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
