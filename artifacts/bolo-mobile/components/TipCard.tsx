import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { appearPlain, useAppearSkip } from '@/lib/entrance';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const indiaFacts = require('@/data/indiaFacts.json') as string[];

const ROTATE_INTERVAL_MS = 4000;

/**
 * Rotating tip card shown while Bolo is processing a reply.
 * Cycles through India fun facts every 4 s with a fade transition.
 * Under prefers-reduced-motion or Expo Go the card appears instantly
 * and never rotates — content is always visible.
 */
export function TipCard() {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const [idx, setIdx] = React.useState<number>(
    () => Math.floor(Math.random() * indiaFacts.length),
  );

  React.useEffect(() => {
    if (skipEnter) return; // reduced-motion: no rotation either
    const id = setInterval(() => {
      setIdx((prev) => (prev + 1) % indiaFacts.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [skipEnter]);

  return (
    <Animated.View
      key={idx}
      entering={skipEnter ? undefined : appearPlain()}
      exiting={skipEnter ? undefined : FadeOut.duration(250)}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.labelRow}>
        <Feather name="zap" size={11} color={colors.primary} />
        <Text style={[styles.labelText, { color: colors.primary }]}>
          Did you know?
        </Text>
      </View>
      <Text style={[styles.fact, { color: colors.mutedForeground }]}>
        {indiaFacts[idx]}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  labelText: {
    fontFamily: AppFonts.bold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fact: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
});
