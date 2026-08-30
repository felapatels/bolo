import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * Places moved since this device last looked: an arrow AND a number, never
 * the colour alone (the owner is partially colour blind; the shape and the
 * digit carry it, the green and red only agree). Nothing at all for no
 * movement, so a still board is a quiet one.
 */
export function RankDelta({ delta, size = 13 }: { delta: number | undefined; size?: number }) {
  const colors = useColors();
  if (!delta) return null;
  const up = delta > 0;
  const tint = up ? colors.success : colors.destructive;
  return (
    <View
      style={styles.wrap}
      accessibilityLabel={`${up ? 'up' : 'down'} ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'place' : 'places'}`}
      testID={`rank-delta-${up ? 'up' : 'down'}`}
    >
      <Feather name={up ? 'arrow-up' : 'arrow-down'} size={size} color={tint} />
      <Text style={[styles.text, { color: tint, fontSize: size }]}>{Math.abs(delta)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  text: { fontFamily: AppFonts.extrabold },
});
