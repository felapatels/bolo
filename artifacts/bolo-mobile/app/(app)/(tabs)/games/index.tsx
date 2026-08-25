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
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAppearSkip } from '@/lib/entrance';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticTap } from '@/lib/haptics';
import { Mascot } from '@/components/Mascot';
import { GlobeButton } from '@/components/GlobeButton';
import { GamePreview, type VignetteInk } from '@/components/games/GamePreview';

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

/**
 * EXPORTED so the hub's own test can count pills from the roster instead of
 * from literals. That assertion had been rewritten three times, once per new
 * game, and every rewrite was bookkeeping rather than a bug: a literal there
 * tests that somebody remembered to edit a number, not that every tile carries
 * a pill.
 */
export const GAMES: GameDef[] = [
  // Luggage Match leads: free, beginner, visually distinct — the right first
  // impression for a new learner browsing the hub.
  {
    id: 'luggage-match',
    title: 'Luggage Match',
    description: 'Pair each bag with its owner before the train leaves.',
    difficulty: 'Beginner',
    plusOnly: false,
    icon: 'briefcase',
  },
  {
    id: 'word-match',
    title: 'Word Match',
    description: 'Match words to their translations before time runs out',
    difficulty: 'Beginner',
    plusOnly: true,
    icon: 'link',
  },
  {
    id: 'listen-and-pick',
    title: 'Listen & Pick',
    description: 'Hear a word or phrase and choose the right translation',
    difficulty: 'Beginner',
    plusOnly: true,
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
  // Switched ON 2026-08-23. The flag said "hidden until pen animation and
  // scoring are polished"; what it was really waiting for was authored stroke
  // data, since AUTHORED_GLYPHS held three prototype glyphs and traceReadyFor()
  // was false in all 22 languages. A speaker traced the Gujarati alphabet, and
  // the other 11 scripts now carry font-derived guesses marked provisional, so
  // every language clears PLAYABLE_GLYPH_FLOOR. The screen still gates itself
  // on traceReadyFor(), so this entry cannot open onto an empty game.
  {
    id: 'script-trace',
    title: 'Script Trace',
    description: 'Trace native-script characters stroke by stroke',
    difficulty: 'Advanced',
    plusOnly: true,
    icon: 'edit-3',
  },
  {
    id: 'bolo-quiz',
    title: 'Bolo Quiz',
    description: 'A fresh daily quiz to test everything you have learned',
    difficulty: 'Advanced',
    plusOnly: true,
    icon: 'award',
  },
  {
    id: 'ticket-check',
    title: 'Ticket Check',
    description: 'Hear the phrase, punch the matching ticket.',
    difficulty: 'Beginner',
    plusOnly: false,
    icon: 'check-square',
  },
  {
    // ALL-ACCESS IN THE HUB, FREE ON THE MAP, and that split is deliberate.
    // Asked for on 2026-08-24: "why is the book game free? it should be gated
    // as All-Access only." A free learner still meets the storybook where it
    // was designed to live, as a stop on their line, where the whole of zone
    // 1's book is the taste and the finished book carries the ask. What
    // All-Access buys is opening it from the Games hub and the other five
    // books. Same arrangement Beat the Train already uses.
    id: 'storybook',
    title: 'Storybook',
    description: 'Read the scene and say the line that fits. Your choices become your book.',
    difficulty: 'Intermediate',
    plusOnly: true,
    icon: 'book',
  },
  {
    // PAID ONLY, same as web. Free learners still meet it where it was designed
    // to live, sprung on them between two stops on the map; what All-Access
    // buys is playing it deliberately and choosing how long.
    id: 'emergency',
    title: 'Beat the Train',
    description: 'The train is coming through. Answer faster than the clock drains.',
    difficulty: 'Intermediate',
    plusOnly: true,
    icon: 'zap',
  },
  {
    id: 'signal-lights',
    title: 'Signal Lights',
    description: 'Green or red? Call the phrase before the signal changes.',
    difficulty: 'Beginner',
    plusOnly: false,
    icon: 'radio',
  },
  {
    id: 'wrong-platform',
    title: 'Wrong Platform',
    description: 'Spot the phrase that does not belong on this platform.',
    difficulty: 'Intermediate',
    plusOnly: false,
    // Not 'alert-triangle': a warning triangle reads as "this tile is broken"
    // in a grid of games. The crosshair says pick the odd one out, and it is
    // the only ring-shaped glyph in the hub, so it stays distinct.
    icon: 'crosshair',
  },
];

/**
 * Per-game color identity (web GAME_COLORS, hue-anchored). Alpha tints over
 * the theme card color keep the hues working on both light and dark
 * palettes: `tint` is the web pressGlow hue (sky/emerald/amber/rose/violet
 * 400), `icon` the 600-weight accent, `glow` the exact web press-bloom rgba.
 */
type GameColor = {
  /** Enamel gradient stops (top-left → bottom-right). */
  from: string;
  to: string;
  /** Deeper edge: border and the chunky bottom edge the board sits on. */
  deep: string;
  /** Icon ink on the cream medallion. */
  ink: string;
  /** Press bloom (animated shadowOpacity). */
  glow: string;
};

/**
 * Per-game color identity, web parity. These are NOT tints over the theme
 * card: every tile is a painted enamel signboard in a saturated Indian hue
 * (marigold, kumkum, peacock, jamun, terracotta, rani pink), so the hub reads
 * as a bazaar wall of boards. The tile carries the color, so all card text is
 * cream/white and the badges sit on a scrim - theme foreground tokens are
 * deliberately NOT used inside a tile (they would vanish), the same rule the
 * chai stall and Bolo Bazaar follow.
 *
 * Gated cards render in FULL COLOR; the All-Access badge and lock chip carry
 * the gate.
 */
const GAME_COLORS: Record<string, GameColor> = {
  // peacock blue
  'word-match': { from: '#1B7A8F', to: '#0E5567', deep: '#0A3F4D', ink: '#0E5567', glow: 'rgba(27,122,143,0.55)' },
  // parrot green
  'listen-and-pick': { from: '#2E9E4F', to: '#177038', deep: '#0F5228', ink: '#177038', glow: 'rgba(46,158,79,0.55)' },
  // turmeric / marigold
  'phrase-builder': { from: '#F0A11B', to: '#D2740A', deep: '#A85700', ink: '#B35F00', glow: 'rgba(240,161,27,0.55)' },
  // kumkum red
  'speed-round': { from: '#E14434', to: '#B3251D', deep: '#8A1912', ink: '#B3251D', glow: 'rgba(225,68,52,0.55)' },
  // jamun purple
  'bolo-quiz': { from: '#7B3FA8', to: '#57217D', deep: '#41165F', ink: '#57217D', glow: 'rgba(123,63,168,0.55)' },
  // terracotta kulhad
  'ticket-check': { from: '#D9702F', to: '#B04A15', deep: '#8A370C', ink: '#B04A15', glow: 'rgba(217,112,47,0.55)' },
  // rani pink
  'wrong-platform': { from: '#D33A7B', to: '#A81C58', deep: '#821242', ink: '#A81C58', glow: 'rgba(211,58,123,0.55)' },
  // deep teal
  'luggage-match': { from: '#17897E', to: '#0B5F58', deep: '#084741', ink: '#0B5F58', glow: 'rgba(23,137,126,0.55)' },
  // express indigo
  'express-listening': { from: '#4453B8', to: '#2A3390', deep: '#1F2670', ink: '#2A3390', glow: 'rgba(68,83,184,0.55)' },
  // signal green
  // alarm red, the only entry in this map that is not a line colour: this game
  // is an emergency and reads as one.
  // book cover teal, the same blue-green the spread is drawn in.
  'storybook': { from: '#1F5060', to: '#143B47', deep: '#0E2A33', ink: '#143B47', glow: 'rgba(31,80,96,0.55)' },
  'emergency': { from: '#E0342C', to: '#A31E18', deep: '#7D1512', ink: '#A31E18', glow: 'rgba(224,52,44,0.55)' },
  'signal-lights': { from: '#3E8E41', to: '#256A2B', deep: '#1A4E1F', ink: '#256A2B', glow: 'rgba(62,142,65,0.55)' },
};

/** Neutral fallback so an unmapped future game still renders sensibly. */
const FALLBACK_COLOR: GameColor = {
  from: '#5B6474',
  to: '#3E4653',
  deep: '#2C333D',
  ink: '#3E4653',
  glow: 'rgba(91,100,116,0.5)',
};

/**
 * Vignettes sit on a cream medallion inside a saturated board, so their shape
 * colors are pinned to the LIGHT theme in both appearances (see VignetteInk).
 */
const MEDALLION_INK: VignetteInk = {
  primary: '#4F46E5',
  secondary: '#0D9488',
  accent: '#14B8A6',
  mutedForeground: '#64748B',
};

/** Difficulty is a dot + white label; a hue alone can't carry it on a board. */
const DIFFICULTY_DOT: Record<GameDef['difficulty'], string> = {
  Beginner: '#5BE58A',
  Intermediate: '#FFC93C',
  Advanced: '#FF8A65',
};

/**
 * Entrance cascade worklet (web: initial y28/scale0.9 → springs.poppy with
 * index*0.07s delay). A custom builder because the stock appearDown(0) does not
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
  const gc = GAME_COLORS[game.id] ?? FALLBACK_COLOR;

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
            // The deeper hue is both the border and the chunky bottom edge
            // the board appears to sit on (web parity: a hard 0 5px shadow).
            borderColor: gc.deep,
            borderBottomColor: gc.deep,
            backgroundColor: gc.to,
            shadowColor: gc.glow,
          },
          motionStyle,
        ]}
      >
        {/* Painted enamel face. */}
        <LinearGradient
          colors={[gc.from, gc.to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Access badge — its own right-aligned row, in normal flow.
            It cannot share the medallion's row and it cannot be pinned to the
            corner: "ALL-ACCESS" measures ~103pt at 10pt extrabold, while a
            two-column card's content box is only ~146pt and the 64pt medallion
            claims the left 64 of that. Pinned at top/right:0 the badge sits
            hard against the border (absolute insets resolve against the
            PADDING BOX, so the card's 12pt padding does not inset it) and
            already overlaps the medallion by ~9pt at 390pt wide; any inset big
            enough to look padded drives it further in. On its own row it gets
            the card's full 12pt padding on all four sides at every width. */}
        <View style={styles.pillRow}>
          <View
            style={[
              styles.pill,
              game.plusOnly ? styles.pillAllAccess : styles.pillFree,
            ]}
          >
            {game.plusOnly && <Feather name="star" size={10} color="#4A2C00" />}
            <Text
              style={[styles.pillText, { color: game.plusOnly ? '#4A2C00' : '#FFFFFF' }]}
            >
              {game.plusOnly ? 'All-Access' : 'Free'}
            </Text>
          </View>
        </View>
        {/* Vignette medallion */}
        <View style={styles.medallion}>
          <GamePreview
            gameId={game.id}
            index={index}
            playing={!reduceMotion && (locked ? pressed : visible || pressed)}
            tempo={pressed ? 1 : 2.2}
            holdMidCycle={locked && !reduceMotion}
            ink={MEDALLION_INK}
            fallback={<Feather name={game.icon} size={32} color={gc.ink} />}
          />
        </View>

        {/* Title & description */}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {game.title}
          </Text>
          <Text style={styles.cardDesc} numberOfLines={2}>
            {game.description}
          </Text>
        </View>

        {/* Difficulty badge, plus the lock chip on gated cards. */}
        <View style={styles.footRow}>
          <View style={styles.difficultyPill}>
            <View
              style={[styles.diffDot, { backgroundColor: DIFFICULTY_DOT[game.difficulty] }]}
            />
            <Text style={styles.difficultyText}>{game.difficulty}</Text>
          </View>
          {locked && (
            <View style={styles.lockChip}>
              <Feather name="lock" size={10} color="#FFFFFF" />
            </View>
          )}
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
    borderRadius: 18,
    borderWidth: 2,
    // Chunky bottom edge: the board sits on its own deeper hue (web parity
    // with the hard `0 5px 0` shadow, which RN cannot express directly).
    borderBottomWidth: 5,
    overflow: 'hidden',
    padding: 12,
    gap: 8,
    // Press bloom: hue glow fades in via animated shadowOpacity.
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  medallion: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8EC',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  pillRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  pillAllAccess: {
    backgroundColor: '#F5B31B',
  },
  pillFree: {
    backgroundColor: '#22C55E',
  },
  pillText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  cardBody: {
    gap: 2,
  },
  cardTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  cardDesc: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.86)',
  },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 'auto',
  },
  difficultyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  diffDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  difficultyText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  lockChip: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
