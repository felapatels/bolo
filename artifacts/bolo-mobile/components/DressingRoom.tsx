// The Bolo Bazaar changing room (mobile twin of
// artifacts/gujarati-coach/src/components/dressing-room.tsx).
//
// WHY IT EXISTS: swapping the mascot art in place made a costume change read
// as a glitch — the old bird blinked out and a new one blinked in. A shop
// solves this with a curtain, so the shop does.
//
// TWO RULES THIS COMPONENT EXISTS TO KEEP:
//  1. The curtains NEVER leave. Open means tied back at the posts, not slid
//     off-stage — a booth with no cloth in it stops reading as a booth.
//  2. `closed` is caller state, never an animation-end callback, so the
//     curtain cannot stick shut over the product.
//
// Only `transform` is animated, on the native driver: animating layout props
// is what crashes Reanimated screens on the New Architecture, and this uses
// RN's own Animated anyway.
import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { INDIA } from '@/constants/india';

const VELVET_MID = '#8C2213';
const VELVET_DARK = '#6E1A0E';

/** Share of the booth each panel still covers once it is tied back. */
const TIED_BACK = 0.13;
const PANEL_WIDTH = 0.52;

/** Velvet folds: hand-laid, since RN has no repeating gradient. */
function Pleats() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.pleatRow}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.pleat,
              {
                backgroundColor:
                  i % 2 === 0 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.20)',
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/** The pelmet's scalloped hem: one half-round per cell, like the awning. */
function PelmetHem({ width }: { width: number }) {
  const size = 16;
  const cells = width > 0 ? Math.ceil(width / size) : 0;
  return (
    <View style={styles.hemRow}>
      {Array.from({ length: cells }).map((_, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size / 2,
            backgroundColor: VELVET_DARK,
            borderBottomLeftRadius: size / 2,
            borderBottomRightRadius: size / 2,
          }}
        />
      ))}
    </View>
  );
}

export function DressingRoom({
  closed,
  children,
  testID = 'dressing-room',
}: {
  /** True while the bird is changing. */
  closed: boolean;
  children: React.ReactNode;
  testID?: string;
}) {
  const [width, setWidth] = React.useState(0);
  // 0 = shut, 1 = tied back.
  const open = React.useRef(new Animated.Value(closed ? 0 : 1)).current;

  React.useEffect(() => {
    Animated.timing(open, {
      toValue: closed ? 0 : 1,
      duration: 620,
      useNativeDriver: true,
    }).start();
  }, [closed, open]);

  const travel = width * (PANEL_WIDTH - TIED_BACK);
  const slide = (direction: -1 | 1) => ({
    transform: [
      {
        translateX: open.interpolate({
          inputRange: [0, 1],
          outputRange: [0, direction * travel],
        }),
      },
    ],
  });
  const tie = { opacity: open };

  return (
    <View
      testID={testID}
      accessibilityState={{ busy: closed }}
      style={styles.room}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {children}

      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View
          testID="curtain-left"
          style={[styles.panel, styles.panelLeft, slide(-1)]}
        >
          <Pleats />
          <View style={styles.innerEdgeRight} />
        </Animated.View>
        <Animated.View
          testID="curtain-right"
          style={[styles.panel, styles.panelRight, slide(1)]}
        >
          <Pleats />
          <View style={styles.innerEdgeLeft} />
        </Animated.View>

        {/* Gold ties, only meaningful once the cloth is gathered at a post. */}
        <Animated.View style={[styles.tie, { left: 0 }, tie]} />
        <Animated.View style={[styles.tie, { right: 0 }, tie]} />

        {/* Posts and floor: the booth's timber. */}
        <View style={[styles.post, { left: 0 }]} />
        <View style={[styles.post, { right: 0 }]} />
        <View style={styles.floor} />

        {/* The pelmet hides the rail; its gold rail-line caps the booth. */}
        <View style={styles.pelmet}>
          <Pleats />
        </View>
        <View style={styles.pelmetHem}>
          <PelmetHem width={width} />
        </View>
        <View style={styles.rail} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  room: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#F2DFB8',
  },
  panel: {
    position: 'absolute',
    // Tucked UNDER the pelmet (18px + 8px hem), never hanging below it, or
    // the bird's crest shows over the top of a shut curtain.
    top: 20,
    bottom: 12,
    width: `${PANEL_WIDTH * 100}%`,
    backgroundColor: VELVET_MID,
  },
  panelLeft: { left: 0 },
  panelRight: { right: 0 },
  innerEdgeRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 2,
    backgroundColor: 'rgba(240,163,43,0.55)',
  },
  innerEdgeLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 2,
    backgroundColor: 'rgba(240,163,43,0.55)',
  },
  tie: {
    position: 'absolute',
    top: '48%',
    height: 12,
    width: `${TIED_BACK * 100}%`,
    borderRadius: 6,
    backgroundColor: INDIA.gold,
  },
  pleatRow: { flex: 1, flexDirection: 'row' },
  pleat: { flex: 1 },
  post: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 8,
    backgroundColor: INDIA.timberShade,
  },
  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 12,
    backgroundColor: INDIA.timber,
  },
  pelmet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 18,
    backgroundColor: VELVET_DARK,
  },
  pelmetHem: { position: 'absolute', left: 0, right: 0, top: 18 },
  hemRow: { flexDirection: 'row', overflow: 'hidden' },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 5,
    backgroundColor: INDIA.gold,
  },
});
