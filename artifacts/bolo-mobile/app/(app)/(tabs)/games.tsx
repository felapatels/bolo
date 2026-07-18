import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useAppearSkip } from '@/lib/entrance';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { PressableScale } from '@/components/PressableScale';
import { Mascot } from '@/components/Mascot';

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
    plusOnly: false,
    icon: 'layers',
  },
  {
    id: 'speed-round',
    title: 'Speed Round',
    description: 'Race against the clock to answer as many as you can',
    difficulty: 'Intermediate',
    plusOnly: false,
    icon: 'zap',
  },
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
];

const DIFFICULTY_COLORS: Record<GameDef['difficulty'], string> = {
  Beginner: '#10B981',
  Intermediate: '#F59E0B',
  Advanced: '#6366F1',
};

export default function GamesScreen() {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const router = useRouter();
  const { isPlus } = useEntitlements();

  const handleGamePress = (game: GameDef) => {
    if (game.plusOnly && !isPlus) {
      router.push('/(app)/paywall');
      return;
    }
    router.push(`/(app)/games/${game.id}` as never);
  };

  return (
    <Screen>
      <Animated.View
        entering={skipEnter ? undefined : FadeInDown.duration(500)}
        style={styles.head}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: colors.foreground }]}>Games</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Play your way to fluency
          </Text>
        </View>
        <Mascot pose="cheer" size={76} motion="sway" />
      </Animated.View>

      <ScrollView
        contentContainerStyle={[
          styles.list,
          { paddingBottom: TAB_BAR_CLEARANCE },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {GAMES.map((game, i) => {
          const locked = game.plusOnly && !isPlus;
          return (
            <Animated.View
              key={game.id}
              entering={
                skipEnter
                  ? undefined
                  : FadeInDown.duration(400).delay(80 + i * 60)
              }
            >
              <GameCard
                game={game}
                locked={locked}
                onPress={() => handleGamePress(game)}
              />
            </Animated.View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

function GameCard({
  game,
  locked,
  onPress,
}: {
  game: GameDef;
  locked: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const diffColor = DIFFICULTY_COLORS[game.difficulty];

  return (
    <PressableScale
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: locked ? 0.85 : 1,
        },
      ]}
    >
      {/* Icon bubble */}
      <View
        style={[
          styles.iconBubble,
          { backgroundColor: locked ? colors.muted : `${colors.primary}15` },
        ]}
      >
        <Feather
          name={game.icon}
          size={24}
          color={locked ? colors.mutedForeground : colors.primary}
        />
      </View>

      {/* Text */}
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {game.title}
          </Text>
          {/* Plus / Free pill */}
          {game.plusOnly ? (
            <View
              style={[
                styles.pill,
                { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}30` },
              ]}
            >
              <Feather name="star" size={10} color={colors.primary} />
              <Text style={[styles.pillText, { color: colors.primary }]}>
                Plus
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
        </View>

        <Text
          style={[styles.cardDesc, { color: colors.mutedForeground }]}
          numberOfLines={2}
        >
          {game.description}
        </Text>

        {/* Difficulty badge */}
        <View style={styles.difficultyRow}>
          <View
            style={[
              styles.difficultyDot,
              { backgroundColor: diffColor },
            ]}
          />
          <Text style={[styles.difficultyText, { color: diffColor }]}>
            {game.difficulty}
          </Text>
        </View>
      </View>

      {/* Lock overlay indicator */}
      {locked ? (
        <View style={styles.lockWrap}>
          <Feather name="lock" size={18} color={colors.mutedForeground} />
        </View>
      ) : (
        <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
      )}
    </PressableScale>
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: AppFonts.bold,
    fontSize: 11,
  },
  cardDesc: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  difficultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  difficultyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  difficultyText: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
  },
  lockWrap: {
    width: 24,
    alignItems: 'center',
  },
});
