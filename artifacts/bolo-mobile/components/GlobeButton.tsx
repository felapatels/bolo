/**
 * Shared globe/language-switcher button used in each tab screen's own header
 * row. Shows the active language code below the icon so learners always know
 * which language they are practising.
 */
import React from 'react';
import { StyleSheet, Text, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { AppFonts } from '@/constants/fonts';

export function GlobeButton({ style }: { style?: ViewStyle }) {
  const router = useRouter();
  const colors = useColors();
  const { activeLang } = useLanguage();
  return (
    // PressableScale supplies the press-scale response and the light haptic
    // tap, matching every other tappable in the app.
    <PressableScale
      onPress={() => router.push('/(app)/language')}
      accessibilityLabel="Change language"
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      scaleTo={0.9}
      style={style ? [styles.root, style] : styles.root}
    >
      <Feather name="globe" size={20} color={colors.mutedForeground} />
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {activeLang}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 2 },
  label: {
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
