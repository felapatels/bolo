import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useContentWidth } from '@/lib/contentWidth';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { BazaarHeader } from '@/components/bazaar/BazaarHeader';
import { ChaiWalletSheet, LanguageInfoOverlay, LanguageSignpostRow } from '@/components/ChaiWallet';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { getJourneyLine } from '@/lib/journeyLines';
import { useJourneyProgress } from '@/lib/useJourneyProgress';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

/** The office's picture: the chalkboard on its easel, no words on it. */
const OFFICE_ART = require('@/assets/games/script-trace.png') as number;

/**
 * THE LANGUAGE OFFICE (build 22, the owner's bazaar redesign: "unlock new
 * languages and content"). The language you are learning, with how far
 * along its line you are and a Continue into the journey; every other
 * language as a tile that opens the picker. HOW A LANGUAGE IS UNLOCKED IS
 * THE ONE HONEST DIFFERENCE from the mockup: nothing is bought here. Chai
 * buys a STOP on a locked language's journey, stop by stop (the wallet's
 * signpost explains it), and All-Access owns every stop. The mockup's "25
 * Chai per language" is not a thing the server sells, so the tiles say what
 * is true instead of pricing what is not.
 */
export default function LanguageOfficeScreen() {
  const colors = useColors();
  const router = useRouter();
  const width = useContentWidth();
  const { languages, activeLang, activeLanguage } = useLanguage();
  const { isPlus, isOneLanguage } = useEntitlements();
  const line = getJourneyLine(activeLang);
  const journey = useJourneyProgress(activeLang, line.zones);
  const [walletOpen, setWalletOpen] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const bandW = Math.max(1, width - 40);
  const bandH = Math.round(bandW * 0.56);
  const others = languages.filter((l) => l.code !== activeLang);
  const included = isPlus || isOneLanguage;
  return (
    <Screen>
      <BazaarHeader title="Language Office" subtitle="Unlock new languages." centred onWallet={() => setWalletOpen(true)} />
      <ScrollView contentContainerStyle={styles.street} showsVerticalScrollIndicator={false}>
        <View style={[styles.band, { width: bandW, height: bandH }]}>
          <Image source={OFFICE_ART} resizeMode="cover" style={{ width: bandW, height: bandH }} />
        </View>
        <Text style={[styles.label, { color: colors.foreground }]}>LANGUAGES</Text>
        {/* The one you are on. */}
        {activeLanguage ? (
          <View testID="language-office-active" style={[styles.activeTile, { backgroundColor: colors.card, borderColor: colors.primary }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.tileName, { color: colors.foreground }]}>{activeLanguage.name}</Text>
              <Text style={[nativeTextStyle(activeLanguage), styles.tileNative, { color: colors.mutedForeground }]}>{activeLanguage.nativeName}</Text>
              <Text style={[styles.tileMeta, { color: colors.mutedForeground }]}>
                {journey.isLoading ? 'Counting your stops' : `${journey.doneCount}/${journey.totalCount} stops on the ${line.lineName}`}
              </Text>
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Continue ${activeLanguage.name}`}
              onPress={() => {
                hapticLight();
                router.push('/(app)/journey' as Parameters<typeof router.push>[0]);
              }}
              style={[styles.continueBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.continueText, { color: colors.primaryForeground }]}>Continue</Text>
              <Feather name="arrow-right" size={14} color={colors.primaryForeground} />
            </PressableScale>
          </View>
        ) : null}
        <View style={styles.grid}>
          {others.map((l) => (
            <Pressable
              key={l.code}
              testID={`language-office-${l.code}`}
              accessibilityRole="button"
              accessibilityLabel={`${l.name}, ${included ? 'included' : 'Chai opens its stops'}`}
              onPress={() => {
                hapticLight();
                router.push('/(app)/language');
              }}
              style={({ pressed }) => [styles.tile, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}
            >
              <Text style={[nativeTextStyle(l, { bold: true }), styles.tileGlyph, { color: colors.primary }]} numberOfLines={1}>
                {l.nativeName.slice(0, 2)}
              </Text>
              <Text style={[styles.tileName, { color: colors.foreground }]} numberOfLines={1}>{l.name}</Text>
              <Text style={[styles.tileState, { color: included ? colors.success : colors.mutedForeground }]} numberOfLines={2}>
                {included ? 'Included' : 'Chai opens stops'}
              </Text>
            </Pressable>
          ))}
        </View>
        {/* The signpost, free tier only: where the Chai actually goes. */}
        <LanguageSignpostRow onInfo={() => setInfoOpen(true)} />
      </ScrollView>
      <ChaiWalletSheet visible={walletOpen} onClose={() => setWalletOpen(false)} />
      {infoOpen ? <LanguageInfoOverlay onClose={() => setInfoOpen(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  street: { paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE, gap: 14 },
  band: { borderRadius: 22, overflow: 'hidden' },
  label: { fontFamily: AppFonts.extrabold, fontSize: 12, letterSpacing: 1.4, marginTop: 4 },
  activeTile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1.5, padding: 14 },
  tileName: { fontFamily: AppFonts.bold, fontSize: 15 },
  tileNative: { fontSize: 14, marginTop: 1 },
  tileMeta: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 4 },
  continueBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  continueText: { fontFamily: AppFonts.bold, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '30.5%', flexGrow: 1, borderRadius: 16, borderWidth: 1, padding: 12, alignItems: 'center', gap: 4 },
  pressed: { opacity: 0.7 },
  tileGlyph: { fontSize: 24, lineHeight: 30 },
  tileState: { fontFamily: AppFonts.semibold, fontSize: 11, lineHeight: 14, textAlign: 'center' },
});
