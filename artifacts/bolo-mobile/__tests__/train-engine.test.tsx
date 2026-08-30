// THE CANONICAL TRAIN IS A PAINTING (build 21, owner: "here is the train
// image, use it and replace our canonical train"). This suite used to pin
// the svg engine's multicolor contract: every palette role in the tree, the
// headlamp as the only tint-coloured surface. INVERTED rather than deleted:
// a painting has one paint, so the tint appears NOWHERE, and what is pinned
// instead is that the picture is the delivered asset, that the wrapper keeps
// the caller's layout box (width x height), and that the picture is absolute,
// numerically sized and anchored to the box's bottom (TicketParts sizing
// contract: the build-28 percentage-height regression must stay impossible,
// and the chat 11 render trap, an Image sized by percentages resolving to its
// intrinsic pixels, must stay impossible too).

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { TRAIN_LOCO, TrainEngine, trainImageSize } from '@/components/journey/TrainEngine';

const HIDDEN = { includeHiddenElements: true } as const;
const TINT = '#ABCDEF';

describe('TrainEngine, the painted locomotive', () => {
  it.each(['none', 'drive', 'bob'] as const)('draws the delivered picture in %s motion', (motion) => {
    render(<TrainEngine tint={TINT} width={56} height={37} motion={motion} />);
    const pic = screen.getByTestId('train-engine-picture', HIDDEN);
    expect(pic.props.source).toBe(TRAIN_LOCO);
  });

  it('is one paint: the tint colours nothing', () => {
    const r = render(<TrainEngine tint={TINT} width={56} height={37} />);
    expect(JSON.stringify(r.toJSON())).not.toContain(TINT);
  });

  it('keeps the caller layout box; the picture is absolute, numeric, and rests on the bottom', () => {
    render(<TrainEngine tint="#ffffff" width={56} height={37} />);
    const wrap = StyleSheet.flatten(screen.getByTestId('train-engine').props.style);
    expect(wrap.width).toBe(56);
    expect(wrap.height).toBe(37);
    const pic = StyleSheet.flatten(screen.getByTestId('train-engine-picture', HIDDEN).props.style);
    expect(pic.position).toBe('absolute');
    expect(pic.bottom).toBe(0);
    expect(pic.left).toBe(0);
    const size = trainImageSize(37);
    expect(pic.width).toBe(size.width);
    expect(pic.height).toBe(size.height);
    // Taller than the body box: the stack and the steam hang above it.
    expect(size.height).toBeGreaterThan(37);
    // No percentage sizing anywhere in the rendered tree.
    expect(JSON.stringify(screen.toJSON())).not.toContain('"%');
  });
});
