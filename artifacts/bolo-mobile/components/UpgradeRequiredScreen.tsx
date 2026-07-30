import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { appear, useAppearSkip } from '@/lib/entrance';
import { Screen } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { PressableScale } from '@/components/PressableScale';
import { Mascot } from '@/components/Mascot';
import { PlusPill } from '@/components/PlusUpsell';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * Full-screen upgrade prompt shown when a lesson request comes back HTTP 402
 * (daily free-lesson limit reached, or a locked language). Mirrors the web
 * app's UpgradeScreen: a clear headline, the server's own denial message, and
 * a CTA into the paywall — instead of a dead-end note or a misleading retry.
 */
export function UpgradeRequiredScreen({
  title,
  message,
  onUpgrade,
  onBack,
  showTrial = false,
}: {
  title: string;
  /** The server-reported denial message (never hardcoded client copy). */
  message: string;
  onUpgrade: () => void;
  onBack: () => void;
  /** When true (daily_lesson_limit), lead with the 7-day free trial CTA. */
  showTrial?: boolean;
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
        <Animated.View entering={appear(FadeInDown.duration(450))}>
          <Mascot pose="wave" size={140} motion="float" />
        </Animated.View>
        <Animated.View
          entering={skipEnter ? undefined : FadeInDown.duration(450).delay(60)}
          style={styles.pillRow}
        >
          <PlusPill />
        </Animated.View>
        <Animated.Text
          entering={skipEnter ? undefined : FadeInDown.duration(450).delay(80)}
          style={[styles.title, { color: colors.foreground }]}
        >
          {title}
        </Animated.Text>
        <Animated.Text
          entering={skipEnter ? undefined : FadeInDown.duration(450).delay(140)}
          style={[styles.message, { color: colors.mutedForeground }]}
        >
          {message}
        </Animated.Text>

        <Animated.View
          entering={skipEnter ? undefined : FadeInDown.duration(450).delay(200)}
          style={styles.actions}
        >
          <ChunkyButton
            title={showTrial ? 'Start 7-day free trial' : 'Unlock with All-Access'}
            icon="star"
            onPress={onUpgrade}
            style={{ width: '100%' }}
          />
          {showTrial && (
            <Text style={[styles.trialNote, { color: colors.mutedForeground }]}>
              Cancel anytime — no charge if you cancel before the trial ends.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={styles.goBack}
          >
            <Text style={[styles.goBackText, { color: colors.mutedForeground }]}>
              Maybe later
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
  pillRow: { marginTop: 14 },
  title: {
    fontFamily: AppFonts.extrabold,
    fontSize: 24,
    textAlign: 'center',
    marginTop: 10,
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
  trialNote: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: 8,
  },
});
