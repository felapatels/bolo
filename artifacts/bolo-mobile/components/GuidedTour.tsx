import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTour } from '@/contexts/TourContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * Full-screen guided-tour overlay. Consumes `TourContext` directly — just
 * render this once inside `<TourProvider>` (e.g. in the authenticated app
 * layout) and the context drives it.
 *
 * The step list is a placeholder; once individual product features stabilise,
 * replace `TOUR_STEPS` in `contexts/TourContext.tsx` with real content.
 */
export function GuidedTour() {
  const { isOpen, steps, currentIndex, goNext, skip } = useTour();
  const colors = useColors();

  if (!isOpen || steps.length === 0) return null;

  const step = steps[currentIndex];
  const isLast = currentIndex === steps.length - 1;
  const totalSteps = steps.length;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={skip}
      statusBarTranslucent
    >
      {/* Tap backdrop to skip */}
      <Pressable
        onPress={skip}
        style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
        accessibilityLabel="Skip tour"
      >
        {/* Card — stop tap propagation so only backdrop press skips */}
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {/* Step indicator dots */}
          {totalSteps > 1 && (
            <View style={styles.dots}>
              {steps.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        i === currentIndex ? colors.primary : colors.muted,
                    },
                  ]}
                />
              ))}
            </View>
          )}

          {/* Step content */}
          <Text style={[styles.title, { color: colors.foreground }]}>
            {step.title}
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            {step.body}
          </Text>

          {/* Controls */}
          <View style={styles.controls}>
            <Pressable
              onPress={skip}
              accessibilityRole="button"
              accessibilityLabel="Skip tour"
              style={styles.skipBtn}
            >
              <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
                Skip
              </Text>
            </Pressable>

            <Pressable
              onPress={goNext}
              accessibilityRole="button"
              accessibilityLabel={isLast ? 'Finish tour' : 'Next step'}
              style={[styles.nextBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.nextText, { color: colors.primaryForeground }]}>
                {isLast ? 'Done' : 'Next'}
              </Text>
              {!isLast && (
                <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    fontFamily: AppFonts.extrabold,
    fontSize: 22,
    marginBottom: 10,
    lineHeight: 28,
  },
  body: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  skipText: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  nextText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 16,
  },
});
