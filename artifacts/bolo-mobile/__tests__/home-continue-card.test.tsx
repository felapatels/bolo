// Guards the ContinueCard hero component on the home screen.
//
// ContinueCard picks the learner's next topic using three priority levels:
//   Priority 1 — in-progress: masteredCount > 0 && masteredCount < phraseCount
//   Priority 2 — first unstarted: masteredCount === 0
//   Fallback   — categories[0] (all-mastered edge case)
//   Null       — empty categories array
//
// Tests verify correct label, target topic, and navigation argument for each
// priority, plus the graceful null render when no categories are available.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { type Category } from '@workspace/api-client-react';

// ─── mocks ───────────────────────────────────────────────────────────────────

jest.mock('../components/XpCounter', () => ({ XpCounter: () => null }));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    primaryForeground: '#FFFFFF',
    primaryShadow: '#3D1FA8',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    card: '#F5F5F5',
    border: '#E0E0E0',
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Feather: ({ name, testID }: { name: string; testID?: string }) => (
      <Text testID={testID ?? `icon-${name}`}>{name}</Text>
    ),
  };
});

jest.mock('@/components/PressableScale', () => {
  const { Pressable } = require('react-native');
  return {
    PressableScale: ({
      children,
      onPress,
      style,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      style?: object;
    }) => (
      <Pressable onPress={onPress} style={style} testID="continue-card-pressable">
        {children}
      </Pressable>
    ),
  };
});

jest.mock('@/lib/ui', () => ({
  categoryIcon: (name: string | null | undefined) => name ?? 'book',
}));

// Imported after all mocks are declared.
import { ContinueCard } from '../components/ContinueCard';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    slug: 'greetings',
    title: 'Greetings',
    description: 'Everyday hellos and goodbyes.',
    iconName: 'sun',
    accent: '#f59e0b',
    sortOrder: 0,
    titleNative: null,
    phraseCount: 10,
    masteredCount: 0,
    lockedPhraseCount: 0,
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('ContinueCard', () => {
  describe('when categories is empty', () => {
    it('renders nothing', () => {
      const onNavigate = jest.fn();
      const { toJSON } = render(
        <ContinueCard categories={[]} onNavigate={onNavigate} />,
      );
      expect(toJSON()).toBeNull();
    });
  });

  describe('when a topic is in-progress (Priority 1)', () => {
    const inProgressCat = makeCategory({
      id: 42,
      title: 'Travel',
      masteredCount: 3,
      phraseCount: 10,
    });
    const unstartedCat = makeCategory({
      id: 99,
      title: 'Food',
      masteredCount: 0,
      phraseCount: 10,
    });

    it('shows the "Continue" sub-label', () => {
      render(
        <ContinueCard
          categories={[inProgressCat, unstartedCat]}
          onNavigate={jest.fn()}
        />,
      );
      expect(screen.getByText('Continue where you left off')).toBeTruthy();
    });

    it('shows the in-progress topic title', () => {
      render(
        <ContinueCard
          categories={[inProgressCat, unstartedCat]}
          onNavigate={jest.fn()}
        />,
      );
      expect(screen.getByText('Travel')).toBeTruthy();
    });

    it('shows the correct progress percentage', () => {
      render(
        <ContinueCard
          categories={[inProgressCat, unstartedCat]}
          onNavigate={jest.fn()}
        />,
      );
      // 3/10 = 30%
      expect(screen.getByText('30%')).toBeTruthy();
    });

    it('calls onNavigate with the in-progress category id', () => {
      const onNavigate = jest.fn();
      render(
        <ContinueCard
          categories={[inProgressCat, unstartedCat]}
          onNavigate={onNavigate}
        />,
      );
      fireEvent.press(screen.getByTestId('continue-card-pressable'));
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith(42);
    });

    it('prefers in-progress over unstarted even when unstarted comes first', () => {
      const onNavigate = jest.fn();
      render(
        <ContinueCard
          // unstarted listed first — should still pick inProgress
          categories={[unstartedCat, inProgressCat]}
          onNavigate={onNavigate}
        />,
      );
      expect(screen.getByText('Continue where you left off')).toBeTruthy();
      fireEvent.press(screen.getByTestId('continue-card-pressable'));
      expect(onNavigate).toHaveBeenCalledWith(42);
    });
  });

  describe('when nothing is started (Priority 2)', () => {
    const cat1 = makeCategory({ id: 10, title: 'Greetings', masteredCount: 0, phraseCount: 8 });
    const cat2 = makeCategory({ id: 11, title: 'Numbers',   masteredCount: 0, phraseCount: 8 });

    it('shows the "Start a new topic" sub-label', () => {
      render(<ContinueCard categories={[cat1, cat2]} onNavigate={jest.fn()} />);
      expect(screen.getByText('Start a new topic')).toBeTruthy();
    });

    it('shows the first unstarted topic title', () => {
      render(<ContinueCard categories={[cat1, cat2]} onNavigate={jest.fn()} />);
      expect(screen.getByText('Greetings')).toBeTruthy();
    });

    it('shows 0% progress', () => {
      render(<ContinueCard categories={[cat1, cat2]} onNavigate={jest.fn()} />);
      expect(screen.getByText('0%')).toBeTruthy();
    });

    it('calls onNavigate with the first category id', () => {
      const onNavigate = jest.fn();
      render(<ContinueCard categories={[cat1, cat2]} onNavigate={onNavigate} />);
      fireEvent.press(screen.getByTestId('continue-card-pressable'));
      expect(onNavigate).toHaveBeenCalledWith(10);
    });
  });

  describe('when all topics are fully mastered (Fallback)', () => {
    const mastered1 = makeCategory({ id: 7, title: 'Greetings', masteredCount: 10, phraseCount: 10 });
    const mastered2 = makeCategory({ id: 8, title: 'Travel',    masteredCount: 5,  phraseCount: 5  });

    it('still renders (falls back to first category)', () => {
      render(
        <ContinueCard categories={[mastered1, mastered2]} onNavigate={jest.fn()} />,
      );
      // Component renders — not null
      expect(screen.getByTestId('continue-card-pressable')).toBeTruthy();
    });

    it('falls back to categories[0] and shows "Start a new topic" label', () => {
      render(
        <ContinueCard categories={[mastered1, mastered2]} onNavigate={jest.fn()} />,
      );
      expect(screen.getByText('Start a new topic')).toBeTruthy();
      expect(screen.getByText('Greetings')).toBeTruthy();
    });

    it('calls onNavigate with the first category id on press', () => {
      const onNavigate = jest.fn();
      render(
        <ContinueCard categories={[mastered1, mastered2]} onNavigate={onNavigate} />,
      );
      fireEvent.press(screen.getByTestId('continue-card-pressable'));
      expect(onNavigate).toHaveBeenCalledWith(7);
    });

    it('shows 100% for a fully-mastered fallback topic', () => {
      render(
        <ContinueCard categories={[mastered1, mastered2]} onNavigate={jest.fn()} />,
      );
      expect(screen.getByText('100%')).toBeTruthy();
    });
  });

  describe('when the active language changes (prop update)', () => {
    // Simulate the home screen switching from one language's categories to
    // another's by calling rerender with a fresh prop value.

    it('re-renders with the in-progress topic from the new language', () => {
      const langACat = makeCategory({
        id: 101,
        title: 'Greetings (Lang A)',
        masteredCount: 0,
        phraseCount: 10,
      });
      const langBInProgress = makeCategory({
        id: 202,
        title: 'Travel (Lang B)',
        masteredCount: 4,
        phraseCount: 10,
      });
      const langBUnstarted = makeCategory({
        id: 203,
        title: 'Food (Lang B)',
        masteredCount: 0,
        phraseCount: 10,
      });

      const onNavigate = jest.fn();
      const { rerender } = render(
        <ContinueCard categories={[langACat]} onNavigate={onNavigate} />,
      );

      // Initial render — shows Lang A's unstarted topic.
      expect(screen.getByText('Greetings (Lang A)')).toBeTruthy();
      expect(screen.getByText('Start a new topic')).toBeTruthy();

      // Language switches — pass in Lang B's categories.
      rerender(
        <ContinueCard
          categories={[langBInProgress, langBUnstarted]}
          onNavigate={onNavigate}
        />,
      );

      // Card should now show the in-progress topic from Lang B.
      expect(screen.getByText('Travel (Lang B)')).toBeTruthy();
      expect(screen.getByText('Continue where you left off')).toBeTruthy();
    });

    it('navigates to the new language\'s in-progress topic after a language switch', () => {
      const langACat = makeCategory({
        id: 101,
        title: 'Greetings (Lang A)',
        masteredCount: 0,
        phraseCount: 10,
      });
      const langBInProgress = makeCategory({
        id: 202,
        title: 'Travel (Lang B)',
        masteredCount: 4,
        phraseCount: 10,
      });

      const onNavigate = jest.fn();
      const { rerender } = render(
        <ContinueCard categories={[langACat]} onNavigate={onNavigate} />,
      );

      rerender(
        <ContinueCard categories={[langBInProgress]} onNavigate={onNavigate} />,
      );

      fireEvent.press(screen.getByTestId('continue-card-pressable'));
      expect(onNavigate).toHaveBeenCalledWith(202);
    });

    it('shows "Start a new topic" fallback when new language has only unstarted topics', () => {
      const langAInProgress = makeCategory({
        id: 101,
        title: 'Greetings (Lang A)',
        masteredCount: 3,
        phraseCount: 10,
      });
      const langBUnstarted1 = makeCategory({
        id: 201,
        title: 'Colors (Lang B)',
        masteredCount: 0,
        phraseCount: 8,
      });
      const langBUnstarted2 = makeCategory({
        id: 202,
        title: 'Numbers (Lang B)',
        masteredCount: 0,
        phraseCount: 8,
      });

      const onNavigate = jest.fn();
      const { rerender } = render(
        <ContinueCard categories={[langAInProgress]} onNavigate={onNavigate} />,
      );

      // Initial render — in-progress for Lang A.
      expect(screen.getByText('Continue where you left off')).toBeTruthy();

      // Switch to Lang B — all topics are unstarted.
      rerender(
        <ContinueCard
          categories={[langBUnstarted1, langBUnstarted2]}
          onNavigate={onNavigate}
        />,
      );

      expect(screen.getByText('Start a new topic')).toBeTruthy();
      expect(screen.getByText('Colors (Lang B)')).toBeTruthy();
    });

    it('navigates to the first unstarted topic in the new language', () => {
      const langAInProgress = makeCategory({
        id: 101,
        title: 'Greetings (Lang A)',
        masteredCount: 3,
        phraseCount: 10,
      });
      const langBUnstarted = makeCategory({
        id: 201,
        title: 'Colors (Lang B)',
        masteredCount: 0,
        phraseCount: 8,
      });

      const onNavigate = jest.fn();
      const { rerender } = render(
        <ContinueCard categories={[langAInProgress]} onNavigate={onNavigate} />,
      );

      rerender(
        <ContinueCard categories={[langBUnstarted]} onNavigate={onNavigate} />,
      );

      fireEvent.press(screen.getByTestId('continue-card-pressable'));
      expect(onNavigate).toHaveBeenCalledWith(201);
    });

    it('renders nothing when the new language has an empty categories array', () => {
      const langACat = makeCategory({
        id: 101,
        title: 'Greetings (Lang A)',
        masteredCount: 0,
        phraseCount: 10,
      });

      const onNavigate = jest.fn();
      const { rerender, toJSON } = render(
        <ContinueCard categories={[langACat]} onNavigate={onNavigate} />,
      );

      expect(screen.getByText('Greetings (Lang A)')).toBeTruthy();

      // Language switches to one with no categories yet (still loading or empty).
      rerender(<ContinueCard categories={[]} onNavigate={onNavigate} />);

      expect(toJSON()).toBeNull();
    });
  });

  describe('single topic edge cases', () => {
    it('renders when there is exactly one unstarted topic', () => {
      const only = makeCategory({ id: 3, title: 'Family', masteredCount: 0, phraseCount: 6 });
      const onNavigate = jest.fn();
      render(<ContinueCard categories={[only]} onNavigate={onNavigate} />);
      expect(screen.getByText('Family')).toBeTruthy();
      expect(screen.getByText('Start a new topic')).toBeTruthy();
      fireEvent.press(screen.getByTestId('continue-card-pressable'));
      expect(onNavigate).toHaveBeenCalledWith(3);
    });

    it('renders when there is exactly one fully-mastered topic', () => {
      const only = makeCategory({ id: 4, title: 'Colors', masteredCount: 8, phraseCount: 8 });
      render(<ContinueCard categories={[only]} onNavigate={jest.fn()} />);
      expect(screen.getByText('Colors')).toBeTruthy();
    });

    it('handles a category with phraseCount 0 without dividing by zero', () => {
      const broken = makeCategory({ id: 5, title: 'Empty', masteredCount: 0, phraseCount: 0 });
      render(<ContinueCard categories={[broken]} onNavigate={jest.fn()} />);
      expect(screen.getByText('0%')).toBeTruthy();
    });
  });
});
