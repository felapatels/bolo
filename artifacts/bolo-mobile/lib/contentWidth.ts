import { useWindowDimensions } from 'react-native';

/**
 * THE CONTENT COLUMN (build 25, the iPad ruling of 2026-08-30).
 *
 * Every screen in this app is a phone column: a `Screen`, a scroller with 20pt
 * of side padding, and art sized off the window width. On a phone the window
 * IS the column. On an iPad it is not: a 13-inch iPad is 1032pt across, and a
 * game tile, a bazaar band or the boarding pass stretched to that width reads
 * as a poster, not a card.
 *
 * The owner chose the cheapest honest iPad over an iPad-native redesign:
 * portrait only, full screen, and ONE centred column of this width on every
 * screen, with backgrounds staying full-bleed. So there are now two widths in
 * the app, and each reader has to pick the right one:
 *
 * - `useContentWidth()` for anything that lives IN the column: card widths,
 *   scene bands, the pass board, grid arithmetic. This is what most of the
 *   old `useWindowDimensions().width` readers meant all along.
 * - `useWindowDimensions()` stays for anything that covers the SCREEN: the
 *   call backdrop video, confetti, the splash film, a full-bleed decor stripe.
 * - `useContentInset()` for chrome pinned to the window's edges that should
 *   line up with the column instead: the floating tab bar, an absolutely
 *   positioned header row.
 *
 * 600 rather than a phone's 390 to 430 because the column is not trying to
 * pretend the iPad is a phone: cards get half again as much room, type stays
 * the same size, and the 13-inch still keeps 216pt of ground either side.
 * On every phone this app supports the window is narrower than the cap, so
 * both hooks return the window width and nothing on a phone changes.
 */
export const CONTENT_MAX_W = 600;

/** The column width for a window this wide. Pure, for tests and for callers
 *  that already hold a window width. */
export function contentWidthFor(windowW: number): number {
  return Math.min(windowW, CONTENT_MAX_W);
}

/** How far the column sits in from each window edge. Zero on a phone. */
export function contentInsetFor(windowW: number): number {
  return Math.max(0, (windowW - CONTENT_MAX_W) / 2);
}

export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return contentWidthFor(width);
}

export function useContentInset(): number {
  const { width } = useWindowDimensions();
  return contentInsetFor(width);
}

/** True when the window is wider than the column, which today means an iPad. */
export function useIsWideScreen(): boolean {
  const { width } = useWindowDimensions();
  return width > CONTENT_MAX_W;
}

/**
 * The column as a style, for a screen that does not go through `Screen`:
 * a scroller's contentContainerStyle, a FlatList's, a game's root View.
 * `Screen` and the games layout use the same three lines.
 */
export const CONTENT_COLUMN = {
  width: '100%',
  maxWidth: CONTENT_MAX_W,
  alignSelf: 'center',
} as const;
