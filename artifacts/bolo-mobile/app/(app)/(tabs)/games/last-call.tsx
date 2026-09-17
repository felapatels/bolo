// LAST CALL, slice 1. A voice stop, played as a boarding game.
//
// Owner rulings, 2026-09-14:
//  1. Last Call REPLACES a voice stop, it never adds a row. stop-play.ts
//     decides which rows; this screen only plays one. (Both it and the round
//     reducer live in @workspace/script-trace since slice 2, shared with web.)
//  2. Gating, mastery and XP are the same as a voice stop. Every take goes
//     through hooks/useSpeakAndScore.ts, which is practice's own evaluate then
//     /attempts path, so the server cannot tell the two screens apart.
//  3. Preview, recall round, end card. Placeholder art only.
//
// ART PASS, 2026-09-14 (presentation only; not one rule of the round moved).
// The emoji cards became a scene: the looping first-person doorway film behind
// everything, passengers as painted cut-outs queueing on the platform, and the
// phrase written ON the sign the passenger at the door holds (native script
// and romanization in the preview, English alone in the recall round). Who
// wears which face, where each sign's blank card is, where each figure stands
// on the painted platform and how text is fitted to a card all live in
// @workspace/script-trace last-call-passengers.ts, shared with web, so the two
// platforms stage the same scene. This file owns only the drawing and motion.
//
// WHY IT LIVES IN THE GAMES STACK AND NOT BESIDE practice/[id]. Every other
// journey stop that is played as a game already routes here (storybook,
// letter-stop, script-trace), so it inherits the games stack's XP and Chai
// strip for free and leaves the way they do. A static `practice/last-call`
// would also have sat one path segment away from the dynamic `practice/[id]`,
// which is a route collision waiting for a typo.
//
// Web twin: gujarati-coach src/pages/games/last-call.tsx (slice 2,
// 2026-09-14). Keep the two in step; the round rules are shared, the screens
// are hand-kept.
import React from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type TextStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
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
import { Mascot } from '@/components/Mascot';
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
  LAST_CALL_MAX_STRIKES,
  assignLastCallPassengers,
  currentPassenger,
  estimateSignTextWidth,
  fitSignText,
  initLastCall,
  lastCallFigureBox,
  lastCallPassengerById,
  lastCallReducer,
  type LastCallFigureBox,
  type LastCallPassenger,
  type LastCallState,
  type TakeOutcome,
} from '@workspace/script-trace';
import { saveLastCallBest } from '@/lib/lastCallMemory';
import { LAST_CALL_FILM, LAST_CALL_PASSENGER_ART, LAST_CALL_POSTER } from '@/lib/lastCallArt';
import { CONTENT_COLUMN } from '@/lib/contentWidth';

/** Longest single clock step. setInterval stalls in the background and resumes
 *  with one huge delta; without this a learner who glanced at a notification
 *  would come back to a strike they never had a chance to avoid. */
const MAX_TICK_MS = 250;
const TICK_EVERY_MS = 100;
/** Below this much clock the bar says "Hurry" in words, not only in colour. */
const URGENT_MS = 3_000;
/** A release this soon after recording started is a TAP: keep listening until
 *  the next tap or the silence auto-stop, rather than scoring half a syllable. */
const TAP_MS = 350;
/** Feedback beats. TUNING PENDING, placeholder pacing for slice 1. */
const BOARDED_BEAT_MS = 900;
const NOCATCH_BEAT_MS = 1_400;
const MISS_BEAT_MS = 1_800;
const PREVIEW_MUTED_BEAT_MS = 1_800;
/** The count before the first clock (owner, 2026-09-14: "count down from 3"). */
const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 1_000;
/** How long "Go!" holds before the clock starts. */
const COUNTDOWN_GO_MS = 600;

/** Art pass motion (owner brief 2026-09-14): the next passenger walks up from
 *  the queue, a boarding passenger steps up into the doorway, a missed one
 *  shakes their sign and goes to the back. Every one sits inside the feedback
 *  beats above, so no animation can outlast the beat that shows it. */
const WALK_MS = 350;
const BOARD_MS = 450;
const SHAKE_MS = 330;
const ASIDE_MS = 420;
const QUEUE_FADE_MS = 250;

/** Dark ink on the cream card, whatever the app theme: it is printed on paper
 *  inside a painting, not UI chrome. */
const SIGN_INK = '#2A2118';
/** Under the poster, the painting's own dark door-frame tone, so a frame the
 *  poster has not decoded yet is never a white flash. */
const STAGE_GROUND = '#3A4238';
/** Legible over any part of the film; state is never carried by it alone. */
const ON_FILM = '#FFFFFF';
const ON_FILM_MUTED = 'rgba(255,255,255,0.82)';
const ON_FILM_URGENT = '#FFB4A8';
const TEXT_SHADOW: TextStyle = {
  textShadowColor: 'rgba(0,0,0,0.55)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
};

/** The sign's blank card is inset a little further so ink never kisses its border. */
const SIGN_PAD_X = 0.05;
const SIGN_PAD_Y = 0.07;

type FigurePhase = 'enter' | 'board' | 'aside';
type SignContent =
  | { kind: 'english'; text: string }
  | { kind: 'preview'; native: string; roman: string };

/**
 * The transform that draws a figure laid out at `box` so it appears at
 * `target` instead: centre to centre horizontally, bottom edge to bottom edge,
 * scaled by height. Scale is about the centre (RN's transform origin), hence
 * the half-heights.
 */
function offsetFor(box: LastCallFigureBox, target: LastCallFigureBox) {
  const s = target.height / box.height;
  return {
    tx: target.cx - box.cx,
    ty: target.bottom - (s * box.height) / 2 - (box.bottom - box.height / 2),
    s,
  };
}

/**
 * The looping doorway film, with its frame 0 underneath.
 *
 * Player setup copied from components/journey/ZoneFilmLayer.tsx: loop, muted
 * (a backdrop that makes noise while a learner listens to a phrase is harmful),
 * play. REDUCE MOTION gets no player at all, only the poster.
 *
 * THE FILM STAYS INVISIBLE UNTIL ITS FIRST FRAME HAS RENDERED, so the poster is
 * what shows while it decodes, and a film that never decodes leaves the
 * poster as the whole backdrop. Nothing throws and nothing blocks the round.
 *
 * Sized in explicit points, not absoluteFill: an Image sized that way can
 * resolve to its intrinsic pixel size on device (CLAUDE.md, render trap 1).
 */
function PlatformFilm({ width, height, reduceMotion }: { width: number; height: number; reduceMotion: boolean }) {
  const player = useVideoPlayer(reduceMotion ? null : LAST_CALL_FILM, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  const [framed, setFramed] = React.useState(false);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: STAGE_GROUND }]}
    >
      {width > 0 ? (
        <Image
          source={LAST_CALL_POSTER}
          style={{ position: 'absolute', left: 0, top: 0, width, height }}
          resizeMode="cover"
          fadeDuration={0}
        />
      ) : null}
      {!reduceMotion && width > 0 ? (
        <VideoView
          player={player}
          style={{ position: 'absolute', left: 0, top: 0, width, height, opacity: framed ? 1 : 0 }}
          nativeControls={false}
          contentFit="cover"
          onFirstFrameRender={() => setFramed(true)}
          testID="last-call-film"
        />
      ) : null}
    </View>
  );
}

/**
 * What is written on the door passenger's sign, fitted to its blank card.
 *
 * HOW THE FIT WORKS. fitSignText (shared with web) steps the size down from a
 * ceiling until a greedy word-wrap fits the card in at most three lines,
 * never breaking a word. React Native cannot measure text before drawing it,
 * so mobile's ruler is estimateSignTextWidth, which errs wide; RN's own
 * adjustsFontSizeToFit with numberOfLines stays on as a net in case the
 * estimate is still generous for some string.
 */
function SignText({
  content,
  width,
  height,
  nativeStyle,
}: {
  content: SignContent;
  width: number;
  height: number;
  nativeStyle: Pick<TextStyle, 'fontFamily' | 'writingDirection'>;
}) {
  const innerW = width * (1 - 2 * SIGN_PAD_X);
  const innerH = height * (1 - 2 * SIGN_PAD_Y);
  if (content.kind === 'english') {
    const fit = fitSignText(content.text, innerW, innerH, estimateSignTextWidth, {
      maxFontSize: 30,
      minFontSize: 8,
      lineHeight: 1.22,
      maxLines: 3,
    });
    return (
      <Text
        numberOfLines={3}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={[styles.signText, { fontSize: fit.fontSize, maxWidth: innerW }]}
      >
        {content.text}
      </Text>
    );
  }
  // The preview card carries two lines of different kinds: the script above,
  // in its own Noto face (taller line box), and the romanization below it.
  const nativeFit = fitSignText(content.native, innerW, innerH * 0.6, estimateSignTextWidth, {
    maxFontSize: 30,
    minFontSize: 8,
    lineHeight: 1.6,
    maxLines: 2,
  });
  const romanFit = fitSignText(content.roman, innerW, innerH * 0.4, estimateSignTextWidth, {
    maxFontSize: Math.max(8, Math.round(nativeFit.fontSize * 0.7)),
    minFontSize: 7,
    lineHeight: 1.22,
    maxLines: 2,
  });
  return (
    <>
      <Text
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={[styles.signText, nativeStyle, { fontSize: nativeFit.fontSize, maxWidth: innerW }]}
      >
        {content.native}
      </Text>
      <Text
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={[styles.signText, styles.signRoman, { fontSize: romanFit.fontSize, maxWidth: innerW }]}
      >
        {content.roman}
      </Text>
    </>
  );
}

/**
 * One painted passenger, standing in `box`.
 *
 * THE LAYOUT BOX NEVER MOVES DURING AN ANIMATION; only a transform does. A
 * walk-up is laid out at the door and drawn, at first, at the queue place it
 * is coming from; a queue figure whose place changes is drawn at its old place
 * for one frame and then eased to the new one. Transforms keep the image and
 * the sign text at one layout for the whole walk.
 *
 * The cut-out is decorative and hidden from screen readers. The sign is not:
 * its words are the element's label, which is the whole question.
 */
function PassengerFigure({
  passenger,
  box,
  from,
  exitTo,
  phase,
  reduceMotion,
  sign,
  nativeStyle,
  signTestID,
}: {
  passenger: LastCallPassenger;
  box: LastCallFigureBox;
  from?: LastCallFigureBox;
  exitTo?: LastCallFigureBox;
  phase: FigurePhase;
  reduceMotion: boolean;
  sign?: SignContent;
  nativeStyle: Pick<TextStyle, 'fontFamily' | 'writingDirection'>;
  signTestID?: string;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  const rot = useSharedValue(0);
  const op = useSharedValue(0);
  const prevBox = React.useRef<LastCallFigureBox | null>(null);

  React.useEffect(() => {
    const prev = prevBox.current;
    prevBox.current = box;
    if (phase === 'board') {
      if (reduceMotion) {
        op.value = 0;
        return;
      }
      // Up the step and into the carriage: a touch larger, a touch higher, gone.
      const d = { duration: BOARD_MS, easing: Easing.in(Easing.quad) };
      sc.value = withTiming(1.1, d);
      ty.value = withTiming(-box.height * 0.14, d);
      op.value = withTiming(0, d);
      return;
    }
    if (phase === 'aside') {
      if (reduceMotion) {
        op.value = 0;
        return;
      }
      // A brief shake of the sign, then back down the platform to the queue.
      rot.value = withSequence(
        withTiming(-5, { duration: 70 }),
        withTiming(5, { duration: 95 }),
        withTiming(-3, { duration: 95 }),
        withTiming(0, { duration: 70 }),
      );
      const t = offsetFor(box, exitTo ?? box);
      const d = { duration: ASIDE_MS, easing: Easing.inOut(Easing.quad) };
      tx.value = withDelay(SHAKE_MS, withTiming(t.tx, d));
      ty.value = withDelay(SHAKE_MS, withTiming(t.ty, d));
      sc.value = withDelay(SHAKE_MS, withTiming(t.s, d));
      op.value = withDelay(SHAKE_MS, withTiming(0, d));
      return;
    }
    // 'enter': a first appearance, or a queue figure moving up a place.
    const moved =
      prev !== null && (prev.cx !== box.cx || prev.bottom !== box.bottom || prev.height !== box.height);
    if (prev !== null && !moved) return;
    if (reduceMotion) {
      tx.value = 0;
      ty.value = 0;
      sc.value = 1;
      rot.value = 0;
      op.value = box.opacity;
      return;
    }
    const start = prev ?? from ?? null;
    const d = { duration: WALK_MS, easing: Easing.out(Easing.quad) };
    if (start) {
      // Jump to the starting place in a zero-length step, then walk. One
      // sequence per value, rather than a plain write followed by an
      // animation, so the start can never be dropped in favour of the target.
      const t = offsetFor(box, start);
      const jump = { duration: 0 };
      tx.value = withSequence(withTiming(t.tx, jump), withTiming(0, d));
      ty.value = withSequence(withTiming(t.ty, jump), withTiming(0, d));
      sc.value = withSequence(withTiming(t.s, jump), withTiming(1, d));
      op.value =
        prev === null
          ? withSequence(withTiming(start.opacity, jump), withTiming(box.opacity, d))
          : withTiming(box.opacity, d);
    } else {
      op.value = withTiming(box.opacity, { duration: QUEUE_FADE_MS });
    }
    // Shared values are stable refs; the geometry numbers are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, box.cx, box.bottom, box.height, box.opacity, reduceMotion]);

  const animated = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: sc.value },
      { rotate: `${rot.value}deg` },
    ],
  }));

  const signBox = {
    left: box.width * passenger.sign.x,
    top: box.height * passenger.sign.y,
    width: box.width * passenger.sign.w,
    height: box.height * passenger.sign.h,
  };
  const label = !sign ? undefined : sign.kind === 'english' ? sign.text : `${sign.native}, ${sign.roman}`;

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height }, animated]}
    >
      <Image
        source={LAST_CALL_PASSENGER_ART[passenger.id]}
        style={{ width: box.width, height: box.height }}
        resizeMode="contain"
        fadeDuration={0}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      {sign ? (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={label}
          testID={signTestID}
          style={[
            styles.sign,
            signBox,
            { paddingHorizontal: signBox.width * SIGN_PAD_X, paddingVertical: signBox.height * SIGN_PAD_Y },
          ]}
        >
          <SignText content={sign} width={signBox.width} height={signBox.height} nativeStyle={nativeStyle} />
        </View>
      ) : null}
    </Animated.View>
  );
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export default function LastCallScreen() {
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
  // BACK TO THE MAP THE LEARNER CAME FROM, NOT A NEW ONE (owner, simulator
  // 2026-09-14: "when i leave the game, i see the old splash play", and "i
  // can't go back from journey to home"). replace() built a fresh journey, which
  // replayed its zone arrival film and, from inside the tabs, left no Home
  // under it. dismissTo pops back to the journey already in the history (the
  // one journey.tsx says "refocuses rather than recreating") and falls back to
  // replace only when there is none, as from a deep link.
  const leave = React.useCallback(() => router.dismissTo('/(app)/journey'), [router]);
  const [runKey, setRunKey] = React.useState(0);

  if (!validGroup) return <Redirect href="/(app)/journey" />;
  // An unsupported language never gets a Last Call row (script-trace stop-play.ts), so
  // arriving here is a stale map or a deep link. Its voice stop is a compare
  // stop, which only practice can play.
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
  // The same three expected refusals practice handles, in the same order.
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
            Finish the stop before it to board here. The line runs station by station.
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
  const list = phrasesQuery.data ?? [];
  // Practice sends an empty group back to the map for the same reason: the
  // listing reports such a stop plan-locked, so the map is where it makes sense.
  if (list.length === 0) return <Redirect href="/(app)/journey" />;

  return (
    <LastCallRound
      // Keyed so a second visit, or Play again, starts a clean round: the
      // games stack can keep this route mounted (CLAUDE.md, "screens outlive
      // the user's mental model of them").
      key={`${groupId}:${runKey}`}
      phrases={list}
      groupId={groupId}
      categoryId={categoryId}
      stopLabel={params.stop}
      onLeave={leave}
      onPlayAgain={() => setRunKey((k) => k + 1)}
    />
  );
}

function LastCallRound({
  phrases,
  groupId,
  categoryId,
  stopLabel,
  onLeave,
  onPlayAgain,
}: {
  phrases: Phrase[];
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

  const byId = React.useMemo(() => new Map(phrases.map((p) => [p.id, p])), [phrases]);
  const ids = React.useMemo(() => phrases.map((p) => p.id), [phrases]);

  const [state, dispatch] = React.useReducer(
    lastCallReducer,
    ids,
    (initial: number[]) => initLastCall(initial, shuffle(initial)),
  );
  // Async callbacks read the round through this, never through a stale closure.
  const stateRef = React.useRef<LastCallState>(state);
  stateRef.current = state;
  // Faces are dealt ONCE, off the round's opening preview and recall orders,
  // so a phrase keeps its passenger through the preview, the recall round and
  // every re-queue (rule and reasoning: assignLastCallPassengers). A lazy
  // initialiser reads the first render's state, which is the initial round.
  const [faces] = React.useState(() => assignLastCallPassengers(state.passengers, state.queue));
  const passengerFor = (phraseId: number) => lastCallPassengerById(faces.get(phraseId) ?? 'grandmother');

  // ── Audio: the same synthesize and per-voice cache practice uses ─────────
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
   * Play a passenger's phrase once. Resolves when it has finished, failed or
   * been skipped, so a caller can chain the next beat off it. Muted means no
   * synthesis at all (GameMuteButton's contract), resolving immediately.
   */
  const playPhrase = React.useCallback(
    (phrase: Phrase): Promise<void> =>
      new Promise((resolve) => {
        if (!soundOnRef.current) {
          resolve();
          return;
        }
        stopPlayback();
        const token = playTokenRef.current;
        void (async () => {
          try {
            const key = `${phrase.id}:${ttsVoice}`;
            const res =
              audioCache.current.get(key) ??
              // languageCode as practice and web send it (2026-09-15): without it an
              // ElevenLabs server resolves the default voice with no language hint,
              // so a Tamil learner heard Tamil read in the Hindi voice.
              (await synth.mutateAsync({ data: { text: phrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang } }));
            audioCache.current.set(key, { audioBase64: res.audioBase64, format: res.format || 'mp3' });
            if (token !== playTokenRef.current || !aliveRef.current) return resolve();
            setAudioPlaying(true);
            const handle = await playBase64Audio(res.audioBase64, res.format || 'mp3', () => {
              if (token === playTokenRef.current) setAudioPlaying(false);
              resolve();
            });
            // A PLAYER THAT ARRIVES AFTER ITS SCREEN DIED STILL PLAYS (owner,
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
    [activeLanguage?.name, stopPlayback, synth, ttsVoice],
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

  // Destructured so effects and callbacks depend on the stable callbacks, not
  // on the hook's return object, which is new every render.
  const { prepare: speakPrepare, start: speakStart, stopAndScore, cancel: speakCancel, permissionDenied } = speak;

  // THE VOICE BARS (owner, in the simulator, 2026-09-14: "add a voice
  // visualizer to that game so you know that your voice is getting
  // recognized"). Practice's own Waveform with practice's wiring restated
  // (practice/[id].tsx, "Spec D2"): amplitude rides a shared value on the UI
  // thread, and React state holds only the reduced-motion segments and the
  // can't-hear-you flag, which is practice's 1.5s of near-silence.
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

  // Warm the recorder whenever a passenger is at the door, as practice does
  // in idle, so the first syllable is not clipped.
  React.useEffect(() => {
    if (state.status === 'asking') void speakPrepare();
  }, [state.status, speakPrepare]);

  // ── Before the round: the rules, then a count from 3 ─────────────────────
  // Owner, in the simulator, 2026-09-14: "for last call. Add the instructions
  // before it starts. and count down from 3", then, placing it: "needs a
  // countdown after I hit start on the How to Play card." So Start runs the
  // count, and the preview's first passenger steps up when it ends. Until then
  // nothing plays, nobody queues and no clock can tick. The round's own rules
  // (last-call-round.ts) do not know either exists.
  const [showRules, setShowRules] = React.useState(true);
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const countdownRef = React.useRef<number | null>(null);
  countdownRef.current = countdown;
  /** The rules card or the count is up: the round is held at the door. */
  const beforeRound = showRules || countdown !== null;
  React.useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) hapticLight();
    else hapticMedium();
    const t = setTimeout(
      () => setCountdown(countdown > 0 ? countdown - 1 : null),
      countdown > 0 ? COUNTDOWN_STEP_MS : COUNTDOWN_GO_MS,
    );
    return () => clearTimeout(t);
  }, [countdown]);

  // ── Preview: each passenger says their phrase once ───────────────────────
  const previewPhrase = state.status === 'preview' ? byId.get(state.passengers[state.previewIndex]!) : undefined;
  React.useEffect(() => {
    if (!previewPhrase || beforeRound) return;
    let cancelled = false;
    void (async () => {
      const started = Date.now();
      await playPhrase(previewPhrase);
      // Muted or failed audio still leaves time to read the card: every card
      // stays up at least PREVIEW_MUTED_BEAT_MS, and a short beat after a clip.
      const rest = Math.max(350, PREVIEW_MUTED_BEAT_MS - (Date.now() - started));
      await new Promise((r) => setTimeout(r, rest));
      if (!cancelled && stateRef.current.status === 'preview' && stateRef.current.previewIndex === state.previewIndex) {
        dispatch({ type: 'preview_next' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewPhrase?.id, state.previewIndex, beforeRound]);

  // ── The clock. Runs only while asking or speaking, and never during the count. ─
  const clockRunning = (state.status === 'asking' || state.status === 'speaking') && countdown === null;
  React.useEffect(() => {
    if (!clockRunning) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      dispatch({ type: 'tick', ms: Math.min(MAX_TICK_MS, now - last) });
      last = now;
    }, TICK_EVERY_MS);
    return () => clearInterval(id);
  }, [clockRunning]);

  // ── A take: stop, score, record, then tell the round ─────────────────────
  const finishingRef = React.useRef(false);
  const pressingRef = React.useRef(false);
  const recordStartedAtRef = React.useRef(0);
  const [banner, setBanner] = React.useState<string | null>(null);
  // A standing no to AI permission stops the round here (AiConsentBlockedCard).
  const [consentBlocked, setConsentBlocked] = React.useState(false);

  const finishTake = React.useCallback(async () => {
    if (finishingRef.current) return;
    const s = stateRef.current;
    if (s.status !== 'speaking') return;
    const id = currentPassenger(s);
    const phrase = id === null ? undefined : byId.get(id);
    if (!phrase) return;
    finishingRef.current = true;
    dispatch({ type: 'score_start' });
    try {
      const outcome = await stopAndScore(phrase);
      if (!aliveRef.current) return;
      if (outcome.kind === 'consent_required') {
        // Re-asking cannot succeed until the learner changes their answer, and
        // it used to loop forever. The round stays paused under the card.
        setConsentBlocked(true);
        return;
      }
      if (outcome.kind !== 'scored') {
        // A timeout and a thrown request both re-ask with no strike: neither
        // is something the learner did.
        setBanner(outcome.kind === 'timeout' ? 'The scorer took too long. Same passenger, no strike.' : 'Scoring hit a snag. Same passenger, no strike.');
        dispatch({ type: 'scoring_timeout' });
        return;
      }
      // Practice's idea of passing, unchanged: lib/ui isPassingBand.
      const take: TakeOutcome =
        outcome.band === 'nocatch' ? 'nocatch' : isPassingBand(outcome.band) ? 'pass' : 'fail';
      setBanner(outcome.attemptSaved ? null : 'Scored, but your progress did not save. Check your connection.');
      dispatch({ type: 'scored', outcome: take });
    } finally {
      finishingRef.current = false;
    }
  }, [byId, stopAndScore]);
  finishTakeRef.current = () => void finishTake();

  // The clock ran out mid-take: score what was said.
  React.useEffect(() => {
    if (state.timeUp && state.status === 'speaking') void finishTake();
  }, [state.timeUp, state.status, finishTake]);

  const onPressIn = React.useCallback(async () => {
    pressingRef.current = true;
    const s = stateRef.current;
    // A second tap while listening in tap mode is the stop.
    if (s.status === 'speaking') {
      void finishTake();
      return;
    }
    if (s.status !== 'asking' || countdownRef.current !== null) return;
    stopPlayback();
    dispatch({ type: 'speak' });
    const ok = await speakStart();
    if (!ok) {
      dispatch({ type: 'speak_cancel' });
      Alert.alert(
        permissionDenied() ? 'Microphone needed' : 'Recording failed',
        permissionDenied()
          ? 'Please allow microphone access to play Last Call.'
          : 'Could not start recording. Try again.',
      );
      return;
    }
    recordStartedAtRef.current = Date.now();
    hapticMedium();
  }, [finishTake, speakStart, permissionDenied, stopPlayback]);

  const onPressOut = React.useCallback(() => {
    pressingRef.current = false;
    if (stateRef.current.status !== 'speaking' || !speak.recording) return;
    // A hold ends the take on release; a tap leaves the mic open.
    if (Date.now() - recordStartedAtRef.current >= TAP_MS) void finishTake();
  }, [finishTake, speak.recording]);

  // ── Feedback beats ───────────────────────────────────────────────────────
  React.useEffect(() => {
    if (state.status !== 'feedback' && state.status !== 'over') return;
    const last = state.last;
    if (!last) return;
    let cancelled = false;
    const beat = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      if (last.outcome === 'pass') {
        hapticNotify(Haptics.NotificationFeedbackType.Success);
        playCue('correct');
        if (state.status === 'over') return;
        await beat(BOARDED_BEAT_MS);
      } else if (last.outcome === 'fail' || last.outcome === 'clock') {
        hapticNotify(Haptics.NotificationFeedbackType.Warning);
        playCue('wrong');
        if (state.status === 'over') return;
        const phrase = byId.get(last.phraseId);
        const started = Date.now();
        // Hear the correct audio before the next passenger steps up.
        if (phrase) await playPhrase(phrase);
        await beat(Math.max(400, MISS_BEAT_MS - (Date.now() - started)));
      } else {
        // nocatch or a scoring timeout: a system miss, so no warning haptic
        // and no wrong cue (Spec 1 rule 16, as practice).
        await beat(NOCATCH_BEAT_MS);
      }
      if (!cancelled && stateRef.current.status === 'feedback') {
        setBanner(null);
        dispatch({ type: 'continue' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Keyed on the outcome object itself: each take produces a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.last, state.status === 'over']);

  // ── End: keep the best on the device ─────────────────────────────────────
  const [best, setBest] = React.useState<{ best: number; isNewBest: boolean } | null>(null);
  React.useEffect(() => {
    if (state.status !== 'over') return;
    let alive = true;
    void saveLastCallBest(activeLang, groupId, state.boarded.length).then((r) => {
      if (alive) setBest(r);
    });
    return () => {
      alive = false;
    };
  }, [state.status, state.boarded.length, activeLang, groupId]);

  // THE SAME EXIT PRACTICE TAKES FROM A FINISHED JOURNEY STOP: the flashback
  // lightbox when phrases are due, the map when none are, and the review
  // screen's own step-aside when the answer is not in yet.
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
    // Attempts already scored stay saved on the server; what a learner loses
    // by leaving is this round's boarding count, which is what the prompt says.
    confirmDiscardRun(() => {
      void speakCancel();
      stopPlayback();
      onLeave();
    });
  };

  const playAgain = () => {
    hapticLight();
    stopPlayback();
    // The reducer has no reset on purpose: the parent re-keys this component,
    // so a new round is a fresh mount with a fresh shuffle and nothing carried.
    onPlayAgain();
  };

  const current = currentPassenger(state);
  const currentPhrase = current === null ? undefined : byId.get(current);
  const timerFrac = state.timerTotalMs > 0 ? state.timerLeftMs / state.timerTotalMs : 0;
  const urgent = clockRunning && state.timerLeftMs <= URGENT_MS;
  const lastPhrase = state.last ? byId.get(state.last.phraseId) : undefined;

  // ── The stage: film size, and who stands where ──────────────────────────
  const [stage, setStage] = React.useState({ w: 0, h: 0 });
  const onStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - stage.w) > 0.5 || Math.abs(height - stage.h) > 0.5) setStage({ w: width, h: height });
  };

  // WHO IS AT THE DOOR. During a pass or miss beat it is still the passenger
  // who just spoke, so the same mounted figure can board or step aside; the
  // reducer has already moved the queue on. The key counts resolved takes, so
  // it is unchanged from that passenger's own turn into their exit, and new
  // for the next turn, which mounts a fresh figure that walks up.
  const resolving =
    state.status === 'feedback' && state.last && state.last.outcome !== 'nocatch' && state.last.outcome !== 'scoring_timeout'
      ? state.last
      : null;
  const takesResolved = state.boarded.length + state.strikes;
  const door: { id: number; key: string; phase: FigurePhase } | null =
    state.status === 'over'
      ? null
      : state.status === 'preview'
        ? previewPhrase
          ? { id: previewPhrase.id, key: `preview-${state.previewIndex}`, phase: 'enter' }
          : null
        : resolving
          ? {
              id: resolving.phraseId,
              key: `turn-${resolving.phraseId}-${takesResolved - 1}`,
              phase: resolving.outcome === 'pass' ? 'board' : 'aside',
            }
          : current !== null
            ? { id: current, key: `turn-${current}-${takesResolved}`, phase: 'enter' }
            : null;
  const waiting: number[] =
    state.status === 'over'
      ? []
      : state.status === 'preview'
        ? state.passengers.slice(state.previewIndex + 1, state.previewIndex + 3)
        : resolving
          ? state.queue.filter((id) => id !== resolving.phraseId).slice(0, 2)
          : state.queue.slice(1, 3);
  const doorPhrase = door ? byId.get(door.id) : undefined;
  const doorSign: SignContent | undefined = !doorPhrase
    ? undefined
    : state.status === 'preview'
      ? { kind: 'preview', native: doorPhrase.nativeScript, roman: doorPhrase.romanized }
      : // English only in the recall round: the romanized hint is deliberately
        // withheld (owner brief, slice 1).
        { kind: 'english', text: doorPhrase.english };

  const scene =
    stage.w > 0 ? (
      <>
        {waiting
          .map((id, i) => ({ id, slot: i === 0 ? ('queue1' as const) : ('queue2' as const) }))
          // Furthest back first, so nearer figures paint over them.
          .reverse()
          .map(({ id, slot }) => {
            const p = passengerFor(id);
            return (
              <View key={`q-${id}`} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
                <PassengerFigure
                  passenger={p}
                  box={lastCallFigureBox(slot, p, stage.w, stage.h)}
                  phase="enter"
                  reduceMotion={!!reduceMotion}
                  nativeStyle={nativeProps}
                />
              </View>
            );
          })}
        {door && doorSign
          ? (() => {
              const p = passengerFor(door.id);
              return (
                <PassengerFigure
                  key={door.key}
                  passenger={p}
                  box={lastCallFigureBox('door', p, stage.w, stage.h)}
                  from={lastCallFigureBox('queue1', p, stage.w, stage.h)}
                  exitTo={lastCallFigureBox('queue2', p, stage.w, stage.h)}
                  phase={door.phase}
                  reduceMotion={!!reduceMotion}
                  sign={doorSign}
                  nativeStyle={nativeProps}
                  signTestID={state.status === 'preview' ? 'last-call-preview-sign' : 'last-call-passenger'}
                />
              );
            })()
          : null}
      </>
    ) : null;

  return (
    <Screen padTop={false} column={false}>
      <View style={styles.stage} onLayout={onStageLayout}>
        <PlatformFilm width={stage.w} height={stage.h} reduceMotion={!!reduceMotion} />
        {/* Soft dark scrims so the controls read over any part of the film.
            Decorative: hidden from screen readers, and never under a touch. */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.62)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']}
          style={styles.scrimTop}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.7)']}
          style={[styles.scrimBottom, { height: TAB_BAR_CLEARANCE + 190 }]}
        />

        {!beforeRound && state.status === 'preview' && previewPhrase ? (
          // The whole platform is the "next passenger" tap, as the card was.
          // It sits UNDER the figures, which take no touches, so the sign keeps
          // its own accessibility label.
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              hapticLight();
              stopPlayback();
              dispatch({ type: 'preview_next' });
            }}
            accessibilityRole="button"
            accessibilityLabel="Next passenger"
            testID="last-call-preview"
          />
        ) : null}

        {/* No one queues before the round: the platform is the backdrop. */}
        {beforeRound && state.status !== 'over' ? null : scene}

        <View style={styles.hud} pointerEvents="box-none">
          <View style={styles.header} pointerEvents="box-none">
            <Pressable
              onPress={handleExit}
              style={[styles.headerBtn, styles.plaque]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="last-call-exit"
              hitSlop={8}
            >
              <Feather name="arrow-left" size={22} color={colors.foreground} />
            </Pressable>
            <View style={{ alignItems: 'center', flex: 1 }} pointerEvents="none">
              <Text style={[styles.headerTitle, TEXT_SHADOW, { color: ON_FILM }]}>Last Call</Text>
              {stopLabel ? (
                <Text style={[styles.headerSub, TEXT_SHADOW, { color: ON_FILM_MUTED }]}>{stopLabel}</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {/* Speaking speed beside the mute (owner, 2026-09-17: wherever the coach speaks). */}
              <View style={styles.plaque}>
                <SpeechSpeedPill variant="stacked" testID="game-speed-pill" style={{ borderWidth: 0, backgroundColor: 'transparent' }} />
              </View>
              <View style={styles.plaque}>
                <GameMuteButton soundOn={soundOn} onToggle={toggleSound} active={audioPlaying} />
              </View>
            </View>
          </View>

          {showRules && state.status !== 'over' ? (
            <View style={styles.fill} pointerEvents="box-none">
              <View style={styles.flexSpacer} pointerEvents="none" />
              <View
                style={[styles.rulesCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                testID="last-call-rules"
              >
                <Text style={[styles.title, { color: colors.foreground, marginTop: 0 }]}>How to play</Text>
                {[
                  'Meet your passengers. Each one says their line once.',
                  `Then each sign shows the meaning in English. Say it in ${activeLanguage?.name ?? 'your language'} before the clock runs out.`,
                  'Hold the mic while you speak, or tap it to start and tap again to stop.',
                  'Three misses and the doors close. Board everyone to win.',
                ].map((line, i) => (
                  <View key={i} style={styles.ruleRow}>
                    <Text style={[styles.ruleNum, { color: colors.primary }]}>{i + 1}</Text>
                    <Text style={[styles.ruleText, { color: colors.foreground }]}>{line}</Text>
                  </View>
                ))}
                <ChunkyButton
                  title="Start"
                  icon="play"
                  onPress={() => {
                    hapticLight();
                    setShowRules(false);
                    setCountdown(COUNTDOWN_FROM);
                  }}
                  style={{ alignSelf: 'stretch', marginTop: 16 }}
                  testID="last-call-start"
                />
              </View>
              <View style={styles.flexSpacer} pointerEvents="none" />
            </View>
          ) : countdown !== null && state.status === 'preview' ? (
            // The count stands alone over the platform (its overlay follows the HUD).
            <View style={styles.fill} pointerEvents="none" />
          ) : state.status === 'preview' && previewPhrase ? (
            <View style={styles.fill} pointerEvents="box-none">
              <Text style={[styles.kicker, TEXT_SHADOW, { color: ON_FILM }]} pointerEvents="none">
                Last call! Meet your passengers.
              </Text>
              <Text style={[styles.body, TEXT_SHADOW, { color: ON_FILM_MUTED }]} pointerEvents="none">
                {`Passenger ${state.previewIndex + 1} of ${state.passengers.length}`}
              </Text>
              {/* The sign carries the script and the sound; the meaning rides
                  under the counter so the pairing the recall round asks for is
                  still taught once (the slice 1 card showed all three). */}
              <Text style={[styles.english, TEXT_SHADOW, { color: ON_FILM, marginTop: 6 }]} pointerEvents="none">
                {previewPhrase.english}
              </Text>
              <View style={styles.flexSpacer} pointerEvents="none" />
              <Text style={[styles.hint, TEXT_SHADOW, { color: ON_FILM_MUTED }]} pointerEvents="none">
                Tap for the next passenger
              </Text>
              <ChunkyButton
                title="Skip to boarding"
                variant="secondary"
                icon="skip-forward"
                onPress={() => {
                  stopPlayback();
                  dispatch({ type: 'preview_skip' });
                }}
                style={{ marginTop: 12, alignSelf: 'stretch' }}
                testID="last-call-skip-preview"
              />
            </View>
          ) : state.status === 'over' ? (
            <ScrollView contentContainerStyle={styles.endWrap}>
              <View style={[styles.endCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Mascot pose={state.endReason === 'all_aboard' ? 'cheer' : 'wave'} size={140} motion={reduceMotion ? 'none' : 'bounce'} />
                <Text style={[styles.title, { color: colors.foreground }]} testID="last-call-aboard">
                  {`${state.boarded.length} ${state.boarded.length === 1 ? 'passenger' : 'passengers'} aboard`}
                </Text>
                <Text style={[styles.body, { color: colors.mutedForeground }]}>
                  {state.endReason === 'all_aboard'
                    ? 'Everyone made the train!'
                    : `Three misses and the doors closed. ${state.queue.length} still on the platform.`}
                </Text>
                {best ? (
                  <Text style={[styles.body, { color: best.isNewBest ? colors.primary : colors.mutedForeground }]} testID="last-call-best">
                    {best.isNewBest ? `New best: ${best.best}` : `Best: ${best.best}`}
                  </Text>
                ) : null}
                {state.bestCombo >= 2 ? (
                  <Text style={[styles.body, { color: colors.mutedForeground }]}>{`Longest combo: ${state.bestCombo}`}</Text>
                ) : null}
                {banner ? <Text style={[styles.hint, { color: colors.destructive }]}>{banner}</Text> : null}
                <ChunkyButton title="On to the next stop" icon="arrow-right" onPress={leaveFinished} style={{ alignSelf: 'stretch', marginTop: 24 }} />
                <ChunkyButton title="Play again" variant="secondary" icon="refresh-cw" onPress={playAgain} style={{ alignSelf: 'stretch', marginTop: 12 }} />
              </View>
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
          ) : (
            <View style={styles.fill} pointerEvents="box-none">
              {/* Strikes and combo in WORDS as well as marks: a colour-only state
                  is invisible to a colour-blind learner (owner, standing rule). */}
              <View style={styles.statusRow} pointerEvents="none">
                <Text style={[styles.statusText, TEXT_SHADOW, { color: ON_FILM }]} testID="last-call-strikes">
                  {`Misses ${state.strikes}/${LAST_CALL_MAX_STRIKES}`}
                </Text>
                <Text style={[styles.statusText, TEXT_SHADOW, { color: ON_FILM }]}>
                  {`Aboard ${state.boarded.length}/${state.passengers.length}`}
                </Text>
                <Text style={[styles.statusText, TEXT_SHADOW, { color: state.combo >= 2 ? ON_FILM : ON_FILM_MUTED }]}>
                  {state.combo >= 2 ? `Combo x${state.combo}` : 'Combo'}
                </Text>
              </View>

              <View
                style={[styles.timerTrack, { backgroundColor: 'rgba(255,255,255,0.28)' }]}
                accessibilityLabel={`${Math.ceil(state.timerLeftMs / 1000)} seconds left`}
                testID="last-call-timer"
              >
                <View
                  style={{
                    width: `${Math.round(Math.max(0, Math.min(1, timerFrac)) * 100)}%`,
                    height: '100%',
                    borderRadius: 5,
                    backgroundColor: urgent ? colors.destructive : colors.primary,
                  }}
                />
              </View>
              <Text style={[styles.timerText, TEXT_SHADOW, { color: urgent ? ON_FILM_URGENT : ON_FILM_MUTED }]}>
                {state.status === 'scoring' || state.status === 'feedback'
                  ? 'Clock paused'
                  : urgent
                    ? `Hurry! ${Math.ceil(state.timerLeftMs / 1000)}s`
                    : `${Math.ceil(state.timerLeftMs / 1000)}s`}
              </Text>

              {state.status === 'feedback' && state.last && lastPhrase ? (
                <Animated.View
                  key={`fb-${state.boarded.length}-${state.strikes}-${state.last.outcome}-${state.queue.join(',')}`}
                  entering={reduceMotion ? undefined : appearPlain()}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  testID="last-call-feedback"
                >
                  {state.last.outcome === 'pass' ? (
                    <Text style={[styles.title, { color: colors.success }]}>Boarded! 🎉</Text>
                  ) : state.last.outcome === 'fail' || state.last.outcome === 'clock' ? (
                    <>
                      <Text style={[styles.title, { color: colors.destructive }]}>
                        {state.last.outcome === 'clock' ? 'Out of time. Back of the queue.' : 'Missed. Back of the queue.'}
                      </Text>
                      <Text style={[styles.native, nativeProps, { color: colors.foreground }]}>{lastPhrase.nativeScript}</Text>
                      <Text style={[styles.roman, { color: colors.mutedForeground }]}>{lastPhrase.romanized}</Text>
                    </>
                  ) : (
                    <Text style={[styles.title, { color: colors.foreground }]}>
                      {"Didn't catch that. Same passenger, no strike."}
                    </Text>
                  )}
                  {banner ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{banner}</Text> : null}
                </Animated.View>
              ) : currentPhrase ? (
                <Text style={[styles.body, TEXT_SHADOW, { color: ON_FILM }]} pointerEvents="none">
                  {state.status === 'scoring' ? 'Checking your ticket...' : 'Read the sign. Say it to board:'}
                </Text>
              ) : null}

              <View style={styles.flexSpacer} pointerEvents="none" />
              <Pressable
                onPressIn={() => void onPressIn()}
                onPressOut={onPressOut}
                disabled={countdown !== null || (state.status !== 'asking' && state.status !== 'speaking')}
                accessibilityRole="button"
                accessibilityLabel={state.status === 'speaking' ? 'Stop and score' : 'Hold or tap to speak'}
                testID="last-call-mic"
                style={[
                  styles.mic,
                  {
                    backgroundColor:
                      state.status === 'speaking'
                        ? colors.destructive
                        : state.status === 'asking' && countdown === null
                          ? colors.primary
                          : colors.muted,
                  },
                ]}
              >
                <Feather name={state.status === 'speaking' ? 'square' : 'mic'} size={30} color="#ffffff" />
              </Pressable>
              {/* The slot keeps its height in every state, so the mic never
                  moves under a holding finger when the bars appear (practice's
                  frame-stability contract). */}
              <View style={styles.waveSlot} testID="last-call-waveform-slot">
                {speak.recording ? <Waveform amplitude={liveAmp} level={ampLevel} height={28} color={ON_FILM} /> : null}
              </View>
              <Text style={[styles.hint, TEXT_SHADOW, { color: ON_FILM }]}>
                {state.status === 'speaking'
                  ? noInput
                    ? "We can't hear you - check your mic"
                    : 'Listening. Let go, or tap again, when you are done.'
                  : state.status === 'scoring'
                    ? 'Scoring. The clock is paused.'
                    : 'Hold or tap to speak'}
              </Text>
            </View>
          )}
        </View>

        {consentBlocked ? (
          <AiConsentBlockedCard
            gameName="Last Call"
            onLeave={() => {
              void speakCancel();
              stopPlayback();
              onLeave();
            }}
            testID="last-call-consent-blocked"
          />
        ) : null}

        {/* THE COUNT. Over everything and never under a touch; the number is
            also announced, so it does not ride on sight alone. */}
        {countdown !== null ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.countdownWrap]}
            accessibilityLiveRegion="assertive"
            accessibilityLabel={countdown > 0 ? `Starting in ${countdown}` : 'Go'}
          >
            <View style={styles.countdownDisc}>
              <Text style={[styles.countdownText, TEXT_SHADOW, { color: ON_FILM }]} testID="last-call-countdown">
                {countdown > 0 ? String(countdown) : 'Go!'}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden' },
  scrimTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 190 },
  scrimBottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // The controls keep the content column (iPad, build 25) while the film and
  // the platform run the full width.
  hud: { flex: 1, ...CONTENT_COLUMN },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // A cream disc behind each header icon: the icons are drawn in the theme's
  // foreground colour, which would vanish into the dark scrim.
  plaque: { borderRadius: 22, backgroundColor: 'rgba(255,250,240,0.92)' },
  headerTitle: { fontFamily: AppFonts.bold, fontSize: 18 },
  headerSub: { fontFamily: AppFonts.regular, fontSize: 13 },
  // The floating tab bar is drawn OVER this screen (Screen.tsx
  // TAB_BAR_CLEARANCE), so the speak control lifts clear of it.
  fill: { flex: 1, paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE, alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  endWrap: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: TAB_BAR_CLEARANCE },
  endCard: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 24, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 24 },
  kicker: { fontFamily: AppFonts.bold, fontSize: 18, marginTop: 12, textAlign: 'center' },
  title: { fontFamily: AppFonts.bold, fontSize: 22, marginTop: 12, textAlign: 'center' },
  body: { fontFamily: AppFonts.regular, fontSize: 15, marginTop: 6, textAlign: 'center' },
  hint: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 10, textAlign: 'center' },
  card: {
    alignSelf: 'stretch',
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  native: { fontSize: 26, marginTop: 6, textAlign: 'center' },
  roman: { fontFamily: AppFonts.regular, fontSize: 15, marginTop: 2, textAlign: 'center' },
  english: { fontFamily: AppFonts.bold, fontSize: 20, marginTop: 10, textAlign: 'center' },
  statusRow: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  statusText: { fontFamily: AppFonts.bold, fontSize: 14 },
  timerTrack: { alignSelf: 'stretch', height: 10, borderRadius: 5, marginTop: 10, overflow: 'hidden' },
  timerText: { fontFamily: AppFonts.bold, fontSize: 13, marginTop: 6 },
  flexSpacer: { flex: 1, minHeight: 16 },
  mic: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  waveSlot: { height: 32, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  rulesCard: { alignSelf: 'stretch', borderRadius: 24, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 20 },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12, gap: 12 },
  ruleNum: { fontFamily: AppFonts.extrabold, fontSize: 18, width: 18, textAlign: 'center' },
  ruleText: { fontFamily: AppFonts.regular, fontSize: 15, lineHeight: 21, flex: 1 },
  countdownWrap: { alignItems: 'center', justifyContent: 'center' },
  countdownDisc: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  countdownText: { fontFamily: AppFonts.extrabold, fontSize: 84 },
  sign: { position: 'absolute', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  // The app's display face, heaviest weight, set like print on the card.
  signText: { fontFamily: AppFonts.extrabold, color: SIGN_INK, textAlign: 'center' },
  signRoman: { fontFamily: AppFonts.semibold, marginTop: 1 },
});
