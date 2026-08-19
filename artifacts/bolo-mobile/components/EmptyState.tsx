import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { appearDown, appearZoom, useAppearSkip } from '@/lib/entrance';
import { Mascot, type MascotPose } from '@/components/Mascot';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

interface EmptyStateProps {
  title: string;
  body?: string;
  /** Optional mascot shown above the text with a gentle spring pop. */
  mascotPose?: MascotPose;
}

/**
 * Minimal empty-state display. Use when a list or queue has no items to show.
 *
 * Enters with a gentle mascot pop + staggered text fade. The `entering`
 * animations run on mount only, so they never replay on re-renders, and the
 * shared appear guard drops them entirely in Expo Go and under the system
 * reduced-motion setting (content renders directly in its resting state).
 */
export function EmptyState({ title, body, mascotPose }: EmptyStateProps) {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  return (
    <View style={styles.wrap}>
      {mascotPose ? (
        <Animated.View
          entering={skipEnter ? undefined : appearZoom(0)}
          style={styles.mascot}
        >
          <Mascot pose={mascotPose} size={92} motion="float" />
        </Animated.View>
      ) : null}
      <Animated.Text
        entering={skipEnter ? undefined : appearDown(80, 350)}
        style={[styles.title, { color: colors.foreground }]}
      >
        {title}
      </Animated.Text>
      {body ? (
        <Animated.Text
          entering={skipEnter ? undefined : appearDown(160, 350)}
          style={[styles.body, { color: colors.mutedForeground }]}
        >
          {body}
        </Animated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  mascot: {
    marginBottom: 14,
  },
  title: {
    fontFamily: AppFonts.extrabold,
    fontSize: 22,
    textAlign: 'center',
  },
  body: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
