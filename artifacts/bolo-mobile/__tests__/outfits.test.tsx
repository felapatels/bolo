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

// The bazaar is a STREET now: the tailor's rack is the first stall, and the
// ticket counter, signal box and chai stall below it render the WALLET'S OWN
// rows. Those rows bring their own hooks, so this full-replacement mock has to
// answer for them too or the screen cannot mount. They are stubbed flat and
// silent here on purpose - the rows' behaviour is pinned in
// chai-wallet.test.tsx; these tests are still only about the tailor.
jest.mock('@workspace/api-client-react', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super(`api ${status}`);
      this.status = status;
      this.data = data;
    }
  },
  useGetOutfits: () => mockState.outfits,
  getGetOutfitsQueryKey: () => ['/api/outfits'],
  getGetTokensQueryKey: () => ['/api/tokens'],
  getGetProgressSummaryQueryKey: () => ['/api/progress/summary'],
  useBuyOutfit: () => ({
    isPending: false,
    mutate: (vars: unknown) => mockState.buyCalls.push(vars),
  }),
  useEquipOutfit: () => ({
    isPending: false,
    mutate: (vars: unknown) => mockState.equipCalls.push(vars),
  }),
  useGetTokens: () => ({ data: undefined }),
  useSpendTokens: () => ({ isPending: false, mutate: jest.fn() }),
  useBuyFirstClass: () => ({ isPending: false, mutate: jest.fn() }),
  // The wallet sheet reads the streak-repair offer; no break to mend here.
  useGetStreakRepair: () => ({ data: { eligible: false, missedDay: null, restoresStreakDays: 0, cost: 25, balance: 0 }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useRepairStreak: () => ({ isPending: false, mutate: jest.fn() }),
  getGetStreakRepairQueryKey: () => ['/api/tokens/streak-repair'],
}));

// The language signpost is a free-tier row and reads entitlements; without the
// provider the hook throws.
jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({
    isPlus: false,
    isOneLanguage: false,
    isLoading: false,
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// The chai stall at the foot of the street mounts the wallet sheet, which
// keeps its own header clear of the notch.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
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
    Mascot: ({
      outfit,
      accessory,
    }: {
      outfit?: string | null;
      accessory?: string | null;
    }) => (
      <>
        <RNText testID="preview-outfit">{outfit ?? 'canonical'}</RNText>
        <RNText testID="preview-accessory">{accessory ?? 'bareheaded'}</RNText>
      </>
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

// The tailor stall is a door of its own since build 22 (the bazaar became a
// hub with four doors); its logic and every pin here live on unchanged.
import OutfitsScreen from '../app/(app)/bazaar/tailor';
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

// An accessory: it lands on the head slot, so it can be worn WITH a garment.
const PAGDI = {
  id: 'pagdi',
  name: 'Marigold pagdi',
  tagline: 'Marigold silk, gold zari and one peacock feather.',
  cost: 10,
  owned: false,
  kind: 'accessory',
};

function renderShop(data: {
  balance: number;
  equipped: string | null;
  /** The head slot. Omitted means bare-headed, as an older payload would be. */
  equippedAccessory?: string | null;
  outfits: Array<Record<string, unknown>>;
}) {
  mockState.outfits = { data };
  return render(<OutfitsScreen />);
}

function previewOutfit(): string {
  return screen.getByTestId('preview-outfit').props.children;
}

function previewAccessory(): string {
  return screen.getByTestId('preview-accessory').props.children;
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
    // The booth only opens on an item: with nothing being tried on, the
    // street is the rack, not a bird standing in an empty changing room.
    expect(screen.queryByTestId('outfit-dressing-room')).toBeNull();

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
    expect(screen.queryByTestId('outfit-dressing-room')).toBeNull();
  });

  test('buying sends the outfit id and shows the server’s price', () => {
    renderShop({ balance: 40, equipped: null, outfits: [NAVRATRI] });
    fireEvent.press(screen.getByTestId('outfit-card-navratri'));

    expect(screen.getByTestId('outfit-buy')).toHaveTextContent('Buy · 25');
    fireEvent.press(screen.getByTestId('outfit-buy'));
    // BUYING ASKS FIRST since 2026-08-26. Chai is earned slowly, an outfit is
    // bought once, and there is no refund and no undo, so the tap that used to
    // be final now opens a confirmation.
    expect(mockState.buyCalls).toEqual([]);
    fireEvent.press(screen.getByTestId('outfit-buy-confirm-yes'));
    expect(mockState.buyCalls).toEqual([{ data: { outfitId: 'navratri' } }]);
  });

  test('backing out of the confirmation spends nothing', () => {
    // The half that matters: a dialog nobody can decline is a slower tap, not
    // a safeguard.
    renderShop({ balance: 40, equipped: null, outfits: [NAVRATRI] });
    fireEvent.press(screen.getByTestId('outfit-card-navratri'));
    fireEvent.press(screen.getByTestId('outfit-buy'));
    expect(screen.getByTestId('outfit-buy-confirm')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Not yet'));
    expect(mockState.buyCalls).toEqual([]);
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

  test('a hat and an outfit ride the bird at once', () => {
    renderShop({
      balance: 40,
      equipped: 'navratri',
      equippedAccessory: 'pagdi',
      outfits: [{ ...NAVRATRI, owned: true }, { ...PAGDI, owned: true }],
    });

    // The booth opens on whichever item is tapped, and it shows her as she
    // actually is: both slots at once.
    fireEvent.press(screen.getByTestId('outfit-card-navratri'));
    expect(previewOutfit()).toBe('navratri');
    expect(previewAccessory()).toBe('pagdi');
  });

  test('trying a hat on leaves the outfit where it is', () => {
    renderShop({
      balance: 40,
      equipped: 'navratri',
      outfits: [{ ...NAVRATRI, owned: true }, PAGDI],
    });

    fireEvent.press(screen.getByTestId('outfit-card-pagdi'));
    expect(previewAccessory()).toBe('pagdi');
    // The garment is untouched: this is the whole point of the second slot.
    expect(previewOutfit()).toBe('navratri');
  });

  test('taking the hat off says which slot, so the outfit stays on', () => {
    renderShop({
      balance: 40,
      equipped: 'navratri',
      equippedAccessory: 'pagdi',
      outfits: [{ ...NAVRATRI, owned: true }, { ...PAGDI, owned: true }],
    });

    fireEvent.press(screen.getByTestId('outfit-takeoff-pagdi'));
    expect(mockState.equipCalls).toEqual([
      { data: { outfitId: null, slot: 'accessory' } },
    ]);
  });

  test('wearing from the rack names the slot it lands in', () => {
    renderShop({
      balance: 40,
      equipped: null,
      outfits: [{ ...NAVRATRI, owned: true }, { ...PAGDI, owned: true }],
    });

    fireEvent.press(screen.getByTestId('outfit-wear-pagdi'));
    fireEvent.press(screen.getByTestId('outfit-wear-navratri'));
    expect(mockState.equipCalls).toEqual([
      { data: { outfitId: 'pagdi', slot: 'accessory' } },
      { data: { outfitId: 'navratri', slot: 'garment' } },
    ]);
  });

  test('what he is wearing can be taken off', () => {
    renderShop({
      balance: 5,
      equipped: 'navratri',
      outfits: [{ ...NAVRATRI, owned: true }],
    });

    // Tapping what she already wears opens the booth on it, and the booth
    // offers to take that slot off.
    fireEvent.press(screen.getByTestId('outfit-card-navratri'));
    expect(previewOutfit()).toBe('navratri');
    fireEvent.press(screen.getByTestId('outfit-unequip'));
    expect(mockState.equipCalls).toEqual([
      { data: { outfitId: null, slot: 'garment' } },
    ]);
  });
});
