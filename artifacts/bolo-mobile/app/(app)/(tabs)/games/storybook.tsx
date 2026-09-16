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
import { TAB_BAR_CLEARANCE } from '@/components/Screen';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  bookIsFinished,
  firstPlayableScene,
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
 * THE LINE JUST SAID, AND WHAT HAPPENED BECAUSE OF IT, carried onto the next
 * beat.
 *
 * This is where the outcome went when the outcome PAGE was removed (owner, off
 * a TestFlight build, 2026-09-15: "after you make a selection, you don't need
 * the one screen in the middle... there is an additional screen in between
 * that's useless"). The consequence is authored content and both halves of it
 * survive: the still, because THE JOKE IS THE PICTURE and a picture lands in
 * all 22 languages with nothing translated, and its brief, because that is the
 * alt text and the only form the joke exists in for a screen reader. They ride
 * beside the carried line instead of taking a page and a second Next press.
 */
type SaidLine = {
  phrase: StoryPhrase;
  /** The consequence's brief, English, also the still's alt text. */
  outcome: string | null;
  /** The consequence still, or null when the line authored none. */
  stillId: string | null;
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
  // THE GAMES STACK HAS NO HEADER, so something has to reserve the notch or
  // the back button lands under the status bar: present, painted, and not
  // tappable. That was reported on device and fixed HERE first, with a
  // paddingTop of insets.top; games/_layout.tsx then took the job for the
  // whole stack on 2026-09-03 and this screen kept paying it too. The second
  // payment was removed 2026-09-08. See the note above the scroller.
  const params = useLocalSearchParams<{ journey?: string; zone?: string }>();

  const journey = Number(params.journey) || 1;
  const zone = Number(params.zone) || 1;
  // FROM A STOP, BACK IS THE MAP (owner, on the phone, 2026-09-14: "when i
  // click the back arrow on the storybook stop, it takes me back to
  // homescreen"). The map opens this screen in a fresh copy of the tabs whose
  // games stack holds nothing under it, so back() fell through to the tab bar
  // and landed on Home. A stop link carries journey and zone; the Games hub
  // opens the book bare, and from there back() to the hub is still right.
  const fromStop = params.journey != null;
  const leave = () => (fromStop ? router.dismissTo('/(app)/journey') : router.back());
  const book: StoryBook | null = useMemo(() => storyBookFor(journey, zone), [journey, zone]);

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [lastSaid, setLastSaid] = useState<SaidLine | null>(null);
  /** Reset with every carried line: a missing still is per consequence. */
  const [saidStillFailed, setSaidStillFailed] = useState(false);
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

  /** The engine's corpus probe: did this concept come back from the server. */
  const has = useCallback(
    (_lang: string, concept: string) => phrasesByConcept.has(concept),
    [phrasesByConcept],
  );

  // Restore a book in progress, or open on its start.
  useEffect(() => {
    if (!book || !activeLang) return;
    let live = true;
    void loadStoryBook(book.id, activeLang).then((saved) => {
      if (!live) return;
      setEntries(saved);
      // NOT `saved.length >= book.scenes.length` any more. A book may now end
      // SHORT, because the scenes this language cannot carry are skipped
      // rather than dead-ending the reader, and a length test would have sent
      // a learner who finished a four-scene run straight back to page one
      // (2026-09-15). bookIsFinished asks the ledger whether its last entry
      // took a choice that ends the book, which needs no corpus at all.
      setFinished(bookIsFinished(book.scenes, saved));
      setSceneId(book.startId);
    });
    return () => {
      live = false;
    };
  }, [book, activeLang]);

  // THE SCENE THIS LANGUAGE CAN ACTUALLY BE SHOWN, which is not always the one
  // `sceneId` names. A scene whose concepts the corpus lacks is stepped over
  // (owner, TestFlight, SEA in Tagalog, 2026-09-15: a story stop that opened on
  // "not ready in Tagalog yet" and a Back button, "this isn't ok"). Still never
  // a partial board: a scene showing two of its three lines reads as broken
  // rather than as short, so it is skipped whole or drawn whole.
  const resolved = useMemo(
    () => (book ? firstPlayableScene(book.scenes, sceneId, activeLang, has) : null),
    [book, sceneId, activeLang, has],
  );
  const scene = resolved?.scene ?? null;

  /* ── audio ─────────────────────────────────────────────────────────────
     Two voices and ONE handle. Tapping a line must stop the narrator, and a
     new beat must stop whatever is playing: two handles give a learner two
     voices at once, in two languages. */
  const synthesize = useSynthesizeSpeech();
  const narrateApi = useNarrateStoryLine();
  const soundRef = useRef<PlaybackHandle | null>(null);
  /**
   * A PLAYER THAT ARRIVES AFTER ITS SCREEN DIED STILL PLAYS. The handle is
   * assigned AFTER an await, so leaving mid-request starts a player nothing
   * holds (owner, 2026-09-12: "back out, the audio keeps playing"). Stopping
   * on unmount cannot catch it: the player does not exist yet when the
   * cleanup runs. playGuarded refuses to hand one back once the screen is gone.
   */
  const aliveRef = useRef(true);
  const playGuarded = useCallback(
    async (...args: Parameters<typeof playBase64Audio>): Promise<PlaybackHandle | null> => {
      const h = await playBase64Audio(...args);
      if (!aliveRef.current) { h.stop(); return null; }
      return h;
    },
    [],
  );
  useEffect(
    () => () => {
      aliveRef.current = false;
      soundRef.current?.stop();
      soundRef.current = null;
    },
    [],
  );
  useEffect(
    () => () => {
      soundRef.current?.stop();
      soundRef.current = null;
    },
    [],
  );

  /**
   * ONE VOICE AT A TIME, IN THE ORDER IT WAS ASKED FOR.
   *
   * THE QUEUE IS PART OF REMOVING THE MIDDLE PAGE, not a tidy-up. A pick used
   * to turn the page on the SECOND press, so the learner's line and the next
   * beat's narration were separated by a tap and could never collide. Now a
   * pick turns the page itself, and both requests are fired in the same tick
   * onto the one handle the comment above insists on: whichever synthesis
   * resolved last won, and the other was cut off mid-word, at random. Chaining
   * them keeps the order they were asked in, which is YOUR line, then the page
   * you turned to.
   *
   * Nothing here waits on a clip that has stopped: mobile's playBase64Audio
   * carries its own watchdog and always reports done, and playGuarded handing
   * back null (the screen is gone) resolves the link too.
   */
  const voiceRef = useRef<Promise<void>>(Promise.resolve());
  const enqueueVoice = useCallback((task: () => Promise<void>) => {
    const next = voiceRef.current.then(task, task);
    voiceRef.current = next.then(
      () => undefined,
      () => undefined,
    );
  }, []);

  const playToEnd = useCallback(
    (audioBase64: string, format: string) =>
      new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        void playGuarded(audioBase64, format, finish)
          .then((h) => {
            if (!h) finish();
            else soundRef.current = h;
          })
          .catch(finish);
      }),
    [playGuarded],
  );

  const speak = useCallback(
    (phrase: StoryPhrase) => {
      if (!soundOn) return;
      enqueueVoice(async () => {
        // The screen can die while this sits in the queue behind another clip.
        if (!aliveRef.current) return;
        try {
          soundRef.current?.stop();
          const res = await synthesize.mutateAsync({
            data: {
              text: phrase.nativeScript,
              languageCode: activeLang,
              languageName: activeLanguage?.name ?? activeLang,
            },
          });
          await playToEnd(res.audioBase64, res.format);
        } catch {
          // A line that will not speak still reads. Silence is the fallback.
        }
      });
    },
    [soundOn, synthesize, activeLang, activeLanguage, enqueueVoice, playToEnd],
  );

  const narrate = useCallback(
    (text: string) => {
      // The mute check is FIRST, before the request, so a muted learner never
      // causes a synthesis. Narration bills per character on first play.
      if (!soundOn) return;
      const line = text.trim();
      if (!line) return;
      enqueueVoice(async () => {
        if (!aliveRef.current) return;
        try {
          soundRef.current?.stop();
          const res = await narrateApi.mutateAsync({ data: { text: line } });
          await playToEnd(res.audioBase64, res.format);
        } catch {
          // Same contract as speak: the story still reads.
        }
      });
    },
    [soundOn, narrateApi, enqueueVoice, playToEnd],
  );

  /* ── the book's zoom ───────────────────────────────────────────────────
     Animated, useNativeDriver FALSE. See the header: the native driver does
     not tick in release builds of this app, so the only honest choice is the
     JS one. A 2-second interpolation on the JS thread is well within what it
     can carry, and the alternative is a zoom that ships as a still. */
  // THE PAGE IS THE SCENE YOU ARE ON, and only ever that. It used to become the
  // consequence still for one press after a pick, which is the middle page the
  // owner asked for the removal of on 2026-09-15. The consequence still has not
  // been dropped: it rides beside the carried line below (see SaidLine).
  const stillId = resolved ? setupStillId(resolved.scene.id) : null;
  const prose = resolved ? resolved.scene.situation : '';

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

  // NARRATION ON BY DEFAULT. It began as an opt-in button; the owner reversed
  // that and asked for sound on with a mute, so the control below reads "Mute
  // the Story".
  //
  // ONE CLIP PER PAGE SINCE 2026-09-15, where it used to be two: the scene and
  // then its consequence. Removing the middle page removed the second clip with
  // it, which halves what this game bills the narrator for. The consequence is
  // still on the screen, beside the carried line, read rather than spoken: the
  // pick already fires the learner's own line in their own language, and a
  // third voice on one page turn is a queue, not a story.
  useEffect(() => {
    if (!stillId || !prose) return;
    narrate(prose);
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

  /**
   * A PICK IS THE PAGE TURN. There is no Next button on this screen any more.
   *
   * Owner, off a TestFlight build, 2026-09-15: "after you make a selection, you
   * don't need the one screen in the middle. should just go to the next
   * question but show what you selected previously on top of the options. there
   * is an additional screen in between that's useless."
   *
   * WHAT ELSE THIS DOES, and both halves matter. It carries the line and its
   * consequence forward into the YOU SAID block, which is where the outcome
   * went rather than being deleted. And it looks for the next scene THIS
   * LANGUAGE CAN CARRY rather than trusting `taken.next` to resolve, so a book
   * whose later scenes name a word the corpus lacks ends properly on the
   * finished book instead of dropping the reader on the not-ready screen with
   * their part-written story thrown away.
   */
  const choose = useCallback(
    (concept: string, phrase: StoryPhrase) => {
      if (!scene || !book || !activeLang) return;
      const taken = chooseScene(scene, concept);
      if (!taken) return;
      const choice = scene.choices.find((c) => c.concept === concept) ?? null;
      const next = [...entries, taken.entry];
      setEntries(next);
      setLastSaid({
        phrase,
        outcome: choice?.outcome?.situation ?? null,
        stillId: choice?.outcome ? outcomeStillId(scene.id, concept) : null,
      });
      setSaidStillFailed(false);
      speak(phrase);
      void saveStoryBook(book.id, activeLang, next);

      const onward =
        taken.next === null
          ? null
          : firstPlayableScene(book.scenes, taken.next, activeLang, has);
      if (onward) {
        setSceneId(onward.scene.id);
        return;
      }
      // THE TWO WAYS A STORY CAN STOP, and they must not be confused. A
      // `limited` response means the server served the taste's concepts only,
      // so the scenes past it cannot resolve BECAUSE THEY WERE NOT PAID FOR:
      // that is the paywall beat, and the screen falls into it by holding the
      // id that will not resolve. Anything else is the story genuinely running
      // out, which is a finished book. Selling somebody a book that does not
      // exist in their language is the worse of the two mistakes, and telling a
      // paying reader their story is unfinished when it just ended is the other.
      if (taken.next !== null && data?.limited === true) {
        setSceneId(taken.next);
        return;
      }
      setFinished(true);
      setSceneId(null);
    },
    [scene, book, activeLang, entries, speak, has, data],
  );

  const readAgain = useCallback(() => {
    if (!book || !activeLang) return;
    void clearStoryBook(book.id, activeLang);
    setEntries([]);
    setFinished(false);
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

  /**
   * THE NOTCH IS CLEARED BY THE STACK, NOT HERE (owner, 2026-09-03, off
   * TestFlight: "too much space up top"). games/_layout.tsx pads the whole
   * stack by insets.top, which is why every OTHER game renders inside
   * `<Screen padTop={false}>`. This screen and its neighbour are raw
   * ScrollViews, so they never got that fix and cleared the notch TWICE:
   * roughly 47pt of dead air above the title, which also pushed the bottom of
   * the page further under the floating tab bar. Found 2026-09-08 while
   * chasing the storybook's unreachable Next button.
   */
  const limited = data?.limited === true;

  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[s.pad, CONTENT_COLUMN]}
      testID="storybook-screen"
    >
      {/* BACK, and every screen in the games stack has to supply its own: the
          stack sets headerShown: false so the tab bar stays visible, which
          means there is no system chrome to fall back on. Reported missing on
          device 2026-08-24 by somebody who had come in from the Games hub and
          could not get out. Same treatment as Phrasebook and Leaderboard. */}
      <Pressable
        onPress={leave}
        accessibilityRole="button"
        accessibilityLabel={fromStop ? 'Back to the journey map' : 'Back'}
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

      {/* THE CORPUS IS SHORT IN THIS LANGUAGE, web's story-short twin
          (build 25). This state rendered NOTHING on mobile: a paying account
          on a language missing one of the scene's concepts opened the book
          to a title and a blank page, which the owner's Gujarati tester hit
          on 1.0.6 page one. No offer, because there is nothing to sell:
          the rest of this book does not exist in their language yet.

          WHAT IT TAKES TO REACH THIS NOW, since 2026-09-15: NOT ONE scene of
          this book resolves. It used to be any single scene, which is how the
          owner got a full-screen "not ready in Tagalog yet" and a Back button
          on the SEA fork ("this isn't ok"), on a book whose other four scenes
          were fine. Against India's seeded corpus this is reachable for no
          book in any of the 22 languages: every one of the 132 pairs carries
          at least one playable scene. It stays because production is not the
          seed and a book authored from rarer concepts could still land here. */}
      {!isLoading && !finished && !resolved && !limited && (
        <View style={s.gap} testID="storybook-short">
          <Text style={[s.h2, { color: colors.foreground }]}>
            {`This story is not ready in ${activeLanguage?.name ?? 'this language'} yet`}
          </Text>
          <Text style={[s.body, { color: colors.mutedForeground }]}>
            A few of its words have not been written in
            {` ${activeLanguage?.name ?? 'this language'}`} yet. The rest of the
            journey is unaffected.
          </Text>
          <Pressable
            testID="storybook-short-back"
            onPress={leave}
            style={[s.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={s.ctaText}>{fromStop ? 'Back to the journey' : 'Back to the games'}</Text>
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

            {/* THERE IS NO NEXT BUTTON HERE ANY MORE, and the history is worth
                keeping because it was twice a bug in one week.

                It was moved ONTO the picture on 2026-09-08 (owner, off the
                phone: "user is unable to press the next button, when they
                scroll down to see it, when they let go it autoscrolls back to
                top"). The cause was this scroller padding its bottom by 40
                under a FLOATING tab bar 74pt tall plus the home indicator, so
                Next was drawn under the bar, and the page was too short to
                scroll, so the drag was rubber band and let go snapped back.
                THE PADDING FIX IS STILL LOAD-BEARING and is still below
                (TAB_BAR_CLEARANCE): it is what saves the choice cards and the
                two upsell buttons.

                Then on 2026-09-15 the owner removed the thing Next advanced
                to: "there is an additional screen in between that's useless".
                A pick turns the page itself, so the button it needed is gone
                rather than relocated. A button that cannot be pressed in the
                wrong place is best fixed by there being no button. */}
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

          {/* WHAT YOU SAID, AND WHAT CAME OF IT, carried onto the next beat
              rather than given a page of its own. The middle page is gone
              (owner, 2026-09-15) and this block is where its two authored
              pieces landed: the consequence still, small, and the brief that
              is also its alt text. The picture stays because the joke is the
              picture and a picture needs no translating; it is a thumbnail
              rather than the page because the page is the scene you are
              reading NOW, and two full pictures compete on a phone.

              THE MEANING LIVES HERE TOO. It used to appear on the chosen card
              after the tap, and that card is gone the instant a line is
              picked, so the reveal moved with the line it belongs to. */}
          {lastSaid && (
            <View style={[s.said, { borderColor: colors.primary }]} testID="storybook-said">
              <View style={s.saidRow}>
                <View style={s.saidText}>
                  <Text style={[s.tiny, { color: colors.mutedForeground }]}>YOU SAID</Text>
                  <Text
                    style={[s.script, nativeTextStyle(activeLanguage), { color: colors.foreground }]}
                  >
                    {lastSaid.phrase.nativeScript}
                  </Text>
                  <Text style={[s.tiny, { color: colors.mutedForeground }]}>
                    {lastSaid.phrase.english}
                  </Text>
                </View>
                {lastSaid.stillId !== null && !saidStillFailed && (
                  <Image
                    testID="storybook-said-still"
                    source={{ uri: storyStillUrl(lastSaid.stillId) }}
                    style={s.saidStill}
                    resizeMode="cover"
                    accessibilityLabel={lastSaid.outcome ?? ''}
                    // A consequence still that has not been generated must not
                    // leave a grey hole beside the line: the brief below says
                    // the same thing in the only other form it exists in.
                    onError={() => setSaidStillFailed(true)}
                  />
                )}
              </View>
              {lastSaid.outcome !== null && (
                <Text style={[s.tiny, { color: colors.primary }]}>{lastSaid.outcome}</Text>
              )}
            </View>
          )}

          {resolved.choices.map((choice) => {
            const phrase = phrasesByConcept.get(choice.concept);
            if (!phrase) return null;
            return (
              <Pressable
                key={choice.concept}
                testID={`storybook-choice-${choice.concept}`}
                // ONE TAP IS THE WHOLE TURN since 2026-09-15. There is no
                // picked state to guard against a second tap: this card is
                // unmounted by the time one could land, because the board it
                // sits on has already been replaced by the next scene's.
                onPress={() => choose(choice.concept, phrase)}
                style={[s.card, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                <Text style={[s.script, nativeTextStyle(activeLanguage), { color: colors.foreground }]}>
                  {phrase.nativeScript}
                </Text>
                {phrase.romanized.trim() !== '' && (
                  <Text style={[s.tiny, { color: colors.mutedForeground }]}>{phrase.romanized}</Text>
                )}
              </Pressable>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  pad: { padding: 16, gap: 10, paddingBottom: TAB_BAR_CLEARANCE },
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
  said: { borderWidth: 1, borderRadius: 14, padding: 11, gap: 4 },
  saidRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  saidText: { flex: 1, gap: 2 },
  // 3:2, the shape every still is generated at, small enough to sit beside the
  // line rather than compete with the page.
  saidStill: { width: 84, height: 56, borderRadius: 8 },
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
  // `nextOnArt` lived here until 2026-09-15 and went with the button it styled.
  // A style for a control that no longer exists is an invitation to put the
  // control back.
  ctaText: { fontFamily: AppFonts.bold, fontSize: 15, color: '#fff' },
});
