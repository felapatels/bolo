import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useContentWidth } from '@/lib/contentWidth';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { BazaarHeader } from '@/components/bazaar/BazaarHeader';
import { SceneBand } from '@/components/bazaar/SceneBand';
import { PassesAndBoosts, Upgrades } from '@/components/bazaar/PassCards';
import { ChaiWalletSheet } from '@/components/ChaiWallet';
import { ChaiPackShop, useChaiPacksSellable } from '@/components/ChaiPackShop';
import { MilestoneToast } from '@/components/MilestoneToast';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * THE TICKET COUNTER (build 22, the owner's bazaar mockup, then "Ticket
 * counter should match the mockup"). The station master's counter, then
 * PASSES & BOOSTS as a rail of stamps (First Class, the Express Multiplier,
 * a Station Pause, the mend when the server offers it), UPGRADES with the
 * All-Access card for learners without it, and Chai packs at the foot when
 * Apple can price them. The stamps sit on the wallet's own hooks.
 */
export default function TicketCounterScreen() {
  const colors = useColors();
  const width = useContentWidth();
  const { isPlus, isLoading } = useEntitlements();
  const [walletOpen, setWalletOpen] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [noticeKey, setNoticeKey] = React.useState(0);
  const packsSellable = useChaiPacksSellable();
  const showNotice = (message: string) => {
    setNotice(message);
    setNoticeKey((k) => k + 1);
  };
  return (
    <Screen>
      <MilestoneToast message={notice} toastKey={noticeKey} />
      <BazaarHeader title="Ticket Counter" subtitle="Passes, boosts and upgrades." centred onWallet={() => setWalletOpen(true)} />
      <ScrollView contentContainerStyle={styles.street} showsVerticalScrollIndicator={false}>
        <SceneBand stall="ticket" width={Math.max(1, width - 40)} testID="tickets-scene" />
        <Text style={[styles.label, { color: colors.foreground }]}>PASSES & BOOSTS</Text>
        <PassesAndBoosts onNotice={showNotice} />
        {!isLoading && !isPlus ? (
          <>
            <Text style={[styles.label, { color: colors.foreground }]}>UPGRADES</Text>
            <Upgrades />
          </>
        ) : null}
        {packsSellable ? (
          <>
            <Text style={[styles.label, { color: colors.foreground }]}>TOP UP</Text>
            <ChaiPackShop />
          </>
        ) : null}
        {/* The wallet is one tap away for the balance and the ledger, as it
            was on the old street: the header's pill, and this link under the
            counter for anyone who scrolled past it. */}
        <Pressable
          onPress={() => setWalletOpen(true)}
          testID="bazaar-open-wallet"
          accessibilityRole="button"
          accessibilityLabel="Open your Chai wallet"
          style={({ pressed }) => [styles.walletLink, pressed && styles.walletLinkPressed]}
        >
          <Text style={[styles.walletLinkText, { color: colors.primary }]}>Open the wallet</Text>
        </Pressable>
      </ScrollView>
      <ChaiWalletSheet visible={walletOpen} onClose={() => setWalletOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  street: { paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE, gap: 14 },
  label: { fontFamily: AppFonts.extrabold, fontSize: 12, letterSpacing: 1.4, marginTop: 4 },
  walletLink: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  walletLinkPressed: { opacity: 0.6 },
  walletLinkText: { fontFamily: AppFonts.bold, fontSize: 14 },
});
