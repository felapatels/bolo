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
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
// Named import from the package root, like the other 63 icon call sites. The
// deep path '@expo/vector-icons/Feather' resolves to a module jest-setup's
// mock does not cover, so it reached the native bridge and failed 70 suites
// with "__fbBatchedBridgeConfig is not set" the first time this suite ran off
// Replit. Same component either way.
import { Feather } from '@expo/vector-icons';
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
 * Streak repair: a gap in the rail with a fishplate bolted across it. The
 * missing sleeper stays missing — the day was lost and the picture does not
 * pretend otherwise — but the line runs through, which is what the repair
 * buys. Web twin: StreakMendTile in components/wallet-art.tsx.
 */
export function StreakMendTile() {
  return (
    <Tile colors={[`${INDIA.gold}66`, INDIA.skyLow]}>
      <View style={styles.mendSun} />
      {[4, 14, 40, 50].map((left) => (
        <View key={left} style={[styles.mendSleeper, { left }]} />
      ))}
      <View style={[styles.mendRail, { left: 2 }]} />
      <View style={[styles.mendRail, { right: 2 }]} />
      <View style={styles.mendPlate} />
      <View style={styles.mendBallast} />
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
      {/* The real stall, not a drawn approximation. Web twin uses the same
          asset out of public/bazaar/. */}
      <Image
        source={require('../assets/images/bazaar/tailor-scene.png')}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={styles.birdSlot}>
        <Mascot pose="wave" size={36} entering={false} />
      </View>
    </Tile>
  );
}

/**
 * Unlock a language: a junction signpost — two enamel name-boards pointing
 * different ways, one of them still padlocked. It is the picture of a stop you
 * have not bought yet.
 */
export function LanguagesTile() {
  return (
    <Tile colors={[INDIA.skyHigh, INDIA.skyLow]}>
      <View style={styles.post} />
      <View style={[styles.nameBoard, styles.nameBoardTop]}>
        <View style={[styles.boardLine, { width: 14, backgroundColor: INDIA.cream }]} />
        <View style={[styles.boardLine, { width: 8, backgroundColor: INDIA.gold }]} />
      </View>
      <View style={[styles.nameBoard, styles.nameBoardBottom]}>
        <View style={[styles.boardLine, { width: 10, backgroundColor: INDIA.cream }]} />
        <View style={[styles.boardLine, { width: 6, backgroundColor: INDIA.gold }]} />
      </View>
      <View style={styles.padlock}>
        <Feather name="lock" size={8} color={INDIA.iron} />
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
  // Streak repair tile: low sun, a rail with a gap, the fishplate across it.
  mendSun: {
    position: 'absolute',
    left: TILE / 2 - 10,
    bottom: 20,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: INDIA.gold,
    opacity: 0.9,
  },
  mendSleeper: {
    position: 'absolute',
    bottom: 10,
    width: 8,
    height: 4,
    borderRadius: 1,
    backgroundColor: INDIA.timberShade,
  },
  mendRail: {
    position: 'absolute',
    bottom: 15,
    width: 24,
    height: 3,
    backgroundColor: INDIA.iron,
  },
  mendPlate: {
    position: 'absolute',
    left: TILE / 2 - 10,
    bottom: 13,
    width: 20,
    height: 7,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: INDIA.timberShade,
    backgroundColor: INDIA.gold,
  },
  mendBallast: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 10,
    backgroundColor: INDIA.timberShade,
    opacity: 0.9,
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
  post: {
    position: 'absolute',
    left: TILE / 2 - 1.5,
    bottom: 7,
    width: 3,
    height: 40,
    backgroundColor: INDIA.timber,
  },
  nameBoard: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 13,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: INDIA.gold,
    paddingHorizontal: 4,
  },
  nameBoardTop: {
    left: 8,
    top: 14,
    width: 38,
    backgroundColor: INDIA.board,
  },
  nameBoardBottom: {
    right: 8,
    top: 31,
    width: 34,
    backgroundColor: INDIA.timberShade,
  },
  boardLine: { height: 2, borderRadius: 999 },
  padlock: {
    position: 'absolute',
    right: 4,
    top: 26,
    width: 13,
    height: 13,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: INDIA.gold,
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
