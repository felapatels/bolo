import React from 'react';
import { render, screen } from '@testing-library/react-native';

// Task #1049, graceful absence.
//
// Referral links point at the hosted WEB app. With no EXPO_PUBLIC_DOMAIN there
// is nothing to point at, so home must show no card at all rather than a
// button that shares a broken or empty link, the same rule the Privacy Policy
// link on this screen already follows.
//
// This lives in its own file because lib/referral reads the env var once at
// module load: the sibling file (home-referral-card) pins the configured case,
// and each jest file gets its own module registry.
delete process.env.EXPO_PUBLIC_DOMAIN;

jest.mock('@workspace/api-client-react', () => ({
  // A perfectly healthy referral query, the ONLY thing missing is the domain.
  useGetReferral: () => ({
    data: { code: 'K7XM2P', pendingCount: 2, activatedCount: 3, chaiEarned: 75 },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { HomeReferralCard } = require('@/components/HomeReferralCard');
const { referralLinkFor } = require('@/lib/referral');

describe('home referral card without a web domain', () => {
  test('resolves no link', () => {
    expect(referralLinkFor('K7XM2P')).toBeUndefined();
  });

  test('renders nothing at all', () => {
    render(<HomeReferralCard />);

    expect(screen.queryByTestId('home-referral-card')).toBeNull();
    expect(screen.queryByText('Invite a friend, earn Chai')).toBeNull();
    expect(screen.queryByText('Share invite')).toBeNull();
  });
});
