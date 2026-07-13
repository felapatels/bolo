import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/** Small "PLUS" pill used to mark locked, Plus-only affordances. */
export function PlusPill({ style }: { style?: ViewStyle }) {
  const colors = useColors();
  return (
    <View style={[styles.pill, { backgroundColor: colors.gold }, style]}>
      <Feather name="star" size={11} color="#1a1200" />
      <Text style={styles.pillText}>PLUS</Text>
    </View>
  );
}

/**
 * A present-but-locked feature row. Free learners see the feature exists and tap
 * through to the paywall instead of hitting an error or a dead end.
 */
export function LockedFeatureCard({
  icon,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Opens the Bolo! Plus upgrade screen"
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: `${colors.gold}2E` }]}>
        <Feather name={icon} size={20} color={colors.foreground} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {title}
          </Text>
          <PlusPill />
        </View>
        <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
          {description}
        </Text>
      </View>
      <Feather name="lock" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

/** Prominent upgrade banner shown to Free learners on the home screen. */
export function UpgradeBanner({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.banner, { backgroundColor: colors.foreground }]}
    >
      <View style={[styles.bannerIcon, { backgroundColor: colors.gold }]}>
        <Feather name="star" size={20} color="#1a1200" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color: colors.background }]}>
          Go Plus
        </Text>
        <Text style={[styles.bannerSub, { color: colors.background }]}>
          All languages, unlimited lessons & more.
        </Text>
      </View>
      <Feather name="chevron-right" size={22} color={colors.background} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  pillText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: '#1a1200',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  cardDesc: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 22,
    marginBottom: 18,
  },
  bannerIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  bannerSub: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 1, opacity: 0.85 },
});
