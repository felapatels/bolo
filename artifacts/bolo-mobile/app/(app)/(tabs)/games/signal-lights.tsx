// Build 35 mobile parity, second quick game: Signal Lights (true-or-false
// lightning round, floor 2).
//
// A phrase flashes up with a CLAIMED meaning; the learner calls it — green
// light for true, red light for false — before the signal changes. Judgement
// game riding the frozen listen-and-pick correctness model: a "true" call on a
// true pairing (and a "false" call on a false one) submits the phrase's own id,
// and a wrong call submits the DECOY's id, so the server recomputes the same
// result web does. The server game id is declared on the roster entry — this
// file adds none and touches no server file.
//
// Ported from the web game (gujarati-coach/src/pages/games/signal-lights.tsx),
// which this must stay behaviourally identical to:
//   - TIMED, 4 seconds a round: the first mobile quick game to use the shell's
//     clock. The shell owns the countdown, the chip and the expiry flag; this
//     file never runs a clock of its own.
//   - a timed-out round is a WRONG judgement, not a stall: the shell flags
//     `api.timedOut`, and this game answers it by submitting the decoy id with
//     correct: false after the same feedback beat a tapped answer gets.
//   - AUTO-ADVANCE after a 650ms feedback flash for both outcomes. There is no
//     "tap to continue" here: Ticket Check's continue beat exists because it is
//     untimed and the learner sets the dwell time, whereas this game's whole
//     mechanic is speed, and a manual beat every 4 seconds would break it.
//   - the game NEVER persists anything: it reports each round through
//     api.submitRound and the shell owns the single end-of-run POST.
//   - the phrase is SPOKEN each round. Web's prod hotfix note says it plainly:
//     soundOn arrived in props and was dead code. Same here until now. The
//     synthesis, cache and playback follow listen-and-pick's pattern exactly,
//     because a second way of playing a clip is how two files drift.

import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  useGetAccount,
  useSynthesizeSpeech,
  type Phrase,
} from '@workspace/api-client-react';
import {
  QuickGameShell,
  type QuickRoundProps,
} from '@/components/games/QuickGameShell';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { hapticNotify } from '@/lib/haptics';
import { playBase64Audio, type PlaybackHandle } from '@/lib/audio';
import { quickGameById } from '@/lib/quick-games';

const ROUNDS = 10;
const SECONDS_PER_ROUND = 4;
const FEEDBACK_MS = 650;

const GREEN = '#10B981';
const RED = '#EF4444';

export type LightsQuestion = {
  phrase: Phrase;
  /** Same-category decoy whose English is shown on false rounds and whose id
   *  is the wrong-judgement submission. */
  decoy: Phrase;
  isTrue: boolean;
  shownEnglish: string;
};

/**
 * Local Fisher-Yates. The planner owns its own shuffle rather than reaching
 * into the shell: shuffling is a game concern, and keeping it here is what
 * lets buildPlan stay pure and testable without rendering anything.
 * Returns a new array — the caller's phrase list is never mutated.
 */
function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Build the whole run up front. Faithful port of the web planner:
 *
 * The pool is shuffled ONCE and walked with a cursor, reshuffling when the
 * cursor passes the end, so anchors spread evenly over a short category
 * instead of repeating some phrases and never showing others.
 *
 * Two details carry the game's correctness and both are easy to lose:
 *   - the decoy is drawn from the SAME category, excluding the anchor itself,
 *     so a false claim is always a real in-category meaning and never the
 *     anchor's own (which would make a "false" round secretly true).
 *   - `isTrue` is a fresh coin per round, and `shownEnglish` is derived from
 *     it, so the claim on screen and the answer key can never disagree.
 */
export function buildPlan(phrases: Phrase[], count: number): LightsQuestion[] {
  const plan: LightsQuestion[] = [];
  let pool = shuffle(phrases);
  let poolIdx = 0;
  for (let i = 0; i < count; i++) {
    if (poolIdx >= pool.length) {
      pool = shuffle(phrases);
      poolIdx = 0;
    }
    const phrase = pool[poolIdx++]!;
    const decoy = shuffle(phrases.filter((p) => p.id !== phrase.id))[0]!;
    const isTrue = Math.random() < 0.5;
    plan.push({
      phrase,
      decoy,
      isTrue,
      shownEnglish: isTrue ? phrase.english : decoy.english,
    });
  }
  return plan;
}

function SignalLightsRound({
  phrases,
  api,
  activeLanguage,
  soundOn,
  setAudioPlaying,
}: QuickRoundProps) {
  const colors = useColors();
  const nativeProps = nativeTextStyle(activeLanguage);
  const [plan] = useState(() => buildPlan(phrases, ROUNDS));
  const [judged, setJudged] = useState<boolean | null>(null);

  const synthesize = useSynthesizeSpeech();
  // The learner's TTS voice, so the cache key can include it. Without it a
  // mid-session voice change still plays the old clip. Stale data is fine:
  // an ancestor has almost always pre-fetched the account already.
  const accountQuery = useGetAccount();
  const ttsVoice = accountQuery.data?.preferences.learning.ttsVoice ?? 'auto';

  const playbackRef = useRef<PlaybackHandle | null>(null);
  const audioCache = useRef(
    new Map<string, { audioBase64: string; format: string }>(),
  );
  // Mute must skip SYNTHESIS, not just playback, so the async path reads the
  // live value rather than the one captured when the callback was built.
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  // The round the async playback started for, so a clip that resolves after
  // the 4-second clock has already moved on never speaks over the next claim.
  const roundRef = useRef(api.round);
  roundRef.current = api.round;

  const stopAudio = useCallback(() => {
    if (playbackRef.current) {
      playbackRef.current.stop();
      playbackRef.current = null;
    }
    setAudioPlaying(false);
  }, [setAudioPlaying]);

  const playPhrase = useCallback(
    async (phrase: Phrase) => {
      if (!soundOnRef.current) return;
      stopAudio();
      const capturedRound = roundRef.current;
      try {
        const cacheKey = `${phrase.id}:${ttsVoice}`;
        const cached = audioCache.current.get(cacheKey);
        const res =
          cached ??
          (await synthesize.mutateAsync({
            data: {
              text: phrase.nativeScript,
              languageName: activeLanguage?.name,
              languageCode: activeLanguage?.code,
            },
          }));
        audioCache.current.set(cacheKey, {
          audioBase64: res.audioBase64,
          format: res.format,
        });
        // The clock is 4 seconds. A slow synthesis can easily land after the
        // round turned over, and speaking the previous claim over the current
        // one is worse than silence.
        if (roundRef.current !== capturedRound) return;
        setAudioPlaying(true);
        playbackRef.current = await playBase64Audio(
          res.audioBase64,
          res.format,
          () => setAudioPlaying(false),
        );
      } catch {
        // Audio is a garnish on this game: a failed clip never blocks a round.
        setAudioPlaying(false);
      }
    },
    [synthesize, activeLanguage, ttsVoice, stopAudio, setAudioPlaying],
  );

  // api.round is ZERO-BASED (shell contract), so it indexes the plan directly.
  const q = plan[api.round];

  /**
   * The pending feedback-flash timer. Held in a ref purely so it can be
   * cleared when the round changes or the game unmounts — a fired-after-teardown
   * submit is harmless (the shell's per-round guard drops it) but it would log
   * a state update on an unmounted tree.
   */
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearFlash = () => {
    if (flashRef.current !== null) {
      clearTimeout(flashRef.current);
      flashRef.current = null;
    }
  };

  useEffect(() => {
    setJudged(null);
    return clearFlash;
  }, [api.round]);

  // Speak the claim as the round opens.
  useEffect(() => {
    const current = plan[api.round];
    if (current) void playPhrase(current.phrase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  /**
   * Warm the NEXT round's clip while this one is on screen. On a 4-second
   * clock a cold synthesis can eat most of the round, so the prefetch is what
   * makes the audio land near the start of the claim rather than the end.
   * The voice is in the cache key, so a mid-run change refetches rather than
   * serving a stale clip.
   */
  useEffect(() => {
    if (!soundOn) return;
    const next = plan[api.round + 1];
    if (!next) return;
    const nextKey = `${next.phrase.id}:${ttsVoice}`;
    if (audioCache.current.has(nextKey)) return;
    synthesize
      .mutateAsync({
        data: {
          text: next.phrase.nativeScript,
          languageName: activeLanguage?.name,
          languageCode: activeLanguage?.code,
        },
      })
      .then((res) =>
        audioCache.current.set(nextKey, {
          audioBase64: res.audioBase64,
          format: res.format,
        }),
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round, ttsVoice, soundOn]);

  useEffect(() => clearFlash, []);

  // Stop on unmount: a clip outliving the game would speak over the summary.
  useEffect(() => stopAudio, [stopAudio]);

  // Timeout counts as a wrong judgement: brief flash, then submit the miss.
  // Web parity — the shell deliberately does not auto-submit for the game,
  // so without this the run would stall on a silent expired round.
  useEffect(() => {
    if (!api.timedOut) return;
    if (judged !== null || !q) return;
    hapticNotify(Haptics.NotificationFeedbackType.Warning);
    const t = setTimeout(
      () =>
        api.submitRound({
          phraseId: q.phrase.id,
          selectedPhraseId: q.decoy.id,
          correct: false,
          // Nothing was called before the clock ran out.
          review: {
            prompt: `${q.phrase.nativeScript} means "${q.shownEnglish}"`,
            // The prompt carries native script, so its reading leads the sub
            // line; a false pairing then says what the phrase really means.
            promptSub:
              [q.phrase.romanized.trim(), q.isTrue ? '' : `It means "${q.phrase.english}"`]
                .filter(Boolean)
                .join(' · ') || null,
            answer: null,
            correct: q.isTrue ? 'True' : 'False',
          },
        }),
      FEEDBACK_MS,
    );
    flashRef.current = t;
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.timedOut, judged]);

  if (!q) return null;

  const answered = judged !== null;
  const settled = answered || api.timedOut;
  const wasCorrect = answered && judged === q.isTrue;

  const handleJudge = (saidTrue: boolean) => {
    if (answered || api.timedOut) return;
    api.lockRound();
    // Web pauses its clip the moment a light is pressed: the call is made, so
    // the phrase carrying on talking over the verdict reads as a lag.
    stopAudio();
    setJudged(saidTrue);
    const correct = saidTrue === q.isTrue;
    hapticNotify(
      correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
    // Auto-advance after the flash (web parity): no continue beat in a game
    // whose whole point is calling the signal quickly.
    clearFlash();
    flashRef.current = setTimeout(
      () =>
        api.submitRound({
          phraseId: q.phrase.id,
          selectedPhraseId: correct ? q.phrase.id : q.decoy.id,
          correct,
          // A true/false call: the review names the pairing that was on
          // screen and what the phrase actually means.
          review: {
            prompt: `${q.phrase.nativeScript} means "${q.shownEnglish}"`,
            // The prompt carries native script, so its reading leads the sub
            // line; a false pairing then says what the phrase really means.
            promptSub:
              [q.phrase.romanized.trim(), q.isTrue ? '' : `It means "${q.phrase.english}"`]
                .filter(Boolean)
                .join(' · ') || null,
            answer: saidTrue ? 'True' : 'False',
            correct: q.isTrue ? 'True' : 'False',
          },
        }),
      FEEDBACK_MS,
    );
  };

  return (
    <View style={styles.wrap}>
      {/* The claim under judgement. Settled rounds take the outcome colour,
          the same green/red flash web shows for its feedback beat. */}
      <View
        testID="signal-lights-claim"
        style={[
          styles.claim,
          {
            backgroundColor: colors.card,
            borderColor: !settled ? colors.border : wasCorrect ? GREEN : RED,
          },
        ]}
      >
        <Text
          testID="signal-lights-native"
          style={[styles.native, nativeProps, { color: colors.foreground }]}
          numberOfLines={2}
          adjustsFontSizeToFit
        >
          {q.phrase.nativeScript}
        </Text>
        {/* Romanized reading under the prompt, quieter and smaller than the
            script. Empty romanized renders nothing. */}
        {q.phrase.romanized.trim() !== '' ? (
          <Text
            testID="signal-lights-romanized"
            style={[styles.romanized, { color: colors.mutedForeground }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {q.phrase.romanized}
          </Text>
        ) : null}
        <Text style={[styles.means, { color: colors.mutedForeground }]}>means</Text>
        <Text
          testID="signal-lights-english"
          style={[styles.english, { color: colors.foreground }]}
        >
          {`"${q.shownEnglish}"`}
        </Text>
        {settled && !wasCorrect && (
          <Text testID="signal-lights-correction" style={[styles.correction, { color: RED }]}>
            {q.isTrue ? 'It was true!' : `It means "${q.phrase.english}"`}
          </Text>
        )}
      </View>

      <View style={styles.lights}>
        <PressableScale
          testID="signal-lights-true"
          onPress={() => handleJudge(true)}
          disabled={settled}
          style={[styles.light, { backgroundColor: `${GREEN}14`, borderColor: `${GREEN}80` }]}
        >
          {/* Web's `shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]` lamp glow, in
              react-native terms: the same hue as a static shadow (iOS) plus
              elevation (Android), matching how the hub tints its own press
              bloom. It is a still glow on web, so nothing here animates and
              the reduced-motion setting has nothing to suppress. */}
          <View style={[styles.lamp, styles.lampGlow, { backgroundColor: GREEN, shadowColor: GREEN }]} />
          <Text style={[styles.lightLabel, { color: GREEN }]}>True</Text>
        </PressableScale>
        <PressableScale
          testID="signal-lights-false"
          onPress={() => handleJudge(false)}
          disabled={settled}
          style={[styles.light, { backgroundColor: `${RED}14`, borderColor: `${RED}80` }]}
        >
          <View style={[styles.lamp, styles.lampGlow, { backgroundColor: RED, shadowColor: RED }]} />
          <Text style={[styles.lightLabel, { color: RED }]}>False</Text>
        </PressableScale>
      </View>
    </View>
  );
}

export default function SignalLightsScreen() {
  const def = quickGameById('signal-lights')!;
  return (
    <QuickGameShell
      def={def}
      secondsPerRound={SECONDS_PER_ROUND}
      roundsPerRun={ROUNDS}
      // The round speaks, so the shell shows its mute toggle and the button
      // lights while a clip is outputting.
      usesAudio
      instruction="Green for true, red for false. Quick!"
      renderRound={(props) => <SignalLightsRound {...props} />}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 16 },
  claim: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 24,
    borderWidth: 2,
    gap: 6,
    maxWidth: 420,
    paddingHorizontal: 20,
    paddingVertical: 22,
    width: '100%',
  },
  native: { fontSize: 26, textAlign: 'center' },
  romanized: { fontFamily: AppFonts.regular, fontSize: 13, opacity: 0.85, textAlign: 'center' },
  means: { fontFamily: AppFonts.regular, fontSize: 13, textAlign: 'center' },
  english: { fontFamily: AppFonts.bold, fontSize: 18, textAlign: 'center' },
  correction: { fontFamily: AppFonts.semibold, fontSize: 12, textAlign: 'center' },
  lights: { flexDirection: 'row', gap: 12 },
  light: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    flex: 1,
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 18,
  },
  lamp: { borderRadius: 9, height: 18, width: 18 },
  lampGlow: {
    elevation: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  lightLabel: { fontFamily: AppFonts.extrabold, fontSize: 16 },
});