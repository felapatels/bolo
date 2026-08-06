import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
  'app/(app)/(tabs)/index.tsx': 1, // Chai stat cell
  'components/ChaiWallet.tsx': 3, // balance badge, Equip · 5, Start · 10
  'components/journey/SignalEncounter.tsx': 1, // signal-chai-chip
  'app/(app)/practice/[id].tsx': 1, // session-chai-pill
  'components/journey/ZoneCloseout.tsx': 1, // closeout payoff chip
};

const MOBILE_GLYPH_COUNT = 7;

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

describe('chai stall vignette', () => {
  test('renders the scene with the steam plume layered over it', () => {
    render(<ChaiStallVignette height={56} />);
    expect(screen.getByTestId('chai-stall-scene', HIDDEN).props.source).toBe(
      STALL_ASSETS.scene,
    );
    expect(screen.getByTestId('chai-stall-steam', HIDDEN)).toBeTruthy();
  });

  test('keeps the scene aspect so the kettle layer map stays true', () => {
    render(<ChaiStallVignette height={56} />);
    const box = screen.getByTestId('chai-stall-vignette', HIDDEN);
    const flat = Object.assign({}, ...[box.props.style].flat(2));
    expect(flat.height).toBe(56);
    expect(Math.round(flat.width)).toBe(Math.round(56 * (1024 / 574)));
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
      if (/name="coffee"/.test(read(file))) survivors.push(file);
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
