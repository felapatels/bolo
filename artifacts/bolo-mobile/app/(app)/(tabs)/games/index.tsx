/**
 * Games hub - the mobile port of the web hub's colorful 2-column animated
 * grid (#967 web redesign + #986 motion punch-up; mobile item #990).
 *
 * Web parity carried over:
 *  - 2-column grid of vertical cards, one distinct hue per game; locked
 *    (Plus-only) cards keep the SAME hue washed out - colorful but obviously
 *    gated, never gray boxes.
 *  - Looping preview vignettes pantomime each game's mechanic inside the
 *    icon bubble (components/games/GamePreview.tsx), phase-staggered so the
 *    grid never pulses in unison; ambient idle tempo wakes to full energy on
 *    press; locked vignettes hold a static frame and play only while
 *    pressed; off-screen vignettes pause (FlatList viewability standing in
 *    for the web IntersectionObserver).
 *  - Entrance cascade: rise from y28 / scale 0.9 with an overshooting spring
 *    (web springs.poppy), 70ms stagger - five cards settle in ~0.65s, under
 *    the 700ms budget. Press is a deeper 0.93 squash with a brief glow in
 *    the card's own hue; navigating into a game steps the card toward the
 *    viewer (1.05, web springs.snappy) without ever delaying navigation.
 *  - Bolo reacts to the hub opening: one whole-image bounce, once per mount,
 *    never looping (canonical mascot rule: whole-image transforms only).
 *  - Reduced motion: fully static - no cascade, no squash, no glow, no
 *    step-in, no mascot bounce, vignettes hold their settled frames.
 *
 * Behavior unchanged from the previous hub: fail-closed Plus gating (locked
 * tiles route to the paywall while entitlements load) and the same push
 * targets.
 */
import React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useAppearSkip } from '@/lib/entrance';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticTap } from '@/lib/haptics';
import { Mascot } from '@/components/Mascot';
import { GlobeButton } from '@/components/GlobeButton';
import { GamePreview } from '@/components/games/GamePreview';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Web lib/motion springs, by the numbers. */
const POPPY = { stiffness: 500, damping: 22, mass: 1 };
const SNAPPY = { stiffness: 400, damping: 30, mass: 1 };

type GameDef = {
  id: string;
  title: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  plusOnly: boolean;
  icon: keyof typeof Feather.glyphMap;
};

const GAMES: GameDef[] = [
  {
    id: 'word-match',
    title: 'Word Match',
    description: 'Match words to their translations before time runs out',
    difficulty: 'Beginner',
    plusOnly: false,
    icon: 'link',
  },
  {
    id: 'listen-and-pick',
    title: 'Listen & Pick',
    description: 'Hear a word or phrase and choose the right translation',
    difficulty: 'Beginner',
    plusOnly: false,
    icon: 'headphones',
  },
  {
    id: 'phrase-builder',
    title: 'Phrase Builder',
    description: 'Arrange word tiles into correct phrases',
    difficulty: 'Intermediate',
    plusOnly: true,
    icon: 'layers',
  },
  {
    id: 'speed-round',
    title: 'Speed Round',
    description: 'Race against the clock to answer as many as you can',
    difficulty: 'Intermediate',
    plusOnly: true,
    icon: 'zap',
  },
  // FEATURE FLAG: script-trace hidden until pen animation and scoring are polished
  // {
  //   id: 'script-trace',
  //   title: 'Script Trace',
  //   description: 'Trace native-script characters stroke by stroke',
  //   difficulty: 'Advanced',
  //   plusOnly: true,
  //   icon: 'edit-3',
  // },
  {
    id: 'bolo-quiz',
    title: 'Bolo Quiz',
    description: 'A fresh daily quiz to test everything you have learned',
    difficulty: 'Advanced',
    plusOnly: true,
    icon: 'award',
  },
  // Build 35 mobile parity, first quick game. Copy comes from the roster
  // entry in lib/quick-games.ts so the hub, signals and web all describe the
  // same game the same way. FREE on mobile: mobile's existing 3-gated/2-free
  // split is untouched here. The roster grades it 'Easy'; the hub's own scale
  // is Beginner/Intermediate/Advanced, so it lands as Beginner.
  {
    id: 'ticket-check',
    title: 'Ticket Check',
    description: 'Hear the phrase, punch the matching ticket.',
    difficulty: 'Beginner',
    plusOnly: false,
    icon: 'check-square',
  },
  // Build 35 mobile parity, second quick game. Title, description and icon
  // come from the roster entry in lib/quick-games.ts so the hub, signals and
  // web all describe the same game the same way. FREE on mobile. The roster
  // grades it 'Medium'; the hub's own scale is Beginner/Intermediate/Advanced,
  // so it lands as Intermediate.
  {
    id: 'signal-lights',
    title: 'Signal Lights',
    description: 'Green or red? Call the phrase before the signal changes.',
    difficulty: 'Intermediate',
    plusOnly: false,
    icon: 'radio',
  },
  // Build 35 mobile parity, third quick game. Title, description and icon come
  // from the roster entry in lib/quick-games.ts. FREE, matching the web hub.
  // The roster grades it 'Medium', which maps to Intermediate on the hub's own
  // Beginner/Intermediate/Advanced scale.
  {
    id: 'wrong-platform',
    title: 'Wrong Platform',
    description: 'Spot the phrase that does not belong on this platform.',
    difficulty: 'Intermediate',
    plusOnly: false,
    icon: 'alert-triangle',
  },
  // Build 35 mobile parity, fourth quick game. Roster title, description and
  // icon; FREE, matching the web hub. The roster grades it 'Easy', which maps
  // to Beginner — the same grade the web hub hardcodes, so no divergence here.
  // The roster blurb's "before the train leaves" promises a timer this game
  // does not have; banked as a copy fix rather than rewritten here.
  {
    id: 'luggage-match',
    title: 'Luggage Match',
    description: 'Pair each bag with its owner before the train leaves.',
    difficulty: 'Beginner',
    plusOnly: false,
    icon: 'briefcase',
  },
];

/**
 * Per-game color identity (web GAME_COLORS, hue-anchored). Alpha tints over
 * the theme card color keep the hues working on both light and dark
 * palettes: `tint` is the web pressGlow hue (sky/emerald/amber/rose/violet
 * 400), `icon` the 600-weight accent, `glow` the exact web press-bloom rgba.
 */
type GameColor = { tint: string; icon: string; glow: string };

const GAME_COLORS: Record<string, GameColor> = {
  'word-match': { tint: '#38BDF8', icon: '#0284C7', glow: 'rgba(56,189,248,0.45)' },
  'listen-and-pick': { tint: '#34D399', icon: '#059669', glow: 'rgba(52,211,153,0.45)' },
  'phrase-builder': { tint: '#FBBF24', icon: '#D97706', glow: 'rgba(251,191,36,0.45)' },
  'speed-round': { tint: '#FB7185', icon: '#E11D48', glow: 'rgba(251,113,133,0.45)' },
  'bolo-quiz': { tint: '#A78BFA', icon: '#7C3AED', glow: 'rgba(167,139,250,0.45)' },
};

/** Neutral fallback so an unmapped future game still renders sensibly. */
const FALLBACK_COLOR: GameColor = {
  tint: '#94A3B8',
  icon: '#64748B',
  glow: 'rgba(148,163,184,0.35)',
};

const DIFFICULTY_COLORS: Record<GameDef['difficulty'], string> = {
  Beginner: '#10B981',
  Intermediate: '#F59E0B',
  Advanced: '#6366F1',
};

/**
 * Entrance cascade worklet (web: initial y28/scale0.9 → springs.poppy with
 * index*0.07s delay). A custom builder because the stock FadeInDown does not
 * carry the scale pop.
 */
function cardEntering(index: number) {
  return () => {
    'worklet';
    const delay = index * 70;
    return {
      initialValues: {
        opacity: 0,
        transform: [{ translateY: 28 }, { scale: 0.9 }],
      },
      animations: {
        opacity: withDelay(delay, withSpring(1, POPPY)),
        transform: [
          { translateY: withDelay(delay, withSpring(0, POPPY)) },
          { scale: withDelay(delay, withSpring(1, POPPY)) },
        ],
      },
    };
  };
}

export default function GamesScreen() {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const { isPlus, isLoading: entitlementsLoading } = useEntitlements();
  // Fail closed: while entitlements are loading (or undefined), Plus-only
  // tiles render locked rather than briefly unlocked.
  const plusReady = isPlus === true && !entitlementsLoading;

  // Step-in: the card being navigated into scales slightly toward the viewer
  // while the route transitions. State only ever selects the animate target -
  // navigation happens immediately and is never delayed.
  const [enteredId, setEnteredId] = React.useState<string | null>(null);

  // FlatList viewability drives vignette pausing (the mobile stand-in for
  // the web IntersectionObserver). Null = callback has not fired yet (fresh
  // mount, and always in jsdom-less test renders): treat everything as
  // visible, the safe default.
  const [visibleIds, setVisibleIds] = React.useState<ReadonlySet<string> | null>(null);
  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      setVisibleIds(new Set(viewableItems.map((v) => String(v.key))));
    },
  ).current;
  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 5 }).current;

  // Bolo reacts to the hub opening - one whole-image bounce timed to the
  // cascade start, once per mount, never looping.
  const mascotY = useSharedValue(0);
  const mascotRot = useSharedValue(0);
  React.useEffect(() => {
    if (skipEnter || reduceMotion) return;
    mascotY.value = withDelay(
      80,
      withSequence(
        withTiming(-9, { duration: 220, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 330, easing: Easing.out(Easing.quad) }),
      ),
    );
    mascotRot.value = withDelay(
      80,
      withSequence(
        withTiming(-7, { duration: 180, easing: Easing.out(Easing.quad) }),
        withTiming(4, { duration: 180, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 190, easing: Easing.out(Easing.quad) }),
      ),
    );
    // One-shot on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mascotStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: mascotY.value }, { rotate: `${mascotRot.value}deg` }],
  }));

  const handleGamePress = (game: GameDef) => {
    if (game.plusOnly && !plusReady) {
      // Locked cards route to the paywall and skip the step-in.
      router.push('/(app)/paywall');
      return;
    }
    if (!reduceMotion) setEnteredId(game.id);
    router.push(`/(app)/(tabs)/games/${game.id}` as never);
  };

  return (
    <Screen>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: colors.foreground }]}>Games</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Play your way to fluency
          </Text>
        </View>
        <GlobeButton style={{ marginRight: 8 }} />
        <Animated.View style={mascotStyle}>
          <Mascot pose="cheer" size={64} />
        </Animated.View>
      </View>

      <FlatList
        data={GAMES}
        keyExtractor={(g) => g.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => (
          <GameCardTile
            game={item}
            index={index}
            locked={item.plusOnly && !plusReady}
            entered={enteredId === item.id}
            visible={visibleIds ? visibleIds.has(item.id) : true}
            skipEnter={skipEnter}
            reduceMotion={!!reduceMotion}
            onPress={() => handleGamePress(item)}
          />
        )}
      />
    </Screen>
  );
}

function GameCardTile({
  game,
  index,
  locked,
  entered,
  visible,
  skipEnter,
  reduceMotion,
  onPress,
}: {
  game: GameDef;
  index: number;
  locked: boolean;
  entered: boolean;
  visible: boolean;
  skipEnter: boolean;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const gc = GAME_COLORS[game.id] ?? FALLBACK_COLOR;
  const diffColor = DIFFICULTY_COLORS[game.difficulty];

  // Pressed drives both the squash/glow and the vignette wake.
  const [pressed, setPressed] = React.useState(false);
  const pressedSV = useSharedValue(0);
  const enteredSV = useSharedValue(0);

  React.useEffect(() => {
    if (entered && !reduceMotion) {
      enteredSV.value = withSpring(1, SNAPPY);
    } else {
      enteredSV.value = 0;
    }
  }, [entered, reduceMotion, enteredSV]);

  const motionStyle = useAnimatedStyle(() => ({
    // Press squash (0.93) and step-in (1.05) compose on one scale; glow is
    // the per-hue shadow fading in with the press.
    transform: [{ scale: (1 - pressedSV.value * 0.07) * (1 + enteredSV.value * 0.05) }],
    shadowOpacity: pressedSV.value,
  }));

  return (
    <Animated.View
      entering={skipEnter || reduceMotion ? undefined : cardEntering(index)}
      style={styles.cell}
    >
      <AnimatedPressable
        onPress={() => {
          hapticTap('light');
          onPress();
        }}
        onPressIn={() => {
          setPressed(true);
          if (!reduceMotion) pressedSV.value = withSpring(1, SNAPPY);
        }}
        onPressOut={() => {
          setPressed(false);
          pressedSV.value = withSpring(0, SNAPPY);
        }}
        accessibilityRole="button"
        accessibilityLabel={
          locked ? `${game.title}, All-Access game, locked` : game.title
        }
        style={[
          styles.card,
          {
            backgroundColor: locked ? `${gc.tint}0D` : `${gc.tint}14`,
            borderColor: locked ? `${gc.tint}33` : `${gc.tint}59`,
            // Locked: same hue, washed out - colorful but obviously gated.
            opacity: locked ? 0.8 : 1,
            shadowColor: gc.glow,
          },
          motionStyle,
        ]}
      >
        {/* Vignette bubble + pills row */}
        <View style={styles.topRow}>
          <View
            style={[
              styles.bubble,
              { backgroundColor: locked ? `${gc.tint}17` : `${gc.tint}26` },
            ]}
          >
            <GamePreview
              gameId={game.id}
              index={index}
              playing={!reduceMotion && (locked ? pressed : visible || pressed)}
              tempo={pressed ? 1 : 2.2}
              holdMidCycle={locked && !reduceMotion}
              fallback={
                <Feather
                  name={game.icon}
                  size={22}
                  color={locked ? `${gc.icon}99` : gc.icon}
                />
              }
            />
          </View>
          <View style={styles.pillCol}>
            {game.plusOnly ? (
              <View
                style={[
                  styles.pill,
                  {
                    backgroundColor: `${colors.primary}18`,
                    borderColor: `${colors.primary}30`,
                  },
                ]}
              >
                <Feather name="star" size={9} color={colors.primary} />
                <Text style={[styles.pillText, { color: colors.primary }]}>
                  All-Access
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.pill,
                  { backgroundColor: '#10B98118', borderColor: '#10B98130' },
                ]}
              >
                <Text style={[styles.pillText, { color: '#10B981' }]}>Free</Text>
              </View>
            )}
            {locked && (
              <Feather
                name="lock"
                size={14}
                color={colors.mutedForeground}
                style={styles.lockIcon}
              />
            )}
          </View>
        </View>

        {/* Title & description */}
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {game.title}
          </Text>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
            {game.description}
          </Text>
        </View>

        {/* Difficulty badge, pinned to the card bottom like the web card */}
        <View
          style={[styles.difficultyPill, { backgroundColor: `${diffColor}1A` }]}
        >
          <Text style={[styles.difficultyText, { color: diffColor }]}>
            {game.difficulty}
          </Text>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  h1: {
    fontFamily: AppFonts.extrabold,
    fontSize: 28,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 16,
    gap: 10,
  },
  column: {
    gap: 10,
  },
  cell: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    // Press bloom: hue glow fades in via animated shadowOpacity.
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  bubble: {
    width: 46,
    height: 46,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: AppFonts.bold,
    fontSize: 10,
  },
  lockIcon: {
    marginTop: 1,
  },
  cardBody: {
    gap: 3,
  },
  cardTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 15,
  },
  cardDesc: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  difficultyPill: {
    alignSelf: 'flex-start',
    marginTop: 'auto',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 100,
  },
  difficultyText: {
    fontFamily: AppFonts.semibold,
    fontSize: 11,
  },
});
