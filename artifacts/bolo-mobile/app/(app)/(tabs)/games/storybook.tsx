// THE STORYBOOK on the phone: the twin of
// gujarati-coach/src/pages/games/storybook.tsx.
//
// WHAT IS SHARED. Every rule is imported from @workspace/story: the six books,
// which zone each belongs to, how a still is named, which scenes a free learner
// gets, the converging graph, and both pieces of paywall copy. This file owns
// the rendering. Web and mobile share no components in this repo, so anything
// not in the library becomes two storybooks that drift apart within a week.
//
// THE BOOK, and all three parts of it are load-bearing. They were arrived at by
// the owner rejecting the first version outright: "I don't like the UI. I
// imagined an actual book, and the image being the page, then the page flipping
// for the next screen", then "this is huge on standard web window" and "the
// book should start small and then after zoom, I will only see the right page
// with photo", then "too fast to tell its even a book".
//
//   A FRAME THAT CLIPS. Everything happens inside a fixed 3:2 box with
//   overflow hidden. The first web version scaled the book in open page flow
//   and the zoom covered the caption above it and the button below it.
//
//   LANDSCAPE PAGES. Each leaf is 3:2, the shape the stills are generated at,
//   so the spread is 3:1 and ONE PAGE FILLS THE FRAME EXACTLY at scale 2 with
//   nothing cropped. Portrait pages make that impossible.
//
//   IT HOLDS BEFORE IT MOVES. 1.5 seconds on the whole small book, then a slow
//   2-second push. The point of showing a book is lost if nobody has time to
//   see one.
//
// useNativeDriver: FALSE, AND THAT IS NOT A STYLE CHOICE. CLAUDE.md records it
// as measured on device by build 270: the native animation driver in this app
// is DEAD in release builds, so anything driven per-frame from the native side
// does not tick at all. A zoom on the native driver would ship as a still.
//
// THE STILLS ARE FETCHED, NOT BUNDLED. See lib/mediaUrl.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View } from 'react-native';
import { CONTENT_COLUMN, useContentWidth } from '@/lib/contentWidth';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import {
  useGetStoryBook,
  getGetStoryBookQueryKey,
  useSynthesizeSpeech,
  useNarrateStoryLine,
} from '@workspace/api-client-react';
import {
  storyBookFor,
  resolveScene,
  chooseScene,
  setupStillId,
  outcomeStillId,
  STORY_TEASER_END,
  STORY_TASTE_BOOK_DONE,
  type LedgerEntry,
  type StoryBook,
} from '@workspace/story';
import { storyStillUrl } from '@/lib/mediaUrl';
import { loadStoryBook, saveStoryBook, clearStoryBook } from '@/lib/storyLedger';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { playBase64Audio, type PlaybackHandle } from '@/lib/audio';
import { loadGameAudioPref, saveGameAudioPref } from '@/lib/gameAudioPref';

type StoryPhrase = {
  concept: string;
  phraseId: number;
  nativeScript: string;
  romanized: string;
  english: string;
};

/**
 * Pretend words on the left leaf.
 *
 * Strokes, not text. They read as a page of writing at a glance and as nothing
 * on inspection, which is exactly right: real prose there would be prose to
 * translate into 22 languages.
 */
function Scribbles({ color }: { color: string }) {
  const rows = [9, 7, 10, 8, 10, 6];
  return (
    <View style={s.scrib} pointerEvents="none">
      {rows.map((seg, i) => {
        const span = i === rows.length - 1 ? 50 : 100;
        const step = span / seg;
        let d = '';
        for (let n = 0; n < seg; n++) {
          const x = n * step;
          d += `M${x.toFixed(2)} 6 q ${(step * 0.2).toFixed(2)} -3.4 ${(step * 0.39).toFixed(2)} 0 t ${(step * 0.39).toFixed(2)} 0 `;
        }
        return (
          <Svg key={i} viewBox="0 0 100 12" height={7} width="100%" preserveAspectRatio="none">
            <Path d={d} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
          </Svg>
        );
      })}
    </View>
  );
}

export default function StorybookScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeLang, activeLanguage } = useLanguage();
  const width = useContentWidth();
  // THE GAMES STACK HAS NO HEADER, so nothing reserves the notch and the back
  // button landed under the status bar: present, painted, and not tappable.
  // Reported on device, and "I can't click it" is the worst kind of bug to
  // ship because the screenshot looks correct.
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ journey?: string; zone?: string }>();

  const journey = Number(params.journey) || 1;
  const zone = Number(params.zone) || 1;
  const book: StoryBook | null = useMemo(() => storyBookFor(journey, zone), [journey, zone]);

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [lastSaid, setLastSaid] = useState<StoryPhrase | null>(null);
  const [finished, setFinished] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    void loadGameAudioPref().then(setSoundOn);
  }, []);

  const bookParams = { lang: activeLang, journey, zone };
  const { data, isLoading } = useGetStoryBook(bookParams, {
    query: { queryKey: getGetStoryBookQueryKey(bookParams) },
  });

  const phrasesByConcept = useMemo(() => {
    const m = new Map<string, StoryPhrase>();
    for (const p of data?.phrases ?? []) m.set(p.concept, p as StoryPhrase);
    return m;
  }, [data]);

  // Restore a book in progress, or open on its start.
  useEffect(() => {
    if (!book || !activeLang) return;
    let live = true;
    void loadStoryBook(book.id, activeLang).then((saved) => {
      if (!live) return;
      setEntries(saved);
      setFinished(saved.length >= book.scenes.length);
      setSceneId(book.startId);
    });
    return () => {
      live = false;
    };
  }, [book, activeLang]);

  const scene = useMemo(
    () => book?.scenes.find((sc) => sc.id === sceneId) ?? null,
    [book, sceneId],
  );
  // resolveScene returns null when the language cannot carry the scene, and the
  // caller skips it. Never a partial board: a scene showing two of its three
  // lines reads as broken rather than as short.
  const resolved = useMemo(
    () =>
      scene
        ? resolveScene(scene, activeLang, (_lang, concept) => phrasesByConcept.has(concept))
        : null,
    [scene, phrasesByConcept, activeLang],
  );

  /* ── audio ─────────────────────────────────────────────────────────────
     Two voices and ONE handle. Tapping a line must stop the narrator, and a
     new beat must stop whatever is playing: two handles give a learner two
     voices at once, in two languages. */
  const synthesize = useSynthesizeSpeech();
  const narrateApi = useNarrateStoryLine();
  const soundRef = useRef<PlaybackHandle | null>(null);
  useEffect(
    () => () => {
      soundRef.current?.stop();
      soundRef.current = null;
    },
    [],
  );

  const speak = useCallback(
    async (phrase: StoryPhrase) => {
      if (!soundOn) return;
      try {
        soundRef.current?.stop();
        const res = await synthesize.mutateAsync({
          data: {
            text: phrase.nativeScript,
            languageCode: activeLang,
            languageName: activeLanguage?.name ?? activeLang,
          },
        });
        soundRef.current = await playBase64Audio(res.audioBase64, res.format);
      } catch {
        // A line that will not speak still reads. Silence is the fallback.
      }
    },
    [soundOn, synthesize, activeLang, activeLanguage],
  );

  const narrate = useCallback(
    async (text: string) => {
      // The mute check is FIRST, before the request, so a muted learner never
      // causes a synthesis. Narration bills per character on first play.
      if (!soundOn) return;
      const line = text.trim();
      if (!line) return;
      try {
        soundRef.current?.stop();
        const res = await narrateApi.mutateAsync({ data: { text: line } });
        soundRef.current = await playBase64Audio(res.audioBase64, res.format);
      } catch {
        // Same contract as speak: the story still reads.
      }
    },
    [soundOn, narrateApi],
  );

  /* ── the book's zoom ───────────────────────────────────────────────────
     Animated, useNativeDriver FALSE. See the header: the native driver does
     not tick in release builds of this app, so the only honest choice is the
     JS one. A 2-second interpolation on the JS thread is well within what it
     can carry, and the alternative is a zoom that ships as a still. */
  const chosen = picked === null ? null : resolved?.choices.find((c) => c.concept === picked) ?? null;
  const outcome = chosen?.outcome ?? null;
  const stillId = resolved
    ? outcome
      ? outcomeStillId(resolved.scene.id, picked!)
      : setupStillId(resolved.scene.id)
    : null;
  const prose = resolved ? (outcome ? outcome.situation : resolved.scene.situation) : '';

  const zoom = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!stillId) return;
    zoom.setValue(0);
    const anim = Animated.timing(zoom, {
      toValue: 1,
      duration: 2000,
      delay: 1500,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [stillId, zoom]);

  // NARRATION ON BY DEFAULT, on the scene as well as its consequence. It began
  // as an opt-in button; the owner reversed that and asked for sound on with a
  // mute, so the control below reads "Mute the Story".
  useEffect(() => {
    if (!stillId || !prose) return;
    void narrate(prose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillId, soundOn]);

  const frameW = Math.min(width - 32, 520);
  const scale = zoom.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.98] });
  /**
   * THE COMPENSATING SHIFT, and it is arithmetic rather than a magic number.
   *
   * REACT NATIVE HAS NO transform-origin. It always scales about the CENTRE,
   * where the web twin sets the origin to the RIGHT PAGE's centre (75% 50%) so
   * the push lands on the picture. Ported straight across, the phone scaled
   * about the middle of the spread and the book drifted off frame, which is
   * exactly what it did on first look.
   *
   * So the origin has to be faked with a translate. The right page's centre
   * sits a QUARTER OF THE BOOK'S WIDTH right of the book's centre, so bringing
   * it back to the middle of the frame means shifting left by that much. React
   * Native composes [{scale},{translateX}] like CSS `scale() translateX()`,
   * which SCALES the translate, so the constant is frameW/4 rather than
   * frameW/4 times the scale.
   *
   * AND translateX TAKES POINTS, NOT PERCENTAGES. The first version passed
   * '-7%' and '-25%', which React Native does not accept on a transform, so
   * the compensation was dropped entirely and only the scale survived.
   */
  const shiftX = zoom.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -frameW / 4],
  });

  const advance = useCallback(() => {
    if (!scene || !picked || !book || !activeLang) return;
    const taken = chooseScene(scene, picked);
    if (!taken) return;
    const next = [...entries, taken.entry];
    setEntries(next);
    setPicked(null);
    if (taken.next === null) {
      setFinished(true);
      setSceneId(null);
      void saveStoryBook(book.id, activeLang, next);
      return;
    }
    setSceneId(taken.next);
    void saveStoryBook(book.id, activeLang, next);
  }, [scene, picked, book, activeLang, entries]);

  const readAgain = useCallback(() => {
    if (!book || !activeLang) return;
    void clearStoryBook(book.id, activeLang);
    setEntries([]);
    setFinished(false);
    setPicked(null);
    // Starting over clears the carried line too, or a fresh read opens with
    // "You said" quoting the previous one.
    setLastSaid(null);
    setSceneId(book.startId);
  }, [book, activeLang]);

  if (!book) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <Text style={[s.body, { color: colors.mutedForeground, padding: 24 }]}>
          There is no book on this part of the line yet.
        </Text>
      </View>
    );
  }

  const limited = data?.limited === true;

  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[s.pad, CONTENT_COLUMN, { paddingTop: insets.top + 12 }]}
      testID="storybook-screen"
    >
      {/* BACK, and every screen in the games stack has to supply its own: the
          stack sets headerShown: false so the tab bar stays visible, which
          means there is no system chrome to fall back on. Reported missing on
          device 2026-08-24 by somebody who had come in from the Games hub and
          could not get out. Same treatment as Phrasebook and Leaderboard. */}
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        testID="storybook-back"
        hitSlop={10}
        style={[s.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Feather name="arrow-left" size={20} color={colors.foreground} />
      </Pressable>
      <Text style={[s.h1, { color: colors.foreground }]}>{book.title}</Text>

      {isLoading && (
        <Text style={[s.body, { color: colors.mutedForeground }]}>Laying the tracks…</Text>
      )}

      {/* THE FINISHED BOOK. The ledger is the argument for subscribing, so the
          ask sits AFTER it, never above. */}
      {!isLoading && finished && (
        <View style={s.gap} testID="storybook-book">
          <Text style={[s.h2, { color: colors.foreground }]}>Your book</Text>
          {entries.map((e, i) => {
            const sc = book.scenes.find((x) => x.id === e.sceneId);
            const ph = phrasesByConcept.get(e.concept);
            return (
              <View
                key={`${e.sceneId}-${i}`}
                style={[s.card, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                {sc && (
                  <Text style={[s.tiny, { color: colors.mutedForeground }]}>{sc.situation}</Text>
                )}
                <Text style={[s.script, nativeTextStyle(activeLanguage), { color: colors.foreground }]}>
                  {ph?.nativeScript ?? e.concept}
                </Text>
                {ph && <Text style={[s.tiny, { color: colors.mutedForeground }]}>{ph.english}</Text>}
              </View>
            );
          })}
          {limited && (
            <View style={[s.upsell, { borderColor: colors.primary }]} testID="storybook-upsell">
              <Text style={[s.h2, { color: colors.foreground }]}>
                {STORY_TASTE_BOOK_DONE.title}
              </Text>
              <Text style={[s.body, { color: colors.mutedForeground }]}>
                {STORY_TASTE_BOOK_DONE.body}
              </Text>
              <Pressable
                testID="storybook-upgrade"
                onPress={() => router.push('/paywall')}
                style={[s.cta, { backgroundColor: colors.primary }]}
              >
                <Text style={s.ctaText}>{STORY_TASTE_BOOK_DONE.cta}</Text>
              </Pressable>
            </View>
          )}
          <Pressable onPress={readAgain} style={[s.cta, { backgroundColor: colors.primary }]}>
            <Text style={s.ctaText}>Read it again</Text>
          </Pressable>
        </View>
      )}

      {/* THE TASTE RAN OUT. Only when the response came back limited AND a
          scene will not resolve; a scene can also fail because the language's
          corpus is thin, and selling somebody a book that does not exist in
          their language is the worse mistake. */}
      {!isLoading && !finished && !resolved && limited && (
        <View style={s.gap} testID="storybook-taste-end">
          <Text style={[s.h2, { color: colors.foreground }]}>{STORY_TEASER_END.title}</Text>
          <Text style={[s.body, { color: colors.mutedForeground }]}>{STORY_TEASER_END.body}</Text>
          <Pressable
            testID="storybook-taste-upgrade"
            onPress={() => router.push('/paywall')}
            style={[s.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={s.ctaText}>{STORY_TEASER_END.cta}</Text>
          </Pressable>
        </View>
      )}

      {!isLoading && !finished && resolved && stillId && (
        <>
          <View style={[s.frame, { width: frameW, height: (frameW * 2) / 3 }]} testID="storybook-frame">
            <Animated.View
              style={{
                width: frameW,
                // scale FIRST, then translate, so the shift above is scaled
                // with it. Reversing these two moves the book by a constant
                // and the picture never lands centred.
                transform: [{ scale }, { translateX: shiftX }],
              }}
            >
              <View style={[s.book, { width: frameW, height: frameW / 3 }]}>
                <View style={[s.page, s.pageLeft]}>
                  <Scribbles color={colors.border} />
                </View>
                <View style={[s.page, s.pageRight]}>
                  <Image
                    source={{ uri: storyStillUrl(stillId) }}
                    style={s.still}
                    resizeMode="cover"
                    accessibilityLabel={prose}
                  />
                </View>
              </View>
            </Animated.View>
          </View>

          {/* MUTE, not "hear". Sound is on by default. */}
          <Pressable
            testID="storybook-mute"
            onPress={() => {
              const next = !soundOn;
              setSoundOn(next);
              void saveGameAudioPref(next);
            }}
            style={[s.mute, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Text style={[s.muteText, { color: colors.foreground }]}>
              {soundOn ? 'Mute the Story' : 'Unmute the Story'}
            </Text>
          </Pressable>

          {/* WHAT YOU SAID, carried onto the next beat rather than given a page
              of its own. */}
          {lastSaid && (
            <View style={[s.said, { borderColor: colors.primary }]} testID="storybook-said">
              <Text style={[s.tiny, { color: colors.mutedForeground }]}>YOU SAID</Text>
              <Text style={[s.script, nativeTextStyle(activeLanguage), { color: colors.foreground }]}>
                {lastSaid.nativeScript}
              </Text>
              <Text style={[s.tiny, { color: colors.mutedForeground }]}>{lastSaid.english}</Text>
            </View>
          )}

          {resolved.choices.map((choice) => {
            const phrase = phrasesByConcept.get(choice.concept);
            if (!phrase) return null;
            const isPicked = picked === choice.concept;
            return (
              <Pressable
                key={choice.concept}
                testID={`storybook-choice-${choice.concept}`}
                onPress={() => {
                  if (picked !== null) return;
                  setPicked(choice.concept);
                  setLastSaid(phrase);
                  void speak(phrase);
                }}
                style={[
                  s.card,
                  {
                    borderColor: isPicked ? colors.primary : colors.border,
                    backgroundColor: colors.card,
                  },
                ]}
              >
                <Text style={[s.script, nativeTextStyle(activeLanguage), { color: colors.foreground }]}>
                  {phrase.nativeScript}
                </Text>
                {phrase.romanized.trim() !== '' && (
                  <Text style={[s.tiny, { color: colors.mutedForeground }]}>{phrase.romanized}</Text>
                )}
                {/* The MEANING is the reveal. Showing it up front turns reading
                    the picture into a matching exercise. */}
                {isPicked && (
                  <Text style={[s.tiny, { color: colors.primary }]}>{phrase.english}</Text>
                )}
              </Pressable>
            );
          })}

          {picked !== null && (
            <Pressable
              testID="storybook-next"
              onPress={advance}
              style={[s.cta, { backgroundColor: colors.primary }]}
            >
              <Text style={s.ctaText}>Next</Text>
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  pad: { padding: 16, gap: 10, paddingBottom: 40 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  gap: { gap: 10 },
  h1: { fontFamily: AppFonts.extrabold, fontSize: 21 },
  h2: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  body: { fontFamily: AppFonts.regular, fontSize: 14, lineHeight: 20 },
  tiny: { fontFamily: AppFonts.regular, fontSize: 12 },
  script: { fontSize: 19 },
  frame: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#0f0c09',
    alignItems: 'center',
    justifyContent: 'center',
  },
  book: { flexDirection: 'row', backgroundColor: '#1f5060', padding: 3, borderRadius: 6 },
  page: { flex: 1, backgroundColor: '#f8f1e0', overflow: 'hidden' },
  pageLeft: { borderTopLeftRadius: 3, borderBottomLeftRadius: 3 },
  pageRight: { borderTopRightRadius: 5, borderBottomRightRadius: 5 },
  scrib: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: '10%',
    gap: 4,
  },
  still: { width: '100%', height: '100%' },
  card: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 2 },
  said: { borderWidth: 1, borderRadius: 14, padding: 11, gap: 2 },
  upsell: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8, alignItems: 'center' },
  mute: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  muteText: { fontFamily: AppFonts.bold, fontSize: 13 },
  cta: { borderRadius: 16, paddingVertical: 13, alignItems: 'center' },
  ctaText: { fontFamily: AppFonts.bold, fontSize: 15, color: '#fff' },
});
