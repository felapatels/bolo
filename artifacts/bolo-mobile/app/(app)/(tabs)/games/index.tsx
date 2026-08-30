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
 *  - Bolo is IN the hero painting now (build 21); the overlay bounce went
 *    with the overlay.
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
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearSkip } from '@/lib/entrance';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticTap } from '@/lib/haptics';
import { GamePreview, type VignetteInk } from '@/components/games/GamePreview';
import { GAMES_HERO, gameArt } from '@/lib/gameArt';
import { readLastPlayedGame, writeLastPlayedGame } from '@/lib/lastPlayedGame';
import { useLanguage } from '@/contexts/LanguageContext';
import { getJourneyLine } from '@/lib/journeyLines';
import { useJourneyProgress } from '@/lib/useJourneyProgress';

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
  /**
   * Where the tile goes, when it is NOT a screen under this Stack.
   *
   * Every other game lives at games/<id> and inherits this Stack's XP and Chai
   * strip. Chacha-ji's call cannot: it is full-bleed, it is his face at full
   * size, and a scoring HUD floating over a phone call would break the one
   * thing the feature is trying to be. So it routes out of the games Stack
   * entirely and the tile is just its front door.
   */
  route?: string;
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
  /**
   * Second, not fourteenth. It is the newest thing in the app and the least
   * like anything else in this list; buried at the bottom nobody finds it.
   *
   * FREE, ON BOTH SURFACES. This shipped All-Access for a day, on the earlier
   * ruling that the full game was gated, and the owner reversed it: "lets flip
   * it to free on games hub". The journey's interruption was already free, so
   * the call now costs nothing anywhere.
   *
   * The reason is better than the rule it replaced. NOBODY HAS HEARD THIS WORK
   * ON A REAL DEVICE YET. Gating the deliberate version on its first build
   * would put it in front of the smallest group of learners, and they are the
   * ones who would try it repeatedly and surface whatever breaks. It can earn
   * a gate later.
   */
  {
    id: 'chacha-call',
    title: 'Chacha-ji Calls',
    // SHORT ENOUGH TO SURVIVE THE CARD. The first draft ran to "He is happy
    // with anything you say" and the tile truncated at "He is happ...", which
    // cut the only line doing any work: the reassurance is the pitch, not the
    // mechanic. Roughly fifty characters is what these cards show.
    description: 'Talk to Chacha-ji. Anything you say delights him.',
    difficulty: 'Beginner',
    plusOnly: false,
    icon: 'phone-call',
    // Out of the games Stack, so nothing is drawn over his face.
    route: '/(app)/call?mode=game',
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
    id: 'signal-lights',
    title: 'Signal Lights',
    description: 'Green or red? Call the phrase before the signal changes.',
    difficulty: 'Beginner',
    plusOnly: false,
    icon: 'radio',
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
    id: 'listen-and-pick',
    title: 'Listen & Pick',
    description: 'Hear a word or phrase and choose the right translation',
    difficulty: 'Beginner',
    plusOnly: true,
    icon: 'headphones',
  },
  {
    id: 'wrong-platform',
    title: 'Wrong Platform',
    description: 'Drag Chacha-ji onto the phrase that does not belong.',
    difficulty: 'Intermediate',
    plusOnly: false,
    // Not 'alert-triangle': a warning triangle reads as "this tile is broken"
    // in a grid of games. The crosshair says pick the odd one out, and it is
    // the only ring-shaped glyph in the hub, so it stays distinct.
    icon: 'crosshair',
  },
  {
    // PART 2, All-Access. Two tiles rather than a difficulty toggle inside
    // one, asked for on 2026-08-25: "split the game into 2 games, it has a lot
    // of content. Add a free version and a Part 2 for All-Access. Show 2
    // different tiles on the games page."
    id: 'wrong-platform-2',
    title: 'Wrong Platform 2',
    description: 'Six cards, a closer stray, and no English to lean on.',
    difficulty: 'Advanced',
    plusOnly: true,
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
  // Part 2 wears a deeper cut of Part 1's colour: the same game, further down
  // the line. A brand-new hue would read as an unrelated game.
  'wrong-platform-2': { from: '#A81C58', to: '#821242', deep: '#5E0D30', ink: '#821242', glow: 'rgba(168,28,88,0.55)' },
  // chai-stall terracotta: his awning and his kulhads. He had no entry and
  // fell to the grey fallback, which showed the moment his card had a picture.
  'chacha-call': { from: '#D9702F', to: '#A8461A', deep: '#7E330F', ink: '#A8461A', glow: 'rgba(217,112,47,0.55)' },
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

/**
 * THE HUB, REBUILT TO THE OWNER'S MOCKUP (build 21: "lets pivot to make games
 * like this. big images, very colorful etc", "a hero header up top").
 *
 * Three bands. A HERO across the top: the painting from lib/gameArt's
 * GAMES_HERO under a cream wash on its left half, the heading, the tagline,
 * the language and the learner's current city, and Bolo at the right doing
 * his one bounce. CONTINUE PLAYING: the last game the device remembers, as a
 * wide card with its picture and a Play again button; absent until a game
 * has been played. ALL GAMES: the same two-column grid, but each tile is now
 * an ivory card with a big 4:3 painting on top, the vignette medallion
 * overlapping the painting's bottom-left, the access badge on the painting's
 * top-right, and the words in ink beneath, so the grid reads as a wall of
 * pictures rather than a wall of enamel boards.
 *
 * WHAT THE MOCKUP SHOWS THAT THE SERVER CANNOT YET: "Personal best" and
 * "Level" per game. POST /game-sessions records sessions and nothing reads
 * them back per game, so those lines are not drawn rather than invented.
 * The foot of each card carries the difficulty, and the lock where it is
 * locked. The mockup's Filter pill is not drawn either: there is nothing to
 * filter by until best scores exist.
 *
 * EXPLICIT POINTS FOR EVERY PICTURE (the chat 11 render trap): the card's
 * width comes from the window and the grid's paddings, and the painting is
 * that width by three quarters of it, never a percentage.
 */
const GRID_PAD = 16;
const GRID_GAP = 10;
const HERO_H = 236;

export default function GamesScreen() {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const { width: windowW } = useWindowDimensions();
  // The hero runs under the status bar and the floating XP and Chai strip
  // (build 21): its height carries the inset, and its words start below the
  // strip.
  const insets = useSafeAreaInsets();
  const heroH = HERO_H + insets.top;
  const heroWordsTop = insets.top + 52;
  const { isPlus, isLoading: entitlementsLoading } = useEntitlements();
  // Fail closed: while entitlements are loading (or undefined), Plus-only
  // tiles render locked rather than briefly unlocked.
  const plusReady = isPlus === true && !entitlementsLoading;
  const { activeLang, activeLanguage } = useLanguage();
  const line = getJourneyLine(activeLang);
  // The learner's current city for the hero's "Hindi · New Delhi" line: the
  // same journey read the home pass makes, cached between the two.
  const journey = useJourneyProgress(activeLang, line.zones);
  const city = journey.current ? journey.current.geoName : line.zones[0];

  // Step-in: the card being navigated into scales slightly toward the viewer
  // while the route transitions. State only ever selects the animate target -
  // navigation happens immediately and is never delayed.
  const [enteredId, setEnteredId] = React.useState<string | null>(null);

  // THE LAST GAME PLAYED, read on every focus so a game just played is the
  // one offered on the way back out of it.
  const [lastPlayed, setLastPlayed] = React.useState<string | null>(null);
  useFocusEffect(
    React.useCallback(() => {
      let live = true;
      readLastPlayedGame().then((id) => {
        if (live) setLastPlayed(id);
      });
      return () => {
        live = false;
      };
    }, []),
  );
  const continueGame = React.useMemo(
    () => GAMES.find((g) => g.id === lastPlayed) ?? null,
    [lastPlayed],
  );

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

  const handleGamePress = (game: GameDef) => {
    if (game.plusOnly && !plusReady) {
      // Locked cards route to the paywall and skip the step-in.
      router.push('/(app)/paywall');
      return;
    }
    if (!reduceMotion) setEnteredId(game.id);
    void writeLastPlayedGame(game.id);
    router.push((game.route ?? `/(app)/(tabs)/games/${game.id}`) as never);
  };

  // The grid's card width, in points, so every painting is sized exactly.
  const cardW = Math.floor((windowW - GRID_PAD * 2 - GRID_GAP) / 2);

  const header = (
    <View>
      {/* THE HERO. The painting, a cream wash over its left half for the
          words, and Bolo on the right. Bleeds to the screen edges; the grid
          below keeps the column. */}
      <View style={[styles.hero, { width: windowW, height: heroH }]} testID="games-hero">
        {/* ANCHORED TO THE PAINTING'S LEFT EDGE, not centred: the brief put
            the parrot in the right third and left the left half open for the
            words, and a centred cover crop threw a third of that away and
            slid the boiler under the tagline. The picture is 16:9; sized
            off the hero's height and left at 0, the overflow is clipped on
            the right, where only platform and roof were. */}
        <Image
          source={GAMES_HERO}
          resizeMode="cover"
          style={{
            position: 'absolute',
            // A third of the way from left-anchored to centred: the words keep
            // the pale left, and the parrot keeps his face.
            left: -Math.round((Math.round((heroH * 16) / 9) - windowW) * 0.34),
            top: 0,
            width: Math.round((heroH * 16) / 9),
            height: heroH,
          }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <LinearGradient
          // Lighter than the first cut (owner: "make the hero less
          // transparent"): the painting shows through the words' side too.
          colors={['rgba(251,243,230,0.66)', 'rgba(251,243,230,0.4)', 'rgba(251,243,230,0)']}
          locations={[0, 0.5, 0.82]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(251,243,230,0)', colors.background]}
          locations={[0.72, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.heroWords, { top: heroWordsTop }]}>
          <Text style={styles.heroTitle}>Games</Text>
          <Text style={styles.heroSub}>Play your way to fluency</Text>
          {/* THE LANGUAGE LINE IS THE LANGUAGE SWITCH (build 21). The globe
              disc that used to sit in the corner landed on the parrot's face
              once the hero was a painting; the mockup has no globe, and the
              line already names the language, so it opens the same picker. */}
          <Pressable
            testID="games-language-line"
            accessibilityRole="button"
            accessibilityLabel={`Learning ${activeLanguage?.name ?? 'a language'}. Change language`}
            hitSlop={8}
            onPress={() => {
              hapticTap('light');
              router.push('/(app)/language');
            }}
            style={styles.heroWhere}
          >
            <Feather name="map-pin" size={14} color="#4F46E5" />
            <Text style={styles.heroWhereText}>
              {activeLanguage?.name ?? 'Your language'}
              <Text style={styles.heroDot}>  ·  </Text>
              {city}
            </Text>
            <Feather name="chevron-down" size={14} color="#4F46E5" />
          </Pressable>
        </View>
        {/* NO MASCOT OVERLAY (build 21): the hero painting carries the parrot
            himself, waving with his controller; the app's dressed Mascot on top
            of him made two birds on the first simulator look. */}
      </View>

      {continueGame && (
        <View style={styles.section}>
          <SectionEyebrow>Continue playing</SectionEyebrow>
          <ContinueCard
            game={continueGame}
            locked={continueGame.plusOnly && !plusReady}
            onPress={() => handleGamePress(continueGame)}
          />
        </View>
      )}

      <View style={[styles.section, { marginBottom: 4 }]}>
        <SectionEyebrow>All games</SectionEyebrow>
      </View>
    </View>
  );

  return (
    <Screen padTop={false}>
      <FlatList
        data={GAMES}
        keyExtractor={(g) => g.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => (
          <GameCardTile
            game={item}
            index={index}
            cardW={cardW}
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

/** The small violet caption over each band, with the mockup's spark. */
function SectionEyebrow({ children }: { children: string }) {
  return (
    <View style={styles.eyebrowRow}>
      <Text style={styles.eyebrow}>{children.toUpperCase()}</Text>
      <Text style={styles.eyebrowSpark}>✦</Text>
    </View>
  );
}

/** The access badge: FREE in green, ALL-ACCESS in gold with its star. */
function AccessPill({ plusOnly }: { plusOnly: boolean }) {
  return (
    <View style={[styles.pill, plusOnly ? styles.pillAllAccess : styles.pillFree]}>
      {plusOnly && <Feather name="star" size={10} color="#4A2C00" />}
      <Text style={[styles.pillText, { color: plusOnly ? '#4A2C00' : '#FFFFFF' }]}>
        {plusOnly ? 'All-Access' : 'Free'}
      </Text>
    </View>
  );
}

/** The difficulty, a dot and a word on a tint of the game's own hue. */
function DifficultyPill({ game, gc }: { game: GameDef; gc: GameColor }) {
  return (
    <View style={[styles.difficultyPill, { backgroundColor: `${gc.from}1F`, borderColor: `${gc.from}55` }]}>
      <View style={[styles.diffDot, { backgroundColor: DIFFICULTY_DOT[game.difficulty] }]} />
      <Text style={[styles.difficultyText, { color: gc.ink }]}>{game.difficulty}</Text>
    </View>
  );
}

/**
 * CONTINUE PLAYING: the last game the device remembers, wide, its picture at
 * the left and a Play again button at the right. No personal best and no
 * level yet (see the file comment).
 */
function ContinueCard({
  game,
  locked,
  onPress,
}: {
  game: GameDef;
  locked: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const gc = GAME_COLORS[game.id] ?? FALLBACK_COLOR;
  const art = gameArt(game.id);
  return (
    <Pressable
      testID={`continue-${game.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Continue playing ${game.title}`}
      onPress={() => {
        hapticTap('light');
        onPress();
      }}
      style={[styles.continueCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.continuePicture}>
        {art != null && (
          <Image source={art} resizeMode="cover" style={{ width: 124, height: 93 }} />
        )}
      </View>
      <View style={styles.continueBody}>
        <View style={styles.continueEyebrowRow}>
          <Feather name={game.icon} size={12} color={gc.ink} />
          <Text style={[styles.continueEyebrow, { color: gc.ink }]}>{game.title.toUpperCase()}</Text>
        </View>
        <Text style={[styles.continueTitle, { color: colors.foreground }]} numberOfLines={1}>
          {game.title}
        </Text>
        <Text style={[styles.continueDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
          {game.description}
        </Text>
        <View style={styles.continueFoot}>
          <DifficultyPill game={game} gc={gc} />
          <View style={[styles.playAgain, { backgroundColor: locked ? colors.mutedForeground : '#4F46E5' }]}>
            <Text style={styles.playAgainText}>{locked ? 'Unlock' : 'Play again'}</Text>
            <Feather name="arrow-right" size={14} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function GameCardTile({
  game,
  index,
  cardW,
  locked,
  entered,
  visible,
  skipEnter,
  reduceMotion,
  onPress,
}: {
  game: GameDef;
  index: number;
  cardW: number;
  locked: boolean;
  entered: boolean;
  visible: boolean;
  skipEnter: boolean;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const gc = GAME_COLORS[game.id] ?? FALLBACK_COLOR;
  const art = gameArt(game.id);
  const pictureH = Math.round((cardW * 3) / 4);

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
    shadowOpacity: 0.1 + pressedSV.value * 0.5,
  }));

  return (
    <Animated.View
      entering={skipEnter || reduceMotion ? undefined : cardEntering(index)}
      style={[styles.cell, { width: cardW }]}
    >
      <AnimatedPressable
        // Named so the hub can be driven in a test at all. Maestro's text
        // matcher cannot see React Native's tree, and there was no testID
        // anywhere on this screen, which made every tile here unreachable to
        // it. One per tile, derived from the id, so it covers all of them
        // rather than just the one that needed it.
        testID={`game-tile-${game.id}`}
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
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: gc.glow,
          },
          motionStyle,
        ]}
      >
        {/* THE PICTURE, 4:3, in explicit points. Locked games keep their
            colour (an All-Access card is a promise, not a broken tile) and
            take a light dim so the lock reads. */}
        <View style={[styles.pictureBox, { width: cardW - 2, height: pictureH }]}>
          {art != null ? (
            <Image
              source={art}
              resizeMode="cover"
              style={{ width: cardW - 2, height: pictureH }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ) : (
            <LinearGradient colors={[gc.from, gc.to]} style={StyleSheet.absoluteFill} />
          )}
          {locked && <View style={styles.pictureDim} />}
          <View style={styles.badgeCorner}>
            <AccessPill plusOnly={game.plusOnly} />
          </View>
          {/* The vignette medallion, overlapping the picture's foot: the
              same looping preview as before, on its cream disc, now a
              picture-in-picture rather than the whole face of the card. */}
          <View style={styles.medallion}>
            <GamePreview
              gameId={game.id}
              index={index}
              playing={!reduceMotion && (locked ? pressed : visible || pressed)}
              tempo={pressed ? 1 : 2.2}
              holdMidCycle={locked && !reduceMotion}
              ink={MEDALLION_INK}
              fallback={<Feather name={game.icon} size={24} color={gc.ink} />}
            />
          </View>
        </View>

        {/* Title & description, in ink on ivory. */}
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
            {game.title}
          </Text>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
            {game.description}
          </Text>
        </View>

        {/* Difficulty, plus the lock chip on gated cards. */}
        <View style={styles.footRow}>
          <DifficultyPill game={game} gc={gc} />
          {locked && (
            <View style={[styles.lockChip, { borderColor: colors.border }]}>
              <Feather name="lock" size={10} color={colors.mutedForeground} />
            </View>
          )}
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Bleeds past the list's padding on both sides: the list is inset by
  // GRID_PAD and the hero is the window's width, so without this it started
  // a pad in and ran a pad off the right edge (the globe was half gone).
  hero: {
    marginLeft: -GRID_PAD,
    marginBottom: 6,
    overflow: 'hidden',
  },
  heroWords: {
    position: 'absolute',
    left: 20,
    right: 150,
  },
  heroTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 40,
    letterSpacing: -0.8,
    color: '#1E1633',
  },
  heroSub: {
    fontFamily: AppFonts.regular,
    fontSize: 16,
    color: '#4B4368',
    marginTop: 2,
  },
  heroWhere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  heroWhereText: {
    fontFamily: AppFonts.semibold,
    fontSize: 14,
    color: '#4F46E5',
  },
  heroDot: { color: '#8A83B3' },
  section: {
    paddingHorizontal: GRID_PAD,
    marginTop: 10,
    marginBottom: 12,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  eyebrow: {
    fontFamily: AppFonts.extrabold,
    fontSize: 12,
    letterSpacing: 1.6,
    color: '#4F46E5',
  },
  eyebrowSpark: { color: '#D9A21B', fontSize: 12 },
  continueCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    padding: 10,
    shadowColor: '#1E1633',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  continuePicture: {
    width: 124,
    height: 93,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E9E4F5',
  },
  continueBody: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 2 },
  continueEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  continueEyebrow: { fontFamily: AppFonts.extrabold, fontSize: 10, letterSpacing: 1.2 },
  continueTitle: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  continueDesc: { fontFamily: AppFonts.regular, fontSize: 12 },
  continueFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
  },
  playAgain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  playAgainText: { fontFamily: AppFonts.extrabold, fontSize: 13, color: '#FFFFFF' },
  list: {
    paddingHorizontal: GRID_PAD,
    gap: GRID_GAP,
  },
  column: {
    gap: GRID_GAP,
  },
  cell: {},
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    // The press bloom: the game's hue as a shadow that deepens on press.
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pictureBox: {
    overflow: 'hidden',
    backgroundColor: '#E9E4F5',
  },
  pictureDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 22, 51, 0.28)',
  },
  badgeCorner: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  medallion: {
    position: 'absolute',
    left: 10,
    bottom: -8,
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8EC',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
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
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  cardTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 16,
  },
  cardDesc: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  difficultyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
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
    textTransform: 'uppercase',
  },
  lockChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
