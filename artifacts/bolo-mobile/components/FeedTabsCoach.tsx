/**
 * THE FIRST-RUN TOUR OF THE FEED'S TABS. Asked for 2026-08-26: "the first time
 * they access the feed screen, lets show popup's pointing to each tab and
 * telling them what each shows. Only shown on their first load of that page."
 *
 * Web twin: src/components/feed-tabs-coach.tsx. Keep the copy in step.
 *
 * IT POINTS BY SELECTING, NOT BY MEASURING. Anchoring a caret to a tab means
 * measuring that tab's position, which is layout state that arrives a frame
 * late and moves whenever the tab list changes. Instead each step SWITCHES to
 * the tab it describes: the segment strip's own active styling becomes the
 * pointer, and the card sits under the strip with a caret on the side the tab
 * is on. Nothing to measure and nothing to keep in sync.
 *
 * FLEX IS NOT ALWAYS THERE, so the steps are built from the tabs actually on
 * screen. A learner with a bare Bolo gets one step about the Feed and is done,
 * and the tour does not describe a tab they cannot see.
 *
 * ONCE PER DEVICE. The flag is written when the tour is DISMISSED, not when it
 * opens, so a learner who kills the app mid-tour gets it again rather than
 * losing it to a crash.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

const SEEN_KEY = 'bolo.feedTabsCoachSeen';

/** What each tab is for, in the learner's words rather than the schema's. */
const COPY: Record<string, { title: string; body: string }> = {
  feed: {
    title: 'Feed',
    body: "Where everyone stands this week, and the moments as they happen. Your XP and your streak are both on every row.",
  },
  flex: {
    title: 'Flex',
    body: "Bolo in what you bought. This tab only exists while she is wearing something, so it is yours as long as you keep her dressed.",
  },
};

export interface CoachStep {
  value: string;
  label: string;
}

/**
 * Reads the flag once on mount. Returns null while unknown, so nothing flashes
 * open and closed on a device that has already seen it.
 */
export function useFeedTabsCoach(): {
  pending: boolean | null;
  dismiss: () => void;
} {
  const [pending, setPending] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const seen = await AsyncStorage.getItem(SEEN_KEY);
        if (!cancelled) setPending(!seen);
      } catch {
        // A storage read that throws must not cost the learner the screen.
        if (!cancelled) setPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = React.useCallback(() => {
    setPending(false);
    void AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {
      // Losing the flag means the tour runs once more. That is the safe way to
      // fail: the other direction silently eats somebody's only showing.
    });
  }, []);

  return { pending, dismiss };
}

export function FeedTabsCoach({
  steps,
  onStep,
  onDone,
}: {
  /** The tabs actually on screen, in the order they appear. */
  steps: CoachStep[];
  /** Selects the tab being described, which is what does the pointing. */
  onStep: (value: string) => void;
  onDone: () => void;
}) {
  const colors = useColors();
  const [i, setI] = React.useState(0);
  const step = steps[i];

  // Select the described tab as each step opens.
  React.useEffect(() => {
    if (step) onStep(step.value);
  }, [step, onStep]);

  if (!step) return null;
  const copy = COPY[step.value];
  if (!copy) return null;

  const last = i === steps.length - 1;

  return (
    <Modal transparent animationType="fade" onRequestClose={onDone}>
      {/* Tapping the scrim advances too. A tour that can only be dismissed by
          finding the one right button is a tour people force-quit. */}
      <Pressable
        style={styles.scrim}
        accessibilityRole="button"
        accessibilityLabel={last ? 'Finish' : 'Next'}
        onPress={() => {
          hapticLight();
          if (last) onDone();
          else setI((n) => n + 1);
        }}
      >
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.head}>
            <View style={[styles.pip, { backgroundColor: `${colors.primary}22` }]}>
              <Feather name="arrow-up" size={16} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {copy.title}
            </Text>
            {steps.length > 1 ? (
              <Text style={[styles.count, { color: colors.mutedForeground }]}>
                {i + 1} of {steps.length}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            {copy.body}
          </Text>
          <View style={[styles.cta, { backgroundColor: colors.primary }]}>
            <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>
              {last ? 'Got it' : 'Next'}
            </Text>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Sits high on the screen so the segment strip it is describing stays visible
  // above it rather than being covered by the card.
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-start',
    paddingTop: 220,
    paddingHorizontal: 20,
  },
  card: { borderRadius: 22, borderWidth: 1.5, padding: 18, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontFamily: AppFonts.extrabold, flex: 1 },
  count: { fontSize: 12, fontFamily: AppFonts.regular },
  body: { fontSize: 14, fontFamily: AppFonts.regular, lineHeight: 20 },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    marginTop: 2,
  },
  ctaText: { fontSize: 14, fontFamily: AppFonts.bold },
});
