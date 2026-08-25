// THE EMERGENCY on the phone: the twin of
// gujarati-coach/src/pages/games/emergency.tsx.
//
// WHAT IS SHARED AND WHAT IS NOT. Every rule lives in @workspace/emergency and
// is imported here rather than reimplemented: the clock, the buy-back, the run
// length, which zones have a film, the copy, and how a film is named. This file
// owns the RENDERING and the ticking, which are the only two things that
// genuinely differ from the web. That split is the whole reason the library
// exists; web and mobile share no components, so anything not in the library
// becomes two games that drift.
//
// TWO WAYS IN, same as web. From the journey with ?journey=1&zone=N the alarm
// flashes, the film plays and five phrases follow, and the first showing cannot
// be skipped. From the Games hub with no zone there is a length picker and no
// film, because interrupting somebody who navigated here on purpose is a joke
// that only works once.
//
// THE FILM IS FETCHED, NOT BUNDLED. See lib/mediaUrl.ts: it keeps 12.8MB out of
// the download and, more importantly, means a new film ships on a republish
// instead of waiting for an App Store review.
//
// expo-video IS USED DELIBERATELY AND CLAUDE.md's HISTORY IS WHY IT IS SAFE
// HERE. The launch crash was expo-video decoding a film at the ROOT layout on
// every cold start; that ban was lifted 2026-08-20 and the splash now plays a
// film through it, 10 cold starts for 10. This screen is nowhere near the
// launch path: nothing decodes until a learner is standing on stop 9.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  useListCategoryPhrases,
  getListCategoryPhrasesQueryKey,
} from '@workspace/api-client-react';
import {
  startDrill,
  tickDrill,
  answerDrill,
  drillScore,
  buildDrill,
  hasEmergency,
  DRILL_START_MS,
  DRILL_QUESTIONS,
  DRILL_LENGTHS,
  DRILL_CHAI_REWARD,
  EMERGENCY_COPY,
  EMERGENCY_ALARM_MS,
  EMERGENCY_JOURNEY,
  type DrillState,
  type DrillQuestion,
} from '@workspace/emergency';
import { emergencyFilmUrl } from '@/lib/mediaUrl';
import {
  hasSeenEmergency,
  markEmergencySeen,
  markEmergencyPassed,
} from '@/lib/emergencyProgress';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import * as Haptics from 'expo-haptics';
import { hapticNotify } from '@/lib/haptics';

type Phase = 'picker' | 'alarm' | 'film' | 'game' | 'end';

export default function EmergencyScreen() {
  const colors = useColors();
  const router = useRouter();
  // Same reason as the storybook: headerShown is false for this whole stack,
  // so every screen has to reserve the notch itself or its own back button is
  // unreachable.
  const insets = useSafeAreaInsets();
  const { activeLang, activeLanguage } = useLanguage();
  const params = useLocalSearchParams<{ journey?: string; zone?: string }>();

  const journey = Number(params.journey) || EMERGENCY_JOURNEY;
  const zoneParam = Number(params.zone);
  const fromJourney = Number.isInteger(zoneParam) && zoneParam > 0;
  const zone = fromJourney ? zoneParam : 1;

  const [phase, setPhase] = useState<Phase>(fromJourney ? 'alarm' : 'picker');
  const [drill, setDrill] = useState<DrillState>(() => startDrill(DRILL_QUESTIONS));
  const [questions, setQuestions] = useState<DrillQuestion[]>([]);
  const [locked, setLocked] = useState<number | null>(null);
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    let live = true;
    void hasSeenEmergency(journey, zone).then((seen) => live && setCanSkip(seen));
    return () => {
      live = false;
    };
  }, [journey, zone]);

  // Zone N is category N, the same ladder the journey map and the storybook
  // read. A zone is a number here rather than a slug for that reason.
  const phraseQuery = useListCategoryPhrases(zone, activeLang, {
    query: { queryKey: getListCategoryPhrasesQueryKey(zone, activeLang) },
  });
  const pool = useMemo(
    () =>
      (phraseQuery.data ?? []).map((p) => ({
        nativeScript: p.nativeScript,
        romanized: p.romanized,
        concept: p.english,
      })),
    [phraseQuery.data],
  );

  const begin = useCallback(
    (total: number) => {
      const built = buildDrill(pool, journey * 100 + zone, total);
      setQuestions(built);
      setDrill(startDrill(built.length || total));
      setLocked(null);
      setPhase('game');
    },
    [pool, journey, zone],
  );

  /* ── the film ─────────────────────────────────────────────────────────── */
  const filmUrl = phase === 'film' ? emergencyFilmUrl(journey, zone) : null;
  const player = useVideoPlayer(filmUrl, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    if (phase !== 'film') return;
    // playToEnd is the only honest signal that the mandatory showing was
    // actually watched. Marking SEEN on start would hand a skip to anybody who
    // backgrounded the app a second in.
    const sub = player.addListener('playToEnd', () => {
      void markEmergencySeen(journey, zone);
      setCanSkip(true);
      begin(DRILL_QUESTIONS);
    });
    // A film that will not load must never strand a learner inside an
    // interruption with no way out. Straight to the game.
    const err = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') begin(DRILL_QUESTIONS);
    });
    return () => {
      sub.remove();
      err.remove();
    };
  }, [phase, player, journey, zone, begin]);

  /* ── the alarm ────────────────────────────────────────────────────────── */
  const [flashOn, setFlashOn] = useState(true);
  useEffect(() => {
    if (phase !== 'alarm') return;
    // Stepped, not eased: a hard on-off at roughly two a second reads as a
    // warning light, where a smooth pulse reads as decoration.
    const blink = setInterval(() => setFlashOn((f) => !f), 275);
    const done = setTimeout(() => setPhase('film'), EMERGENCY_ALARM_MS);
    return () => {
      clearInterval(blink);
      clearTimeout(done);
    };
  }, [phase]);

  /* ── the clock ────────────────────────────────────────────────────────── */
  const lastRef = useRef(0);
  useEffect(() => {
    if (phase !== 'game' || drill.status !== 'running') return;
    lastRef.current = Date.now();
    // setInterval rather than requestAnimationFrame: RN's rAF is tied to the
    // JS thread's frame loop, and CLAUDE.md records that the native animation
    // driver in this app is dead. A 100ms interval is enough for a bar that
    // takes ten seconds to empty, and the reducer takes MEASURED elapsed, so a
    // throttled interval cannot buy the learner extra time.
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastRef.current;
      lastRef.current = now;
      setDrill((d) => (d.status === 'running' ? tickDrill(d, elapsed) : d));
    }, 100);
    return () => clearInterval(id);
  }, [phase, drill.status]);

  useEffect(() => {
    if (drill.status === 'running' || phase !== 'game') return;
    if (drill.status === 'won' && fromJourney) void markEmergencyPassed(journey, zone);
    setPhase('end');
  }, [drill.status, phase, fromJourney, journey, zone]);

  // A zone with no film has no Emergency. Nothing flashes and nothing is
  // half-played: the learner goes back to the map as though it was never
  // planned. Same fallback as web, same reason the manifest is compiled in.
  useEffect(() => {
    if (fromJourney && !hasEmergency(journey, zone)) router.replace('/journey');
  }, [fromJourney, journey, zone, router]);

  const answer = useCallback(
    (k: number) => {
      if (locked !== null || drill.status !== 'running') return;
      const q = questions[drill.index];
      if (!q) return;
      const right = k === q.answer;
      setLocked(k);
      hapticNotify(
        right
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
      setTimeout(() => {
        setLocked(null);
        setDrill((d) => answerDrill(d, right));
      }, 330);
    },
    [locked, drill.status, drill.index, questions],
  );

  const q = questions[drill.index];
  const pct = Math.max(0, drill.msLeft / DRILL_START_MS);
  const s = styles(colors);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {phase === 'picker' && (
        <ScrollView
          contentContainerStyle={[s.pad, { paddingTop: insets.top + 12 }]}
          testID="emergency-picker"
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
        testID="emergency-back"
        hitSlop={10}
        style={[s.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Feather name="arrow-left" size={20} color={colors.foreground} />
      </Pressable>
          <Text style={[s.h1, { color: colors.foreground }]}>Beat the Train</Text>
          <Text style={[s.sub, { color: colors.mutedForeground }]}>How many phrases?</Text>
          {DRILL_LENGTHS.map((n) => (
            <Pressable
              key={n}
              testID={`emergency-length-${n}`}
              onPress={() => begin(n)}
              style={[s.card, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <Text style={[s.big, { color: colors.foreground }]}>{n}</Text>
              <Text style={[s.sub, { color: colors.mutedForeground }]}>
                {n === 5 ? 'A quick one' : n === 10 ? 'A proper run' : 'Endurance'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {phase === 'alarm' && (
        <View style={s.stage} testID="emergency-alarm">
          <Text style={[s.alarm, { opacity: flashOn ? 1 : 0.12 }]}>
            {EMERGENCY_COPY.alarm.toUpperCase()}
          </Text>
          <Text style={[s.alarmSub, { color: colors.mutedForeground }]}>
            {EMERGENCY_COPY.alarmSub.toUpperCase()}
          </Text>
        </View>
      )}

      {phase === 'film' && (
        <View style={s.stage}>
          <VideoView
            testID="emergency-film"
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
          <Pressable
            testID="emergency-skip"
            disabled={!canSkip}
            onPress={() => begin(DRILL_QUESTIONS)}
            style={[s.skip, { opacity: canSkip ? 1 : 0.35 }]}
          >
            <Text style={s.skipText}>Skip</Text>
          </Pressable>
        </View>
      )}

      {phase === 'game' && (
        <ScrollView contentContainerStyle={s.pad} testID="emergency-game">
          <View style={s.row}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>
              {EMERGENCY_COPY.running.toUpperCase()}
            </Text>
            <Text testID="emergency-clock" style={[s.label, { color: colors.mutedForeground }]}>
              {(drill.msLeft / 1000).toFixed(1)}s
            </Text>
          </View>
          <View style={[s.barWrap, { borderColor: colors.border }]}>
            <View testID="emergency-bar" style={[s.bar, { width: `${pct * 100}%` }]} />
          </View>

          {q && (
            <>
              <Text style={[s.prompt, { color: colors.foreground }]}>
                Say &ldquo;{q.prompt}&rdquo;
              </Text>
              {q.options.map((o, k) => (
                <Pressable
                  key={`${o.concept}-${k}`}
                  testID={`emergency-option-${k}`}
                  onPress={() => answer(k)}
                  style={[
                    s.card,
                    {
                      borderColor:
                        locked === k
                          ? k === q.answer
                            ? '#3fb96a'
                            : '#e0342c'
                          : colors.border,
                      backgroundColor: colors.card,
                      opacity: locked !== null && locked !== k ? 0.6 : 1,
                    },
                  ]}
                >
                  {/* SCRIPT AND ROMANIZATION TOGETHER, asked for directly. Under
                      a draining clock a script the learner cannot yet read at a
                      glance is a coin toss, and a coin toss is not a drill. */}
                  <Text style={[s.script, nativeTextStyle(activeLanguage), { color: colors.foreground }]}>
                    {o.nativeScript}
                  </Text>
                  {o.romanized.trim() !== '' && (
                    <Text style={[s.roman, { color: colors.mutedForeground }]}>{o.romanized}</Text>
                  )}
                </Pressable>
              ))}
            </>
          )}

          <View style={s.pips}>
            {Array.from({ length: drill.total }, (_, n) => (
              <View
                key={n}
                style={[
                  s.pip,
                  {
                    backgroundColor:
                      drill.marks[n] === true
                        ? '#3fb96a'
                        : drill.marks[n] === false
                          ? '#e0342c'
                          : colors.border,
                  },
                ]}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {phase === 'end' && (
        <ScrollView contentContainerStyle={s.padCenter} testID="emergency-end">
          <Text style={[s.h1, { color: colors.foreground }]}>
            {drill.status === 'won' ? EMERGENCY_COPY.won.title : EMERGENCY_COPY.lost.title}
          </Text>
          <Text style={[s.body, { color: colors.mutedForeground }]}>
            {drill.status === 'won' ? EMERGENCY_COPY.won.body : EMERGENCY_COPY.lost.body}
          </Text>
          <Text style={[s.score, { color: colors.foreground }]}>
            {drillScore(drill)} of {drill.total} right
          </Text>
          {drill.status === 'won' && fromJourney && (
            <Text style={s.chai}>+{DRILL_CHAI_REWARD} Chai</Text>
          )}
          <Pressable
            testID="emergency-replay"
            onPress={() => (fromJourney ? begin(DRILL_QUESTIONS) : setPhase('picker'))}
            style={[s.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={s.ctaText}>Run it again</Text>
          </Pressable>
          <Pressable onPress={() => router.replace(fromJourney ? '/journey' : '/games')}>
            <Text style={[s.link, { color: colors.mutedForeground }]}>
              {fromJourney ? 'Back to the map' : 'Back to Games'}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    pad: { padding: 16, gap: 10 },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },

    padCenter: { padding: 24, gap: 12, alignItems: 'center', paddingTop: 60 },
    stage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
    h1: { fontFamily: AppFonts.extrabold, fontSize: 22 },
    sub: { fontFamily: AppFonts.regular, fontSize: 13 },
    body: { fontFamily: AppFonts.regular, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    score: { fontFamily: AppFonts.bold, fontSize: 14 },
    big: { fontFamily: AppFonts.extrabold, fontSize: 20 },
    label: { fontFamily: AppFonts.bold, fontSize: 11, letterSpacing: 1 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    barWrap: {
      height: 12,
      borderRadius: 99,
      borderWidth: 1,
      backgroundColor: '#000',
      overflow: 'hidden',
    },
    bar: { height: '100%', backgroundColor: '#f0a020' },
    prompt: { fontFamily: AppFonts.extrabold, fontSize: 22, paddingTop: 10 },
    card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 2 },
    script: { fontSize: 19 },
    roman: { fontFamily: AppFonts.regular, fontSize: 12 },
    pips: { flexDirection: 'row', gap: 5, paddingTop: 8 },
    pip: { height: 4, width: 22, borderRadius: 99 },
    alarm: {
      fontFamily: AppFonts.extrabold,
      fontSize: 44,
      letterSpacing: 6,
      color: '#e0342c',
    },
    alarmSub: { fontFamily: AppFonts.bold, fontSize: 13, letterSpacing: 2, marginTop: 10 },
    skip: {
      position: 'absolute',
      right: 14,
      bottom: 14,
      borderRadius: 99,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.35)',
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    skipText: { fontFamily: AppFonts.bold, fontSize: 12, color: '#fff' },
    chai: {
      fontFamily: AppFonts.bold,
      fontSize: 14,
      color: '#f0a020',
      borderWidth: 1,
      borderColor: '#f0a020',
      borderRadius: 99,
      paddingHorizontal: 14,
      paddingVertical: 5,
    },
    cta: { borderRadius: 16, paddingHorizontal: 24, paddingVertical: 13, marginTop: 8 },
    ctaText: { fontFamily: AppFonts.bold, fontSize: 15, color: '#fff' },
    link: { fontFamily: AppFonts.regular, fontSize: 13, textDecorationLine: 'underline' },
  });
}
