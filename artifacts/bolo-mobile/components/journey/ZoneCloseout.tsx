// Build 35 mobile parity: the zone closeout, a two-beat celebration on the
// journey map, detected client-side when every stop in a fare zone is done.
//
// Beat 1 is the RESULT: confetti, a cheering Bolo, and a closeout game CTA
// (Plus riders get Speed Round, free riders get Ticket Check pinned to the
// zone's topic — the mobile stand-in for web's Express Listening, which was
// descoped from this platform's roster).
// Beat 2 is the PAYOFF: Chacha-ji's Chai, with a door into the wallet.
//
// Two deliberate divergences from the shipped web overlay, both ruled:
//   · web beat 2 is the capstone conversation offer. Mobile has no scenario
//     plumbing, so beat 2 here is the Chai payoff instead. The capstone offer
//     is left to the Zone 2-6 capstone work.
//   · web has no guard against opening over another dialog. Mobile holds the
//     overlay while the lock or signal dialog is up (the `blocked` prop).
//
// Nothing here gates: every action, including dismissing, moves the state
// machine forward and never blocks the map. The stage machine is pure display
// state (see lib/closeoutMemory.ts) — the Chai itself is protected by the
// ledger's once-ever `earn_closeout_first` refId, not by anything on device.

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Confetti } from '@/components/Confetti';
import { Mascot } from '@/components/Mascot';
import { ChaiGlyph } from '@/components/ChaiStall';
import { AppFonts } from '@/constants/fonts';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { hapticLight } from '@/lib/haptics';
import { type CloseoutMemory } from '@/lib/closeoutMemory';

export type CloseoutZone = {
  zoneIndex: number;
  /** Category id — the closeout game's `cat` and the grant's zone identity. */
  zoneId: number;
  geoName: string;
  title: string;
  allDone: boolean;
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

export function ZoneCloseoutOverlay({
  lang,
  lineName,
  accent,
  colors,
  zones,
  memory,
  blocked,
  onOpenWallet,
}: {
  lang: string;
  lineName: string;
  accent: string;
  colors: Colors;
  zones: CloseoutZone[];
  memory: CloseoutMemory;
  /** True while another dialog owns the screen. Addition over web. */
  blocked: boolean;
  onOpenWallet: () => void;
}) {
  const router = useRouter();
  const { isPlus, isLoading } = useEntitlements();
  // Fail closed like the games hub: only confirmed Plus gets the Plus game.
  const plusReady = isPlus === true && !isLoading;
  const [active, setActive] = useState<{ zone: CloseoutZone; beat: 1 | 2 } | null>(null);
  // Web navigates AWAY from the map to the closeout game, so its overlay is
  // simply gone. On a stack the map stays mounted underneath, and a Modal is
  // app-wide: without this, launching the game would re-open the payoff beat
  // instantly, on top of the game. Cleared when the map is focused again,
  // which is exactly when the payoff is due.
  const [awaitingReturn, setAwaitingReturn] = useState(false);
  useFocusEffect(
    React.useCallback(() => {
      setAwaitingReturn(false);
    }, []),
  );

  const { hydrated, unseeded, seed, write } = memory;
  const zonesKey = zones.map((z) => `${z.zoneIndex}:${z.allDone ? 1 : 0}`).join(',');

  useEffect(() => {
    // Never before the device's stages have hydrated: reading an empty cache
    // as "no stage yet" would re-celebrate a zone that is already closed out.
    if (!hydrated) return;
    // First sight of the feature on this device: zones that are ALREADY
    // complete seed straight to "done". Nobody gets a retroactive burst of
    // celebrations for work they finished before this shipped.
    if (unseeded) {
      seed(zones.filter((z) => z.allDone).map((z) => z.zoneIndex));
      return;
    }
    if (active || blocked || awaitingReturn) return;
    const stages = memory.stages;
    for (const z of zones) {
      if (!z.allDone) continue;
      const stage = stages[z.zoneIndex];
      if (stage === 'done') continue;
      // Absent = never celebrated; "beat2" = returning from the closeout game
      // (or from a skipped beat 1) with the payoff still owed.
      setActive({ zone: z, beat: stage === undefined ? 1 : 2 });
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, zonesKey, active, blocked, awaitingReturn, hydrated, unseeded]);

  if (!active) return null;
  const { zone, beat } = active;

  const advanceFromBeat1 = () => {
    write(zone.zoneIndex, 'beat2');
    setActive({ zone, beat: 2 });
  };
  const finish = () => {
    write(zone.zoneIndex, 'done');
    setActive(null);
  };

  const playCloseoutGame = () => {
    hapticLight();
    // The stage advances BEFORE navigating: the learner comes back to the
    // payoff beat whether or not the run finished.
    write(zone.zoneIndex, 'beat2');
    setActive(null);
    setAwaitingReturn(true);
    router.push(
      plusReady
        ? {
            pathname: '/(app)/(tabs)/games/speed-round' as never,
            params: { ctx: 'closeout' },
          }
        : {
            pathname: '/(app)/(tabs)/games/ticket-check' as never,
            params: { cat: String(zone.zoneId), ctx: 'closeout' },
          },
    );
  };

  const grantedChai = memory.grantedChai(zone.zoneId);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <View style={styles.backdrop} testID="zone-closeout-overlay">
        {beat === 1 && <Confetti />}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {beat === 1 ? (
            <View testID="closeout-beat1" style={styles.body}>
              <Mascot pose="cheer" size={88} />
              <Text style={[styles.title, { color: colors.foreground }]}>
                Zone {zone.zoneIndex + 1} complete!
              </Text>
              <Text style={[styles.blurb, { color: colors.mutedForeground }]}>
                Every stop in {zone.geoName} is done. The {lineName} is ready to roll on.
              </Text>
              <View style={styles.actions}>
                <Pressable
                  testID="closeout-game-cta"
                  onPress={playCloseoutGame}
                  style={[styles.cta, { backgroundColor: accent }]}
                >
                  <Text style={styles.ctaText}>
                    {plusReady ? 'Celebrate with a Speed Round' : 'Celebrate with Ticket Check'}
                  </Text>
                </Pressable>
                <Pressable
                  testID="closeout-skip"
                  onPress={advanceFromBeat1}
                  style={[styles.secondary, { borderColor: colors.border }]}
                >
                  <Text style={[styles.secondaryText, { color: colors.foreground }]}>
                    Skip for now
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View testID="closeout-beat2" style={styles.body}>
              <Mascot pose="wave" size={88} />
              <Text style={[styles.title, { color: colors.foreground }]}>
                Chai on the house
              </Text>
              {grantedChai !== null && (
                <View
                  testID="closeout-chai-chip"
                  style={[styles.chip, { backgroundColor: colors.muted }]}
                >
                  <ChaiGlyph size={18} />
                  <Text style={[styles.chipText, { color: colors.foreground }]}>
                    +{grantedChai} Chai
                  </Text>
                </View>
              )}
              <Text style={[styles.blurb, { color: colors.mutedForeground }]}>
                {grantedChai !== null
                  ? `Chacha-ji poured you ${grantedChai} Chai for closing out ${zone.geoName}.`
                  : `Chacha-ji has the kettle on at ${zone.geoName} whenever you want a cup.`}
              </Text>
              <View style={styles.actions}>
                <Pressable
                  testID="closeout-wallet-cta"
                  onPress={() => {
                    hapticLight();
                    finish();
                    onOpenWallet();
                  }}
                  style={[styles.cta, { backgroundColor: accent }]}
                >
                  <Text style={styles.ctaText}>Open your Chai wallet</Text>
                </Pressable>
                <Pressable
                  testID="closeout-later"
                  onPress={finish}
                  style={[styles.secondary, { borderColor: colors.border }]}
                >
                  <Text style={[styles.secondaryText, { color: colors.foreground }]}>
                    Maybe later
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 20,
  },
  body: { alignItems: 'center', gap: 12 },
  title: { fontFamily: AppFonts.extrabold, fontSize: 20, textAlign: 'center' },
  blurb: { fontFamily: AppFonts.regular, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: { fontFamily: AppFonts.bold, fontSize: 13 },
  actions: { width: '100%', gap: 10, marginTop: 4 },
  cta: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaText: { fontFamily: AppFonts.extrabold, fontSize: 14, color: '#FFFFFF' },
  secondary: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 2,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: AppFonts.bold, fontSize: 14 },
});
