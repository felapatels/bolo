import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
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

/** The upgrade card's paper: the Ticket Counter's own stamp stock, so the
 *  card reads as one of the bazaar's tickets wherever it is met. Mobile twin
 *  of the same five in components/bazaar/PassCards.tsx (STAMP). */
const UPGRADE_PAPER = {
  paper: '#FBF3E6',
  edge: '#DCCBAF',
  ink: '#3B2A1E',
  inkMuted: '#7A6551',
  picture: 'rgba(232,185,60,0.22)',
  brass: '#92650A',
} as const;

/**
 * THE ALL-ACCESS UPGRADE CARD, ONE OF IT (build 23, owner off the 1.0.6
 * build: "This go all access button is not the same as the new ones we
 * created. Fix it on the home screen"). The Ticket Counter drew it first in
 * build 22 (an armchair in a beige tile, "All-Access", its one line, a gold
 * Explore pill on cream paper) while the home kept the navy "Go All-Access"
 * banner with a gold star from before. Same card now, from one definition:
 * the Ticket Counter's Upgrades renders this, and so does the home.
 */
export function AllAccessUpgradeCard({
  onPress,
  style,
  testID,
}: {
  onPress: () => void;
  style?: ViewStyle;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Explore All-Access"
      accessibilityHint="Opens the Bolo! All-Access upgrade screen"
      onPress={onPress}
      style={[styles.upgrade, { backgroundColor: UPGRADE_PAPER.paper, borderColor: UPGRADE_PAPER.edge }, ...(style ? [style] : [])]}
      testID={testID}
    >
      <View style={[styles.upgradePicture, { backgroundColor: UPGRADE_PAPER.picture }]}>
        <MaterialCommunityIcons name="sofa-single" size={34} color={UPGRADE_PAPER.brass} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.upgradeTitle, { color: UPGRADE_PAPER.ink }]}>All-Access</Text>
        <Text style={[styles.upgradeLine, { color: UPGRADE_PAPER.inkMuted }]}>
          Every language, the full phrase library and every game.
        </Text>
      </View>
      <View style={[styles.exploreBtn, { backgroundColor: colors.gold }]}>
        <Text style={styles.exploreText}>Explore</Text>
        <Feather name="arrow-right" size={14} color="#1a1200" />
      </View>
    </PressableScale>
  );
}

/**
 * The home's upgrade card for learners who are not yet All-Access. It was a
 * navy banner ("Go All-Access", a gold star, a chevron) with plan-aware copy
 * until build 23; it is the Ticket Counter's card now, see
 * AllAccessUpgradeCard. The One-Language line went with it: that tier is
 * dead (CLAUDE.md), and a card that reads differently for a plan nobody is
 * on is a branch nobody can see.
 */
export function UpgradeBanner({ onPress }: { onPress: () => void }) {
  return <AllAccessUpgradeCard onPress={onPress} style={styles.homeUpgrade} testID="home-upgrade" />;
}

/** The All-Access card's paper: warm cream, gold edge, brown ink. The theme's
 *  slate foreground reads cold on it, as it does on the ticket stock. */
const ALL_ACCESS = {
  paper: '#FBF1E3',
  edge: '#E8CFA3',
  ink: '#3B2A1E',
  inkMuted: '#8A6A47',
  brass: '#9A6B1C',
} as const;

/**
 * ONE CARD FOR THE WHOLE UPSELL (build 22, the owner's Progress mockup: "Go
 * deeper with All-Access"). The Progress tab used to stack three
 * LockedFeatureCards under a heading; the mockup folds them into one warm
 * card with the three features as two lines, a padlocked ticket, and a gold
 * "Explore All-Access" button. The whole card is the tap target and the
 * button is its affordance, so a learner cannot land between two targets.
 */
export function AllAccessCard({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Explore All-Access"
      accessibilityHint="Opens the Bolo! All-Access upgrade screen"
      testID="all-access-card"
      style={[styles.allAccess, { backgroundColor: ALL_ACCESS.paper, borderColor: ALL_ACCESS.edge }]}
    >
      <View style={styles.allAccessTicket}>
        <MaterialCommunityIcons
          name="ticket-confirmation-outline"
          size={56}
          color={ALL_ACCESS.brass}
          style={{ transform: [{ rotate: '-14deg' }] }}
        />
        <View style={[styles.allAccessTicketLock, { backgroundColor: ALL_ACCESS.paper }]}>
          <Feather name="lock" size={13} color={ALL_ACCESS.brass} />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.allAccessTitle, { color: ALL_ACCESS.ink }]}>Go deeper with All-Access</Text>
        <Text style={[styles.allAccessLine, { color: ALL_ACCESS.inkMuted }]} numberOfLines={1}>
          Review weak phrases  •  Advanced analytics
        </Text>
        <Text style={[styles.allAccessLine, { color: ALL_ACCESS.inkMuted }]} numberOfLines={1}>
          Exclusive badges and achievements
        </Text>
        <View style={[styles.allAccessCta, { backgroundColor: colors.gold }]}>
          <Text style={styles.allAccessCtaText}>Explore All-Access</Text>
          <Feather name="arrow-right" size={16} color="#1a1200" />
        </View>
      </View>
      {/* The padlock sits in the corner rather than in the row, so the two
          feature lines keep the width they need to stay on one line each. */}
      <Feather name="lock" size={22} color={ALL_ACCESS.brass} style={styles.allAccessLock} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  allAccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 24,
  },
  allAccessTicket: { width: 54, alignItems: 'center', justifyContent: 'center' },
  allAccessLock: { position: 'absolute', top: 14, right: 14, opacity: 0.75 },
  allAccessTicketLock: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allAccessTitle: { fontFamily: AppFonts.extrabold, fontSize: 16, marginBottom: 4, paddingRight: 28 },
  allAccessLine: { fontFamily: AppFonts.semibold, fontSize: 12, lineHeight: 18 },
  allAccessCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  allAccessCtaText: { fontFamily: AppFonts.extrabold, fontSize: 14, color: '#1a1200' },
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
  // The Ticket Counter's upgrade card, exactly (PassCards.tsx held these
  // until build 23): cream paper, a 64pt picture tile, the gold Explore pill.
  upgrade: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
  },
  upgradePicture: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  upgradeTitle: { fontFamily: AppFonts.extrabold, fontSize: 14, lineHeight: 18 },
  upgradeLine: { fontFamily: AppFonts.regular, fontSize: 11.5, lineHeight: 15 },
  exploreBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  exploreText: { fontFamily: AppFonts.extrabold, fontSize: 13, color: '#1a1200' },
  // The home keeps the banner's old spacing below it.
  homeUpgrade: { marginBottom: 18 },
});
