import React, { useEffect, useState } from 'react';
import {
  Dimensions,
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

const PADDING = 10; // spotlight padding around the target element (px)
const RING_WIDTH = 3; // bright border ring width (px)

interface SpotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Full-screen guided-tour overlay. Consumes `TourContext` directly — just
 * render this once inside `<TourProvider>` (e.g. in the authenticated app
 * layout) and the context drives it.
 *
 * When the current step carries a `highlightRef`, the overlay measures the
 * referenced View and cuts a transparent spotlight around it — four dark
 * panels surround it with a glowing ring on the cutout border. Steps without
 * a ref fall back to the original full-screen caption card.
 */
export function GuidedTour() {
  const { isOpen, steps, currentIndex, goNext, skip } = useTour();
  const colors = useColors();
  const [spotRect, setSpotRect] = useState<SpotRect | null>(null);

  const step = steps[currentIndex];

  // Measure the highlighted element whenever the step or open state changes.
  // If the step provides a `scrollIntoView` callback, call it first and wait
  // for the scroll animation to settle before taking the measurement —
  // otherwise `measureInWindow` can return stale or off-screen coordinates.
  useEffect(() => {
    setSpotRect(null);
    if (!isOpen || !step?.highlightRef?.current) return;

    let cancelled = false;

    const doMeasure = () => {
      if (cancelled || !step.highlightRef?.current) return;
      // measureInWindow gives absolute screen coords — exactly what we need for
      // the overlay which sits in a full-screen Modal over everything.
      step.highlightRef.current.measureInWindow((x, y, width, height) => {
        if (!cancelled && width > 0 && height > 0) {
          setSpotRect({
            x: x - PADDING,
            y: y - PADDING,
            width: width + PADDING * 2,
            height: height + PADDING * 2,
          });
        }
      });
    };

    if (step.scrollIntoView) {
      // Scroll the target into view, then wait 350 ms for the animated scroll
      // to settle before we measure its on-screen position.
      step.scrollIntoView();
      const t = setTimeout(doMeasure, 350);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    } else {
      doMeasure();
    }
  }, [isOpen, currentIndex, step?.highlightRef, step?.scrollIntoView]);

  if (!isOpen || steps.length === 0) return null;

  const isLast = currentIndex === steps.length - 1;
  const totalSteps = steps.length;
  const hasSpot = spotRect !== null;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={skip}
      statusBarTranslucent
    >
      {hasSpot ? (
        <SpotlightOverlay
          spot={spotRect!}
          step={step}
          currentIndex={currentIndex}
          totalSteps={totalSteps}
          isLast={isLast}
          colors={colors}
          goNext={goNext}
          skip={skip}
        />
      ) : (
        /* ── Fallback: full-screen caption card (original behaviour) ── */
        <Pressable
          onPress={skip}
          style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
          accessibilityLabel="Skip tour"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <StepCard
              step={step}
              currentIndex={currentIndex}
              totalSteps={totalSteps}
              isLast={isLast}
              colors={colors}
              goNext={goNext}
              skip={skip}
            />
          </Pressable>
        </Pressable>
      )}
    </Modal>
  );
}

// ─── Spotlight overlay ────────────────────────────────────────────────────────

interface SpotlightProps {
  spot: SpotRect;
  step: ReturnType<typeof useTour>['steps'][number];
  currentIndex: number;
  totalSteps: number;
  isLast: boolean;
  colors: ReturnType<typeof useColors>;
  goNext: () => void;
  skip: () => void;
}

function SpotlightOverlay({
  spot,
  step,
  currentIndex,
  totalSteps,
  isLast,
  colors,
  goNext,
  skip,
}: SpotlightProps) {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const dim = 'rgba(0,0,0,0.72)';

  // Four rectangles that fill the screen except for the spotlight cutout.
  //
  //  ┌──────────────────────────────┐
  //  │          top panel           │
  //  ├──────┬───────────────┬───────┤
  //  │ left │   spotlight   │ right │
  //  ├──────┴───────────────┴───────┤
  //  │         bottom panel         │
  //  └──────────────────────────────┘

  const top = { left: 0, top: 0, width: screenW, height: spot.y };
  const bottom = {
    left: 0,
    top: spot.y + spot.height,
    width: screenW,
    height: Math.max(0, screenH - (spot.y + spot.height)),
  };
  const left = { left: 0, top: spot.y, width: spot.x, height: spot.height };
  const right = {
    left: spot.x + spot.width,
    top: spot.y,
    width: Math.max(0, screenW - (spot.x + spot.width)),
    height: spot.height,
  };

  // Place the card below the spotlight if there is room, otherwise above.
  const spaceBelow = screenH - (spot.y + spot.height);
  const cardBelow = spaceBelow >= 220;

  return (
    <Pressable
      style={StyleSheet.absoluteFillObject}
      onPress={skip}
      accessibilityLabel="Skip tour"
    >
      {/* Four dim panels */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: dim, ...top }]} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: dim, ...bottom }]} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: dim, ...left }]} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: dim, ...right }]} />

      {/* Glowing ring around the cutout */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: spot.x - RING_WIDTH,
          top: spot.y - RING_WIDTH,
          width: spot.width + RING_WIDTH * 2,
          height: spot.height + RING_WIDTH * 2,
          borderRadius: 16,
          borderWidth: RING_WIDTH,
          borderColor: 'rgba(255,255,255,0.75)',
        }}
      />

      {/* Caption card — positioned below or above the spotlight */}
      <Pressable
        onPress={(e) => e.stopPropagation()}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            position: 'absolute',
            left: 16,
            right: 16,
            ...(cardBelow
              ? { top: spot.y + spot.height + 16 }
              : { bottom: screenH - spot.y + 16 }),
          },
        ]}
      >
        <StepCard
          step={step}
          currentIndex={currentIndex}
          totalSteps={totalSteps}
          isLast={isLast}
          colors={colors}
          goNext={goNext}
          skip={skip}
        />
      </Pressable>
    </Pressable>
  );
}

// ─── Shared step card content ─────────────────────────────────────────────────

interface StepCardProps {
  step: ReturnType<typeof useTour>['steps'][number];
  currentIndex: number;
  totalSteps: number;
  isLast: boolean;
  colors: ReturnType<typeof useColors>;
  goNext: () => void;
  skip: () => void;
}

function StepCard({
  step,
  currentIndex,
  totalSteps,
  isLast,
  colors,
  goNext,
  skip,
}: StepCardProps) {
  return (
    <>
      {/* Step indicator dots */}
      {totalSteps > 1 && (
        <View style={styles.dots}>
          {Array.from({ length: totalSteps }).map((_, i) => (
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
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
