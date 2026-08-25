// The home prompt, after it stopped asking for a display name.
//
// WHY THIS FILE EXISTS AT ALL. The card had no test of its own on either
// platform: every home suite mocked it out, so when it changed on 2026-08-25
// from asking for a display name to asking for a public username, both suites
// stayed green and told us nothing. A component that only ever appears as a
// mock is a component nobody is checking.
//
// Web twin: src/test/username-prompt-card.test.tsx. Keep both in step.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockState = {
  username: null as string | null,
  mutateAsync: jest.fn(async () => ({})),
};

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { firstName: 'Asha', reload: jest.fn() } }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useUpdateAccountProfile: () => ({ mutateAsync: mockState.mutateAsync }),
  useGetAccount: () => ({ data: { profile: { username: mockState.username } } }),
  getGetAccountQueryKey: () => ['account'],
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    card: '#FFFFFF',
    border: '#E0E0E0',
    foreground: '#111111',
    mutedForeground: '#888888',
    primary: '#6C3FC5',
    primaryForeground: '#FFFFFF',
  }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NamePromptCard,
  NAME_PROMPT_DISMISSED_KEY,
  USERNAME_PROMPT_DISMISSED_KEY,
} from '@/components/NamePromptCard';

beforeEach(async () => {
  mockState.username = null;
  mockState.mutateAsync.mockClear();
  await AsyncStorage.clear();
});

/** The dismissal flag is read from AsyncStorage, so the card needs a tick. */
async function renderCard() {
  render(<NamePromptCard />);
  await act(async () => {});
}

describe('the home username prompt', () => {
  it('asks a learner with no username, even though Clerk has their first name', async () => {
    // The old card hid itself whenever Clerk had a first name, which is most
    // people. The username is the thing the app cannot derive, so having a
    // first name is no longer a reason not to ask.
    await renderCard();
    expect(screen.getByTestId('name-prompt-card')).toBeTruthy();
  });

  it('stays away once a username exists', async () => {
    mockState.username = 'meera';
    await renderCard();
    expect(screen.queryByTestId('name-prompt-card')).toBeNull();
  });

  it('saves the USERNAME, not the display name', async () => {
    await renderCard();
    fireEvent.changeText(screen.getByTestId('name-prompt-input'), 'chai_wallah');
    fireEvent.press(screen.getByTestId('name-prompt-save'));
    await waitFor(() =>
      expect(mockState.mutateAsync).toHaveBeenCalledWith({
        data: { username: 'chai_wallah' },
      }),
    );
  });

  it("shows the server's own refusal, never a generic retry", async () => {
    // Only the server knows WHICH rule broke: shape, a reserved word, the
    // profanity screen, or a name already taken.
    mockState.mutateAsync.mockRejectedValueOnce({
      data: { error: 'That name cannot be used. Please pick another.' },
    });
    await renderCard();
    fireEvent.changeText(screen.getByTestId('name-prompt-input'), 'rude');
    fireEvent.press(screen.getByTestId('name-prompt-save'));
    await waitFor(() =>
      expect(
        screen.getByText('That name cannot be used. Please pick another.'),
      ).toBeTruthy(),
    );
  });

  it('an OLD name-prompt dismissal does not suppress it', async () => {
    // The population that dismissed the old prompt is exactly the population
    // that needs asking, since every existing account has username null.
    await AsyncStorage.setItem(NAME_PROMPT_DISMISSED_KEY, '1');
    await renderCard();
    expect(screen.getByTestId('name-prompt-card')).toBeTruthy();
  });

  it('its own dismissal does suppress it', async () => {
    await AsyncStorage.setItem(USERNAME_PROMPT_DISMISSED_KEY, '1');
    await renderCard();
    expect(screen.queryByTestId('name-prompt-card')).toBeNull();
  });
});
