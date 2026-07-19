/**
 * Shared globe/language-switcher button used in each tab screen's own header
 * row. Shows the active language code below the icon so learners always know
 * which language they are practising.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

export function GlobeButton({ style }: { style?: ViewStyle }) {
  const router = useRouter();
  const colors = useColors();
  const { activeLang } = useLanguage();
  return (
    <Pressable
      onPress={() => {
        hapticLight();
        router.push('/(app)/language');
      }}
      accessibilityLabel="Change language"
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.root, style]}
    >
      <Feather name="globe" size={20} color={colors.mutedForeground} />
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {activeLang}
      </Text>
    </Pressable>
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
