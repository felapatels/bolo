// The Guideline 1.2 block control, added 2026-08-25. Twin of the web suite at
// gujarati-coach/src/test/learner-safety.test.tsx: same assertions, same
// reasoning, so the two clients cannot drift on a safety control.
//
// The report half already shipped. These tests are about the half that gives a
// learner relief now, and about the two not being confused in the copy.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockBlock = jest.fn(async () => undefined);
const mockUnblock = jest.fn(async () => undefined);
const mockReport = jest.fn(async () => undefined);
const mockState: { blocked: any[] } = { blocked: [] };

jest.mock('@workspace/api-client-react', () => ({
  useGetAccount: () => ({ data: { profile: { username: 'me', shareStats: true } } }),
  useReportUsername: () => ({ mutateAsync: mockReport, isPending: false }),
  useBlockUser: () => ({ mutateAsync: mockBlock, isPending: false }),
  useUnblockUser: () => ({ mutateAsync: mockUnblock, isPending: false }),
  useListBlockedUsers: () => ({ data: mockState.blocked, isLoading: false }),
}));

const mockInvalidate = jest.fn(async () => undefined);
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useThemePrefValue: () => 'system',
}));

jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn() }));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { LearnerSafetyButton, BlockedLearnersList } from '@/components/BoardScope';

beforeEach(() => {
  mockBlock.mockClear();
  mockUnblock.mockClear();
  mockReport.mockClear();
  mockInvalidate.mockClear();
  mockState.blocked = [];
});

describe('LearnerSafetyButton', () => {
  it('offers BOTH report and block from one control', () => {
    render(<LearnerSafetyButton userId="u1" username="ravi" />);
    fireEvent.press(screen.getByLabelText('Report or block ravi'));

    // Guideline 1.2 wants reporting AND blocking reachable. One icon, two
    // remedies, so an upset learner does not have to guess which is which.
    expect(screen.getByTestId('safety-report-u1')).toBeTruthy();
    expect(screen.getByTestId('safety-block-u1')).toBeTruthy();
  });

  it('blocks only after a confirm step, and says the friendship ends', async () => {
    render(<LearnerSafetyButton userId="u1" username="ravi" />);
    fireEvent.press(screen.getByLabelText('Report or block ravi'));
    fireEvent.press(screen.getByTestId('safety-block-u1'));

    // The tap that opens the menu must not be the tap that blocks.
    expect(mockBlock).not.toHaveBeenCalled();
    // The consequence people are surprised by is stated before they commit.
    expect(screen.getByText(/if you are friends that ends too/i)).toBeTruthy();

    fireEvent.press(screen.getByTestId('safety-block-confirm-u1'));
    await waitFor(() => expect(mockBlock).toHaveBeenCalledTimes(1));
    expect(mockBlock.mock.calls[0][0]).toEqual({ id: 'u1' });
    // The block is enforced in the server's where clause, so a stale cache
    // would keep the row on screen and read as the control having done nothing.
    await waitFor(() => expect(mockInvalidate).toHaveBeenCalled());
    expect(screen.getByText('Blocked')).toBeTruthy();
  });

  it('is available for a learner who never chose a username', () => {
    // They appear under a pseudonym rather than not at all, so "you can block
    // anybody you can see" has to hold for them too.
    render(<LearnerSafetyButton userId="u9" username="Learner 4821" />);
    fireEvent.press(screen.getByLabelText('Report or block Learner 4821'));
    expect(screen.getByTestId('safety-block-u9')).toBeTruthy();
  });

  it('offers a block straight after a report, because a report gives no relief', async () => {
    render(<LearnerSafetyButton userId="u1" username="ravi" />);
    fireEvent.press(screen.getByLabelText('Report or block ravi'));
    fireEvent.press(screen.getByTestId('safety-report-u1'));
    fireEvent.press(screen.getByText('Offensive or hateful'));

    await waitFor(() => expect(mockReport).toHaveBeenCalledTimes(1));
    fireEvent.press(await screen.findByTestId('safety-block-after-report-u1'));
    fireEvent.press(screen.getByTestId('safety-block-confirm-u1'));
    await waitFor(() => expect(mockBlock).toHaveBeenCalledTimes(1));
  });

  it('does not promise the report will change anything', () => {
    render(<LearnerSafetyButton userId="u1" username="ravi" />);
    fireEvent.press(screen.getByLabelText('Report or block ravi'));
    // Nothing auto-hides a name on a report count, so the copy must not imply
    // it does.
    expect(screen.getByText(/Nothing changes on your screen/i)).toBeTruthy();
  });
});

describe('BlockedLearnersList', () => {
  it('renders nothing when nobody is blocked', () => {
    render(<BlockedLearnersList />);
    // An empty "Blocked" section on every account screen teaches learners that
    // blocking is expected. It is only interesting once it has something in it.
    expect(screen.queryByTestId('blocked-learners')).toBeNull();
  });

  it('lists the blocked and offers a way back', async () => {
    mockState.blocked = [
      { userId: 'u1', displayName: 'ravi', username: 'ravi' },
      { userId: 'u9', displayName: 'Learner 4821', username: null },
    ];
    render(<BlockedLearnersList />);

    expect(screen.getByTestId('blocked-row-u1')).toBeTruthy();
    // The pseudonymous learner is listed under the same name the feed showed,
    // or the learner cannot tell who they blocked.
    expect(screen.getByText('Learner 4821')).toBeTruthy();

    // A BLOCK WITH NO WAY BACK IS A TRAP, NOT A CONTROL.
    fireEvent.press(screen.getByTestId('unblock-u1'));
    await waitFor(() => expect(mockUnblock).toHaveBeenCalledTimes(1));
    expect(mockUnblock.mock.calls[0][0]).toEqual({ id: 'u1' });
  });
});
