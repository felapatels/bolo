import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useGetTokens } from '@workspace/api-client-react';
import { ChaiGlyph } from '@/components/ChaiStall';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

/**
 * THE BAZAAR'S HEADER (build 22, the owner's redesign): a back button, the
 * place's name with its one-line trade under it, and the Chai pill at the
 * right, which opens the wallet. The balance is the wallet's own query, so
 * every door shows the same number.
 *
 * THE HUB HAS THE BACK BUTTON TOO SINCE BUILD 23 (owner: "Bazaar has no back
 * button so you get stuck on that screen"), and back FALLS BACK TO HOME:
 * a bazaar opened by a deep link, or first thing after a launch, has nothing
 * behind it, and router.back() on an empty stack is a dev-only warning and a
 * learner still stuck. Every screen outside the tabs needs a way back or the
 * tab bar; this one is the way back.
 */
export function BazaarHeader({
  title,
  subtitle,
  back = true,
  centred = false,
  onWallet,
}: {
  title: string;
  subtitle: string;
  back?: boolean;
  /** The doors centre their name between the back button and the pill. */
  centred?: boolean;
  onWallet: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const tokens = useGetTokens();
  const balance = tokens.data?.balance;
  return (
    <View style={styles.row}>
      {back ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            hapticLight();
            if (router.canGoBack()) router.back();
            else router.replace('/(app)/(tabs)');
          }}
          style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </PressableScale>
      ) : null}
      <View style={[styles.words, centred && styles.wordsCentred]}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Pressable
        testID="outfit-balance"
        accessibilityRole="button"
        accessibilityLabel={balance === undefined ? 'Chai wallet' : `${balance} Chai. Open your wallet`}
        onPress={() => {
          hapticLight();
          onWallet();
        }}
        style={[styles.pill, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <ChaiGlyph size={16} />
        <Text style={[styles.pillText, { color: colors.foreground }]}>{balance ?? '·'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { flex: 1, minWidth: 0 },
  wordsCentred: { alignItems: 'center' },
  title: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
});
