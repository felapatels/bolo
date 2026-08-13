// Build 35 mobile parity: the trackside signal encounter dialog, ported from
// the web dialog in gujarati-coach/src/pages/journey.tsx.
//
// This is NEVER a forced modal. It opens from a tap or from the soft stop,
// and waving through is always one press away. The voice is the shipped web
// voice: waving is never shamed, and the unclaimed Chai is described as kept
// warm for you rather than lost.
//
// It renders its own Modal in the journey's existing modal idiom (the same
// translucent backdrop and card the lock dialogs use) rather than sharing the
// lock Modal, exactly as web keeps a second Dialog: signal state and lock
// state are unrelated, and one host serving both would couple them.

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ChaiGlyph } from '@/components/ChaiStall';
import { AppFonts } from '@/constants/fonts';
import { TrainEngine } from '@/components/journey/TrainEngine';
import { SignalmanGlyph } from '@/components/journey/SignalmanGlyph';
import { SignalGlyph, type SignalState } from '@/components/journey/SignalGlyph';
import type { QuickGameDef } from '@/lib/quick-games';

export type SignalEncounter = {
  gap: number;
  zoneId: number;
  state: SignalState;
  /** First-clear amount SERVED BY THE ZONE PAYLOAD. Never a constant: the
   *  server owns what a clear pays, and the chip must not promise otherwise. */
  rewardChai: number;
  /** null means no quick game fits this zone, which is the auto-wave case. */
  game: QuickGameDef | null;
};

type Colors = {
  foreground: string;
  mutedForeground: string;
  card: string;
  border: string;
  muted: string;
  primary: string;
  primaryForeground: string;
};

export function SignalEncounterDialog({
  encounter,
  colors,
  onPlay,
  onWave,
  onClose,
  goldPalette,
}: {
  encounter: SignalEncounter | null;
  colors: Colors;
  onPlay: (e: SignalEncounter & { game: QuickGameDef }) => void;
  onWave: (e: SignalEncounter) => void;
  onClose: () => void;
  /** If non-null, the signal-scene engine renders in First Class gold. */
  goldPalette?: { chassis: string; body: string; trim: string; steam: string };
}) {
  const cleared = encounter?.state === 'cleared';
  const waved = encounter?.state === 'waved';

  return (
    <Modal
      visible={encounter !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          testID="signal-dialog"
          style={[styles.card, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {encounter && encounter.game === null && (
            <>
              <Text style={[styles.title, { color: colors.foreground }]}>Green flag!</Text>
              <Text
                testID="signal-autowave-quip"
                style={[styles.body, { color: colors.mutedForeground }]}
              >
                Not enough phrases here for a game yet. Green flag, straight through!
              </Text>
              <Pressable
                testID="signal-carry-on"
                accessibilityRole="button"
                onPress={() => onWave(encounter)}
                style={[styles.cta, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>
                  Carry on
                </Text>
              </Pressable>
            </>
          )}

          {encounter && encounter.game !== null && (
            <>
              {/* Compact scene from existing art only: the engine pulling up
                  to the crossing. Decorative, so it is hidden from a11y. */}
              <View
                testID="signal-scene"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.scene, { backgroundColor: colors.muted }]}
              >
                <TrainEngine width={64} tint={colors.primary} palette={goldPalette} />
                <View style={[styles.sceneRule, { borderColor: colors.border }]} />
                {/* The Signalman himself steps out beside his crossing, in
                    web's scene order: engine, rule, signalman, signal. */}
                <SignalmanGlyph />
                <SignalGlyph state={cleared ? 'cleared' : waved ? 'waved' : 'active'} />
              </View>

              <Text testID="signal-dialog-title" style={[styles.title, { color: colors.foreground }]}>
                {cleared ? 'Signal already cleared' : 'Signal ahead'}
              </Text>
              <Text testID="signal-dialog-body" style={[styles.body, { color: colors.mutedForeground }]}>
                {cleared
                  ? `You cleared this signal and pocketed the Chai. Fancy another round of ${encounter.game.title}?`
                  : waved
                    ? 'The gate is up for you, and the signalman kept your Chai. Clear the signal whenever you like.'
                    : 'The crossing gate is down and the signalman steps out. Clear the signal with a quick game, or wave and roll on.'}
              </Text>

              {/* What clearing pays, shown BEFORE playing and ONLY while the
                  first-clear grant is unclaimed. A cleared replay promises
                  nothing, because the server will not pay twice. */}
              {!cleared && (
                <View testID="signal-chai-chip" style={styles.chaiChip}>
                  <ChaiGlyph size={13} />
                  <Text style={styles.chaiChipText}>+{encounter.rewardChai} Chai</Text>
                </View>
              )}

              <Pressable
                testID="signal-play-game"
                accessibilityRole="button"
                onPress={() => onPlay({ ...encounter, game: encounter.game! })}
                style={[styles.cta, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>
                  Play {encounter.game.title}
                </Text>
              </Pressable>
              <Text
                testID="signal-game-blurb"
                style={[styles.blurb, { color: colors.mutedForeground }]}
              >
                {encounter.game.description}
              </Text>

              {!cleared && (
                <Pressable
                  testID="signal-wave-through"
                  accessibilityRole="button"
                  onPress={() => onWave(encounter)}
                  style={[styles.secondaryCta, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Text style={[styles.secondaryCtaText, { color: colors.foreground }]}>
                    Wave me through
                  </Text>
                </Pressable>
              )}
            </>
          )}

          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            testID="signal-dialog-close"
            onPress={onClose}
            style={[styles.close, { backgroundColor: colors.muted }]}
          >
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 20,
    gap: 10,
  },
  scene: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sceneRule: { flex: 1, borderBottomWidth: 2, borderStyle: 'dashed', marginBottom: 6 },
  title: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  body: { fontFamily: AppFonts.regular, fontSize: 14, lineHeight: 20 },
  chaiChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  chaiChipText: { fontFamily: AppFonts.extrabold, fontSize: 12, color: '#B45309' },
  cta: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaText: { fontFamily: AppFonts.extrabold, fontSize: 14 },
  blurb: { fontFamily: AppFonts.regular, fontSize: 12, textAlign: 'center' },
  secondaryCta: {
    borderRadius: 12,
    borderWidth: 2,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryCtaText: { fontFamily: AppFonts.bold, fontSize: 14 },
  close: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
