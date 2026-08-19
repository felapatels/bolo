import React from 'react';
import { Share } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// Task #1049, the mobile home referral card.
//
// Mobile has no other referral surface: this card is the whole of it, so what
// it may and may not show matters. It is the COMPACT twin of the web settings
// card, headline, one line, one button, and must never leak the raw code,
// the URL text or the Joined / Pending / Chai earned row.
//
// The link is built by @workspace/referral-link (the one module web builds its
// links with too) from EXPO_PUBLIC_DOMAIN, which lib/referral reads ONCE at
// module load. Hence the env assignment before the require below, and hence
// the no-domain case living in its own file (home-referral-card-no-domain):
// re-requiring the component inside this file would hand it a second React
// instance with a null dispatcher.
process.env.EXPO_PUBLIC_DOMAIN = 'bolo.example.com';

const mockReferral: { value: any } = { value: undefined };

jest.mock('@workspace/api-client-react', () => ({
  useGetReferral: () => mockReferral.value,
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { HomeReferralCard } = require('@/components/HomeReferralCard');
const { REFERRAL_REWARD_CHAI, buildReferralLink } = require('@workspace/referral-link');
const { referralLinkFor } = require('@/lib/referral');

const LINK = 'https://bolo.example.com/join/K7XM2P';

beforeEach(() => {
  mockReferral.value = {
    data: { code: 'K7XM2P', pendingCount: 2, activatedCount: 3, chaiEarned: 75 },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  jest.restoreAllMocks();
});

describe('home referral card', () => {
  test('renders the approved copy with the reward from the shared constant', () => {
    render(<HomeReferralCard />);

    expect(screen.getByText('Invite a friend, earn Chai')).toBeOnTheScreen();
    expect(
      screen.getByText(
        `You both get ${REFERRAL_REWARD_CHAI} Chai when they finish their first practice.`,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Share invite')).toBeOnTheScreen();
  });

  test('the button opens the share sheet carrying the referral link', async () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as any);

    render(<HomeReferralCard />);
    fireEvent.press(screen.getByTestId('home-referral-share'));

    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    const arg = shareSpy.mock.calls[0][0] as { message: string; url?: string };
    expect(arg.url).toBe(LINK);
    expect(arg.message).toContain(LINK);
  });

  test('never shows the code, the URL text, or the stat row', () => {
    render(<HomeReferralCard />);

    expect(screen.queryByText('K7XM2P')).toBeNull();
    expect(screen.queryByText(LINK)).toBeNull();
    for (const label of ['Joined', 'Pending', 'Chai earned', 'Copy link']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  test('hides itself while the referral query is loading or failed', () => {
    mockReferral.value = { data: undefined, isLoading: true, isError: false };
    const loading = render(<HomeReferralCard />);
    expect(screen.queryByTestId('home-referral-card')).toBeNull();
    loading.unmount();

    mockReferral.value = { data: undefined, isLoading: false, isError: true };
    render(<HomeReferralCard />);
    expect(screen.queryByTestId('home-referral-card')).toBeNull();
  });
});

describe('referral link module', () => {
  test('mobile resolves the same link web does for the same code', () => {
    // Web calls buildReferralLink with window.location.origin; mobile calls it
    // with https://<EXPO_PUBLIC_DOMAIN>. Same module, same origin, same link, // there is no second place in the repo that assembles a /join/ URL.
    expect(referralLinkFor('k7xm2p')).toBe(
      buildReferralLink('https://bolo.example.com', 'k7xm2p'),
    );
    expect(referralLinkFor('k7xm2p')).toBe(LINK);
  });
});
