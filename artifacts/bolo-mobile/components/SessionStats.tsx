import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGetTokens } from '@workspace/api-client-react';
import { XpCounter } from '@/components/XpCounter';
import { ChaiGlyph } from '@/components/ChaiStall';
import { ChaiWalletSheet } from '@/components/ChaiWallet';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

/**
 * XP AND CHAI, TOGETHER, ON THE SCREENS WHERE THEY ARE EARNED.
 *
 * The owner asked for "Chai and XP in the top bar on every practice and game
 * screen". Measured before building anything, 2026-08-28, and the gap was
 * wider on mobile than anyone had said:
 *
 *   XP    home, practice and review. ZERO of the thirteen game screens.
 *   Chai  home only. Not on practice, not on review, not on any game.
 *
 * So a learner could finish a quiz that pays 2 Chai and a Signal that pays 1
 * and never see either number move. A currency you cannot watch accumulate is
 * a currency nobody is saving for, which is the whole reason the Chai economy
 * reads as something you buy rather than something you earn.
 *
 * WHY BOTH IN ONE COMPONENT rather than a Chai counter dropped in beside the
 * XP one at each call site: they are one idea, "what this session is paying
 * you", and pairing them here means a screen cannot end up with one and not the
 * other. That is exactly how the current split happened.
 *
 * The balance is the same `useGetTokens` query every other Chai surface reads,
 * so it cannot drift from the wallet: spends are server-authoritative and every
 * surface refetches on change.
 */
/**
 * The Chai half on its own, for slots too tight for the full strip. The
 * practice and review headers are a close button, a centred label column and a
 * language chip; a full-width space-between row does not fit in the column, but
 * a pill beside the XP meter does.
 */
export function ChaiPill({ compact = false }: { compact?: boolean } = {}) {
  const colors = useColors();
  const tokens = useGetTokens();
  const balance = tokens.data?.balance;
  // THE PILL IS A DOOR TO THE WALLET (build 21, owner off the flashback's
  // header: "if i click on that chai up top it should open my chai wallet
  // slideout"). It owns its own sheet rather than asking every host screen to
  // mount one: the practice, review and game screens all show this pill and
  // none of them had a wallet, which is exactly how the home-only wallet
  // came to be. The sheet is the same ChaiWalletSheet home opens.
  const [walletOpen, setWalletOpen] = React.useState(false);
  // Absent, not zero, until the balance is known. A "0" that becomes "23" a
  // beat later reads as having just lost everything.
  if (balance === undefined) return null;
  return (
    <>
      <Pressable
        testID="session-chai"
        accessibilityRole="button"
        accessibilityLabel={`${balance} Chai`}
        accessibilityHint="Opens your Chai wallet"
        hitSlop={6}
        onPress={() => {
          hapticLight();
          setWalletOpen(true);
        }}
        style={[
          styles.chai,
          compact && styles.chaiCompact,
          { backgroundColor: colors.primary + '14', borderColor: colors.primary + '38' },
        ]}
      >
        {/* A cup, a number and the word. Never the colour alone: the glyph and
            the label both carry it, so the pill reads without relying on hue.
            THE KULHAD, NOT A TEACUP (build 21, owner: "this is the wrong icon
            for chai"): the same clay cup every other Chai surface draws, via
            ChaiGlyph, in place of a 🍵 emoji that read as green tea. */}
        <ChaiGlyph size={compact ? 12 : 15} testID="session-chai-glyph" />
        <Text style={[styles.value, compact && styles.valueCompact, { color: colors.primary }]}>
          {balance}
        </Text>
        {!compact && <Text style={[styles.label, { color: colors.primary }]}>Chai</Text>}
      </Pressable>
      <ChaiWalletSheet visible={walletOpen} onClose={() => setWalletOpen(false)} />
    </>
  );
}

export function SessionStats({ testID = 'session-stats' }: { testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.xpSlot}>
        <XpCounter variant="session" />
      </View>
      <ChaiPill />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  // The XP meter keeps its natural width; the Chai pill takes what it needs.
  xpSlot: { flexShrink: 1 },
  chai: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  chaiCompact: { paddingHorizontal: 6, paddingVertical: 2, gap: 3 },
  valueCompact: { fontSize: 11 },
  value: { fontFamily: AppFonts.extrabold, fontSize: 13 },
  label: { fontFamily: AppFonts.semibold, fontSize: 10 },
});
