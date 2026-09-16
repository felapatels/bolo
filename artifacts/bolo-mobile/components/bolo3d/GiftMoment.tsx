// THE DAILY GIFT MOMENT: the owner's second pick, over home (docs/bolo3d.md).
//
// Owner's 3D brief, banked 2026-09-13: "Open the daily gift. Tries lifting it,
// notices the lock, points at 'Finish a stop today'. Once earned, tears the box
// and catches what pops out."
//
// A MOMENT ON TAP, NOT A BIRD LIVING ON HOME. Home is the first screen after
// launch, and the 3D runtime never rides the launch path (ledger X92): the gift
// row stays today's 2D row, and the stage only mounts when a learner taps the
// box. It is also the owner's own framing for the bird: most screens simple,
// the bird spent on a few memorable moments.
//
// THE CARD OWNS THE WORDS. DailyGiftCard decides what happened (locked, a claim
// on the wire, opened, failed) and what it says; this puts the words up when
// her gesture lands, and always offers a way out.
//
// REQUIRED LAZILY by DailyGiftCard, only when BOLO3D_IN_SCREENS is on, and only
// on the first tap: home is the launch path.

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { MomentBeat } from '@workspace/bolo-character';
import type { GiftTier } from '@workspace/daily-gift';
import { GiftBolo3D, type GiftMomentPhase } from '@/components/bolo3d/surfaces';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { GIFT_TOKEN_3D, giftBox3d, giftTokenCount } from '@/lib/bolo3dGift';

export type { GiftMomentPhase };

/** The beat that puts the words up: they land on her gesture, never before it. */
const REVEAL_ON: Record<GiftMomentPhase, MomentBeat | null> = {
  locked: 'point',
  opened: 'caught',
  waiting: null,
  failed: null,
  already: null,
};

/**
 * If the beat never comes (a page that died, the still bird standing in), the
 * words come anyway. Counted from when she is up, a little after the beat is
 * due (gift.ts: `point` at 4.45 s, `caught` at 1.97 s after the claim lands),
 * so a slow boot never puts the words ahead of her.
 */
const REVEAL_LATEST_MS: Record<GiftMomentPhase, number> = {
  locked: 6000,
  opened: 3500,
  waiting: 0,
  failed: 0,
  already: 0,
};

/** How long a page that never reports ready is waited for, on top of that. */
const BOOT_ALLOWANCE_MS = 6000;

/** A card, not a banner, on an iPad (build 25's dialog rule). */
const CARD_MAX_W = 440;

export function GiftMoment({
  phase,
  tier,
  day,
  baseAmount,
  words,
  announce,
  closeLabel,
  onClose,
}: {
  phase: GiftMomentPhase;
  tier: GiftTier;
  day?: number;
  /** The draw before any multiplier: one token pops out per unit of it. */
  baseAmount?: number;
  /** What the card says for this phase. */
  words: ReactNode;
  /** The same, as one sentence for a screen reader when it appears. */
  announce: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const { width: windowW } = useWindowDimensions();
  const cardW = Math.min(windowW - 32, CARD_MAX_W);
  const stageH = Math.round(cardW * 0.86);

  // REVEALED PER PHASE, NOT AS A FLAG. A flag reset in an effect leaves one
  // frame where the new phase's words show under the old flag, and for an
  // opened box that frame is the amount, flashed before she has caught it.
  const [revealedFor, setRevealedFor] = useState<GiftMomentPhase | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [stageReady, setStageReady] = useState(false);
  const current = useRef(phase);
  current.current = phase;
  const revealed = REVEAL_ON[phase] === null || revealedFor === phase || unavailable;
  useEffect(() => {
    if (revealed) return;
    const due = phase;
    const latest = setTimeout(() => setRevealedFor(due), REVEAL_LATEST_MS[phase] + (stageReady ? 0 : BOOT_ALLOWANCE_MS));
    return () => clearTimeout(latest);
  }, [phase, revealed, stageReady]);

  useEffect(() => {
    if (revealed && announce) AccessibilityInfo.announceForAccessibility(announce);
  }, [revealed, announce]);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: `${colors.background}F2` }]} testID="gift-moment">
        {/* Outside the card closes it. Behind the card, not around it, so a
            touch on her (she reacts, and turns when dragged) never closes it. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
          testID="gift-moment-backdrop"
        />
        <View style={[styles.card, { width: cardW }]} accessibilityViewIsModal>
          <Text style={[styles.kicker, { color: colors.mutedForeground }]}>TODAY'S GIFT</Text>
          <GiftBolo3D
            phase={phase}
            box={giftBox3d(tier, day)}
            token={GIFT_TOKEN_3D}
            count={giftTokenCount(baseAmount ?? 1)}
            width={cardW}
            height={stageH}
            onReady={() => setStageReady(true)}
            onBeat={(beat) => {
              if (beat === REVEAL_ON[current.current]) setRevealedFor(current.current);
            }}
            onUnavailable={() => setUnavailable(true)}
          />
          <View style={styles.wordsSlot}>
            {revealed ? (
              <View
                testID="gift-moment-words"
                style={[styles.words, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                {/* She points with her left wing, which is on the right as the
                    learner looks at her: the tail reaches up toward it. */}
                {phase === 'locked' ? (
                  <View style={[styles.tail, { borderBottomColor: colors.cardBorder }]}>
                    <View style={[styles.tailInner, { borderBottomColor: colors.card }]} />
                  </View>
                ) : null}
                {words}
              </View>
            ) : null}
          </View>
          <Pressable
            testID="gift-moment-close"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{closeLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  card: { alignItems: 'center' },
  kicker: { fontFamily: AppFonts.extrabold, fontSize: 13, letterSpacing: 2.5 },
  wordsSlot: { alignSelf: 'stretch', minHeight: 124, justifyContent: 'flex-start' },
  words: { alignSelf: 'stretch', borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
  tail: {
    position: 'absolute',
    top: -12,
    right: 44,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tailInner: {
    position: 'absolute',
    top: 1.5,
    left: -10.5,
    width: 0,
    height: 0,
    borderLeftWidth: 10.5,
    borderRightWidth: 10.5,
    borderBottomWidth: 10.5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  button: { marginTop: 12, minHeight: 52, minWidth: 180, paddingHorizontal: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: AppFonts.extrabold, fontSize: 18 },
});
