import React from 'react';
import { View } from 'react-native';

/**
 * TWO INDEPENDENT COLUMNS ON A TABLET, and the reason it is not flexWrap.
 *
 * Build 29 reflowed home with `flexWrap`, which was right about one thing and
 * wrong about another. Right: one source order, so a phone reads the exact
 * sequence it always read and there is no second ordering to maintain. Wrong:
 * flexWrap lays out in ROWS, and a row is as tall as its tallest child, so a
 * short card beside a tall one leaves a hole underneath it. The owner saw it
 * immediately, "extra padding", and moving which card sits where only moved
 * the hole.
 *
 * This keeps the good half and drops the bad one. Children still arrive in one
 * source order; they are dealt into two columns that stack INDEPENDENTLY, so a
 * short card is followed by the next card and never by empty space.
 *
 * HOW A CHILD SAYS WHERE IT GOES: by the width already on its style, which the
 * screen sets from `colHalf` / `colFull`. No new prop to thread, no wrapper per
 * section, and nothing to keep in step with the phone layout.
 *
 *   width '100%'  a full-width band. Ends the current pair of columns, draws
 *                 across, and starts a fresh pair after it.
 *   width '48.5%' a column item, dealt to whichever column is shorter.
 *   anything else passed through untouched, which is what invisible children
 *                 like StreakRepairSheet want: they occupy no column slot.
 *
 * On a phone this renders its children and nothing else.
 */
function widthOf(el: React.ReactElement): string | undefined {
  const style = (el.props as { style?: unknown }).style;
  const parts = Array.isArray(style) ? style : [style];
  for (const p of parts) {
    if (p && typeof p === 'object' && 'width' in p) {
      const w = (p as { width?: unknown }).width;
      if (typeof w === 'string') return w;
    }
  }
  return undefined;
}

export function HomeColumns({
  wide,
  gap = 24,
  children,
}: {
  wide: boolean;
  gap?: number;
  children: React.ReactNode;
}) {
  // THE PHONE PATH FILTERS TOO (build 29). It used to hand children straight
  // through, and eight spaces between a tag and a JSX comment on the same
  // line reached a View as a string: "Text strings must be rendered within a
  // <Text> component", on every phone, while the iPad path below already
  // dropped non-elements and hid the fault. Same rule on both paths now.
  if (!wide) return <>{React.Children.toArray(children).filter(React.isValidElement)}</>;

  const bands: React.ReactNode[] = [];
  let left: React.ReactNode[] = [];
  let right: React.ReactNode[] = [];
  // Dealt by COUNT rather than by measured height, because heights are not
  // knowable at render. Alternating keeps the two columns close enough, and
  // unlike flexWrap an imbalance costs a longer column, never a hole.
  let n = 0;

  const flush = (key: string) => {
    if (left.length === 0 && right.length === 0) return;
    bands.push(
      <View key={`band-${key}`} style={{ flexDirection: 'row', gap, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>{left}</View>
        <View style={{ flex: 1 }}>{right}</View>
      </View>,
    );
    left = [];
    right = [];
  };

  React.Children.toArray(children).forEach((child, i) => {
    if (!React.isValidElement(child)) return;
    const w = widthOf(child);
    if (w === '100%') {
      flush(`b${i}`);
      bands.push(child);
      return;
    }
    if (w === undefined) {
      // Invisible or self-positioning: keep it where it is, cost it no slot.
      bands.push(child);
      return;
    }
    // THE WIDTH ON THE CHILD IS A LABEL, NOT A SIZE. It says "I am a column
    // item"; once dealt, the column itself is the half, so the child must fill
    // it. Left as 48.5% the card is halved twice and comes out a quarter of the
    // screen, which is what the first cut of this did: "All-Access" wrapped one
    // letter per line.
    const filled = React.cloneElement(child as React.ReactElement<{ style?: unknown }>, {
      style: [(child.props as { style?: unknown }).style, { width: '100%' }],
    });
    if (n % 2 === 0) left.push(filled);
    else right.push(filled);
    n += 1;
  });
  flush('last');

  return <>{bands}</>;
}
