import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useContentWidth } from '@/lib/contentWidth';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { PressableScale } from '@/components/PressableScale';
import { Mascot } from '@/components/Mascot';
import { BazaarWelcome } from '@/components/BazaarWelcome';
import { BazaarHeader } from '@/components/bazaar/BazaarHeader';
import { SceneBand } from '@/components/bazaar/SceneBand';
import { ChaiWalletSheet } from '@/components/ChaiWallet';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

const TRAIN_ART = require('@/assets/journey/train-loco.png') as number;
const OFFICE_ART = require('@/assets/games/script-trace.png') as number;

/**
 * THE BAZAAR IS A STREET WITH FOUR DOORS (build 22, the owner's redesign:
 * "Where would you like to go?"). It used to be one long scroll of stalls;
 * the hub now shows the tailor's scene and four doors, each its own screen:
 *
 *   The Tailor        outfits, headwear and accessories for Bolo
 *   Station Master    hats, uniforms and station essentials
 *   Ticket Counter    passes, boosts and first class upgrades
 *   Language Office   unlock new languages and content
 *
 * The greeting on arrival (BazaarWelcome) stays on the hub, and the Chai
 * pill in the header opens the wallet, as the old chai stall's band did.
 */
export default function BazaarScreen() {
  const colors = useColors();
  const router = useRouter();
  const width = useContentWidth();
  const [walletOpen, setWalletOpen] = React.useState(false);
  const bandW = Math.max(1, width - 40);
  const go = (path: string) => {
    hapticLight();
    router.push(path as Parameters<typeof router.push>[0]);
  };
  return (
    <Screen>
      <BazaarWelcome />
      {/* A BACK BUTTON ON THE HUB TOO (build 23, owner off the 1.0.6 build:
          "Bazaar has no back button so you get stuck on that screen"). The
          hub sits outside the tabs, so without one there was no way off it
          but the home indicator. Build 22 hid it on the hub as the top of
          the bazaar's own stack; the top of a stack still needs a door out. */}
      <BazaarHeader title="Bazaar" subtitle="Spend Chai, upgrade your journey." onWallet={() => setWalletOpen(true)} />
      <ScrollView contentContainerStyle={styles.street} showsVerticalScrollIndicator={false}>
        <SceneBand stall="tailor" width={bandW} testID="bazaar-hero" />
        <Text style={[styles.ask, { color: colors.primary }]}>Where would you like to go?</Text>
        <Door
          title="The Tailor"
          lines={['Outfits, headwear', 'and accessories', 'for Bolo.']}
          onPress={() => go('/(app)/bazaar/tailor')}
          testID="bazaar-door-tailor"
          picture={<Mascot pose="wave" size={64} motion="none" entering={false} />}
        />
        <Door
          title="Station Master"
          lines={['Hats, uniforms', 'and station', 'essentials.']}
          onPress={() => go('/(app)/bazaar/station')}
          testID="bazaar-door-station"
          picture={<Mascot pose="thumbsup" size={64} motion="none" entering={false} accessory="station-cap" />}
        />
        <Door
          title="Ticket Counter"
          lines={['Passes, boosts', 'and first class', 'upgrades.']}
          onPress={() => go('/(app)/bazaar/tickets')}
          testID="bazaar-door-tickets"
          picture={<Image source={TRAIN_ART} resizeMode="contain" style={{ width: 66, height: 64 }} accessibilityIgnoresInvertColors />}
        />
        <Door
          title="Language Office"
          lines={['Unlock new', 'languages and', 'content.']}
          onPress={() => go('/(app)/bazaar/languages')}
          testID="bazaar-door-languages"
          picture={<Image source={OFFICE_ART} resizeMode="cover" style={{ width: 70, height: 56, borderRadius: 10 }} accessibilityIgnoresInvertColors />}
        />
      </ScrollView>
      <ChaiWalletSheet visible={walletOpen} onClose={() => setWalletOpen(false)} />
    </Screen>
  );
}

function Door({
  title,
  lines,
  picture,
  onPress,
  testID,
}: {
  title: string;
  lines: string[];
  picture: React.ReactNode;
  onPress: () => void;
  testID: string;
}) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${lines.join(' ')}`}
      onPress={onPress}
      testID={testID}
      style={[styles.door, { backgroundColor: '#FBF4E8', borderColor: '#E8D9BE' }]}
    >
      <View style={[styles.doorPicture, { backgroundColor: '#F3E6D0' }]}>{picture}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.doorTitle, { color: '#2B1A0E' }]}>{title}</Text>
        <Text style={[styles.doorLines, { color: '#6B5B4E' }]}>{lines.join('\n')}</Text>
      </View>
      <Feather name="chevron-right" size={22} color={colors.mutedForeground} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  street: { paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE, gap: 12 },
  ask: { fontFamily: AppFonts.semibold, fontSize: 15, marginTop: 4 },
  door: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 12,
    shadowColor: '#2B1A12',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  doorPicture: { width: 92, height: 84, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  doorTitle: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  doorLines: { fontFamily: AppFonts.regular, fontSize: 13, lineHeight: 18, marginTop: 2 },
});
