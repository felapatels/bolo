/**
 * MATCH THE LETTER TO ITS SOUND.
 *
 * The letter stop at position 4 hides the letter and tests the EAR. This shows
 * the letter and tests the EYE, which is the direction a learner actually needs
 * standing in front of a signboard. Same alphabet, same clips, opposite
 * question.
 *
 * TAPPING A LETTER TO HEAR IT IS FREE AND UNLIMITED, and that is the whole
 * teaching moment rather than a convenience. A learner who taps all six before
 * answering has just done a listening lesson and must not be punished for it.
 *
 * A MATCH GREYS ITS ROWS AND LEAVES THEM WHERE THEY ARE. Every match game that
 * collapses its list trains the learner to answer by POSITION rather than by
 * reading, and hands them the last pair for nothing. Rows never reflow here,
 * which also means nothing moves under a thumb already travelling.
 *
 * WHAT THIS SCREEN DOES NOT DECIDE: how many pairs, how many boards, which
 * letters are on them and the order of the two columns all come from
 * letter-match.ts in @workspace/script-trace, so the web twin cannot drift from
 * it and neither client is the authority. This file owns the taps and the
 * noise.
 *
 * NO REANIMATED AND NO NATIVE DRIVER. The native animation driver is dead in
 * this app's release builds, so the miss is said in a border, a weight and an
 * icon rather than a shake, which is also what a colour-blind learner needs:
 * state is never in hue alone.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  completeLetterMatch,
  getGetProgressSummaryQueryKey,
  useSynthesizeSpeech,
} from '@workspace/api-client-react';
import {
  MATCH_BOARD_PAIRS,
  SCRIPT_BY_LANGUAGE,
  isLetterMatch,
  letterMatchBoards,
  lettersMetBy,
  type LetterMatchBoard,
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
import { hapticLight, hapticMedium } from '@/lib/haptics';

/** How long a wrong pair stays marked before the board clears it. */
const MISS_MS = 700;

type Marked = { letterId: string; sound: string; right: boolean };

export default function LetterMatchScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPlus, isLoading } = useEntitlements();
  const { activeLang, activeLanguage } = useLanguage();
  const nativeProps = nativeTextStyle(activeLanguage);
  const { soundOn, toggle } = useGameAudio();
  const synthesize = useSynthesizeSpeech();

  // THE WIDEST QUESTION THE LADDER CAN ANSWER. The hub is not scoped to a zone,
  // so the pool is every letter met on journey 1, which is what makes this
  // revision rather than a cold test. Same call the server runs before it will
  // record a game.
  const boards = useMemo(
    () => letterMatchBoards(lettersMetBy(activeLang, 1, Number.MAX_SAFE_INTEGER)),
    [activeLang],
  );

  const [round, setRound] = useState(0);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<TraceStopCharacter | null>(null);
  const [mark, setMark] = useState<Marked | null>(null);
  const [tries, setTries] = useState(0);
  const [firstTry, setFirstTry] = useState(0);
  const [done, setDone] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // Which pairs have already been missed once, so a pair got right on the
  // second go does not score as a first-try match.
  const missedOnce = useRef(new Set<string>());
  const playback = useRef<PlaybackHandle | null>(null);
  const audioCache = useRef(new Map<string, { audioBase64: string; format: string }>());
  const missTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const board: LetterMatchBoard | undefined = boards[round];

  // THE STOPWATCH COUNTS UP AND IS SHOWN, NEVER ENFORCED. A countdown turns a
  // reading exercise into a panic; a stopwatch gives a returning learner
  // something to beat.
  useEffect(() => {
    if (done) return;
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [done]);

  useEffect(
    () => () => {
      playback.current?.stop();
      if (missTimer.current) clearTimeout(missTimer.current);
    },
    [],
  );

  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const speak = useCallback(
    async (char: TraceStopCharacter) => {
      if (!soundOnRef.current) return;
      playback.current?.stop();
      playback.current = null;
      try {
        // Keyed on the SCRIPT and the letter, never the language: Devanagari
        // serves nine languages and क sounds the same in all of them. The
        // server's own tts_cache still keys on the language name, which is
        // owed work and is why this cache is only per session.
        const key = `${char.chapterId}:${char.char}`;
        const cached = audioCache.current.get(key);
        const res =
          cached ??
          (await synthesize.mutateAsync({
            data: {
              text: char.char,
              // The SCRIPT, not the language. See the letter stop screen and
              // the `script` field on SpeechInput for why.
              script: SCRIPT_BY_LANGUAGE[activeLang],
              languageName: activeLanguage?.name,
              languageCode: activeLang,
            },
          }));
        audioCache.current.set(key, { audioBase64: res.audioBase64, format: res.format });
        playback.current = await playBase64Audio(res.audioBase64, res.format, () => {});
      } catch {
        /* a silent letter is better than a broken screen */
      }
    },
    [synthesize, activeLanguage, activeLang],
  );

  const finish = useCallback(
    (right: number, total: number) => {
      setDone(true);
      // Best effort, exactly as the tracing screen and the letter stop record
      // theirs: the game is over and the learner is looking at their score, so
      // a network failure must not take the screen with it.
      completeLetterMatch({ lang: activeLang, correct: right, total })
        .then(() => {
          queryClient.invalidateQueries({
            queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }),
          });
        })
        .catch(() => {});
    },
    [activeLang, queryClient],
  );

  const pickLetter = useCallback(
    (char: TraceStopCharacter) => {
      if (matched.has(char.id)) return;
      hapticLight();
      // Tapping a second letter before answering just MOVES the selection and
      // speaks the new one. It is never a wrong answer.
      setPicked(char);
      setMark(null);
      void speak(char);
    },
    [matched, speak],
  );

  const pickSound = useCallback(
    (sound: string) => {
      if (!board || !picked) return;
      if (matched.has(picked.id)) return;
      const right = isLetterMatch(picked, sound);
      hapticMedium();
      setMark({ letterId: picked.id, sound, right });
      setTries((t) => t + 1);
      if (right) {
        // Only a pair got right at the FIRST attempt scores, or a learner who
        // taps every sound in turn clears the board and calls it six from six.
        if (!missedOnce.current.has(picked.id)) setFirstTry((n) => n + 1);
        const next = new Set(matched).add(picked.id);
        setMatched(next);
        setPicked(null);
        if (next.size >= board.letters.length) {
          // Board cleared. The next one, or the scorecard.
          if (round + 1 >= boards.length) {
            finish(
              missedOnce.current.has(picked.id) ? firstTry : firstTry + 1,
              boards.length * MATCH_BOARD_PAIRS,
            );
          } else {
            setRound((r) => r + 1);
            setMatched(new Set());
            setMark(null);
          }
        }
        return;
      }
      // A MISS COSTS NO LIFE AND BREAKS NO STREAK. It says the letter again,
      // which is the one moment the sound and the shape are together, and
      // clears the selection so the next tap starts clean.
      missedOnce.current.add(picked.id);
      void speak(picked);
      if (missTimer.current) clearTimeout(missTimer.current);
      missTimer.current = setTimeout(() => {
        setMark(null);
        setPicked(null);
      }, MISS_MS);
    },
    [board, picked, matched, round, boards.length, firstTry, finish, speak],
  );

  useEffect(() => {
    if (!isLoading && !isPlus) router.replace('/(app)/paywall');
  }, [isLoading, isPlus, router]);

  // While entitlements load there is nothing safe to draw: the effect above
  // redirects a learner who may not be here once it settles.
  if (!isPlus && !isLoading) return null;

  const leave = () => router.replace('/(app)/(tabs)/games');
  const total = boards.length * MATCH_BOARD_PAIRS;

  if (boards.length === 0) {
    return (
      <Screen padTop={false}>
        <View style={styles.center}>
          <Text style={[styles.bigTitle, { color: colors.foreground }]}>
            Not enough letters yet
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Trace a few more on the journey and this game opens up.
          </Text>
          <ChunkyButton title="Back to games" onPress={leave} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <View style={styles.header}>
        <Pressable
          testID="game-exit-btn"
          onPress={() => (done ? leave() : confirmDiscardRun(leave))}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to games"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Letter Match</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {done
              ? `${tries} taps`
              : `Board ${round + 1} of ${boards.length} · ${seconds}s`}
          </Text>
        </View>
        <GameMuteButton soundOn={soundOn} onToggle={toggle} />
      </View>

      {done ? (
        <View style={styles.center} testID="letter-match-done">
          <Feather name="award" size={44} color={colors.primary} />
          <Text style={[styles.bigTitle, { color: colors.foreground }]}>
            {firstTry} of {total}
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            First-try matches, in {seconds} seconds. Tapping a letter to hear it
            always costs nothing, so listen as often as you like.
          </Text>
          <ChunkyButton title="Back to games" onPress={leave} />
        </View>
      ) : board ? (
        <ScrollView
          contentContainerStyle={[styles.body_, { paddingBottom: TAB_BAR_CLEARANCE }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Tap a letter to hear it, then tap its sound.
          </Text>
          <View style={styles.columns}>
            <View style={styles.col}>
              {board.letters.map((c) => {
                const isMatched = matched.has(c.id);
                const isPicked = picked?.id === c.id;
                const isWrong = mark?.letterId === c.id && !mark.right;
                return (
                  <PressableScale
                    key={c.id}
                    testID={`match-letter-${c.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={isMatched ? `${c.label}, matched` : 'Hear this letter'}
                    onPress={() => pickLetter(c)}
                    disabled={isMatched}
                    style={[
                      styles.cell,
                      {
                        backgroundColor: colors.card,
                        // Matched rows GREY IN PLACE and never leave, which is
                        // what stops the last pair being free.
                        opacity: isMatched ? 0.45 : 1,
                        borderColor: isMatched
                          ? colors.border
                          : isWrong
                            ? '#EF4444'
                            : isPicked
                              ? colors.primary
                              : colors.border,
                        borderWidth: isPicked || isWrong ? 3 : 1.5,
                      },
                    ]}
                  >
                    <Text style={[styles.glyph, nativeProps, { color: colors.foreground }]}>
                      {c.char}
                    </Text>
                    {isMatched ? (
                      <Feather name="check" size={14} color={colors.mutedForeground} />
                    ) : null}
                  </PressableScale>
                );
              })}
            </View>
            <View style={styles.col}>
              {board.sounds.map((sound) => {
                const owner = board.letters.find((c) => c.label === sound);
                const isMatched = owner ? matched.has(owner.id) : false;
                const isWrong = mark?.sound === sound && !mark.right;
                const isRight = mark?.sound === sound && mark.right;
                return (
                  <PressableScale
                    key={sound}
                    testID={`match-sound-${sound}`}
                    accessibilityRole="button"
                    accessibilityLabel={sound}
                    onPress={() => pickSound(sound)}
                    disabled={isMatched}
                    style={[
                      styles.cell,
                      {
                        backgroundColor: colors.card,
                        opacity: isMatched ? 0.45 : 1,
                        borderColor: isMatched
                          ? colors.border
                          : isWrong
                            ? '#EF4444'
                            : isRight
                              ? '#10B981'
                              : colors.border,
                        borderWidth: isWrong || isRight ? 3 : 1.5,
                      },
                    ]}
                  >
                    <Text style={[styles.sound, { color: colors.foreground }]}>{sound}</Text>
                    {isMatched ? (
                      <Feather name="check" size={14} color={colors.mutedForeground} />
                    ) : null}
                  </PressableScale>
                );
              })}
            </View>
          </View>
        </ScrollView>
      ) : null}
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
  body_: { paddingHorizontal: 20, gap: 14 },
  hint: { fontFamily: AppFonts.regular, fontSize: 13, textAlign: 'center' },
  columns: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, gap: 10 },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 16,
  },
  glyph: { fontFamily: 'serif', fontSize: 26, lineHeight: 34 },
  sound: { fontFamily: AppFonts.bold, fontSize: 17 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 32,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  bigTitle: { fontFamily: AppFonts.extrabold, fontSize: 24, textAlign: 'center' },
  body: { fontFamily: AppFonts.regular, fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
