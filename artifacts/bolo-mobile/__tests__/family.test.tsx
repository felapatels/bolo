import React from 'react';
import { Share } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { FamilyStatus } from '@workspace/api-client-react';

// ---------------------------------------------------------------------------
// Mocks — same pattern as subscription.test.tsx: the real screen renders, the
// generated data hooks are stubbed so each test shapes the server snapshot.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {
  family: undefined,
  invite: undefined,
  revoke: undefined,
  remove: undefined,
  leave: undefined,
  regenerate: undefined,
  join: undefined,
  params: {},
  purchases: undefined,
};

const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockQueryClient = {
  setQueryData: jest.fn(),
  invalidateQueries: jest.fn().mockResolvedValue(undefined),
  refetchQueries: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

// Build 34B: JoinView reads the family package price from PurchasesContext.
// The real context imports react-native-purchases (untransformed ESM), so it
// must be stubbed here like in the paywall suites.
jest.mock('@/contexts/PurchasesContext', () => ({
  usePurchases: () =>
    mockState.purchases ?? { familyMonthly: undefined, familyAnnual: undefined },
}));

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockState.params,
}));

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useGetFamily: () => mockState.family,
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
  getGetFamilyQueryKey: () => ['family'],
  getGetEntitlementsQueryKey: () => ['entitlements'],
  useCreateFamilyInvite: () => mockState.invite,
  useRevokeFamilyInvite: () => mockState.revoke,
  useRemoveFamilyMember: () => mockState.remove,
  useLeaveFamily: () => mockState.leave,
  useRegenerateFamilyCode: () => mockState.regenerate,
  useJoinFamily: () => mockState.join,
  ApiError: class ApiError extends Error {
    data: unknown;
    constructor(message: string, data?: unknown) {
      super(message);
      this.data = data;
    }
  },
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
}));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    TAB_BAR_CLEARANCE: 0,
    RAISED_PARROT_CLEARANCE: 0,
  };
});

jest.mock('@/components/FunFactLoader', () => {
  const { Text } = require('react-native');
  return { FunFactLoader: () => <Text>loading…</Text> };
});

// Imported after the mocks are declared.
import FamilyScreen from '@/app/(app)/account/family';

// -------------------------------- fixtures --------------------------------

function query(data: unknown) {
  return {
    data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
}

function idleMutation(result?: unknown) {
  return {
    mutateAsync: jest.fn().mockResolvedValue(result ?? { ok: true }),
    isPending: false,
  };
}

const ownerFamily: FamilyStatus = {
  role: 'owner',
  active: true,
  joinCode: 'K7XM2PWQ',
  capacity: 4,
  seats: [
    {
      id: 1,
      status: 'active',
      memberUserId: 'user_2',
      displayName: 'Meera',
      email: null,
      joinedAt: '2026-06-01T00:00:00Z',
    },
    {
      id: 2,
      status: 'pending',
      email: 'kiran@example.com',
      memberUserId: null,
      displayName: null,
      joinedAt: null,
    },
  ],
};

const memberFamily: FamilyStatus = {
  role: 'member',
  active: true,
  ownerName: 'Arjun',
  joinedAt: '2026-06-01T00:00:00Z',
};

function setAllMutationsIdle() {
  mockState.invite = idleMutation({ id: 3, status: 'pending', email: 'x@y.z' });
  mockState.revoke = idleMutation();
  mockState.remove = idleMutation();
  mockState.leave = idleMutation();
  mockState.regenerate = idleMutation({ joinCode: 'NEWCODE1' });
  mockState.join = idleMutation({
    ok: true,
    ownerName: 'Arjun',
    previousSubscriptionCanceled: false,
    active: true,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.params = {};
  setAllMutationsIdle();
});

// --------------------------------- tests ----------------------------------

describe('FamilyScreen — owner', () => {
  beforeEach(() => {
    mockState.family = query(ownerFamily);
  });

  it('shows seat usage, members, pending invites, and the join code', () => {
    render(<FamilyScreen />);
    expect(screen.getByText('2 of 4 seats in use')).toBeOnTheScreen();
    expect(screen.getByText('Meera')).toBeOnTheScreen();
    expect(screen.getByText('kiran@example.com')).toBeOnTheScreen();
    expect(screen.getByText('Invite pending')).toBeOnTheScreen();
    expect(screen.getByText('K7XM2PWQ')).toBeOnTheScreen();
    // 4 capacity − owner − 2 seats = 1 open seat.
    expect(screen.getByText('Open seat')).toBeOnTheScreen();
  });

  it('shares the join code through the native share sheet', async () => {
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
    render(<FamilyScreen />);
    fireEvent.press(screen.getByText('Share join code'));
    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    expect(shareSpy.mock.calls[0][0].message).toContain('K7XM2PWQ');
  });

  it('sends an email invite and refreshes the family status', async () => {
    render(<FamilyScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText('their@email.com'),
      'nani@example.com',
    );
    fireEvent.press(screen.getByText('Invite'));
    await waitFor(() =>
      expect(mockState.invite.mutateAsync).toHaveBeenCalledWith({
        data: { email: 'nani@example.com' },
      }),
    );
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['family'],
    });
    expect(screen.getByText('Invite sent to nani@example.com.')).toBeOnTheScreen();
  });

  it('removes a member after confirming, then refreshes entitlements', async () => {
    render(<FamilyScreen />);
    // Open the confirmation from the seat row, then confirm inside the modal.
    fireEvent.press(screen.getAllByLabelText('Remove')[0]);
    expect(screen.getByText('Remove Meera?')).toBeOnTheScreen();
    const removeButtons = screen.getAllByLabelText('Remove');
    fireEvent.press(removeButtons[removeButtons.length - 1]);
    await waitFor(() =>
      expect(mockState.remove.mutateAsync).toHaveBeenCalledWith({
        memberUserId: 'user_2',
      }),
    );
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['entitlements'],
    });
  });

  it('revokes a pending invite', async () => {
    render(<FamilyScreen />);
    fireEvent.press(screen.getByLabelText('Revoke'));
    await waitFor(() =>
      expect(mockState.revoke.mutateAsync).toHaveBeenCalledWith({ seatId: 2 }),
    );
  });

  it('shows the full-plan message when no seats remain', () => {
    mockState.family = query({
      ...ownerFamily,
      seats: [
        ...ownerFamily.seats!,
        {
          id: 3,
          status: 'active',
          memberUserId: 'user_3',
          displayName: 'Dev',
          email: null,
          joinedAt: null,
        },
      ],
    });
    render(<FamilyScreen />);
    expect(
      screen.getByText(/Your family plan is full — all 4 seats are taken/),
    ).toBeOnTheScreen();
  });
});

describe('FamilyScreen — member', () => {
  beforeEach(() => {
    mockState.family = query(memberFamily);
  });

  it("shows whose plan the member is on and lets them leave", async () => {
    render(<FamilyScreen />);
    expect(screen.getByText("You're on a family plan")).toBeOnTheScreen();
    expect(screen.getByText('Shared by Arjun')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Leave this family plan'));
    expect(screen.getByText('Leave the family plan?')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Leave'));
    await waitFor(() => expect(mockState.leave.mutateAsync).toHaveBeenCalled());
    // Everything server-derived is re-pulled so gates re-lock immediately.
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith();
  });

  it('surfaces the server error when leaving fails', async () => {
    mockState.leave = {
      mutateAsync: jest.fn().mockRejectedValue(new Error('You are not on a family plan.')),
      isPending: false,
    };
    render(<FamilyScreen />);
    fireEvent.press(screen.getByText('Leave this family plan'));
    fireEvent.press(screen.getByText('Leave'));
    await waitFor(() =>
      expect(screen.getByText('You are not on a family plan.')).toBeOnTheScreen(),
    );
  });
});

describe('FamilyScreen — not on a plan', () => {
  beforeEach(() => {
    mockState.family = query({ role: 'none' });
  });

  it('shows the Family upsell with a path to plans', () => {
    render(<FamilyScreen />);
    expect(screen.getByText('Bolo! Family')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('See plans'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/paywall');
  });

  it('joins with a code and unlocks Plus immediately', async () => {
    render(<FamilyScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('E.G. K7XM2PWQ'), 'k7xm2pwq');
    fireEvent.press(screen.getByText('Join family plan'));
    await waitFor(() =>
      expect(mockState.join.mutateAsync).toHaveBeenCalledWith({
        data: { code: 'K7XM2PWQ' },
      }),
    );
    // Entitlements re-read so Plus features unlock right away.
    expect(mockQueryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: ['entitlements'],
    });
    expect(
      screen.getByText("Welcome to Arjun's family plan!"),
    ).toBeOnTheScreen();
  });

  it('accepts an invite arriving as a deep-link token', async () => {
    mockState.params = { invite: 'tok_abc' };
    render(<FamilyScreen />);
    expect(screen.getByText("You've been invited!")).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Accept my seat'));
    await waitFor(() =>
      expect(mockState.join.mutateAsync).toHaveBeenCalledWith({
        data: { inviteToken: 'tok_abc' },
      }),
    );
  });

  it('shows a clear message when the plan is full or the invite is gone', async () => {
    mockState.join = {
      mutateAsync: jest
        .fn()
        .mockRejectedValue(
          new Error('That family plan is full, or the invite is no longer valid.'),
        ),
      isPending: false,
    };
    render(<FamilyScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('E.G. K7XM2PWQ'), 'BADCODE1');
    fireEvent.press(screen.getByText('Join family plan'));
    await waitFor(() =>
      expect(
        screen.getByText('That family plan is full, or the invite is no longer valid.'),
      ).toBeOnTheScreen(),
    );
  });
});
