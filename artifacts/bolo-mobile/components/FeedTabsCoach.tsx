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
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useContentInset } from '@/lib/contentWidth';
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
  anchor,
  onStep,
  onDone,
}: {
  /** The tabs actually on screen, in the order they appear. */
  steps: CoachStep[];
  /**
   * The segment strip's real box in window coordinates, measured by the
   * screen that owns it. Null until the measurement lands, and the tour
   * renders NOTHING until then rather than flashing in the wrong place.
   */
  anchor: CoachAnchor | null;
  /** Selects the tab being described, which is what does the pointing. */
  onStep: (value: string) => void;
  onDone: () => void;
}) {
  const colors = useColors();
  const { height: windowH } = useWindowDimensions();
  const contentInset = useContentInset();
  const [i, setI] = React.useState(0);
  const step = steps[i];

  // Select the described tab as each step opens.
  React.useEffect(() => {
    if (step) onStep(step.value);
  }, [step, onStep]);

  if (!step || !anchor) return null;
  const copy = COPY[step.value];
  if (!copy) return null;

  // THE CARD GOES UNDER THE STRIP, WHICH IS THE ACTUAL FIX. It used to sit at
  // a fixed paddingTop of 220 and on a real screen that lands ON TOP OF the
  // strip it is describing: the learner saw a card about "Feed" with the Feed
  // tab hidden underneath it and a caret pointing up at the scope toggle
  // instead. Reported twice, "each isn't really pointing to the right option"
  // and then "still not pointing to the right buttons".
  //
  // Below the strip when there is room, above it when there is not, and the
  // caret flips with it so it always points AT the strip.
  const gap = 12;
  const belowY = anchor.y + anchor.height + gap;
  // A card is about 190 tall with two lines of body copy; if that would run
  // off the bottom, hang it above the strip instead.
  const placeBelow = belowY + 200 < windowH;
  const caretX = coachCaretX(anchor, i, steps.length);

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
        {/* THE CARET IS THE POINTING, and until 2026-08-26 there was none: the
            card sat at a fixed offset, centred, identical on every step, so
            with two tabs nothing indicated anything. "Each isn't really
            pointing to the right option." It sits under the tab the step
            describes now. */}
        <View
          pointerEvents="none"
          testID="feed-tabs-coach-caret"
          style={[
            styles.caret,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              left: caretX - 7,
              // Sits on the card's edge that faces the strip, so the diamond
              // reads as the card pointing rather than as a loose lozenge.
              top: placeBelow ? belowY - 7 : anchor.y - gap - 7,
              // The two borders drawn are the top-left pair, which is the
              // corner that faces up once rotated. Facing down needs the
              // other two, so the whole thing turns instead.
              transform: [{ rotate: placeBelow ? '45deg' : '225deg' }],
            },
          ]}
        />
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              position: 'absolute',
              // The card spans the column, not the window (build 25): on an
              // iPad it ran a thousand points wide under a 140pt strip. The
              // caret keeps window coordinates, because the anchor is measured
              // in them.
              left: 20 + contentInset,
              right: 20 + contentInset,
              ...(placeBelow
                ? { top: belowY }
                : { bottom: windowH - anchor.y + gap }),
            },
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

/**
 * WHERE THE SEGMENT STRIP PUTS ITS TABS.
 *
 * MEASURED NOW, NOT ASSUMED, and the assumption is what broke this twice.
 * The strip is flex:1 segments in a row with a known padding and gap, so tab
 * i's centre looked like exact arithmetic off the WINDOW width. It is not: the
 * strip is not the only thing on that screen and the window is not its
 * container. The caller measures the real strip in window coordinates and
 * passes the box; this only splits it.
 */
const STRIP_GAP = 8;

/** The strip's own box, in window coordinates. */
export interface CoachAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The horizontal centre of tab `i` of `n`, inside a measured strip. */
export function coachCaretX(anchor: CoachAnchor, i: number, n: number): number {
  const seg = (anchor.width - STRIP_GAP * (n - 1)) / n;
  return anchor.x + i * (seg + STRIP_GAP) + seg / 2;
}

const styles = StyleSheet.create({
  // The caret that does the pointing. Rotated square rather than a triangle:
  // RN draws a border triangle with zero width and height, which cannot carry
  // the card's own border along two of its edges.
  caret: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 3,
    borderLeftWidth: 1.5,
    borderTopWidth: 1.5,
  },
  // Just the dimmer now. The card and the caret are positioned from the
  // measured strip in window coordinates, so the scrim must not add padding
  // of its own or every position would be off by it.
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
