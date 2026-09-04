/**
 * THE LETTER STOP, position 4 of every zone. Hear the sound, pick the sound.
 *
 * Tracing at stop 2 teaches the hand and nothing in fourteen games ever taught
 * the eye: a learner could draw थ eight times and still not know it says "tha".
 * This is the other direction, and it is the only screen in the app that asks
 * somebody to READ.
 *
 * THE LETTER IS NEVER SHOWN WHILE THE QUESTION IS OPEN. That is the whole point
 * of the ear version and the whole difference from the tracing stop two rows
 * above it. It is revealed the moment an answer lands, because seeing the shape
 * beside the sound you just chose is the teaching, and hiding it afterwards
 * would be withholding the lesson rather than protecting the question.
 *
 * WHAT THIS SCREEN DOES NOT DECIDE. Its position on the map, the questions, the
 * wrong answers, the length and the pass mark all come from letter-stops.ts in
 * @workspace/script-trace, so the web twin cannot drift from it and neither
 * client is the authority. This file owns the hand movements and the noise.
 *
 * NO REANIMATED AND NO NATIVE DRIVER, and this is not preference. The native
 * animation driver is DEAD in this app's release builds (CLAUDE.md, build 270,
 * measured on device), so anything driven per frame from native comes out flat
 * in the store build while animating perfectly in a simulator. Nothing here
 * animates at all: the feedback is a border, a weight and an icon, which is
 * also what a colour-blind learner needs, since state is never in hue alone.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutRectangle,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  completeLetterStop,
  getGetProgressSummaryQueryKey,
  useGetAccount,
  useSynthesizeSpeech,
} from '@workspace/api-client-react';
import {
  LETTER_CHOICES_FIRST,
  LETTER_CHOICES_SEEN,
  LETTER_STOP_LENGTH,
  LETTER_STOP_PASS,
  letterDistractorsFor,
  letterStopFor,
  type LetterStop,
  type TraceStopCharacter,
} from '@workspace/script-trace';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { GameMuteButton, useGameAudio } from '@/components/GameMuteButton';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { playBase64Audio, type PlaybackHandle } from '@/lib/audio';
import { confirmDiscardRun } from '@/lib/gameExit';
import { pickTargetByStroke, type GesturePoint } from '@/lib/gestureAnswer';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { useTraceStopProgress } from '@/lib/useTraceStopProgress';

/**
 * How far a finger must travel before the grid claims the gesture as a slash.
 * Same value ticket-check uses, and for the same reason: below it the touch
 * still belongs to whichever row it started on.
 */
const SLASH_SLOP = 8;

/** How long the right answer stays on screen before the next letter. */
const FEEDBACK_MS = 1100;

/**
 * One question. `requeued` is the second showing of a letter that was missed:
 * it teaches and it does NOT score, which is what "no life lost" has to mean if
 * the pass mark is still to mean anything.
 */
type Ask = { char: TraceStopCharacter; requeued: boolean };

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ─── The run ──────────────────────────────────────────────────────────────────

function LetterRun({
  stop,
  soundOn,
  metBefore,
  onEnd,
}: {
  stop: LetterStop;
  soundOn: boolean;
  /**
   * Letters the learner has already passed at the tracing stop.
   *
   * THIS IS WHAT MAKES THE FOURTH CHOICE MEAN ANYTHING. The rule is four
   * choices "once the learner has had this letter right before", and the first
   * cut of this screen read that as right-before-in-this-run: a letter is asked
   * once, a missed one comes back UNSEEN because it was missed, so the fourth
   * choice could never appear at all. Tracing progress is the honest record of
   * having met a letter, the server has stored it since 2026-08-23, and the
   * journey map already reads it through the same hook.
   */
  metBefore: ReadonlySet<string>;
  onEnd: (correct: number, total: number) => void;
}) {
  const colors = useColors();
  const { activeLanguage } = useLanguage();
  const nativeProps = nativeTextStyle(activeLanguage);
  const synthesize = useSynthesizeSpeech();

  // The voice belongs in the audio cache key because a new voice genuinely is a
  // new clip. The LANGUAGE does not: Devanagari serves nine languages and क
  // sounds the same in all of them, so a language-keyed cache stores it nine
  // times identically. Keyed on script, voice and the letter here.
  //
  // OWED, AND IT IS SERVER WORK: `tts_cache` still keys on the language NAME
  // the client sends, so the nine-way duplication is real one layer down. That
  // cache is at 98% of a 10 GiB database and climbing a gigabyte a month, which
  // is why the spec called it out. This cache is per screen and per session;
  // pre-warming all 529 clips once per voice is the other half and is not here.
  const accountQuery = useGetAccount();
  const ttsVoice = accountQuery.data?.preferences.learning.ttsVoice ?? 'auto';
  const audioCache = useRef(new Map<string, { audioBase64: string; format: string }>());
  const playbackRef = useRef<PlaybackHandle | null>(null);
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'playing'>('idle');

  const asks = useRef<Ask[]>(
    stop.characters.slice(0, LETTER_STOP_LENGTH).map((char) => ({ char, requeued: false })),
  );
  const [askIndex, setAskIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  // Letters the learner has met properly: traced and passed before today, plus
  // anything they have just read correctly. Those get a fourth choice, which
  // roughly halves the guess rate exactly where guessing has stopped being the
  // point. Seeded once; the set the hook returns is rebuilt on every fetch and
  // must not reshuffle a question under a thumb.
  const seen = useRef(new Set<string>(metBefore));

  const ask = asks.current[askIndex];
  const answered = picked !== null;

  /**
   * The choices, built ONCE per question and held, because rebuilding them on
   * a re-render would reshuffle the rows under a thumb that is already moving.
   */
  const choices = useMemo(() => {
    if (!ask) return [];
    const count = seen.current.has(ask.char.id) ? LETTER_CHOICES_SEEN : LETTER_CHOICES_FIRST;
    const wrong = letterDistractorsFor(ask.char, stop.pool, count - 1);
    return shuffle([ask.char, ...wrong]);
    // askIndex identifies the question and the char is derived from it, so
    // depending on `ask` as well would only reshuffle on an unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askIndex, stop]);

  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const askIndexRef = useRef(askIndex);
  askIndexRef.current = askIndex;

  const speak = useCallback(
    async (char: TraceStopCharacter) => {
      if (!soundOnRef.current) return;
      playbackRef.current?.stop();
      playbackRef.current = null;
      setAudioState('loading');
      const at = askIndexRef.current;
      try {
        const key = `${stop.script}:${ttsVoice}:${char.char}`;
        const cached = audioCache.current.get(key);
        const res =
          cached ??
          (await synthesize.mutateAsync({
            data: {
              // The letter's own sound, which for अ is the vowel and not
              // "a-kaar". The learner is being taught to decode; the name of
              // the letter is a different fact and a later one.
              text: char.char,
              languageName: activeLanguage?.name,
              languageCode: activeLanguage?.code,
            },
          }));
        audioCache.current.set(key, { audioBase64: res.audioBase64, format: res.format });
        if (askIndexRef.current !== at) {
          setAudioState('idle');
          return;
        }
        setAudioState('playing');
        playbackRef.current = await playBase64Audio(res.audioBase64, res.format, () =>
          setAudioState('idle'),
        );
      } catch {
        setAudioState('idle');
      }
    },
    [synthesize, activeLanguage, ttsVoice, stop.script],
  );

  // A listening question that arrives silent reads as broken, so it plays
  // itself on arrival and replays on tap, uncapped: tapping to listen is the
  // lesson and must never cost anything.
  useEffect(() => {
    if (ask) void speak(ask.char);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askIndex]);

  // The clip AND the pending advance, both torn down. A timer that fires after
  // this screen has gone calls setState on nothing and, worse, would call
  // onEnd for a run the learner walked out of.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      playbackRef.current?.stop();
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  const answer = useCallback(
    (id: string) => {
      if (answered || !ask) return;
      const right = id === ask.char.id;
      setPicked(id);
      hapticMedium();
      if (right) {
        seen.current.add(ask.char.id);
        // Only a FIRST showing scores. A re-queued letter is the teaching half
        // of "no life lost"; letting it score would mean eight wrong answers
        // could still pass, which is not a pass mark.
        if (!ask.requeued) setCorrect((c) => c + 1);
      } else {
        // Say it again with the answer on screen, which is the one moment the
        // sound and the shape are together.
        void speak(ask.char);
        if (!ask.requeued) {
          asks.current = [...asks.current, { char: ask.char, requeued: true }];
        }
      }
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => {
        setPicked(null);
        if (askIndexRef.current + 1 >= asks.current.length) {
          onEnd(
            // correct is one render behind its own setState, so the answer just
            // given is added here rather than read back.
            right && !ask.requeued ? correct + 1 : correct,
            Math.min(stop.characters.length, LETTER_STOP_LENGTH),
          );
        } else {
          setAskIndex((i) => i + 1);
        }
      }, FEEDBACK_MS);
    },
    [answered, ask, correct, onEnd, speak, stop.characters.length],
  );

  // ── The slash, on every third question ────────────────────────────────────
  //
  // "Mix it up" was a ruling about VARIETY, not a ban on multiple choice, so
  // this stop is the plain version on purpose and the variety lives across
  // questions rather than inside one. Every third letter the rows are struck
  // through instead of tapped, using the same geometry ticket-check punches its
  // tickets with. A tap still works on a slash question: taking the tap away
  // would be a new rule to learn rather than a change of pace.
  const slashing = askIndex % 3 === 2;
  const answerRef = useRef(answer);
  answerRef.current = answer;
  const answeredRef = useRef(answered);
  answeredRef.current = answered;
  const slashingRef = useRef(slashing);
  slashingRef.current = slashing;

  // Read by the pan responder, which is built once and would otherwise close
  // over the first render's choices forever.
  const choicesRef = useRef(choices);
  choicesRef.current = choices;

  const gridRef = useRef<View | null>(null);
  const gridOrigin = useRef({ x: 0, y: 0 });
  const rowRects = useRef<(LayoutRectangle | null)[]>([]);
  const stroke = useRef<GesturePoint[]>([]);
  const [underFinger, setUnderFinger] = useState<number | null>(null);

  const toGrid = (pageX: number, pageY: number): GesturePoint => ({
    x: pageX - gridOrigin.current.x,
    y: pageY - gridOrigin.current.y,
  });
  const targets = () =>
    rowRects.current
      .map((rect, id) => (rect ? { id, rect } : null))
      .filter((t): t is { id: number; rect: LayoutRectangle } => t !== null);

  const responder = useRef(
    PanResponder.create({
      // Never on touch-down: a tap has to fall through to the row itself.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) =>
        slashingRef.current &&
        !answeredRef.current &&
        (Math.abs(g.dx) > SLASH_SLOP || Math.abs(g.dy) > SLASH_SLOP),
      onPanResponderGrant: (e) => {
        stroke.current = [toGrid(e.nativeEvent.pageX, e.nativeEvent.pageY)];
      },
      onPanResponderMove: (e) => {
        stroke.current.push(toGrid(e.nativeEvent.pageX, e.nativeEvent.pageY));
        setUnderFinger(pickTargetByStroke(stroke.current, targets(), 'slash'));
      },
      onPanResponderRelease: () => {
        const hit = pickTargetByStroke(stroke.current, targets(), 'slash');
        stroke.current = [];
        setUnderFinger(null);
        // Null is a normal outcome: they drew across empty space and have not
        // answered. Let them draw again rather than marking anything.
        if (hit !== null) {
          const choice = choicesRef.current[hit];
          if (choice) answerRef.current(choice.id);
        }
      },
      onPanResponderTerminate: () => {
        stroke.current = [];
        setUnderFinger(null);
      },
    }),
  ).current;

  if (!ask) return null;

  const asked = Math.min(stop.characters.length, LETTER_STOP_LENGTH);
  // First showings only, so the counter never reads "9 / 8" once a letter has
  // been put back in the pile.
  const position = Math.min(asks.current.slice(0, askIndex + 1).filter((a) => !a.requeued).length, asked);

  return (
    <ScrollView
      contentContainerStyle={[styles.run, { paddingBottom: TAB_BAR_CLEARANCE }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.progressRow}>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            testID="letter-progress"
            style={{
              width: `${Math.round((position / asked) * 100)}%`,
              height: '100%',
              borderRadius: 3,
              backgroundColor: colors.primary,
            }}
          />
        </View>
        <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
          {position} / {asked}
        </Text>
      </View>

      <Text style={[styles.prompt, { color: colors.foreground }]}>
        {slashing ? 'Strike through the sound you hear' : 'What sound does this make?'}
      </Text>

      {/* THE SPEAKER IS THE QUESTION. Sized in explicit points rather than a
          percentage and an aspect ratio: an image or a box sized that way in
          this tree can resolve to its intrinsic size on device, which is the
          whole of the blank-board saga of builds 511 to 515. */}
      <PressableScale
        testID="letter-speaker-card"
        accessibilityRole="button"
        accessibilityLabel="Hear the letter again"
        onPress={() => {
          hapticLight();
          void speak(ask.char);
        }}
        style={[
          styles.speaker,
          { backgroundColor: colors.card, borderColor: audioState === 'playing' ? colors.primary : colors.border },
        ]}
      >
        {audioState === 'loading' ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Feather name="volume-2" size={44} color={colors.primary} />
        )}
        <Text style={[styles.speakerHint, { color: colors.mutedForeground }]}>
          {soundOn ? 'Tap to hear it again' : 'Sound is off'}
        </Text>
      </PressableScale>

      {/* THE ANSWER, REVEALED. Once a choice has landed the letter itself comes
          up beside its sound: that pairing is what the stop exists to teach and
          holding it back would be withholding the lesson. */}
      {answered ? (
        <View
          testID="letter-reveal"
          style={[styles.reveal, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.revealChar, nativeProps, { color: colors.foreground }]}>
            {ask.char.char}
          </Text>
          <Text style={[styles.revealLabel, { color: colors.mutedForeground }]}>
            says &ldquo;{ask.char.label}&rdquo;
          </Text>
        </View>
      ) : null}

      <View
        ref={gridRef}
        style={styles.grid}
        onLayout={() =>
          gridRef.current?.measureInWindow((x, y) => {
            gridOrigin.current = { x, y };
          })
        }
        {...responder.panHandlers}
      >
        {choices.map((choice, idx) => {
          const isAnswer = answered && choice.id === ask.char.id;
          const isWrongPick = answered && choice.id === picked && picked !== ask.char.id;
          const struck = !answered && underFinger === idx;
          return (
            <PressableScale
              key={choice.id}
              testID={`letter-choice-${idx}`}
              accessibilityRole="button"
              accessibilityLabel={choice.label}
              onPress={() => answer(choice.id)}
              onLayout={(e) => {
                rowRects.current[idx] = e.nativeEvent.layout;
              }}
              disabled={answered}
              style={[
                styles.choice,
                {
                  backgroundColor: colors.card,
                  // STATE IS NEVER IN HUE ALONE. The border thickens on the
                  // right answer and on the row under a finger, and a tick or
                  // a cross rides on the end, so the card reads the same to a
                  // learner who cannot separate the green from the red.
                  borderColor: isAnswer
                    ? '#10B981'
                    : isWrongPick
                      ? '#EF4444'
                      : struck
                        ? colors.primary
                        : colors.border,
                  borderWidth: isAnswer || isWrongPick || struck ? 3 : 1.5,
                },
              ]}
            >
              <Text style={[styles.choiceLabel, { color: colors.foreground }]}>
                {choice.label}
              </Text>
              {isAnswer ? <Feather name="check" size={18} color="#10B981" /> : null}
              {isWrongPick ? <Feather name="x" size={18} color="#EF4444" /> : null}
            </PressableScale>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── The screen ───────────────────────────────────────────────────────────────

export default function LetterStopScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPlus, isLoading } = useEntitlements();
  const { activeLang, activeLanguage } = useLanguage();
  const { soundOn, toggle } = useGameAudio();
  // The letters this learner has already traced and passed, which is what
  // raises a question from three choices to four. Same hook the journey map
  // reads for the tracing row's own progress, so there is one fetch and one
  // idea of what "met" means.
  const { passedCharacterIds } = useTraceStopProgress(activeLang);
  const params = useLocalSearchParams<{ journey?: string; zone?: string }>();
  const [result, setResult] = useState<{ correct: number; total: number } | null>(null);
  const [runKey, setRunKey] = useState(0);

  const stop = useMemo(() => {
    const zone = Number(params.zone);
    if (!Number.isInteger(zone) || zone < 1) return null;
    // Journey defaults to 1 so an older link still resolves, matching the
    // tracing screen beside it.
    const journeyRaw = Number(params.journey ?? '1');
    const journey = Number.isInteger(journeyRaw) && journeyRaw > 0 ? journeyRaw : 1;
    return letterStopFor(activeLang, journey, zone);
  }, [params.journey, params.zone, activeLang]);

  // THE FREE TASTE: journey 1 zone 1, in every language, exactly as tracing at
  // stop 2 and the story at stop 3 already are. The server route derives the
  // same condition inline rather than through a shared helper, on purpose, so
  // neither side learns a new rule.
  const tasting = !isPlus && stop !== null && stop.journey === 1 && stop.zone === 1;

  useEffect(() => {
    if (!isLoading && !isPlus && !tasting) router.replace('/(app)/paywall');
  }, [isLoading, isPlus, tasting, router]);

  const leave = useCallback(() => router.replace('/(app)/journey'), [router]);

  const finish = useCallback(
    (correct: number, total: number) => {
      setResult({ correct, total });
      if (!stop) return;
      // Best effort, exactly as the tracing screen records its own progress:
      // the run is over and the learner is looking at their score, so a network
      // failure must not take the screen with it.
      completeLetterStop({
        lang: activeLang,
        journey: stop.journey,
        zone: stop.zone,
        correct,
        total,
      })
        .then(() => {
          queryClient.invalidateQueries({
            queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }),
          });
        })
        .catch(() => {});
    },
    [stop, activeLang, queryClient],
  );

  // While entitlements load there is nothing safe to draw: the effect above
  // redirects a learner who may not be here once it settles.
  if (!isPlus && !isLoading && !tasting) return null;

  if (!stop) {
    return (
      <Screen padTop={false}>
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            No letters here yet
          </Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            This zone has no letter stop in {activeLanguage?.name ?? 'this language'}.
          </Text>
          <ChunkyButton title="Back to journey" onPress={leave} />
        </View>
      </Screen>
    );
  }

  const passMark = Math.min(LETTER_STOP_PASS, Math.min(stop.characters.length, LETTER_STOP_LENGTH));
  const passed = result !== null && result.correct >= passMark;

  return (
    <Screen padTop={false}>
      <View style={styles.header}>
        <Pressable
          testID="game-exit-btn"
          onPress={() => {
            if (result) leave();
            else confirmDiscardRun(leave);
          }}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to the journey map"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{stop.title}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {tasting
              ? `Free taste · ${Math.min(stop.characters.length, LETTER_STOP_LENGTH)} letters`
              : `Zone ${stop.zone} · ${Math.min(stop.characters.length, LETTER_STOP_LENGTH)} letters`}
          </Text>
        </View>
        <GameMuteButton soundOn={soundOn} onToggle={toggle} />
      </View>

      {result ? (
        <View style={styles.center} testID="letter-stop-done">
          <Feather
            name={passed ? 'award' : 'refresh-cw'}
            size={44}
            color={passed ? colors.primary : colors.mutedForeground}
          />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {result.correct} of {result.total}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            {passed
              ? 'You can read these letters now. That is the half tracing never taught.'
              : `${passMark} of ${result.total} clears this stop. The letters stay, so another run is all it takes.`}
          </Text>
          <ChunkyButton
            title={passed ? 'Back to journey' : 'Try again'}
            onPress={() => {
              if (passed) {
                leave();
                return;
              }
              setResult(null);
              setRunKey((k) => k + 1);
            }}
          />
          {passed ? null : (
            <Pressable onPress={leave} style={styles.textBtn}>
              <Text style={[styles.textBtnLabel, { color: colors.mutedForeground }]}>
                Back to journey
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <LetterRun
          key={runKey}
          stop={stop}
          soundOn={soundOn}
          metBefore={passedCharacterIds}
          onEnd={finish}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: AppFonts.bold, fontSize: 18 },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 1 },
  run: { paddingHorizontal: 20, gap: 16 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressLabel: { fontFamily: AppFonts.semibold, fontSize: 12, width: 44, textAlign: 'right' },
  prompt: { fontFamily: AppFonts.bold, fontSize: 17, textAlign: 'center' },
  speaker: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 132,
    borderRadius: 20,
    borderWidth: 2,
  },
  speakerHint: { fontFamily: AppFonts.regular, fontSize: 12 },
  reveal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  revealChar: { fontFamily: 'serif', fontSize: 40, lineHeight: 50 },
  revealLabel: { fontFamily: AppFonts.semibold, fontSize: 15 },
  grid: { gap: 10 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  choiceLabel: { fontFamily: AppFonts.bold, fontSize: 20 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 32,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  emptyTitle: { fontFamily: AppFonts.extrabold, fontSize: 24, textAlign: 'center' },
  emptyBody: { fontFamily: AppFonts.regular, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  textBtn: { paddingVertical: 8 },
  textBtnLabel: { fontFamily: AppFonts.regular, fontSize: 14 },
});
