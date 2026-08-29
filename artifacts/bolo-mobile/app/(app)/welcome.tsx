import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { ChunkyButton } from '@/components/ChunkyButton';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';
import { WALKTHROUGH_STEPS, useFinishWalkthrough } from '@/lib/walkthrough';

// THE WALKTHROUGH CARDS, build 19: three screens after the language chooser,
// each one Bolo in a pose, a title and two lines. Next advances, the last
// card's button and Skip both leave for home and retire the walkthrough for
// this account (lib/walkthrough.ts has the rules). Web twin: pages/welcome.tsx.
export default function WelcomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const finish = useFinishWalkthrough();
  const [index, setIndex] = useState(0);
  // Back to card one on every FOCUS, not on mount: expo-router keeps this
  // screen mounted between visits (CLAUDE.md, "screens outlive the user's
  // mental model"), and the simulator showed card two on a re-entry.
  useFocusEffect(
    useCallback(() => {
      setIndex(0);
    }, []),
  );

  const step = WALKTHROUGH_STEPS[index]!;
  const last = index === WALKTHROUGH_STEPS.length - 1;

  const leave = (reason: 'done' | 'skipped') => {
    finish(reason, index);
    router.replace('/(app)/(tabs)');
  };

  const next = () => {
    hapticLight();
    if (last) {
      leave('done');
      return;
    }
    setIndex(index + 1);
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable
          testID="walkthrough-skip"
          accessibilityRole="button"
          onPress={() => leave('skipped')}
          hitSlop={12}
        >
          <Text style={[styles.skip, { color: colors.mutedForeground }]}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Mascot pose={step.pose} size={168} motion="float" />
        <Text testID="walkthrough-title" style={[styles.title, { color: colors.foreground }]}>
          {step.title}
        </Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>{step.body}</Text>
        <View testID="walkthrough-dots" style={styles.dots}>
          {WALKTHROUGH_STEPS.map((s, i) => (
            <View
              key={s.key}
              testID={i === index ? 'walkthrough-dot-current' : 'walkthrough-dot'}
              style={[
                styles.dot,
                i === index && styles.dotCurrent,
                { backgroundColor: i === index ? colors.primary : colors.border },
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <ChunkyButton
          testID="walkthrough-next"
          title={last ? "Let's go" : 'Next'}
          icon={last ? 'play' : 'arrow-right'}
          onPress={next}
          style={{ alignSelf: 'stretch' }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  skip: { fontFamily: AppFonts.semibold, fontSize: 15 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  title: {
    fontFamily: AppFonts.extrabold,
    fontSize: 28,
    textAlign: 'center',
    marginTop: 12,
  },
  copy: {
    fontFamily: AppFonts.regular,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 320,
  },
  dots: { flexDirection: 'row', gap: 8, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  // The current dot is a pill, not only a colour: the owner is partially
  // colour blind, so state is never carried by hue alone.
  dotCurrent: { width: 24 },
  footer: { paddingHorizontal: 24, paddingBottom: 36, paddingTop: 12 },
});
