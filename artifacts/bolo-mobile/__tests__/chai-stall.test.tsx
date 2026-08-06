import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  ChaiGlyph,
  ChaiStallVignette,
  STALL_ASSETS,
  STEAM_REST_OPACITY,
  steamLoop,
} from '@/components/ChaiStall';

// ---------------------------------------------------------------------------
// Chacha-ji's Chai Stall, mobile side — the twin of the web suite in
// artifacts/gujarati-coach/src/test/chai-stall.test.tsx (owner ruling 4: same
// asset, same loop, same layer map, built once).
//
//  - the kulhad glyph is Chai's inline mark and renders the delivered art
//  - the stall vignette is a layer-mapped scene: stall + one steam plume
//  - the steam loop is gated on Reanimated's useReducedMotion and rests on a
//    visible frame rather than disappearing
//  - CENSUS: every Chai surface carries the glyph and no Feather coffee
//    survives on one. The census is a count, not a presence check, so a NEW
//    Chai surface that forgets the glyph fails here instead of shipping a
//    coffee cup next to a kulhad.
//
// Both the glyph and the vignette are hidden from the accessibility tree
// (they are decoration next to text that already states the amount), so every
// query below opts into hidden elements.
// ---------------------------------------------------------------------------

const ROOT = path.join(__dirname, '..');
const HIDDEN = { includeHiddenElements: true } as const;

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/**
 * The Chai surfaces and how many amounts each one marks. Mobile carries SIX;
 * web carries seven because its wallet sheet marks both spend buttons while
 * mobile's balance row marks the balance itself.
 */
const GLYPH_SITES: Record<string, number> = {
  'components/ChaiStall.tsx': 1, // the band's own balance readout
  'app/(app)/(tabs)/index.tsx': 1, // Chai stat cell
  'components/ChaiWallet.tsx': 3, // balance badge, Equip · 5, Start · 10
  'components/journey/SignalEncounter.tsx': 1, // signal-chai-chip
  'app/(app)/practice/[id].tsx': 1, // session-chai-pill
  'components/journey/ZoneCloseout.tsx': 1, // closeout payoff chip
};

const MOBILE_GLYPH_COUNT = 8;

describe('chai glyph', () => {
  test('renders the delivered kulhad art at the caller size', () => {
    render(<ChaiGlyph size={14} />);
    const glyph = screen.getByTestId('chai-glyph', HIDDEN);
    expect(glyph.props.source).toBe(STALL_ASSETS.kulhad);
    expect(glyph.props.style).toEqual(
      expect.arrayContaining([{ width: 14, height: 14 }]),
    );
  });
});

describe('chai stall scene', () => {
  test('renders the scene with the steam plume layered over it', () => {
    render(<ChaiStallVignette />);
    expect(screen.getByTestId('chai-stall-scene', HIDDEN).props.source).toBe(
      STALL_ASSETS.scene,
    );
    expect(screen.getByTestId('chai-stall-steam', HIDDEN)).toBeTruthy();
  });

  test('is a full-width band at the scene aspect', () => {
    // Owner correction (Aug 6): the stall is a SCENE, not an icon — it fills
    // the column at the art's own aspect instead of the 56px wallet-vignette
    // scale it shipped at. Yoga derives the height from the measured width.
    render(<ChaiStallVignette />);
    const box = screen.getByTestId('chai-stall-vignette', HIDDEN);
    const flat = Object.assign({}, ...[box.props.style].flat(2));
    expect(flat.width).toBe('100%');
    expect(flat.aspectRatio).toBeCloseTo(1024 / 574, 5);
    expect(flat.height).toBeUndefined();
  });

  test('the kettle map still lands on the kettle at full width', () => {
    // Verified rather than assumed: feed the band a real full-width layout
    // and check the plume's resolved pixels are exactly the KETTLE fractions
    // of THAT box (left 21%, bottom 46%, width 12%) — the same three numbers
    // as web, and scale-free because the aspect box never changes shape.
    render(<ChaiStallVignette />);
    const width = 390 - 40; // a phone viewport minus the home screen's padding
    const height = width / (1024 / 574);
    fireEvent(screen.getByTestId('chai-stall-vignette', HIDDEN), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });

    const steam = screen.getByTestId('chai-stall-steam', HIDDEN);
    const flat = Object.assign({}, ...[steam.props.style].flat(2));
    expect(flat.left).toBeCloseTo(width * 0.21, 5);
    expect(flat.bottom).toBeCloseTo(height * 0.46, 5);
    expect(flat.width).toBeCloseTo(width * 0.12, 5);
    // cover on a same-aspect box crops nothing, which is what keeps the map
    // honest at this new size.
    expect(screen.getByTestId('chai-stall-scene', HIDDEN).props.resizeMode).toBe(
      'cover',
    );
  });

  test('Chacha-ji is his own layer, placed by his own fraction map', () => {
    // He is NEVER baked into stall.png: the banked pour-on-earn moment has to
    // be able to animate him, which a painted-in figure makes impossible.
    render(<ChaiStallVignette />);
    const width = 390 - 40; // a phone viewport minus the home screen's padding
    const height = width / (1024 / 574);
    fireEvent(screen.getByTestId('chai-stall-vignette', HIDDEN), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });

    const chachaji = screen.getByTestId('chai-stall-chachaji', HIDDEN);
    // Placement and the pointerEvents rule live on the wrapper View (Image
    // takes no pointerEvents prop); the art itself is the child image.
    expect(
      screen.getByTestId('chai-stall-chachaji-image', HIDDEN).props.source,
    ).toBe(STALL_ASSETS.chachaji);
    expect(STALL_ASSETS.chachaji).not.toBe(STALL_ASSETS.scene);
    // Same three-number contract as the kettle map, and the same numbers as
    // web. Placement itself was verified by looking at the composite; these
    // pin what that verification chose.
    const flat = Object.assign({}, ...[chachaji.props.style].flat(2));
    expect(flat.left).toBeCloseTo(width * 0.485, 5);
    expect(flat.bottom).toBeCloseTo(height * 0.17, 5);
    expect(flat.width).toBeCloseTo(width * 0.195, 5);
    // Height comes from the art's own aspect, so scale stays one number.
    expect(flat.height).toBeCloseTo((width * 0.195) / (386 / 520), 5);
    // Decoration, not a control.
    expect(chachaji.props.pointerEvents).toBe('none');
  });

  test('names itself and shows the balance it is given', () => {
    // The band is a wallet surface, not scenery: it says whose stall it is and
    // what the learner has. The balance is a PROP — the component never runs
    // its own query, so it cannot drift from the stat cell or the wallet.
    render(<ChaiStallVignette balance={12} />);
    expect(screen.getByTestId('chai-stall-title', HIDDEN)).toHaveTextContent(
      "Chacha-ji's Chai Stall",
    );
    expect(screen.getByTestId('chai-stall-balance', HIDDEN)).toHaveTextContent(
      '12',
    );
    // Rendered with the kulhad, exactly like every other Chai amount.
    expect(screen.getByTestId('chai-glyph', HIDDEN)).toBeTruthy();
  });

  test("shows the wallet's dash while the balance is still loading", () => {
    render(<ChaiStallVignette />);
    expect(screen.getByTestId('chai-stall-balance', HIDDEN)).toHaveTextContent(
      '-',
    );
  });

  test('the overlay is legible over the art, not just where it is dark', () => {
    // Both ends of the scene are in play: bright sky on the right, dark awning
    // on the left. The scrim therefore spans the full width rather than
    // sitting behind the text, and the text carries its own shadow.
    render(<ChaiStallVignette balance={3} />);
    const scrim = screen.getByTestId('chai-stall-scrim', HIDDEN);
    const scrimStyle = Object.assign({}, ...[scrim.props.style].flat(2));
    expect(scrimStyle.left).toBe(0);
    expect(scrimStyle.right).toBe(0);
    expect(scrimStyle.bottom).toBe(0);
    // Must not reach the plume, which starts at 46%.
    expect(scrimStyle.height).toBe('40%');
    // jest-expo's LinearGradient stub does not forward `colors` onto the host
    // view, so the ramp itself is pinned at the source: transparent at the top
    // (no hard edge across the art) down to a near-opaque base under the text.
    const src = read('components/ChaiStall.tsx');
    expect(src).toContain("colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.40)', 'rgba(0,0,0,0.75)']}");

    const title = screen.getByTestId('chai-stall-title', HIDDEN);
    const titleStyle = Object.assign({}, ...[title.props.style].flat(2));
    expect(titleStyle.color).toBe('#FFFFFF');
    expect(titleStyle.textShadowColor).toBe('rgba(0,0,0,0.8)');
  });

  test('stays decorative when no tap target is asked for', () => {
    render(<ChaiStallVignette />);
    expect(screen.queryByTestId('chai-stall-button')).toBeNull();
    const box = screen.getByTestId('chai-stall-vignette', HIDDEN);
    expect(box.props.accessibilityElementsHidden).toBe(true);
    expect(box.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('given onPress it is a labelled button, not decoration', () => {
    const onPress = jest.fn();
    render(
      <ChaiStallVignette
        onPress={onPress}
        accessibilityLabel="Open your Chai wallet"
        balance={12}
      />,
    );
    const button = screen.getByLabelText('Open your Chai wallet');
    expect(button.props.accessibilityRole).toBe('button');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('the title and balance do not add a second tap target', () => {
    // The overlay is text on a non-pressable layer inside the button, and the
    // scene stays out of the a11y tree, so a screen reader finds ONE node with
    // ONE name however much text the band grows.
    const onPress = jest.fn();
    render(
      <ChaiStallVignette
        onPress={onPress}
        accessibilityLabel="Open your Chai wallet"
        balance={12}
      />,
    );
    expect(screen.getAllByLabelText('Open your Chai wallet')).toHaveLength(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    // Chacha-ji is part of that one target, not a second one.
    expect(
      screen.getByTestId('chai-stall-chachaji', HIDDEN).props.pointerEvents,
    ).toBe('none');
    const box = screen.getByTestId('chai-stall-vignette', HIDDEN);
    expect(box.props.accessibilityElementsHidden).toBe(true);
    expect(box.props.pointerEvents).toBe('none');
  });

  test('the steam loop stops under reduced motion, still visible', () => {
    // The contract lives in a plain function so the ruling is testable
    // without reaching through Reanimated's worklets: reduced motion holds
    // the plume on its rest frame, and that frame is a VISIBLE plume — the
    // vignette never degrades to a blank layer.
    expect(steamLoop(true).animate).toBe(false);
    expect(steamLoop(false).animate).toBe(true);
    expect(steamLoop(true).restOpacity).toBe(STEAM_REST_OPACITY);
    expect(STEAM_REST_OPACITY).toBeGreaterThan(0);
    // And the component really consults the platform preference.
    expect(read('components/ChaiStall.tsx')).toContain('useReducedMotion()');
  });
});

describe('chai glyph census (mobile)', () => {
  test('every Chai surface carries the glyph, with the exact expected count', () => {
    const counts: Record<string, number> = {};
    for (const file of Object.keys(GLYPH_SITES)) {
      counts[file] = read(file).split('<ChaiGlyph').length - 1;
    }
    // Compared as an object so a failure names the offending file.
    expect(counts).toEqual(GLYPH_SITES);

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(MOBILE_GLYPH_COUNT);
  });

  test('no Feather coffee survives on a Chai surface', () => {
    const survivors: string[] = [];
    for (const file of Object.keys(GLYPH_SITES)) {
      // Comments are stripped first: ChaiStall.tsx is itself a census site
      // now, and the ChaiGlyph docstring quotes the very element it replaced
      // (`<Feather name="coffee" …>`). Prose must not satisfy — or trip — a
      // check on what the file actually renders.
      const src = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (/name="coffee"/.test(src)) survivors.push(file);
    }
    expect(survivors).toEqual([]);
  });

  test('the food-topic icon is deliberately still coffee', () => {
    // Owner ruling: lib/ui.ts maps the Utensils TOPIC, not a Chai amount.
    // Swapping it would stamp the currency mark on a phrasebook topic, so it
    // is pinned here rather than left to look like an oversight.
    expect(read('lib/ui.ts')).toContain("Utensils: 'coffee'");
  });
});
