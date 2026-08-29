// Build-28 device regression (native-only): TicketPerforationV rendered
// <Svg width={2} height="100%"> as a NORMAL-FLOW child of an
// indefinite-height stretch row. Web resolves a percentage of an indefinite
// parent to auto, but native Yoga measures the Svg node, and the percentage
// height inflated the perforation strip → row → card until BOTH ticket
// surfaces (home hero JourneyPassCard + journey map header) filled the whole
// iPhone screen — while Expo web looked perfect.
//
// These tests pin the sizing contract from components/journey/TicketParts.tsx:
//  1. No Svg renders inside the ticket fittings until an onLayout measure
//     provides numeric dimensions (nothing percentage-sized in flow, ever).
//  2. The measured Svgs live inside absolutely-positioned wrappers, which
//     Yoga can never grow the parent from.
//  3. Both ticket surfaces carry an explicit maxHeight belt so no future
//     unbounded child can reproduce a full-screen ticket.
//
// True Yoga layout resolution is device/simulator-only; what jest CAN verify
// is that the only ingredients of the bug (percentage-sized normal-flow
// Svgs, missing height caps) stay gone.

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

// ─── mocks ───────────────────────────────────────────────────────────────────

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = ({ children, ...props }: any) =>
    React.createElement(View, props, children);
  return {
    __esModule: true,
    default: passthrough,
    Svg: passthrough,
    G: passthrough,
    Path: passthrough,
    Circle: passthrough,
    Rect: passthrough,
    Ellipse: passthrough,
    Line: passthrough,
    Pattern: passthrough,
    Defs: passthrough,
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const icon = ({ name }: { name: string }) => <Text>{`icon-${name}`}</Text>;
  return { Feather: icon, MaterialCommunityIcons: icon };
});

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
  nativeTextStyle: () => ({}),
  isTallCascadingScript: () => false,
}));

// PressableScale animates via reanimated; a plain View keeps the tree simple
// while preserving style + testID, which is all these tests inspect.
jest.mock('@/components/PressableScale', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    PressableScale: ({ children, style, testID }: any) =>
      React.createElement(View, { style, testID }, children),
  };
});

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#FFFFFF',
    card: '#F5F5F5',
    border: '#E0E0E0',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'hi',
    activeLanguage: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  }),
}));

// JourneyPassCard now imports the tear SFX layer (R4), which pulls in
// expo-audio's native bridge — mock it out; SFX behavior is pinned in
// tear-audio.test.ts and journey-pass-motion.test.tsx.
jest.mock('@/lib/tearAudio', () => ({
  preloadTearAudio: jest.fn(),
  playTearSfx: jest.fn(),
}));

jest.mock('@/lib/useJourneyProgress', () => ({
  useJourneyProgress: () => ({
    current: {
      geoName: 'New Delhi',
      stopNumber: 1,
      stopCount: 9,
      phraseCount: 10,
      masteredCount: 3,
      zoneIndex: 0,
      started: true,
    },
    doneCount: 0,
  }),
}));

// Imported after the mocks are declared.
import {
  TicketPerforationV,
  TicketStripes,
  ZoneStamp,
  stampNameFontSize,
  stampSizeForExtent,
  zoneStampExtent,
} from '@/components/journey/TicketParts';
import {
  HOME_PANEL_H,
  JourneyPassCard,
  STAMP_SIZE,
} from '@/components/journey/JourneyPassCard';

// ─── helpers ─────────────────────────────────────────────────────────────────

const fireLayout = (el: any, width: number, height: number) =>
  fireEvent(el, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height } } });

// Build 30 item 5 additions live at the bottom of this file: the rotated
// stamp's slot sizing and the un-truncated geoName fit.

/** No node anywhere in the tree may carry a percentage dimension. */
const treeHasPercent = (json: unknown) => JSON.stringify(json).includes('%');

// ─── tests ───────────────────────────────────────────────────────────────────

describe('TicketPerforationV stays content-sized (build-28 full-screen regression)', () => {
  it('renders NO svg before measuring — the strip has zero normal-flow content', () => {
    const r = render(<TicketPerforationV dashColor="#ccc" holeColor="#fff" />);
    expect(r.queryByTestId('ticket-perforation-svg')).toBeNull();
    expect(treeHasPercent(r.toJSON())).toBe(false);
  });

  it('after measuring, draws a numeric-height svg inside an absolute wrapper', () => {
    const r = render(<TicketPerforationV dashColor="#ccc" holeColor="#fff" />);
    fireLayout(r.getByTestId('ticket-perforation'), 2, 132);

    const svg = r.getByTestId('ticket-perforation-svg');
    expect(svg.props.height).toBe(132); // number, not "100%"
    expect(svg.props.width).toBe(2);

    const wrap = StyleSheet.flatten(r.getByTestId('ticket-perforation-svg-wrap').props.style);
    expect(wrap.position).toBe('absolute'); // absolute children cannot grow the card

    expect(treeHasPercent(r.toJSON())).toBe(false);
  });
});

describe('TicketStripes stays absolute and numerically sized', () => {
  it('renders no svg until measured, then numeric dimensions only', () => {
    const r = render(<TicketStripes ink="rgba(255,255,255,0.05)" />);
    expect(r.queryByTestId('ticket-stripes-svg')).toBeNull();
    expect(treeHasPercent(r.toJSON())).toBe(false);

    fireLayout(r.getByTestId('ticket-stripes'), 320, 168);
    const svg = r.getByTestId('ticket-stripes-svg');
    expect(svg.props.width).toBe(320);
    expect(svg.props.height).toBe(168);

    const wrap = StyleSheet.flatten(r.getByTestId('ticket-stripes').props.style);
    expect(wrap.position).toBe('absolute');
    expect(treeHasPercent(r.toJSON())).toBe(false);
  });
});

describe('JourneyPassCard height belt', () => {
  it('the home hero pass carries an explicit maxHeight cap with overflow hidden', () => {
    const r = render(<JourneyPassCard onPress={() => {}} />);
    const style = StyleSheet.flatten(r.getByTestId('journey-pass-card').props.style);
    // THE CAP MOVED FROM 260 ON 2026-08-27, and it moved because the design
    // changed rather than because content crept. The home hero is a CARVED
    // STATION BOARD now, so its height is HOME_PANEL_H plus a pediment that
    // takes its own aspect (~18.7%) out of the column width: a 390pt column is
    // 200 + 73 = 273. The belt is still a belt. It sits one step above the
    // widest phone board, so a child that measures itself unbounded still
    // cannot ship a full-screen hero, which is the whole build-28 lesson.
    //
    // TIED TO HOME_PANEL_H ON PURPOSE. Raising the panel's budget without
    // raising the cap would clip the board rather than fail here, and a
    // clipped panel looks BLANK rather than short.
    expect(style.maxHeight).toBeDefined();
    expect(style.maxHeight).toBeLessThanOrEqual(HOME_PANEL_H + 120);
    expect(style.overflow).toBe('hidden');
  });
});

// Build 30 item 5: the -12 degree stamp rotation inflates its bounding box
// by (cos 12 + sin 12) ~= 1.186x, so a 48px stamp spans ~57px. The old
// hard-coded 56px home slot (and 52px journey header slot) clipped the
// rotated corners; both slots now size themselves from zoneStampExtent.
describe('zone stamp geometry (build 30)', () => {
  it('zoneStampExtent covers the full rotated bounding box', () => {
    const rad = (12 * Math.PI) / 180;
    const factor = Math.cos(rad) + Math.sin(rad);
    for (const size of [44, 48]) {
      expect(zoneStampExtent(size)).toBeGreaterThanOrEqual(size * factor);
    }
  });

  it('the home pass stamp slot reserves the rotated extent of the DERIVED stamp', () => {
    // TAKEN FROM THE COMPONENT, NOT RESTATED. This used to recompute
    // `stampSizeForExtent(64 - 8)` from the stub width of the day, and when the
    // stub became a landscape ticket with a border and an inner rule the two
    // silently disagreed: the real stamp got smaller, the test kept checking
    // the old one. A test that re-derives a constant is a second definition of
    // it, which is the same defect this repo names everywhere else.
    const r = render(<JourneyPassCard onPress={() => {}} />);
    const stamp = StyleSheet.flatten(r.getByTestId('zone-stamp').props.style);
    expect(stamp.width).toBe(STAMP_SIZE);
    const slot = StyleSheet.flatten(r.getByTestId('home-stamp-slot').props.style);
    // The rotated bounding box is what has to fit, not the nominal square.
    expect(slot.width).toBeGreaterThanOrEqual(zoneStampExtent(STAMP_SIZE));
    expect(slot.height).toBeGreaterThanOrEqual(zoneStampExtent(STAMP_SIZE));
  });

  it('stampSizeForExtent is the safe inverse of zoneStampExtent', () => {
    for (const extent of [48, 56, 64]) {
      const size = stampSizeForExtent(extent);
      expect(zoneStampExtent(size)).toBeLessThanOrEqual(extent);
      // Not needlessly small either: one more pixel would overflow.
      expect(zoneStampExtent(size + 1)).toBeGreaterThan(extent);
    }
  });

  it('renders the longest real geoName un-truncated (wraps, never ellipsizes)', () => {
    // Longest zone name across every journey line in lib/journeyLines.ts.
    const name = 'Thiruvananthapuram Central';
    const r = render(<ZoneStamp ink="#000" zone={3} name={name} size={44} />);
    const text = r.getByTestId('zone-stamp-name');
    // No numberOfLines means react-native wraps on spaces instead of ever
    // showing an ellipsis, and the full uppercased name is in the tree.
    expect(text.props.numberOfLines).toBeUndefined();
    expect(r.getByText(name.toUpperCase())).toBeTruthy();
    // The font shrinks toward the fit computed from the longest word (the
    // 3px floor may sit a hair over the exact budget; wrapping, not an
    // ellipsis, absorbs any remainder because numberOfLines is gone).
    const style = StyleSheet.flatten(text.props.style);
    expect(style.fontSize).toBe(stampNameFontSize(name, 44));
    expect(style.fontSize).toBeGreaterThanOrEqual(3);
    expect(style.fontSize).toBeLessThan(7);
  });

  it('short names keep the full-size stamp type', () => {
    const r = render(<ZoneStamp ink="#000" zone={1} name="Dwarka" size={48} />);
    const style = StyleSheet.flatten(r.getByTestId('zone-stamp-name').props.style);
    expect(style.fontSize).toBe(7);
    expect(stampNameFontSize('Dwarka', 48)).toBe(7);
  });
});

// R1 (32.1): the stub's four device defects shared one cause — fixed-size
// type inside a fixed 64px column. Pins: the stamp's inner type scales with
// the ring (a 7px FARE ZONE label overflowed the top-arc chord of a 48px
// ring), the name budget respects the narrower lower-arc chord, and all
// stamp type ignores OS font scaling so accessibility text sizes cannot
// re-introduce the collision.
describe('zone stamp type scales as a unit (R1)', () => {
  const labelOf = (r: ReturnType<typeof render>) => r.getByText('PLATFORM');

  it('label and numeral fonts derive from the ring size', () => {
    const small = render(<ZoneStamp ink="#000" zone={2} name="Anand" size={47} />);
    const smallLabel = StyleSheet.flatten(labelOf(small).props.style);
    expect(smallLabel.fontSize).toBe(Math.round(47 * 0.115)); // 5
    small.unmount();

    const big = render(<ZoneStamp ink="#000" zone={2} name="Anand" size={52} />);
    const bigLabel = StyleSheet.flatten(labelOf(big).props.style);
    expect(bigLabel.fontSize).toBe(Math.round(52 * 0.115)); // 6
    expect(bigLabel.fontSize).toBeGreaterThan(smallLabel.fontSize as number);
  });

  it('the label chord budget keeps FARE ZONE inside the ring at stub size', () => {
    const size = stampSizeForExtent(64 - 8);
    const r = render(<ZoneStamp ink="#000" zone={1} name="Anand" size={size} />);
    const label = StyleSheet.flatten(labelOf(r).props.style);
    // 9 glyphs at ~0.7em advance + tracking must clear the chord where the
    // label row sits (~0.8 of the diameter).
    const estimatedWidth =
      9 * (label.fontSize as number) * 0.7 + 8 * (label.letterSpacing as number);
    expect(estimatedWidth).toBeLessThan(size * 0.8);
  });

  it('stamp type is pinned against OS font scaling', () => {
    const r = render(<ZoneStamp ink="#000" zone={1} name="New Delhi" size={47} />);
    expect(labelOf(r).props.allowFontScaling).toBe(false);
    expect(r.getByText('1').props.allowFontScaling).toBe(false);
    expect(r.getByTestId('zone-stamp-name').props.allowFontScaling).toBe(false);
  });

  it('the name budget respects the lower-arc chord (no mid-word wrap room)', () => {
    // "AHMEDABAD" (9 glyphs) at the old 0.84 budget computed to a font whose
    // estimated run EQUALED the budget — zero margin, guaranteed mid-word
    // wrap on device. The 0.72 budget leaves real margin.
    const size = 47;
    const font = stampNameFontSize('Ahmedabad Junction', size);
    expect(9 * font * 0.7).toBeLessThanOrEqual(size * 0.72 + 0.001);
  });
});

// R1: the vertical GUJARAT EXPRESS wordmark used a fixed 8px font with
// numberOfLines={1}, which ellipsized whenever the measured run came up
// short. Now the font fits the measured extent by construction and the
// ellipsis path is gone entirely.
// THE ROTATED WORDMARK IS GONE, and these two cases are INVERTED rather than
// deleted.
//
// The stub used to be a bare vertical column: a fare-zone stamp with the line's
// name rotated 90 degrees beside it, fitted to its measured run by
// `stubLineFontSize` and shortened whole word by whole word so it could never
// ellipsize. All of that was real work and it is all retired, because the stub
// is no longer a column. It is the right-hand half of a landscape ticket:
// "this area can fit a full smaller ticket with stub, only keep stamp on stub"
// (owner, 2026-08-27, chat 12).
//
// The line's name did not go missing with it. It is on the ticket's other half
// now, horizontal, and carved across the board's pediment above that. What
// these cases pin is the owner's instruction: the stub carries the stamp and
// NOTHING else, so a future port cannot quietly rotate a wordmark back onto it.
describe('the stub carries the stamp and nothing else', () => {
  it('has no rotated wordmark on it any more', () => {
    const r = render(<JourneyPassCard onPress={() => {}} />);
    expect(r.queryByTestId('stub-line-name')).toBeNull();
    expect(r.queryByTestId('stub-line-slot')).toBeNull();
  });

  it('still stamps the fare zone, which is the half thing that stayed', () => {
    const r = render(<JourneyPassCard onPress={() => {}} />);
    expect(r.getByTestId('home-stamp-slot')).toBeTruthy();
    expect(r.getByTestId('zone-stamp')).toBeTruthy();
  });
});

