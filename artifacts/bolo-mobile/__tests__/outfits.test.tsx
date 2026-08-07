import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Bolo's outfits, mobile side — twin of
// artifacts/gujarati-coach/src/test/outfits.test.tsx.
//
// Outfits are a Chai sink: bought once, owned forever, worn on every mascot
// surface. What is pinned here:
//   1. Art resolution is pose + outfit in ONE place, and an outfit that does
//      not ship a pose falls back to canonical Bolo rather than blanking him
//      (Metro requires literal require() paths, so the map is hand-written and
//      a typo would otherwise ship a missing image).
//   2. The shop previews a costume on the learner's OWN Bolo, and backing out
//      restores what they actually wear.
//   3. Buying, wearing and taking off send the server the exact payloads, and
//      an empty tin never shows a buy button.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {
  outfits: null,
  buyCalls: [],
  equipCalls: [],
};

jest.mock('@workspace/api-client-react', () => ({
  useGetOutfits: () => mockState.outfits,
  getGetOutfitsQueryKey: () => ['/api/outfits'],
  getGetTokensQueryKey: () => ['/api/tokens'],
  useBuyOutfit: () => ({
    isPending: false,
    mutate: (vars: unknown) => mockState.buyCalls.push(vars),
  }),
  useEquipOutfit: () => ({
    isPending: false,
    mutate: (vars: unknown) => mockState.equipCalls.push(vars),
  }),
  useGetTokens: () => ({ data: undefined }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('@/components/Screen', () => {
  const { View: RNView } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => (
      <RNView>{children}</RNView>
    ),
    TAB_BAR_CLEARANCE: 96,
  };
});

jest.mock('@/components/PressableScale', () => {
  const { Pressable: RNPressable } = require('react-native');
  return { PressableScale: RNPressable };
});

// The mascot itself is exercised elsewhere; here it only has to report which
// costume the shop asked it to wear.
jest.mock('@/components/Mascot', () => {
  const { Text: RNText } = require('react-native');
  return {
    Mascot: ({ outfit }: { outfit?: string | null }) => (
      <RNText testID="preview-outfit">{outfit ?? 'canonical'}</RNText>
    ),
  };
});

jest.mock('@/components/ChaiStall', () => {
  const { View: RNView } = require('react-native');
  return { ChaiGlyph: () => <RNView testID="chai-glyph" /> };
});

jest.mock('@/components/MilestoneToast', () => ({
  MilestoneToast: () => null,
}));

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    card: '#ffffff',
    border: '#e2e8f0',
    background: '#f8fafc',
    foreground: '#0f172a',
    mutedForeground: '#64748b',
    primary: '#0d9488',
    primaryForeground: '#ffffff',
  }),
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
}));

import OutfitsScreen from '../app/(app)/outfits';
import {
  mascotSource,
  CANONICAL_POSE_SOURCES,
  OUTFIT_POSE_SOURCES,
} from '@/lib/mascotOutfits';

const NAVRATRI = {
  id: 'navratri',
  name: 'Navratri chaniya choli',
  tagline: 'Nine nights of colour.',
  cost: 25,
  owned: false,
};

function renderShop(data: {
  balance: number;
  equipped: string | null;
  outfits: (typeof NAVRATRI)[];
}) {
  mockState.outfits = { data };
  return render(<OutfitsScreen />);
}

function previewOutfit(): string {
  return screen.getByTestId('preview-outfit').props.children;
}

beforeEach(() => {
  mockState.buyCalls = [];
  mockState.equipCalls = [];
});

// ── Art resolution ─────────────────────────────────────────────────────────

describe('pose art resolves from the equipped outfit', () => {
  test('no outfit is canonical Bolo', () => {
    expect(mascotSource('wave', null)).toBe(CANONICAL_POSE_SOURCES.wave);
    expect(mascotSource('cheer', undefined)).toBe(CANONICAL_POSE_SOURCES.cheer);
  });

  test('an equipped outfit dresses every pose', () => {
    for (const pose of Object.keys(CANONICAL_POSE_SOURCES) as Array<
      keyof typeof CANONICAL_POSE_SOURCES
    >) {
      expect(mascotSource(pose, 'navratri')).toBe(
        OUTFIT_POSE_SOURCES.navratri![pose],
      );
      expect(mascotSource(pose, 'navratri')).not.toBe(
        CANONICAL_POSE_SOURCES[pose],
      );
    }
  });

  test('a pose the outfit does not ship falls back instead of blanking him', () => {
    // A deliberately incomplete outfit: it dresses the wave and nothing else.
    const partial = { halfdressed: { wave: 424242 } };
    expect(mascotSource('wave', 'halfdressed', partial)).toBe(424242);
    expect(mascotSource('cheer', 'halfdressed', partial)).toBe(
      CANONICAL_POSE_SOURCES.cheer,
    );
    // An outfit nobody ships art for is canonical, not broken.
    expect(mascotSource('cheer', '__unknown', partial)).toBe(
      CANONICAL_POSE_SOURCES.cheer,
    );
  });
});

// ── The shop ───────────────────────────────────────────────────────────────

describe('the wardrobe previews before it charges', () => {
  test('it opens on the learner’s own Bolo and previews a costume on tap', () => {
    renderShop({ balance: 40, equipped: null, outfits: [NAVRATRI] });
    expect(previewOutfit()).toBe('canonical');

    fireEvent.press(screen.getByTestId('outfit-card-navratri'));
    expect(previewOutfit()).toBe('navratri');
    // The preview names what he is trying on (the rack names it too, hence
    // the scoped query).
    expect(
      within(screen.getByTestId('outfit-preview')).getByText(
        'Navratri chaniya choli',
      ),
    ).toBeTruthy();

    // Nothing was spent by looking.
    expect(mockState.buyCalls).toEqual([]);
    expect(mockState.equipCalls).toEqual([]);

    fireEvent.press(screen.getByTestId('outfit-cancel-preview'));
    expect(previewOutfit()).toBe('canonical');
  });

  test('buying sends the outfit id and shows the server’s price', () => {
    renderShop({ balance: 40, equipped: null, outfits: [NAVRATRI] });
    fireEvent.press(screen.getByTestId('outfit-card-navratri'));

    expect(screen.getByTestId('outfit-buy')).toHaveTextContent('Buy · 25');
    fireEvent.press(screen.getByTestId('outfit-buy'));
    expect(mockState.buyCalls).toEqual([{ data: { outfitId: 'navratri' } }]);
  });

  test('an empty tin shows what is missing instead of a buy button', () => {
    renderShop({ balance: 13, equipped: null, outfits: [NAVRATRI] });
    fireEvent.press(screen.getByTestId('outfit-card-navratri'));

    expect(screen.queryByTestId('outfit-buy')).toBeNull();
    expect(screen.getByTestId('outfit-short')).toHaveTextContent(
      '12 more Chai and she can wear it.',
    );
  });

  test('an owned outfit is worn, not bought again', () => {
    renderShop({
      balance: 5,
      equipped: null,
      outfits: [{ ...NAVRATRI, owned: true }],
    });
    fireEvent.press(screen.getByTestId('outfit-card-navratri'));

    expect(screen.queryByTestId('outfit-buy')).toBeNull();
    expect(screen.queryByTestId('outfit-short')).toBeNull();
    fireEvent.press(screen.getByTestId('outfit-wear'));
    expect(mockState.equipCalls).toEqual([{ data: { outfitId: 'navratri' } }]);
  });

  test('what he is wearing can be taken off', () => {
    renderShop({
      balance: 5,
      equipped: 'navratri',
      outfits: [{ ...NAVRATRI, owned: true }],
    });

    // The shop opens showing him dressed, because that is how he looks.
    expect(previewOutfit()).toBe('navratri');
    fireEvent.press(screen.getByTestId('outfit-unequip'));
    expect(mockState.equipCalls).toEqual([{ data: { outfitId: null } }]);
  });
});
