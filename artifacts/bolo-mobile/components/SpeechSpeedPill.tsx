import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';
import {
  currentSpeechRate,
  nextSpeechRate,
  saveSpeechRatePref,
  speechRateLabel,
  subscribeSpeechRate,
} from '@/lib/speechRatePref';

/**
 * THE SPEAKING SPEED, WHERE THE SPEAKING HAPPENS.
 *
 * Owner, 2026-09-17, verbatim: "where is the coach and bolo speed setting on
 * the chat screen? it should be on chat screen and lesson screens, wherever
 * bolo or coach speaks". The control landed on 2026-09-13 (X96) on the account
 * screen only, which is three taps away from the moment a learner wants it.
 *
 * ONE PREFERENCE, MANY DOORS. This reads and writes lib/speechRatePref.ts, the
 * exact store the account screen's Segmented uses, and subscribes to it, so a
 * change here shows on the account screen and on every other pill that is
 * still mounted (tab screens are). It holds no copy of its own.
 *
 * IT IS STILL A PLAYBACK RATE. Nothing here touches synthesis: lib/audio.ts
 * reads currentSpeechRate() when it creates each player, so the next clip
 * plays at the new speed and the clip already sounding finishes at its own.
 *
 * A single pill that CYCLES Normal, Slow, Slower, rather than a picker, so it
 * costs one 44pt slot in a header that is already full on an iPhone SE. The state
 * is the WORD on the pill (the account screen's own labels), never a colour:
 * the owner is partially colour blind, and so are a share of learners.
 */
export function useSpeechRate(): number {
  return React.useSyncExternalStore(subscribeSpeechRate, currentSpeechRate, currentSpeechRate);
}

export function SpeechSpeedPill({
  variant = 'stacked',
  testID = 'speech-speed-pill',
  style,
}: {
  /**
   * `labelled` adds "Speed" for a row with room (the chat screen's language
   * row), where a bare "Normal" beside the language name would be a riddle.
   * `stacked` is a 44pt square, the icon over the word, the size of the gear
   * and the mute button it sits beside. Lesson and game headers use it: on an
   * iPhone SE (375pt) a 76pt one-line pill left the practice title 125pt and
   * wrapped "10 of 10 · another go" onto two lines, growing the header
   * (seen in the simulator, 2026-09-17).
   */
  variant?: 'labelled' | 'stacked';
  testID?: string;
  /** Outer spacing only, from the host row. */
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const rate = useSpeechRate();
  const label = speechRateLabel(rate);
  const nextLabel = speechRateLabel(nextSpeechRate(rate));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Speaking speed: ${label}`}
      accessibilityHint={`Changes to ${nextLabel}`}
      hitSlop={6}
      onPress={() => {
        hapticLight();
        void saveSpeechRatePref(nextSpeechRate(rate));
      }}
      style={({ pressed }) => [
        styles.pill,
        styles[variant],
        {
          backgroundColor: pressed ? colors.muted : colors.card,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Feather name="clock" size={variant === 'labelled' ? 14 : 12} color={colors.primary} />
      {variant === 'labelled' ? (
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>Speed</Text>
      ) : null}
      <Text
        testID={`${testID}-label`}
        numberOfLines={1}
        style={[
          variant === 'labelled'
            ? styles.value
            : styles.valueStacked,
          { color: colors.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 999,
  },
  // A FIXED WIDTH, so cycling Normal to Slower never reflows the header
  // around it (the same rule as the language chip's slot).
  stacked: {
    width: 44,
    height: 44,
    flexDirection: 'column',
    gap: 1,
    borderRadius: 14,
  },
  labelled: {
    minWidth: 128,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  caption: {
    fontFamily: AppFonts.semibold,
    fontSize: 14,
  },
  value: {
    fontFamily: AppFonts.bold,
    fontSize: 14,
  },
  valueStacked: {
    fontFamily: AppFonts.bold,
    fontSize: 10,
  },
});
