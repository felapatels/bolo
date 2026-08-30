import React from 'react';
import { Animated as RNAnimated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { appearDown, useAppearSkip } from '@/lib/entrance';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useListBadges } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { badgeIcon } from '@/lib/badge-icons';
import { findNearestLockedBadge, progressRatio } from '@/lib/badge-progress';
import { TICKET } from '@/lib/ticketStock';

/**
 * THE NEXT MILESTONE, AS A TICKET (build 22, the owner's Progress mockup).
 * A prominent card at the top of the Progress tab that calls out the single
 * locked badge the learner is closest to unlocking, turning the gallery into
 * a directed goal rather than a reference grid. It used to be a tinted
 * "Next goal" card; the mockup makes it a slip of ticket stock with a gold
 * edge, the badge in a gold tile, a purple bar, "19 / 25 phrases" on the
 * left and "6 more to unlock" on the right, and a faint stamp in the
 * corner. When every badge is earned it shows a celebratory all-earned state
 * instead. Mirrors the web NextBadgeSpotlight so the highlighted goal
 * matches across platforms; web still wears the old tint until its parity
 * pass.
 */

/** The unit a milestone counts in, read off its own description ("Master 25
 *  phrases", "a 7 day streak"). Empty when the description does not say, so
 *  the count stands alone rather than guessing. */
export function milestoneUnit(description: string): string {
  const d = description.toLowerCase();
  if (d.includes('phrase')) return 'phrases';
  if (d.includes('day')) return 'days';
  if (d.includes('game')) return 'games';
  if (d.includes('stop')) return 'stops';
  return '';
}

const STAMP = 72;

export function NextBadgeSpotlight({ lang }: { lang: string }) {
  const router = useRouter();
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const reduceMotion = useReducedMotion();
  const { data: badges, isLoading } = useListBadges({ lang });

  // Shimmer pulse on the badge icon: opacity 1 → 0.5 → 1 repeating.
  // Opacity is not a layout prop so Reanimated useAnimatedStyle is safe here
  // (no New Architecture crash risk). Skipped entirely for reduced-motion users.
  const iconOpacity = useSharedValue(1);
  React.useEffect(() => {
    if (reduceMotion) return;
    iconOpacity.value = withRepeat(withTiming(0.5, { duration: 1200 }), -1, true);
  }, [reduceMotion, iconOpacity]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
  }));

  // Derive nearest/ratio before any early returns so hooks below stay
  // unconditional. Defaults to null/0 while data is still loading.
  const nearest =
    badges && badges.length > 0 ? findNearestLockedBadge(badges) : null;
  const ratio = nearest ? progressRatio(nearest) : 0;

  // Progress bar spring: width is a layout prop — must use RNAnimated (not
  // Reanimated useAnimatedStyle) to avoid the New Architecture layout-prop
  // crash. Matches TopicBar physics (stiffness 120, damping 14).
  // Hooks are declared unconditionally here, before any early returns.
  const barAnim = React.useRef(new RNAnimated.Value(0)).current;
  React.useEffect(() => {
    if (!nearest) return; // nothing to animate while loading or all-earned
    if (reduceMotion) {
      barAnim.setValue(ratio * 100);
      return;
    }
    barAnim.setValue(0);
    RNAnimated.spring(barAnim, {
      toValue: ratio * 100,
      stiffness: 120,
      damping: 14,
      mass: 1,
      useNativeDriver: false, // width cannot use the native driver
    }).start();
  }, [ratio, reduceMotion, barAnim, nearest]);

  const barWidthPct = barAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  // Nothing to spotlight until we know the catalog for this language.
  if (isLoading || !badges || badges.length === 0) return null;

  if (!nearest) {
    return (
      <Animated.View
        entering={skipEnter ? undefined : appearDown(0, 400)}
        style={[styles.card, styles.allEarned, { borderColor: TICKET.edgeGold }]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[TICKET.stockTop, TICKET.stockBottom]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.trophy, { backgroundColor: colors.gold }]}>
          <MaterialCommunityIcons name="trophy" size={26} color="#1a1200" />
        </View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>
          All badges earned
        </Text>
        <Text style={[styles.allEarnedTitle, { color: TICKET.ink }]}>
          You've unlocked them all!
        </Text>
        <Text style={[styles.allEarnedSub, { color: TICKET.inkMuted }]}>
          Keep practicing to stay sharp — new goals await.
        </Text>
      </Animated.View>
    );
  }

  const remaining = Math.max(nearest.progressTarget - nearest.progressCurrent, 0);
  const unit = milestoneUnit(nearest.description);

  return (
    <Animated.View
      entering={skipEnter ? undefined : appearDown(0, 400)}
      style={[styles.card, { borderColor: TICKET.edgeGold }]}
      testID="next-milestone"
    >
      <LinearGradient
        pointerEvents="none"
        colors={[TICKET.stockTop, TICKET.stockBottom]}
        style={StyleSheet.absoluteFill}
      />
      {/* The stamp: two rings, the outer one perforated, a train in the
          middle, in the primary ink at a whisper. Decoration; it carries no
          state, so it can be as faint as it likes. */}
      <View pointerEvents="none" style={styles.stamp}>
        <Svg width={STAMP} height={STAMP} viewBox={`0 0 ${STAMP} ${STAMP}`}>
          <Circle
            cx={STAMP / 2}
            cy={STAMP / 2}
            r={STAMP / 2 - 2}
            fill="none"
            stroke={colors.primary}
            strokeWidth={2}
            strokeDasharray="5 4"
          />
          <Circle cx={STAMP / 2} cy={STAMP / 2} r={STAMP / 2 - 9} fill="none" stroke={colors.primary} strokeWidth={1} />
        </Svg>
        <View style={styles.stampGlyph}>
          <MaterialCommunityIcons name="train" size={28} color={colors.primary} />
        </View>
      </View>

      <Text style={[styles.eyebrow, { color: colors.primary }]}>
        ◆  NEXT MILESTONE  ◆
      </Text>
      <View style={styles.row}>
        {/* Animated.View is safe here: opacity is not a layout prop and does
            not trigger the New Architecture crash that width/height would. */}
        <Animated.View style={[styles.icon, { backgroundColor: `${colors.gold}2E` }, iconAnimStyle]}>
          <MaterialCommunityIcons name={badgeIcon(nearest.iconName)} size={30} color={colors.gold} />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: TICKET.ink }]} numberOfLines={1}>
            {nearest.title}
          </Text>
          <Text style={[styles.desc, { color: TICKET.inkMuted }]} numberOfLines={2}>
            {nearest.description}
          </Text>
        </View>
      </View>

      <View style={styles.progressWrap}>
        <View style={[styles.track, { backgroundColor: `${colors.primary}22` }]}>
          {/* RNAnimated.View required: width is a layout prop and crashes New
              Architecture if driven by Reanimated useAnimatedStyle. */}
          <RNAnimated.View
            style={{
              width: barWidthPct,
              height: '100%',
              borderRadius: 999,
              backgroundColor: colors.primary,
            }}
          />
        </View>
        <View style={styles.progressMeta}>
          <Text style={[styles.count, { color: TICKET.ink }]}>
            {`${nearest.progressCurrent} / ${nearest.progressTarget}${unit ? ` ${unit}` : ''}`}
          </Text>
          {/* A DOOR TO THE JOURNEY (owner, build 25: "if they click that 6
              more to unlock, they should be taken to the journey"). The
              phrases are mastered on the line, so the number is the link. */}
          <Pressable
            testID="next-milestone-go"
            onPress={() => router.push('/(app)/journey' as Parameters<typeof router.push>[0])}
            accessibilityRole="link"
            accessibilityLabel={`${remaining} more to unlock, open the journey`}
            hitSlop={8}
            style={({ pressed }) => [styles.remainingLink, pressed && { opacity: 0.7 }]}
          >
            <Text style={[styles.remaining, { color: colors.primary }]}>
              {`${remaining} more to unlock`}
            </Text>
            <Feather name="chevron-right" size={14} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 20,
    overflow: 'hidden',
  },
  stamp: {
    position: 'absolute',
    right: 16,
    top: 14,
    width: STAMP,
    height: STAMP,
    opacity: 0.32,
    transform: [{ rotate: '-8deg' }],
  },
  stampGlyph: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: STAMP - 6 },
  icon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  desc: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 2,
  },
  progressWrap: { marginTop: 16 },
  track: {
    height: 9,
    borderRadius: 999,
    overflow: 'hidden',
    width: '100%',
  },
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  count: { fontFamily: AppFonts.semibold, fontSize: 14 },
  remainingLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  remaining: { fontFamily: AppFonts.bold, fontSize: 14 },
  // All-earned celebratory variant.
  allEarned: { alignItems: 'center' },
  trophy: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  allEarnedTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    marginTop: 4,
  },
  allEarnedSub: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
});
