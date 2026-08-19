import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ChunkyButton } from '@/components/ChunkyButton';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * The constant two-slot result-actions row (Task #1040, owner-ruled).
 *
 * "Try again" is ALWAYS the left slot and "Next phrase"/"Finish" ALWAYS the
 * right one, every band, every state, both platforms, with labels that
 * never change between outcomes. Only the EMPHASIS moves: after a weak take
 * the retry carries the filled chunky treatment, after a good one the advance
 * does. The two used to swap places between bands, so the learner tapped the
 * same pixels and got the opposite action.
 *
 * An inactive slot is disabled and dimmed: no press, no toast, nothing to
 * explain. Mirrors artifacts/gujarati-coach/src/pages/practice.tsx's
 * ResultActions.
 */
export function ResultActions({
  onRetry,
  onAdvance,
  advanceLabel,
  retryPrimary,
  retryDisabled = false,
  advanceDisabled = false,
}: {
  onRetry: () => void;
  onAdvance: () => void;
  /** "Next phrase", or "Finish" on the last stop of the run. */
  advanceLabel: string;
  /** Which slot carries the filled treatment. Position never changes. */
  retryPrimary: boolean;
  retryDisabled?: boolean;
  advanceDisabled?: boolean;
}) {
  return (
    <View style={styles.row} testID="result-actions">
      <ResultActionSlot
        title="Try again"
        icon="rotate-ccw"
        onPress={onRetry}
        primary={retryPrimary}
        disabled={retryDisabled}
        testID="try-again-button"
      />
      <ResultActionSlot
        title={advanceLabel}
        icon="arrow-right"
        onPress={onAdvance}
        primary={!retryPrimary}
        disabled={advanceDisabled}
        testID="advance-button"
      />
    </View>
  );
}

function ResultActionSlot({
  title,
  icon,
  onPress,
  primary,
  disabled,
  testID,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  primary: boolean;
  disabled: boolean;
  testID: string;
}) {
  const colors = useColors();

  // The primary slot reuses the chunky button (and its existing disabled
  // support) so the treatments stay identical to the rest of the app.
  if (primary) {
    return (
      <ChunkyButton
        title={title}
        icon={icon}
        onPress={onPress}
        disabled={disabled}
        style={{ flex: 1 }}
        testID={testID}
      />
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      // No accessibilityLabel: the name comes from the Text child, exactly as
      // it does for the chunky primary. (It also keeps the button out of the
      // score trail's band-label queries, which use the same words.)
      accessibilityState={{ disabled }}
      testID={testID}
      style={[
        styles.secondary,
        { borderColor: colors.border, opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <Feather name={icon} size={18} color={colors.foreground} />
      <Text style={[styles.secondaryLabel, { color: colors.foreground }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  secondary: {
    flex: 1,
    height: 56,
    borderRadius: 20,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  secondaryLabel: {
    fontFamily: AppFonts.bold,
    fontSize: 15,
  },
});
