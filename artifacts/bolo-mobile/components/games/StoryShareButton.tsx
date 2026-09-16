/**
 * SHARE YOUR STORY on the phone: the finished storybook as one tall PNG, handed
 * to the system share sheet. The twin of the web's ShareStoryButton in
 * gujarati-coach/src/pages/games/storybook.tsx, which draws the same plan on a
 * canvas (lib/story-share-image.ts).
 *
 * Owner, 2026-09-16: "add a share button to share the story once its done as
 * an image file." Approved approach: capture on the phone with
 * react-native-view-shot and share with expo-sharing, not a server route.
 *
 * WHAT GOES IN is storySharePlan's answer in @workspace/story, never this
 * file's: title, the earned ending, each outcome picture with the line under
 * it, then Bolo! and the domain read from EXPO_PUBLIC_DOMAIN. No name, email
 * or account id can reach it.
 *
 * THESE TWO NATIVE MODULES ARE REQUIRED HERE AND NOWHERE ELSE, and only the
 * storybook screen imports this file. CLAUDE.md records what a native module on
 * the launch path cost this app (expo-video, and expo-image, which is still
 * banned), so neither may ever be pulled into a layout, a provider or a lib file
 * the root imports.
 *
 * AND THEY ARE REQUIRED AT THE PRESS, NOT AT THE TOP OF THE FILE. A top-level
 * import is not enough to keep them off the launch path: expo-router in
 * development with sync imports evaluates EVERY route file at startup
 * (getRoutesCore's loadRoute), and expo-sharing calls requireNativeModule
 * when it is evaluated, which THROWS on a binary built before it was added. So
 * a dev client that has not been rebuilt would die at launch for the sake of a
 * button on the last screen of one game. Required at the press, a binary
 * without them fails that one press, reported, and nothing else.
 *
 * HOW THE PICTURE IS MADE. The share layout exists only while sharing: pressing
 * the button mounts it off screen, every still reports load or error (with a
 * timeout, so a slow network cannot hold the button busy forever), a still that
 * failed is taken out rather than left as a grey box, and only then is the view
 * captured to a PNG tmpfile and shared. The layout is drawn at 1080 PIXELS wide
 * (1080 / PixelRatio points), so the capture comes out at about the web
 * canvas's width without a resize.
 *
 * UNVERIFIED ON A DEVICE when written. Two things only a device can answer: that
 * an off-screen view captures with its pictures on both platforms (iOS uses
 * renderInContext for exactly that reason), and that Android's image loader
 * loads a still in a view outside the visible window.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  storySharePlan,
  storyShareStillIds,
  withoutMissingStills,
  STORY_SHARE_CTA,
  STORY_SHARE_LAYOUT as L,
  type LedgerEntry,
  type StoryBook,
  type StorySharePlan,
} from '@workspace/story';
import { storyStillUrl } from '@/lib/mediaUrl';
import { Sentry } from '@/lib/sentry';
import { AppFonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';

type SharingModule = typeof import('expo-sharing');
type ViewShotModule = typeof import('react-native-view-shot');

/** The two native modules, evaluated only when a learner asks to share. */
function shareModules(): { Sharing: SharingModule; ViewShot: ViewShotModule } {
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Sharing: require('expo-sharing') as SharingModule,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ViewShot: require('react-native-view-shot') as ViewShotModule,
  };
}

/** How long one still may take before it is left out. Same as the web. */
export const STORY_SHARE_STILL_TIMEOUT_MS = 8000;

type Phrase = { nativeScript: string; english: string };
type StillState = 'ok' | 'failed';

function reportShareFailure(stage: string, err: unknown, bookId: string) {
  Sentry.captureException(
    err instanceof Error ? err : new Error(`story share ${stage} failed: ${String(err)}`),
    { tags: { storyShare: stage, bookId } },
  );
}

/** The share layout, in points scaled from STORY_SHARE_LAYOUT's pixels. */
function ShareCard({
  plan,
  onStill,
  scriptStyle,
  cardRef,
}: {
  plan: StorySharePlan;
  onStill: (stillId: string, state: StillState) => void;
  scriptStyle: StyleProp<TextStyle>;
  cardRef: React.RefObject<View | null>;
}) {
  const width = L.width / PixelRatio.get();
  const k = width / L.width;
  const inner = (L.width - L.margin * 2) * k;
  const stillH = inner * L.stillAspect;

  const still = (stillId: string, situation: string, radius: number) => (
    <Image
      key={stillId}
      testID="story-share-still"
      source={{ uri: storyStillUrl(stillId) }}
      // Explicit points, never width '100%' plus an aspect ratio: CLAUDE.md
      // records that resolving to the image's intrinsic size on device.
      style={{ width: inner, height: stillH, borderRadius: radius }}
      resizeMode="cover"
      accessibilityLabel={situation}
      onLoad={() => onStill(stillId, 'ok')}
      onError={() => onStill(stillId, 'failed')}
    />
  );

  return (
    <View
      ref={cardRef}
      collapsable={false}
      testID="story-share-card"
      style={{
        width,
        backgroundColor: L.background,
        paddingHorizontal: L.margin * k,
        paddingVertical: L.margin * k,
        gap: L.gap * k,
      }}
    >
      <Text
        style={{
          fontFamily: AppFonts.extrabold,
          fontSize: L.titleSize * k,
          color: L.ink,
          textAlign: 'center',
        }}
      >
        {plan.title}
      </Text>
      {plan.ending && still(plan.ending.stillId, plan.ending.situation, L.radius * k)}
      {plan.panels.map((panel) => (
        <View
          key={panel.key}
          testID="story-share-panel"
          style={{ backgroundColor: L.card, borderRadius: L.radius * k, overflow: 'hidden' }}
        >
          {panel.still && still(panel.still.stillId, panel.still.situation, 0)}
          {panel.line && (
            <View
              style={{
                paddingVertical: L.cardPadV * k,
                paddingHorizontal: L.cardPadH * k,
                gap: L.lineGap * k,
              }}
            >
              <Text
                style={[
                  { fontSize: L.scriptSize * k, color: L.ink, textAlign: 'center' },
                  scriptStyle,
                ]}
              >
                {panel.line.nativeScript}
              </Text>
              {panel.line.english.trim() !== '' && (
                <Text
                  style={{
                    fontFamily: AppFonts.regular,
                    fontSize: L.englishSize * k,
                    color: L.muted,
                    textAlign: 'center',
                  }}
                >
                  {panel.line.english}
                </Text>
              )}
            </View>
          )}
        </View>
      ))}
      <View style={{ alignItems: 'center', paddingTop: 8 * k }}>
        <View style={{ width: 120 * k, height: 6 * k, backgroundColor: L.accent, marginBottom: 24 * k }} />
        <Text style={{ fontFamily: AppFonts.extrabold, fontSize: L.footerBrandSize * k, color: L.accent }}>
          {plan.footer.brand}
        </Text>
        {plan.footer.domain && (
          <Text style={{ fontFamily: AppFonts.regular, fontSize: L.footerDomainSize * k, color: L.muted }}>
            {plan.footer.domain}
          </Text>
        )}
      </View>
    </View>
  );
}

export function StoryShareButton({
  book,
  entries,
  phrasesByConcept,
  scriptStyle,
  style,
}: {
  book: StoryBook;
  entries: LedgerEntry[];
  phrasesByConcept: Map<string, Phrase>;
  /** nativeTextStyle(activeLanguage), so every script renders in its font. */
  scriptStyle: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const [plan, setPlan] = useState<StorySharePlan | null>(null);
  const [stills, setStills] = useState<Record<string, StillState>>({});
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<View | null>(null);
  const capturingRef = useRef(false);
  const aliveRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      aliveRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const finish = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    capturingRef.current = false;
    if (!aliveRef.current) return;
    setPlan(null);
    setStills({});
    setBusy(false);
  }, []);

  const onStill = useCallback((stillId: string, state: StillState) => {
    setStills((prev) => (prev[stillId] ? prev : { ...prev, [stillId]: state }));
  }, []);

  const press = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { Sharing } = shareModules();
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing is not available', 'This device cannot open a share sheet.');
        finish();
        return;
      }
    } catch (err) {
      reportShareFailure('available', err, book.id);
      finish();
      return;
    }
    if (!aliveRef.current) return;
    const next = storySharePlan(
      book,
      entries,
      (concept) => phrasesByConcept.get(concept),
      process.env.EXPO_PUBLIC_DOMAIN,
    );
    setStills({});
    setPlan(next);
    // A still that has not answered in time is left out, like one that failed.
    timeoutRef.current = setTimeout(() => {
      setStills((prev) => {
        const out = { ...prev };
        for (const id of storyShareStillIds(next)) if (!out[id]) out[id] = 'failed';
        return out;
      });
    }, STORY_SHARE_STILL_TIMEOUT_MS);
  }, [busy, book, entries, phrasesByConcept, finish]);

  // What is drawn: the plan minus every still that failed, so a failure is
  // taken out of the layout BEFORE the capture rather than captured as a hole.
  const drawn = useMemo(() => {
    if (!plan) return null;
    const failed = new Set(Object.keys(stills).filter((id) => stills[id] === 'failed'));
    return withoutMissingStills(plan, failed);
  }, [plan, stills]);

  const ready = useMemo(
    () => !!plan && storyShareStillIds(plan).every((id) => stills[id] !== undefined),
    [plan, stills],
  );

  useEffect(() => {
    if (!ready || !drawn || capturingRef.current) return;
    capturingRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    let stage = 'capture';
    void (async () => {
      try {
        // Let the layout that removed any failed still reach the screen first.
        await new Promise((r) => setTimeout(r, 150));
        if (!aliveRef.current || !cardRef.current) return;
        const { Sharing, ViewShot } = shareModules();
        const uri = await ViewShot.captureRef(cardRef, {
          format: 'png',
          result: 'tmpfile',
          // Off screen, drawViewHierarchyInRect can come back blank on iOS;
          // renderInContext draws the layer tree wherever it sits.
          useRenderInContext: Platform.OS === 'ios',
        });
        stage = 'share';
        if (!aliveRef.current) return;
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          UTI: 'public.png',
          dialogTitle: STORY_SHARE_CTA,
        });
      } catch (err) {
        reportShareFailure(stage, err, book.id);
      } finally {
        finish();
      }
    })();
  }, [ready, drawn, book.id, finish]);

  return (
    <View style={style}>
      <Pressable
        testID="storybook-share"
        onPress={() => void press()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        style={[s.btn, { borderColor: colors.primary, backgroundColor: colors.card }, busy && s.busy]}
      >
        {busy ? (
          <ActivityIndicator color={colors.primary} testID="storybook-share-busy" />
        ) : (
          <Feather name="share" size={16} color={colors.primary} />
        )}
        {/* One line, shrinking on the narrowest phones, since it shares the
            row with Read it again. */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[s.btnText, { color: colors.primary }]}
        >
          {STORY_SHARE_CTA}
        </Text>
      </Pressable>
      {drawn && (
        // OFF SCREEN AND UNTOUCHABLE. It exists only while sharing.
        <View style={s.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ShareCard plan={drawn} onStill={onStill} scriptStyle={scriptStyle} cardRef={cardRef} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  busy: { opacity: 0.6 },
  btnText: { fontFamily: AppFonts.bold, fontSize: 15 },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
});
