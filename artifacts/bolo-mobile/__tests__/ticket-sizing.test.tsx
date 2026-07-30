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
  return {
    Feather: ({ name }: { name: string }) => <Text>{`icon-${name}`}</Text>,
  };
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
  zoneStampExtent,
} from '@/components/journey/TicketParts';
import { JourneyPassCard } from '@/components/journey/JourneyPassCard';

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
    // Content tops out around ~190px; anything near screen height means the
    // build-28 regression is back.
    expect(style.maxHeight).toBeDefined();
    expect(style.maxHeight).toBeLessThanOrEqual(260);
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

  it('the home pass stamp slot reserves the rotated extent', () => {
    const r = render(<JourneyPassCard onPress={() => {}} />);
    const slot = StyleSheet.flatten(r.getByTestId('home-stamp-slot').props.style);
    expect(slot.width).toBeGreaterThanOrEqual(zoneStampExtent(48));
    expect(slot.height).toBeGreaterThanOrEqual(zoneStampExtent(48));
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
