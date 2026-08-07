// Art tiles for the Chai wallet rows. Mobile twin of
// artifacts/gujarati-coach/src/components/wallet-art.tsx.
//
// Each row of the wallet used to be text and a button; these give every offer
// a picture of what it does. Three rules hold them together:
//
//  - The TRAIN is the canonical engine (components/journey/TrainEngine.tsx),
//    never a new drawing. Its ironwork normally reads theme tokens, so each
//    tile passes a FIXED palette — the tiles are painted scenes on fixed
//    backgrounds and must not flip with the theme.
//  - BOLO is the canonical mascot component, so the bird in the bazaar tile is
//    wearing whatever the learner bought, and the whole-image motion rule
//    holds automatically.
//  - MOTION comes from those components' own reduced-motion-aware loops
//    (bob / drive), so a learner with Reduce Motion on gets a clean parked
//    frame. Nothing here animates layout — transforms and opacity only.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mascot } from '@/components/Mascot';
import { TrainEngine } from '@/components/journey/TrainEngine';
import { INDIA } from '@/constants/india';
import { AppFonts } from '@/constants/fonts';

const TILE = 64;

/** Ironwork for an engine on a warm daylight tile. */
const WARM_ENGINE = {
  chassis: INDIA.iron,
  body: INDIA.express,
  trim: INDIA.peacock,
  steam: '#FFFFFF',
} as const;

/** Ironwork for the engine on the indigo express tile. */
const NIGHT_ENGINE = {
  chassis: INDIA.iron,
  body: INDIA.gold,
  trim: INDIA.peacock,
  steam: '#FFFFFF',
} as const;

function Tile({
  children,
  background,
  colors,
}: {
  children: React.ReactNode;
  background?: string;
  colors?: readonly [string, string];
}) {
  return (
    <View
      style={styles.tile}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {colors ? (
        <LinearGradient colors={colors} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]} />
      )}
      {children}
    </View>
  );
}

/**
 * Station Pause: the engine standing at a platform under a signal, steam
 * ticking over. It is waiting for you — which is what a pause buys.
 */
export function StationPauseTile() {
  return (
    <Tile colors={[INDIA.skyHigh, INDIA.skyLow]}>
      <View style={styles.sun} />
      <View style={styles.signalPost} />
      <View style={styles.signalLamp} />
      <View style={styles.engineSlot}>
        <TrainEngine
          tint="#FFFFFF"
          width={40}
          height={26}
          motion="bob"
          palette={WARM_ENGINE}
        />
      </View>
      <View style={styles.platform}>
        <View style={styles.platformLip} />
      </View>
    </Tile>
  );
}

/**
 * Bolo Bazaar: a stall front — striped awning, a marigold, and the learner's
 * own bird standing under it in whatever he currently owns.
 */
export function BazaarTile() {
  return (
    <Tile background={INDIA.wall}>
      <View style={styles.tileAwning}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: i % 2 === 0 ? INDIA.stripe : INDIA.cloth,
            }}
          />
        ))}
      </View>
      <View style={styles.tileHem}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderBottomLeftRadius: 999,
              borderBottomRightRadius: 999,
              backgroundColor: i % 2 === 0 ? INDIA.stripe : INDIA.cloth,
            }}
          />
        ))}
      </View>
      <View style={styles.marigold} />
      <View style={styles.birdSlot}>
        <Mascot pose="wave" size={40} entering={false} />
      </View>
      <View style={styles.counter}>
        <View style={styles.counterLip} />
      </View>
    </Tile>
  );
}

/**
 * Express Multiplier: the same engine, but running — speed streaks behind it
 * and a 2× flag in the corner.
 */
export function ExpressTile({ running = false }: { running?: boolean }) {
  return (
    <Tile colors={[INDIA.express, INDIA.expressDeep]}>
      {[14, 22, 30].map((top, i) => (
        <View
          key={top}
          style={[styles.streak, { top, width: 14 + i * 6 }]}
        />
      ))}
      <View style={styles.flag}>
        <Text style={styles.flagText}>2×</Text>
      </View>
      <View style={styles.engineSlot}>
        <TrainEngine
          tint="#FFFFFF"
          width={40}
          height={26}
          motion={running ? 'drive' : 'bob'}
          palette={NIGHT_ENGINE}
        />
      </View>
      <View style={styles.rail} />
    </Tile>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 16,
    overflow: 'hidden',
  },
  sun: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: INDIA.gold,
    opacity: 0.85,
  },
  signalPost: {
    position: 'absolute',
    right: 12,
    bottom: 16,
    width: 2,
    height: 22,
    backgroundColor: INDIA.iron,
  },
  signalLamp: {
    position: 'absolute',
    right: 7,
    bottom: 24,
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: INDIA.stripe,
  },
  engineSlot: { position: 'absolute', left: 4, bottom: 11 },
  platform: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 13,
    backgroundColor: INDIA.timber,
  },
  platformLip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 7,
    backgroundColor: INDIA.timberShade,
  },
  tileAwning: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 13,
    flexDirection: 'row',
  },
  tileHem: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 13,
    flexDirection: 'row',
  },
  marigold: {
    position: 'absolute',
    left: 8,
    top: 21,
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: INDIA.gold,
  },
  birdSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 6,
    alignItems: 'center',
  },
  counter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 7,
    backgroundColor: INDIA.timber,
  },
  counterLip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: INDIA.timberShade,
  },
  streak: {
    position: 'absolute',
    left: 4,
    height: 2,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    opacity: 0.28,
  },
  flag: {
    position: 'absolute',
    right: 6,
    top: 6,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: INDIA.gold,
  },
  flagText: { fontFamily: AppFonts.extrabold, fontSize: 10, color: INDIA.iron },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 7,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
