import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { appear, appearDown, useAppearSkip } from '@/lib/entrance';
import { Screen } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { PressableScale } from '@/components/PressableScale';
import { Mascot } from '@/components/Mascot';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * Shown when lesson generation fails (the phrases fetch errors out, e.g. the
 * API returns a retry-able 502 because AI generation failed and nothing broken
 * was cached). Gives the learner a clear "try again" affordance instead of a
 * stuck spinner or empty screen, mirroring the web experience.
 */
export function LessonError({
  onRetry,
  isRetrying,
  onBack,
  message,
}: {
  onRetry: () => void;
  isRetrying: boolean;
  onBack: () => void;
  /** Optional override for the body copy (e.g. the zone test-out 403 guard). */
  message?: string;
}) {
  const colors = useColors();
  const skipEnter = useAppearSkip();

  return (
    <Screen>
      <View style={styles.header}>
        <PressableScale
          accessibilityLabel="Go back"
          onPress={onBack}
          style={[
            styles.backBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </PressableScale>
      </View>

      <View style={styles.body}>
        <Animated.View entering={appear(appearDown(0, 450))}>
          <Mascot pose="tryagain" size={140} motion="float" />
        </Animated.View>
        <Animated.Text
          entering={skipEnter ? undefined : appearDown(80, 450)}
          style={[styles.title, { color: colors.foreground }]}
        >
          Bolo's chef is still cooking 🍳
        </Animated.Text>
        <Animated.Text
          entering={skipEnter ? undefined : appearDown(140, 450)}
          style={[styles.message, { color: colors.mutedForeground }]}
        >
          {message ??
            "The lesson didn't come through, give it another try and Bolo will whip up something fresh!"}
        </Animated.Text>

        <Animated.View
          entering={skipEnter ? undefined : appearDown(200, 450)}
          style={styles.actions}
        >
          <ChunkyButton
            title={isRetrying ? 'Trying again…' : 'Try again'}
            icon="refresh-cw"
            loading={isRetrying}
            onPress={onRetry}
            style={{ width: '100%' }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={styles.goBack}
          >
            <Text style={[styles.goBackText, { color: colors.mutedForeground }]}>
              Go back
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
    gap: 6,
  },
  title: {
    fontFamily: AppFonts.extrabold,
    fontSize: 24,
    textAlign: 'center',
    marginTop: 12,
  },
  message: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 4,
  },
  actions: {
    width: '100%',
    marginTop: 28,
    alignItems: 'center',
    gap: 4,
  },
  goBack: {
    paddingVertical: 12,
  },
  goBackText: {
    fontFamily: AppFonts.bold,
    fontSize: 14,
  },
});
