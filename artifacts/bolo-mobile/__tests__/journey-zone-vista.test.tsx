import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ZoneVista } from '@/components/journey/Scenery';
import {
  ZONE_VISTA,
  ZONE_VISTA_Y,
  zoneBackdrop,
  zoneVistaOffset,
  zoneVistaY,
} from '@/lib/zoneBackdrops';

// THE POSTCARD'S PICTURE SIDE IS A CROP OF THE ZONE'S OWN PAINTING.
//
// It was a hand-coded SVG landmark until 2026-08-26, which was right while the
// map was flat and wrong the moment the zones were painted: a drawn gateway
// sitting on top of a painted one, the last vector left on a painted map.
//
// Web twin: gujarati-coach/src/test/journey-zone-vista.test.tsx. This side
// carries one job web does not: React Native has NO object-position, so the
// offset web hands to CSS in one line is arithmetic here, and arithmetic is
// what a test is for.

describe('which band of the painting each postcard shows', () => {
  it('holds exactly the six offsets web holds', () => {
    expect(ZONE_VISTA_Y).toEqual([8, 8, 8, 0, 8, 16]);
  });

  it('keeps zone 4 off the skyline and zone 6 low, for stated reasons', () => {
    // Zone 4's chai-stall street is roofed by awnings and lantern strings from
    // its first row, so the skyline band lands inside an arcade and reads as
    // mush at 56px. Zone 6's palace domes only clear the band that far down,
    // and the terminus should look like one.
    expect(zoneVistaY(3)).toBe(0);
    expect(zoneVistaY(5)).toBe(16);
    for (const skyline of [0, 1, 2, 4]) expect(zoneVistaY(skyline)).toBe(8);
  });

  it('falls back to the skyline for an unknown zone, not to zero', () => {
    // Zero is a real chosen value for zone 4, so it must not double as the
    // "no idea" answer.
    expect(zoneVistaY(99)).toBe(8);
  });

  it('agrees with web on the frame and the paintings', () => {
    expect(ZONE_VISTA).toEqual({
      height: 56,
      grayedOpacity: 0.55,
      artW: 1280,
      artH: 2276,
    });
  });
});

describe('the offset that stands in for object-position', () => {
  // CSS reads `object-position: center Y%` as "line up Y% of the picture with
  // Y% of the frame", which for a picture taller than its frame is Y% of the
  // overflow. These pin that reading, because getting it wrong is silent: the
  // picture still renders, just showing the wrong part of the painting.
  const W = 350;
  const COVER_H = W * (2276 / 1280); // 622.65…

  it('scales the painting to the postcard width', () => {
    expect(zoneVistaOffset(0, W).width).toBe(W);
    expect(zoneVistaOffset(0, W).height).toBeCloseTo(COVER_H, 5);
  });

  it('slides it up by the offset percentage of the overflow', () => {
    const slack = COVER_H - 56;
    expect(zoneVistaOffset(0, W).top).toBeCloseTo(-0.08 * slack, 5);
    expect(zoneVistaOffset(5, W).top).toBeCloseTo(-0.16 * slack, 5);
  });

  it('leaves zone 4 flush with the top of the painting', () => {
    // Zone 4 sits at 0, so its top offset must be exactly 0 and not a tiny
    // negative from floating point: it is the one zone whose band is the very
    // first rows of the picture.
    expect(zoneVistaOffset(3, W).top).toBe(-0);
  });

  it('never slides a picture that is shorter than its frame', () => {
    // A zero-width layout pass is the real case: onLayout has not run yet.
    // Sliding on a negative overflow would push the picture off the frame.
    expect(zoneVistaOffset(5, 0)).toEqual({ width: 0, height: 0, top: -0 });
  });
});

describe('the vista draws the painting, not the drawn scene', () => {
  /** The picture only mounts once a layout pass has given the band a width,
   *  because the offset cannot be worked out without one. The test renderer
   *  lays nothing out, so it plays that pass itself. */
  const layOut = (zoneIndex: number, width = 350) =>
    fireEvent(screen.getByTestId(`zone-vista-${zoneIndex}`), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height: 56 } },
    });

  it('shows the drawn scene until it knows how wide it is', () => {
    render(<ZoneVista zoneIndex={0} accent="#c2410c" grayed={false} />);
    // Not a bug and not a flash in practice: the layout pass lands in the same
    // frame. It is asserted so the fallback is known to be reachable.
    expect(screen.queryByTestId('zone-vista-art-0')).toBeNull();
  });

  it('shows each zone its own painting at its own offset', () => {
    for (let z = 0; z < 6; z++) {
      render(<ZoneVista zoneIndex={z} accent="#c2410c" grayed={false} />);
      layOut(z);
      const art = screen.getByTestId(`zone-vista-art-${z}`);
      expect(art.props.source).toBe(zoneBackdrop(z));
      expect(art.props.resizeMode).toBe('cover');
      const st = StyleSheet.flatten(art.props.style) as { top: number };
      expect(st.top).toBeCloseTo(zoneVistaOffset(z, 350).top, 5);
      screen.unmount();
    }
  });

  it('drains a locked showroom zone instead of greying it', () => {
    // React Native cannot run web's `grayscale` filter, so the honest
    // equivalent is to pull the picture back toward the gradient under it.
    render(<ZoneVista zoneIndex={0} accent="#c2410c" grayed />);
    layOut(0);
    expect(screen.getByTestId('zone-vista-art-0')).toBeTruthy();
    const drained = screen
      .UNSAFE_getAllByType(require('react-native').View)
      .map((v: { props: { style?: unknown } }) => StyleSheet.flatten(v.props.style) as { opacity?: number })
      .filter((st) => st?.opacity === ZONE_VISTA.grayedOpacity);
    expect(drained.length).toBe(1);
  });
});
