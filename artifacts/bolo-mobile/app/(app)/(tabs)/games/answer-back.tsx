// ANSWER BACK. A voice stop, played as a conversation at Chacha-ji's stall.
//
// Owner rulings, 2026-09-14 (the second game in Last Call's slots):
//  1. It REPLACES a voice stop, never adds a row, and takes a converted slot by
//     BEST FIT (owner ruling "c"): Answer Back where the group fields enough
//     exchanges, Last Call otherwise (@workspace/script-trace stop-play.ts).
//     A group that cannot field ANSWER_BACK_MIN_EXCHANGES plays as Last Call,
//     and this screen enforces that too, for a stale map or a deep link.
//  2. Gating, mastery and XP are a voice stop's. Every scored take goes through
//     hooks/useSpeakAndScore.ts, practice's own evaluate then /attempts path,
//     and is scored as THE RIGHT REPLY, whichever card was spoken. So a wrong
//     card is recorded as a weak attempt at the right reply, which is exactly
//     what practice would record for a learner who said the wrong words.
//  3. The keeper SAYS a line (audio only, "Hear again"); three reply cards
//     show native script and romanized, English hidden until the take is
//     scored. Right card and passing band: he beams, next line. Wrong card: he
//     looks puzzled, the right reply plays, one retry. Failing band on the
//     right card: hear it, retry. Nocatch or timeout: re-ask, no penalty.
//  4. Finish is a visual reward only. NO currency and no new server grant. A
//     star for a perfect run, best stars kept on device (lib/answerBackMemory).
//
// WHICH CARD WAS SPOKEN is read from the scorer's own transcript against all
// three cards (answer-back.ts detectChosenCard). There is no second request:
// the one evaluation both scores the right reply and says what was heard.
//
// Web twin: gujarati-coach src/pages/games/answer-back.tsx. The round, the
// content and the card detection are shared in @workspace/script-trace; the
// screens are hand-kept, as last-call.tsx and its twin are.
import React from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ApiError,
  useGetAccount,
  useListLessonGroupPhrases,
  getListLessonGroupPhrasesQueryKey,
  useListReviewPhrases,
  getListReviewPhrasesQueryKey,
  useSynthesizeSpeech,
  type Phrase,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { AiConsentBlockedCard } from '@/components/games/AiConsentBlockedCard';
import { Confetti } from '@/components/Confetti';
import { FunFactLoader } from '@/components/FunFactLoader';
import { LessonError } from '@/components/LessonError';
import { UpgradeRequiredScreen } from '@/components/UpgradeRequiredScreen';
import { FlashbackLightbox } from '@/components/FlashbackLightbox';
import { SpeechSpeedPill } from '@/components/SpeechSpeedPill';
import { GameMuteButton, useGameAudio } from '@/components/GameMuteButton';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { appearPlain } from '@/lib/entrance';
import { asUpgradeRequired, paywallHrefForDenial } from '@/lib/entitlements';
import { meteringToAmplitude, playBase64Audio, type PlaybackHandle } from '@/lib/audio';
import { Waveform } from '@/components/Waveform';
import { hapticLight, hapticMedium, hapticNotify } from '@/lib/haptics';
import { playCue } from '@/lib/sound';
import { confirmDiscardRun } from '@/lib/gameExit';
import { isPassingBand } from '@/lib/ui';
import { useSpeakAndScore } from '@/hooks/useSpeakAndScore';
import {
  ANSWER_BACK_MIN_EXCHANGES,
  answerBackExchangesFor,
  answerBackReducer,
  answerBackStars,
  answerBackTakeOutcome,
  detectChosenCard,
  initAnswerBack,
  pickAnswerBackRound,
  type AnswerBackExchange,
  type AnswerBackState,
} from '@workspace/script-trace';
import { saveAnswerBackStars } from '@/lib/answerBackMemory';

/**
 * The elder himself: the same delivered figure the map's stall and the stall
 * vignette draw (components/ChaiStall.tsx, components/journey/Scenery.tsx).
 * 386x520. Sized in explicit points, never width:'100%' + aspectRatio
 * (CLAUDE.md, render trap 1).
 */
const KEEPER_ART = require('@/assets/images/stall/chachaji.png') as number;
const KEEPER_W = 104;
const KEEPER_H = Math.round((KEEPER_W * 520) / 386);

/** A release this soon after recording started is a TAP (Last Call's rule). */
const TAP_MS = 350;
/** Feedback beats. TUNING PENDING, nobody has played this yet. */
const BEAM_BEAT_MS = 1_100;
const NOCATCH_BEAT_MS = 1_400;
const MISS_BEAT_MS = 1_800;

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export default function AnswerBackScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{ group?: string; cat?: string; stop?: string }>();
  const groupId = Number(params.group);
  const categoryId = Number(params.cat);
  const { activeLang, speechCapability } = useLanguage();
  const validGroup = Number.isFinite(groupId) && groupId > 0;

  const phrasesQuery = useListLessonGroupPhrases(validGroup ? groupId : 0, {
    query: {
      enabled: validGroup,
      queryKey: getListLessonGroupPhrasesQueryKey(validGroup ? groupId : 0),
    },
  });
  const list = phrasesQuery.data;
  const exchanges = React.useMemo(() => answerBackExchangesFor(list ?? []), [list]);
  // Back to the journey already in the history, not a new one: Last Call's
  // reason (2026-09-14), the old splash replaying and Home gone from under it.
  const leave = React.useCallback(() => router.dismissTo('/(app)/journey'), [router]);
  const [runKey, setRunKey] = React.useState(0);

  if (!validGroup) return <Redirect href="/(app)/journey" />;
  // Unsupported languages never convert (stop-play.ts); a later tap-only game
  // covers them. Their voice stop is a compare stop only practice can play.
  if (speechCapability === 'unsupported') {
    return (
      <Redirect
        href={{ pathname: '/(app)/practice/[id]', params: { id: String(categoryId), group: String(groupId) } }}
      />
    );
  }
  if (phrasesQuery.isLoading) {
    return (
      <Screen padTop={false}>
        <FunFactLoader color={colors.primary} style={{ marginTop: 80 }} />
      </Screen>
    );
  }
  // The same three expected refusals practice and Last Call handle, in order.
  const upgrade = asUpgradeRequired(phrasesQuery.error);
  if (upgrade) {
    return (
      <UpgradeRequiredScreen
        title="Unlock this stop"
        message={upgrade.message}
        onUpgrade={() => router.push(paywallHrefForDenial(upgrade, activeLang))}
        onBack={leave}
      />
    );
  }
  const groupLocked =
    phrasesQuery.error instanceof ApiError &&
    phrasesQuery.error.status === 403 &&
    (phrasesQuery.error.data as { error?: string } | null)?.error === 'lesson_group_locked';
  if (groupLocked) {
    return (
      <Screen padTop={false}>
        <View style={styles.center}>
          <Feather name="lock" size={28} color={colors.mutedForeground} />
          <Text style={[styles.title, { color: colors.foreground }]}>This stop is still locked</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Finish the stop before it to sit at this stall. The line runs station by station.
          </Text>
          <ChunkyButton title="Back to the map" onPress={leave} style={{ marginTop: 16 }} />
        </View>
      </Screen>
    );
  }
  if (phrasesQuery.isError) {
    return (
      <LessonError onRetry={() => phrasesQuery.refetch()} isRetrying={phrasesQuery.isFetching} onBack={leave} />
    );
  }
  if (!list || list.length === 0) return <Redirect href="/(app)/journey" />;
  // THE FALLBACK, HELD HERE TOO. The map only knows a group's content once it
  // has fetched it, so a stale map or a deep link can land here on a group
  // with too few exchanges. It plays as Last Call, the owner's ruling.
  if (exchanges.length < ANSWER_BACK_MIN_EXCHANGES) {
    return (
      <Redirect
        href={{
          // Cast for the reason journey.tsx gives: the typed-routes file is
          // generated by Metro and gitignored.
          pathname: '/(app)/(tabs)/games/last-call' as never,
          params: { group: String(groupId), cat: String(categoryId), ...(params.stop ? { stop: params.stop } : {}) },
        }}
      />
    );
  }

  return (
    <AnswerBackRound
      // Keyed so a second visit, or Play again, starts a clean round with a
      // fresh pick and fresh card order (screens outlive the mental model).
      key={`${groupId}:${runKey}`}
      exchanges={exchanges}
      groupId={groupId}
      categoryId={categoryId}
      stopLabel={params.stop}
      onLeave={leave}
      onPlayAgain={() => setRunKey((k) => k + 1)}
    />
  );
}

function AnswerBackRound({
  exchanges,
  groupId,
  categoryId,
  stopLabel,
  onLeave,
  onPlayAgain,
}: {
  exchanges: AnswerBackExchange<Phrase>[];
  groupId: number;
  categoryId: number;
  stopLabel?: string;
  onLeave: () => void;
  onPlayAgain: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { activeLang, activeLanguage } = useLanguage();
  const nativeProps = nativeTextStyle(activeLanguage, { bold: true });
  const { soundOn, toggle: toggleSound } = useGameAudio();

  // Picked once per mount: the round and each line's card order. A card that
  // moved between a miss and its retry would read as a different question.
  const [round] = React.useState(() => pickAnswerBackRound(exchanges, shuffle));
  const [cardOrder] = React.useState(() =>
    round.map((e) => shuffle([e.replyPhrase, ...e.distractors])),
  );

  const [state, dispatch] = React.useReducer(answerBackReducer, round.length, initAnswerBack);
  const stateRef = React.useRef<AnswerBackState>(state);
  stateRef.current = state;
  const exchange = round[state.index];
  const cards = cardOrder[state.index] ?? [];

  // ── Audio: the same synthesize and per-voice cache Last Call and practice use ─
  const synth = useSynthesizeSpeech();
  const account = useGetAccount();
  const ttsVoice = account.data?.preferences.learning.ttsVoice ?? 'auto';
  const audioCache = React.useRef(new Map<string, { audioBase64: string; format: string }>());
  const playbackRef = React.useRef<PlaybackHandle | null>(null);
  const playTokenRef = React.useRef(0);
  const aliveRef = React.useRef(true);
  const soundOnRef = React.useRef(soundOn);
  soundOnRef.current = soundOn;
  const [audioPlaying, setAudioPlaying] = React.useState(false);

  const stopPlayback = React.useCallback(() => {
    playTokenRef.current += 1;
    playbackRef.current?.stop();
    playbackRef.current = null;
    setAudioPlaying(false);
  }, []);

  /**
   * Last Call's playPhrase, plus WHO speaks: resolves when done, failed or stopped.
   *
   * THE KEEPER'S LINE IS THE ELDER'S VOICE (owner ruling 2026-09-15, option A,
   * under the 2026-09-13 voice roles rule: the bird is the coach, the elder is
   * always different). Every place Chacha-ji speaks passes 'elder': the opening
   * line, each re-ask and "Hear again". The learner's right reply after a miss
   * stays 'coach', the model answer in the voice practice uses. Both requests
   * carry languageCode (2026-09-15): the coach's used to omit it, so an
   * ElevenLabs server picked the default Hindi voice with no language hint for
   * every learner; the elder's needs it to pick his voice.
   * The speaker is in the local cache key because one phrase can be his line in
   * one exchange and the learner's reply in another.
   */
  const playPhrase = React.useCallback(
    (phrase: Phrase, speaker: 'coach' | 'elder'): Promise<void> =>
      new Promise((resolve) => {
        if (!soundOnRef.current) {
          resolve();
          return;
        }
        stopPlayback();
        const token = playTokenRef.current;
        void (async () => {
          try {
            // The learner's saved voice re-voices the coach only; the elder is one man.
            const key = speaker === 'elder' ? `${phrase.id}:elder` : `${phrase.id}:${ttsVoice}`;
            const res =
              audioCache.current.get(key) ??
              (await synth.mutateAsync({
                data:
                  speaker === 'elder'
                    ? { text: phrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang, speaker: 'elder' }
                    : { text: phrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang },
              }));
            audioCache.current.set(key, { audioBase64: res.audioBase64, format: res.format || 'mp3' });
            if (token !== playTokenRef.current || !aliveRef.current) return resolve();
            setAudioPlaying(true);
            const handle = await playBase64Audio(res.audioBase64, res.format || 'mp3', () => {
              if (token === playTokenRef.current) setAudioPlaying(false);
              resolve();
            });
            // A player that arrives after its screen died still plays (owner,
            // 2026-09-12). Same guard as practice's playGuarded.
            if (!aliveRef.current || token !== playTokenRef.current) {
              handle.stop();
              resolve();
              return;
            }
            playbackRef.current = handle;
          } catch {
            if (token === playTokenRef.current) setAudioPlaying(false);
            resolve();
          }
        })();
      }),
    [activeLang, activeLanguage?.name, stopPlayback, synth, ttsVoice],
  );

  // ── Recorder, scorer and the attempts path ──────────────────────────────
  const finishTakeRef = React.useRef<() => void>(() => undefined);
  const speak = useSpeakAndScore({
    lessonGroupId: groupId,
    categoryId,
    languageCode: activeLang,
    languageName: activeLanguage?.name,
    onSilence: () => finishTakeRef.current(),
  });
  const { prepare: speakPrepare, start: speakStart, stopAndScore, cancel: speakCancel, permissionDenied } = speak;

  // THE VOICE BARS, Last Call's wiring (owner, 2026-09-14: "add a voice
  // visualizer to that game so you know that your voice is getting
  // recognized"); both games share the recorder hook and the mic control, so
  // both get the bars. Practice's Waveform and its 1.5s can't-hear-you rule.
  const liveAmp = useSharedValue(0);
  const [ampLevel, setAmpLevel] = React.useState(0);
  const [noInput, setNoInput] = React.useState(false);
  const lastLoudAtRef = React.useRef(0);
  React.useEffect(() => {
    if (!speak.recording) {
      liveAmp.value = withTiming(0, { duration: 120 });
      setAmpLevel(0);
      setNoInput(false);
      lastLoudAtRef.current = 0;
      return;
    }
    if (typeof speak.metering !== 'number') return;
    const amp = meteringToAmplitude(speak.metering);
    liveAmp.value = withTiming(amp, { duration: 80 });
    if (reduceMotion) setAmpLevel(Math.round(amp * 5) / 5);
    const now = Date.now();
    if (lastLoudAtRef.current === 0) lastLoudAtRef.current = now;
    if (amp > 0.08) lastLoudAtRef.current = now;
    setNoInput(now - lastLoudAtRef.current > 1500);
    // Shared values are stable refs; the reading and the flag are the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak.recording, speak.metering, reduceMotion]);

  React.useEffect(
    () => () => {
      aliveRef.current = false;
      playbackRef.current?.stop();
      playbackRef.current = null;
      void speakCancel();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  React.useEffect(() => {
    if (state.status === 'asking') void speakPrepare();
  }, [state.status, speakPrepare]);

  // ── The keeper says the line: on every new line and every re-ask ─────────
  React.useEffect(() => {
    if (state.status !== 'asking' || !exchange) return;
    void playPhrase(exchange.promptPhrase, 'elder');
    // askSeq is the trigger; a speak_cancel returns to asking without a new
    // askSeq, so the keeper does not repeat himself over a failed recorder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.askSeq]);

  // ── A take: stop, score as the right reply, read which card was spoken ───
  const finishingRef = React.useRef(false);
  const recordStartedAtRef = React.useRef(0);
  const [banner, setBanner] = React.useState<string | null>(null);
  // A standing no to AI permission stops the round here (AiConsentBlockedCard).
  const [consentBlocked, setConsentBlocked] = React.useState(false);
  const [chosenId, setChosenId] = React.useState<number | null>(null);

  const finishTake = React.useCallback(async () => {
    if (finishingRef.current) return;
    const s = stateRef.current;
    if (s.status !== 'speaking') return;
    const ex = round[s.index];
    const shown = cardOrder[s.index];
    if (!ex || !shown) return;
    finishingRef.current = true;
    dispatch({ type: 'score_start' });
    try {
      const outcome = await stopAndScore(ex.replyPhrase);
      if (!aliveRef.current) return;
      if (outcome.kind === 'consent_required') {
        // Re-asking cannot succeed until the learner changes their answer, and
        // it used to loop forever. The round stays paused under the card.
        setConsentBlocked(true);
        return;
      }
      if (outcome.kind !== 'scored') {
        setBanner(
          outcome.kind === 'timeout'
            ? 'That took too long to check. Chacha-ji will ask again.'
            : 'Checking hit a snag. Chacha-ji will ask again.',
        );
        setChosenId(null);
        dispatch({ type: 'scoring_timeout' });
        return;
      }
      // Practice's idea of passing, unchanged: lib/ui isPassingBand.
      const band = outcome.band === 'nocatch' ? 'nocatch' : isPassingBand(outcome.band) ? 'pass' : 'fail';
      const { chosen } = detectChosenCard(outcome, shown);
      setChosenId(chosen?.id ?? null);
      setBanner(outcome.attemptSaved ? null : 'Scored, but your progress did not save. Check your connection.');
      dispatch({
        type: 'scored',
        outcome: answerBackTakeOutcome({ band, chosenId: chosen?.id ?? null, rightId: ex.replyPhrase.id }),
      });
    } finally {
      finishingRef.current = false;
    }
  }, [round, cardOrder, stopAndScore]);
  finishTakeRef.current = () => void finishTake();

  const onPressIn = React.useCallback(async () => {
    const s = stateRef.current;
    if (s.status === 'speaking') {
      void finishTake();
      return;
    }
    if (s.status !== 'asking') return;
    stopPlayback();
    dispatch({ type: 'speak' });
    const ok = await speakStart();
    if (!ok) {
      dispatch({ type: 'speak_cancel' });
      Alert.alert(
        permissionDenied() ? 'Microphone needed' : 'Recording failed',
        permissionDenied()
          ? 'Please allow microphone access to play Answer Back.'
          : 'Could not start recording. Try again.',
      );
      return;
    }
    recordStartedAtRef.current = Date.now();
    hapticMedium();
  }, [finishTake, speakStart, permissionDenied, stopPlayback]);

  const onPressOut = React.useCallback(() => {
    if (stateRef.current.status !== 'speaking' || !speak.recording) return;
    if (Date.now() - recordStartedAtRef.current >= TAP_MS) void finishTake();
  }, [finishTake, speak.recording]);

  // ── Feedback beats ───────────────────────────────────────────────────────
  React.useEffect(() => {
    if (state.status !== 'feedback') return;
    const last = state.last;
    const ex = last ? round[last.exchangeIndex] : undefined;
    if (!last || !ex) return;
    let cancelled = false;
    const beat = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      if (last.outcome === 'pass') {
        hapticNotify(Haptics.NotificationFeedbackType.Success);
        playCue('correct');
        await beat(BEAM_BEAT_MS);
      } else if (last.outcome === 'wrong_card' || last.outcome === 'fail') {
        hapticNotify(Haptics.NotificationFeedbackType.Warning);
        playCue('wrong');
        const started = Date.now();
        // Hear the right reply before trying again (or before the next line).
        await playPhrase(ex.replyPhrase, 'coach');
        await beat(Math.max(400, MISS_BEAT_MS - (Date.now() - started)));
      } else {
        // nocatch or a scoring timeout: a system miss, no warning haptic and
        // no wrong cue (Spec 1 rule 16, as practice and Last Call).
        await beat(NOCATCH_BEAT_MS);
      }
      if (!cancelled && stateRef.current.status === 'feedback') {
        setBanner(null);
        setChosenId(null);
        dispatch({ type: 'continue' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Keyed on the outcome object itself: each take produces a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.last]);

  // ── End: the star, kept on the device ────────────────────────────────────
  const stars = answerBackStars(state);
  const [best, setBest] = React.useState<{ best: number; isNewBest: boolean } | null>(null);
  React.useEffect(() => {
    if (state.status !== 'over') return;
    let alive = true;
    void saveAnswerBackStars(activeLang, groupId, stars).then((r) => {
      if (alive) setBest(r);
    });
    return () => {
      alive = false;
    };
  }, [state.status, stars, activeLang, groupId]);

  // The same exit Last Call takes from a finished journey stop.
  const flashbackDue = useListReviewPhrases(
    { lang: activeLang, limit: 3 },
    { query: { enabled: !!activeLang, queryKey: getListReviewPhrasesQueryKey({ lang: activeLang, limit: 3 }) } },
  );
  const [flashbackOpen, setFlashbackOpen] = React.useState(false);
  const leaveFinished = () => {
    const due = flashbackDue.data;
    if (Array.isArray(due) && due.length > 0) setFlashbackOpen(true);
    else if (Array.isArray(due)) onLeave();
    else router.replace({ pathname: '/(app)/review', params: { flashback: '1' } } as Parameters<typeof router.replace>[0]);
  };

  const handleExit = () => {
    hapticLight();
    if (state.status === 'over') {
      onLeave();
      return;
    }
    // Attempts already scored stay saved; leaving loses this round's star.
    confirmDiscardRun(() => {
      void speakCancel();
      stopPlayback();
      onLeave();
    });
  };

  const playAgain = () => {
    hapticLight();
    stopPlayback();
    onPlayAgain();
  };

  const inFeedback = state.status === 'feedback' && state.last !== null;
  const outcome = state.last?.outcome;
  // The keeper's face, in WORDS as well as the emoji: a learner who cannot
  // read an expression still reads "beams" and "puzzled" (colour-blind rule).
  const mood =
    inFeedback && outcome === 'pass'
      ? { emoji: '😊', words: 'Chacha-ji beams.' }
      : inFeedback && outcome === 'wrong_card'
        ? {
            emoji: '🤔',
            words: state.last?.advance
              ? 'Chacha-ji looks puzzled. This was the reply. On to his next line.'
              : 'Chacha-ji looks puzzled. Listen to the right reply, then try again.',
          }
        : inFeedback && outcome === 'fail'
          ? {
              emoji: '👂',
              words: state.last?.advance
                ? 'Nearly. Listen to how it goes. On to his next line.'
                : 'Nearly. Listen, then say it again.',
            }
          : inFeedback
            ? { emoji: '🙂', words: "He didn't catch that. He'll ask again." }
            : null;

  return (
    <Screen padTop={false}>
      <View style={styles.header}>
        <Pressable
          onPress={handleExit}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="answer-back-exit"
          hitSlop={8}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Answer Back</Text>
          {stopLabel ? <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{stopLabel}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {/* Speaking speed beside the mute (owner, 2026-09-17: wherever the coach speaks). */}
          <SpeechSpeedPill variant="stacked" testID="game-speed-pill" />
          <GameMuteButton soundOn={soundOn} onToggle={toggleSound} active={audioPlaying} />
        </View>
      </View>

      {state.status === 'over' ? (
        <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.endWrap}>
          <Image
            source={KEEPER_ART}
            style={{ width: KEEPER_W * 1.2, height: KEEPER_H * 1.2 }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          <Text style={[styles.title, { color: colors.foreground }]} testID="answer-back-result">
            {stars > 0
              ? 'Perfect conversation!'
              : `${state.answered} of ${state.exchangeCount} ${state.exchangeCount === 1 ? 'reply' : 'replies'} landed`}
          </Text>
          <Text
            style={[styles.stars, { color: stars > 0 ? colors.primary : colors.mutedForeground }]}
            accessibilityLabel={stars > 0 ? 'One star, for a perfect run' : 'No star this time'}
            testID="answer-back-stars"
          >
            {stars > 0 ? '★ 1 star' : '☆ No star this time'}
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            {stars > 0
              ? 'Every reply right first time. Chacha-ji pours you a proper cup.'
              : `First time right: ${state.firstTry} of ${state.exchangeCount}. Get them all for the star.`}
          </Text>
          {best ? (
            <Text
              style={[styles.body, { color: best.isNewBest ? colors.primary : colors.mutedForeground }]}
              testID="answer-back-best"
            >
              {best.isNewBest ? 'New best: 1 star' : best.best > 0 ? 'Best: 1 star' : 'Best: no star yet'}
            </Text>
          ) : null}
          {banner ? <Text style={[styles.hint, { color: colors.destructive }]}>{banner}</Text> : null}
          <ChunkyButton title="On to the next stop" icon="arrow-right" onPress={leaveFinished} style={{ alignSelf: 'stretch', marginTop: 24 }} />
          <ChunkyButton title="Play again" variant="secondary" icon="refresh-cw" onPress={playAgain} style={{ alignSelf: 'stretch', marginTop: 12 }} />
          <FlashbackLightbox
            visible={flashbackOpen}
            onEnter={() => {
              setFlashbackOpen(false);
              router.replace({ pathname: '/(app)/review', params: { flashback: '1' } } as Parameters<typeof router.replace>[0]);
            }}
            onSkip={() => {
              setFlashbackOpen(false);
              onLeave();
            }}
          />
        </ScrollView>
        {/* THE REWARD MOMENT IS VISUAL ONLY (owner brief): no Chai, no grant.
            Confetti only for a perfect run, never under Reduce Motion, and a
            sibling over the scroll rather than inside it so it spans the
            screen. It sets pointerEvents none on its pieces. */}
        {stars > 0 && !reduceMotion ? <Confetti variant="perfect" pace="burst" /> : null}
        </View>
      ) : exchange ? (
        <ScrollView contentContainerStyle={styles.fill}>
          <Text style={[styles.statusText, { color: colors.mutedForeground }]} testID="answer-back-progress">
            {`Line ${state.index + 1} of ${state.exchangeCount}${state.tries > 0 && !inFeedback ? ' · second try' : ''}`}
          </Text>

          <View style={styles.keeperRow}>
            <Image
              source={KEEPER_ART}
              style={{ width: KEEPER_W, height: KEEPER_H }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessible={false}
            />
            <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {mood ? (
                <Animated.View key={`mood-${state.last?.exchangeIndex}-${state.tries}-${outcome}`} entering={reduceMotion ? undefined : appearPlain()}>
                  <Text style={styles.moodEmoji} accessible={false}>
                    {mood.emoji}
                  </Text>
                  <Text style={[styles.bubbleText, { color: colors.foreground }]} testID="answer-back-mood">
                    {mood.words}
                  </Text>
                </Animated.View>
              ) : (
                <>
                  {/* AUDIO ONLY: the keeper's line is never written (owner brief). */}
                  <Text style={[styles.bubbleText, { color: colors.foreground }]}>
                    {audioPlaying ? 'Chacha-ji is speaking...' : 'Chacha-ji said something. Answer him!'}
                  </Text>
                  <Pressable
                    onPress={() => {
                      hapticLight();
                      void playPhrase(exchange.promptPhrase, 'elder');
                    }}
                    disabled={!soundOn || state.status !== 'asking'}
                    accessibilityRole="button"
                    accessibilityLabel="Hear Chacha-ji again"
                    testID="answer-back-hear-again"
                    style={[styles.hearBtn, { borderColor: colors.border, opacity: soundOn && state.status === 'asking' ? 1 : 0.5 }]}
                  >
                    <Feather name="volume-2" size={16} color={colors.foreground} />
                    <Text style={[styles.hearText, { color: colors.foreground }]}>
                      {soundOn ? 'Hear again' : 'Sound is off'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>

          <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 14 }]}>Say ONE of these out loud</Text>
          {cards.map((card, i) => {
            const isRight = card.id === exchange.replyPhrase.id;
            const isChosen = card.id === chosenId;
            // Revealed only once a take is scored, and only for a real answer:
            // a nocatch re-ask keeps the meanings hidden.
            const reveal = inFeedback && (outcome === 'pass' || outcome === 'wrong_card' || outcome === 'fail');
            const tag = reveal && isRight ? 'Right reply' : reveal && isChosen ? 'You said this' : null;
            return (
              <View
                key={card.id}
                testID={`answer-back-card-${i}`}
                accessibilityLabel={`${card.romanized}${reveal ? `, ${card.english}` : ''}${tag ? `, ${tag}` : ''}`}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: tag === 'Right reply' ? colors.success : tag ? colors.destructive : colors.border,
                    borderWidth: tag ? 2 : 1,
                  },
                ]}
              >
                <Text style={[styles.native, nativeProps, { color: colors.foreground }]}>{card.nativeScript}</Text>
                <Text style={[styles.roman, { color: colors.mutedForeground }]}>{card.romanized}</Text>
                {reveal ? <Text style={[styles.english, { color: colors.foreground }]}>{card.english}</Text> : null}
                {tag ? (
                  <Text style={[styles.tag, { color: tag === 'Right reply' ? colors.success : colors.destructive }]}>
                    {tag === 'Right reply' ? `✓ ${tag}` : `✗ ${tag}`}
                  </Text>
                ) : null}
              </View>
            );
          })}
          {banner ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{banner}</Text> : null}

          <View style={styles.flexSpacer} />
          <Pressable
            onPressIn={() => void onPressIn()}
            onPressOut={onPressOut}
            disabled={state.status !== 'asking' && state.status !== 'speaking'}
            accessibilityRole="button"
            accessibilityLabel={state.status === 'speaking' ? 'Stop and check' : 'Hold or tap to answer'}
            testID="answer-back-mic"
            style={[
              styles.mic,
              {
                backgroundColor:
                  state.status === 'speaking' ? colors.destructive : state.status === 'asking' ? colors.primary : colors.muted,
              },
            ]}
          >
            <Feather name={state.status === 'speaking' ? 'square' : 'mic'} size={30} color="#ffffff" />
          </Pressable>
          {/* A fixed-height slot, so the mic never moves under a holding finger. */}
          <View style={styles.waveSlot} testID="answer-back-waveform-slot">
            {speak.recording ? <Waveform amplitude={liveAmp} level={ampLevel} height={28} color={colors.primary} /> : null}
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            {state.status === 'speaking'
              ? noInput
                ? "We can't hear you - check your mic"
                : 'Listening. Let go, or tap again, when you are done.'
              : state.status === 'scoring'
                ? 'Chacha-ji is listening...'
                : state.status === 'feedback'
                  ? ' '
                  : 'Hold or tap to answer'}
          </Text>
        </ScrollView>
      ) : null}
      {consentBlocked ? (
        <AiConsentBlockedCard
          gameName="Answer Back"
          onLeave={() => {
            void speakCancel();
            stopPlayback();
            onLeave();
          }}
          testID="answer-back-consent-blocked"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: AppFonts.bold, fontSize: 18 },
  headerSub: { fontFamily: AppFonts.regular, fontSize: 13 },
  // The games stack keeps the floating tab bar OVER every game screen
  // (games/_layout.tsx), so the speak control and the end card's buttons lift
  // clear of it, as every other game's scroll content does. Found in the
  // simulator 2026-09-14 (owner: "mic button stuck under nav").
  fill: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE, alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  endWrap: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 32, paddingBottom: TAB_BAR_CLEARANCE },
  title: { fontFamily: AppFonts.bold, fontSize: 22, marginTop: 12, textAlign: 'center' },
  body: { fontFamily: AppFonts.regular, fontSize: 15, marginTop: 6, textAlign: 'center' },
  hint: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 10, textAlign: 'center' },
  stars: { fontFamily: AppFonts.bold, fontSize: 20, marginTop: 8 },
  statusText: { fontFamily: AppFonts.bold, fontSize: 14, marginTop: 4 },
  keeperRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-end', marginTop: 8, gap: 10 },
  bubble: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12 },
  bubbleText: { fontFamily: AppFonts.bold, fontSize: 15 },
  moodEmoji: { fontSize: 28 },
  hearBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
  },
  hearText: { fontFamily: AppFonts.bold, fontSize: 14 },
  card: { alignSelf: 'stretch', marginTop: 10, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  native: { fontSize: 24, textAlign: 'center' },
  roman: { fontFamily: AppFonts.regular, fontSize: 15, marginTop: 2, textAlign: 'center' },
  english: { fontFamily: AppFonts.bold, fontSize: 15, marginTop: 6, textAlign: 'center' },
  tag: { fontFamily: AppFonts.bold, fontSize: 13, marginTop: 4 },
  flexSpacer: { flexGrow: 1, minHeight: 16 },
  mic: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  waveSlot: { height: 32, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
