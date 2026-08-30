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
 * The Chai surfaces and how many amounts each one marks. The count is a raw
 * substring count over source text, so a glyph inside a conditional branch
 * still counts and only deleting it from the file lowers the number. Web's
 * twin census lives in
 * artifacts/gujarati-coach/src/test/chai-stall.test.tsx.
 */
const GLYPH_SITES: Record<string, number> = {
  'components/ChaiStall.tsx': 1, // the band's own balance readout
  'app/(app)/(tabs)/index.tsx': 2, // Chai stat cell + streak-repair banner balance
  'components/ChaiWallet.tsx': 3, // header balance, the shared ChaiCoin, the per-row delta. The empty-history glyph went with the tile-to-list rebuild (2026-08-19): the empty state is the same LIST as the populated one, and that list has no glyph in its heading.
  'components/journey/SignalEncounter.tsx': 1, // signal-chai-chip
  'app/(app)/practice/[id].tsx': 1, // session-chai-pill
  'components/journey/ZoneCloseout.tsx': 1, // closeout payoff chip
  // THE BAZAAR IS FOUR DOORS (build 22): the shop's try-on Buy and the rail
  // card's price, the header's Chai pill every door shares, the Ticket
  // Counter's stamp price. The old street's four went with the street.
  'components/bazaar/OutfitShop.tsx': 2,
  'components/bazaar/BazaarHeader.tsx': 1,
  'components/bazaar/PassCards.tsx': 1,
  // The paywall's annual card wears three kulhads and the trial box one (build 22).
  'app/(app)/paywall.tsx': 4,
  'components/SessionStats.tsx': 1, // the session-chai pill in the practice, review and game headers. Build 21: it drew a 🍵 emoji, which read as green tea ("this is the wrong icon for chai", owner); it now draws the kulhad like every other Chai surface.
  'components/journey/JourneyPassCard.tsx': 1, // the cup before "Chai and surprises along the way" on the home pass (build 21, the owner's home mockup)
};

const MOBILE_GLYPH_COUNT = 19; // 15 until build 22: the street's 4 became 4 across the doors, and the paywall added 4

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
    // The BAND is the cropped box (BOTTOM_CROP 0.12). The SCENE LAYER
    // inside it keeps 1024/572, and that is the box every fraction map
    // below is a fraction OF.
    expect(flat.aspectRatio).toBeCloseTo(1024 / (572 * (1 - 0.12)), 5);
    expect(flat.height).toBeUndefined();
    const layer = screen.getByTestId('chai-stall-scene-layer', HIDDEN);
    const layerFlat = Object.assign({}, ...[layer.props.style].flat(2));
    expect(layerFlat.aspectRatio).toBeCloseTo(1024 / 572, 5);
  });

  test('the kettle map still lands on the kettle at full width', () => {
    // Verified rather than assumed: feed the band a real full-width layout
    // and check the plume's resolved pixels are exactly the KETTLE fractions
    // of THAT box (left 21%, bottom 46%, width 12%) — the same three numbers
    // as web, and scale-free because the aspect box never changes shape.
    render(<ChaiStallVignette />);
    const width = 390 - 40; // a phone viewport minus the home screen's padding
    const height = width / (1024 / 572);
    // onLayout lives on the inner SCENE LAYER, not the band. RNTL walks UP
    // from the target looking for an onLayout prop and never down, so
    // firing at the band silently does nothing and every fraction stays 0.
    fireEvent(screen.getByTestId('chai-stall-scene-layer', HIDDEN), 'layout', {
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
    const height = width / (1024 / 572);
    // Same as the kettle map: the measurer is the inner scene layer.
    fireEvent(screen.getByTestId('chai-stall-scene-layer', HIDDEN), 'layout', {
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
    // INVERTED IN BUILD 17 with the owner's home mockup: the title, the
    // purpose line and the balance sit top-LEFT now, Chacha-ji on the right,
    // so the scrim is a left-side band fading rightward and the man stays in
    // the light. The text still carries its own shadow on top of it.
    render(<ChaiStallVignette balance={3} />);
    const scrim = screen.getByTestId('chai-stall-scrim', HIDDEN);
    const scrimStyle = Object.assign({}, ...[scrim.props.style].flat(2));
    expect(scrimStyle.top).toBe(0);
    expect(scrimStyle.bottom).toBe(0);
    expect(scrimStyle.left).toBe(0);
    // Just over half the width, so the right of the art is untouched.
    expect(scrimStyle.width).toBe('58%');
    expect(scrimStyle.right).toBeUndefined();
    // jest-expo's LinearGradient stub does not forward `colors` onto the host
    // view, so the ramp itself is pinned at the source: near-opaque under the
    // text, fading to nothing before the man.
    const src = read('components/ChaiStall.tsx');
    expect(src).toContain("colors={['rgba(0,0,0,0.82)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}");

    const title = screen.getByTestId('chai-stall-title', HIDDEN);
    const titleStyle = Object.assign({}, ...[title.props.style].flat(2));
    expect(titleStyle.color).toBe('#FFFFFF');
    expect(titleStyle.textShadowColor).toBe('rgba(0,0,0,0.9)');
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
