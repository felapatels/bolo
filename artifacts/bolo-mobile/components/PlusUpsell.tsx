import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { AppFonts } from '@/constants/fonts';

/** Small "ALL-ACCESS" pill used to mark locked, All-Access-only affordances. */
export function PlusPill({ style }: { style?: ViewStyle }) {
  const colors = useColors();
  return (
    <View style={[styles.pill, { backgroundColor: colors.gold }, style]}>
      <Feather name="star" size={11} color="#1a1200" />
      <Text style={styles.pillText}>ALL-ACCESS</Text>
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
    // PressableScale provides the press-scale response and light haptic tap.
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Opens the Bolo! All-Access upgrade screen"
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
    </PressableScale>
  );
}

/**
 * Shown on a topic screen to a non-Plus learner: surfaces how many additional
 * phrases the extended (Plus) library holds for this topic and routes to the
 * paywall. The count is server-reported (never hardcoded); the caller only
 * renders this when it's > 0.
 */
export function LockedPhrasesCard({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const colors = useColors();
  const label = `${count} more ${count === 1 ? 'phrase' : 'phrases'} with All-Access`;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the Bolo! All-Access upgrade screen"
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: `${colors.gold}2E` }]}>
        <Feather name="lock" size={20} color={colors.foreground} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {label}
          </Text>
          <PlusPill />
        </View>
        <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
          Unlock the full phrase library for this topic.
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </PressableScale>
  );
}

/**
 * Prominent upgrade banner shown to learners who aren't yet all-access. Its copy
 * adapts to the plan: Free learners are nudged toward the plans generally, while
 * a One-Language subscriber is nudged specifically toward all-access.
 */
export function UpgradeBanner({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const { isOneLanguage } = useEntitlements();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.banner, { backgroundColor: colors.foreground }]}
    >
      <View style={[styles.bannerIcon, { backgroundColor: colors.gold }]}>
        <Feather name="star" size={20} color="#1a1200" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color: colors.background }]}>
          Go All-Access
        </Text>
        <Text style={[styles.bannerSub, { color: colors.background }]}>
          {isOneLanguage
            ? 'Every language, review & analytics.'
            : 'Every language, the full phrase library & every game.'}
        </Text>
      </View>
      <Feather name="chevron-right" size={22} color={colors.background} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
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
  // THE PILL USED TO RUN OFF THE SCREEN. Reported on device 2026-08-26 with
  // "32 more phrases with All-Access", which wraps to two lines: the Text had
  // no flexShrink, so it claimed the whole row and laid the pill out past the
  // card AND past the right edge, clipped mid-word. LockedFeatureCard looked
  // fine only because its title happened to be short enough.
  //
  // flexShrink on the title and none on the pill is the pair that matters: the
  // title yields the space, the pill keeps its intrinsic width, and any title
  // length now stays inside the card.
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontFamily: AppFonts.bold, fontSize: 16, flexShrink: 1 },
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
