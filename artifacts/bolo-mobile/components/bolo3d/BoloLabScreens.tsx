// BOLO LAB, SCREENS: each real screen's 3D bird, driven by hand.
//
// Chat, lessons, the tailor and home's daily gift all sit behind sign-in, which an agent cannot
// pass on a simulator. These are the SAME components those screens render
// (components/bolo3d/surfaces.tsx), fed the states the screens feed them, so
// every state can be seen and checked without an account. The screens
// themselves still need a signed-in look before anyone calls them done.
//
// Reached from the Bolo Lab, or: xcrun simctl openurl booted "bolo-mobile://bolo-lab-screens"

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { DailyGiftState } from '@workspace/api-client-react';
import { giftDraw, giftTierForStreakDay, type GiftTier } from '@workspace/daily-gift';
import { DailyGiftMoment } from '@/components/DailyGiftCard';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import type { TalkingMascotMode } from '@/components/TalkingMascot';
import {
  LessonBolo3D,
  OutfitPreview3D,
  SummaryBolo3D,
  TalkingBolo3D,
  lessonBirdSize,
  type GiftMomentPhase,
  type LessonMoment,
  type SummaryMoment,
} from '@/components/bolo3d/surfaces';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { WARDROBE_3D } from '@/lib/bolo3d';

type Surface = 'chat' | 'lesson' | 'summary' | 'store' | 'gift';

/**
 * The lesson measures the room its word card leaves her (surfaces.tsx
 * lessonBirdSize). About what a one-line phrase leaves on an iPhone 17 Pro,
 * read off the simulator 2026-09-16, so the bench shows her at lesson size.
 */
const PHONE_ROOM = 280;
type Colors = ReturnType<typeof useColors>;

const SURFACES: { surface: Surface; label: string }[] = [
  { surface: 'chat', label: 'Chat' },
  { surface: 'lesson', label: 'Lesson' },
  { surface: 'summary', label: 'Lesson end' },
  { surface: 'store', label: 'Tailor' },
  { surface: 'gift', label: 'Daily gift' },
];

const STORE_ITEMS: { id: string | null; label: string }[] = [
  { id: null, label: 'Bare-headed' },
  { id: 'pagdi', label: 'Marigold pagdi' },
  { id: 'station-cap', label: "Harbour master's cap" },
  { id: 'pink-beanie2', label: 'Pink Knit Beanie' },
];

export function BoloLabScreens() {
  const colors = useColors();
  const router = useRouter();
  const [surface, setSurface] = useState<Surface>('chat');

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }} testID="bolo-lab-screens-scroll">
        <View style={styles.header}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/bolo-lab'))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            style={{ padding: 4 }}
          >
            <Feather name="chevron-left" size={26} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Bolo in the screens</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>The components chat, lessons, the tailor and the daily gift render</Text>
          </View>
        </View>

        <View style={[styles.wrap, styles.pad]}>
          {SURFACES.map((s) => (
            <Chip
              key={s.surface}
              label={s.label}
              selected={surface === s.surface}
              onPress={() => setSurface(s.surface)}
              colors={colors}
              testID={`screens-surface-${s.surface}`}
            />
          ))}
        </View>

        {surface === 'chat' ? <ChatBench colors={colors} /> : null}
        {surface === 'lesson' ? <LessonBench colors={colors} /> : null}
        {surface === 'summary' ? <SummaryBench colors={colors} /> : null}
        {surface === 'store' ? <StoreBench colors={colors} /> : null}
        {surface === 'gift' ? <GiftBench colors={colors} /> : null}
      </ScrollView>
    </Screen>
  );
}

function ChatBench({ colors }: { colors: Colors }) {
  const [mode, setMode] = useState<TalkingMascotMode>('idle');
  const [perched, setPerched] = useState(false);
  const [holds, setHolds] = useState(0);
  const [holding, setHolding] = useState(false);
  return (
    <View style={styles.pad}>
      <Note colors={colors}>
        In chat the bird sits inside the hold-to-talk button, so a finger on her must reach the button. Hold her below: the counter proves
        it does.
      </Note>
      <Pressable
        testID="screens-chat-hold"
        onPressIn={() => {
          setHolding(true);
          setHolds((n) => n + 1);
        }}
        onPressOut={() => setHolding(false)}
        style={[styles.bench, { borderColor: holding ? colors.primary : colors.cardBorder, borderWidth: holding ? 3 : 1, backgroundColor: colors.muted }]}
      >
        <TalkingBolo3D mode={mode} size={perched ? 76 : 156} showBars={!perched} />
      </Pressable>
      <Text style={[styles.status, { color: colors.foreground }]} testID="screens-chat-holds">
        {holding ? 'Holding: chat would be recording' : `Holds that reached the button: ${holds}`}
      </Text>
      <View style={styles.wrap}>
        {(['idle', 'listening', 'thinking', 'talking'] as TalkingMascotMode[]).map((m) => (
          <Chip key={m} label={m} selected={mode === m} onPress={() => setMode(m)} colors={colors} testID={`screens-chat-${m}`} />
        ))}
      </View>
      <View style={styles.wrap}>
        <Chip label="Empty chat, 156 pt" selected={!perched} onPress={() => setPerched(false)} colors={colors} />
        <Chip label="Perched in the corner, 76 pt" selected={perched} onPress={() => setPerched(true)} colors={colors} />
      </View>
    </View>
  );
}

function LessonBench({ colors }: { colors: Colors }) {
  const [moment, setMoment] = useState<LessonMoment>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [celebrate, setCelebrate] = useState(0);
  const [outcome, setOutcome] = useState(false);
  const moments: LessonMoment[] = ['idle', 'recording', 'evaluating', 'great', 'good', 'nocatch', 'miss', 'compare', 'error'];
  return (
    <View style={styles.pad}>
      <Note colors={colors}>
        The bird over the phrase card. She listens while you record, thinks while it scores, then reacts to the band. Touch her too: lessons
        keep her interactive.
      </Note>
      <View style={[styles.bench, { borderColor: colors.cardBorder, backgroundColor: colors.muted }]}>
        <LessonBolo3D moment={moment} speaking={speaking} celebrate={celebrate} size={lessonBirdSize(PHONE_ROOM, outcome)} />
      </View>
      <View style={styles.wrap}>
        {moments.map((m) => (
          <Chip key={m} label={m} selected={moment === m} onPress={() => setMoment(m)} colors={colors} testID={`screens-lesson-${m}`} />
        ))}
      </View>
      <View style={styles.wrap}>
        <Chip label="Phrase audio playing" selected={speaking} onPress={() => setSpeaking((v) => !v)} colors={colors} testID="screens-lesson-speaking" />
        <Chip label="Milestone" onPress={() => setCelebrate((n) => n + 1)} colors={colors} testID="screens-lesson-celebrate" />
        <Chip label="Result showing" selected={outcome} onPress={() => setOutcome((v) => !v)} colors={colors} />
      </View>
    </View>
  );
}

function SummaryBench({ colors }: { colors: Colors }) {
  const [moment, setMoment] = useState<SummaryMoment>('celebrate');
  const moments: SummaryMoment[] = ['celebrate', 'perfect', 'passed', 'not-yet', 'checking', 'error'];
  return (
    <View style={styles.pad}>
      <Note colors={colors}>
        The end of a session and the Express check verdicts. Each screen mounts her fresh, so each choice here does too.
      </Note>
      <View style={[styles.bench, { borderColor: colors.cardBorder, backgroundColor: colors.muted }]}>
        <SummaryBolo3D key={moment} moment={moment} size={168} />
      </View>
      <View style={styles.wrap}>
        {moments.map((m) => (
          <Chip key={m} label={m} selected={moment === m} onPress={() => setMoment(m)} colors={colors} testID={`screens-summary-${m}`} />
        ))}
      </View>
    </View>
  );
}

function StoreBench({ colors }: { colors: Colors }) {
  const [accessory, setAccessory] = useState<string | null>('pagdi');
  return (
    <View style={styles.pad}>
      <Note colors={colors}>
        The tailor's preview, with this fork's real catalogue. Drag her round to see the back; she stays where you leave her. Every 3D
        piece is a stand-in for the delivered art.
      </Note>
      <View style={[styles.bench, { borderColor: colors.cardBorder, backgroundColor: colors.muted }]}>
        <OutfitPreview3D garment={null} accessory={accessory} size={200} />
      </View>
      <View style={styles.wrap}>
        {STORE_ITEMS.map((item) => (
          <Chip
            key={item.label}
            label={item.id && !WARDROBE_3D[item.id] ? `${item.label} (no 3D piece)` : item.label}
            selected={accessory === item.id}
            onPress={() => setAccessory(item.id)}
            colors={colors}
            testID={`screens-store-${item.id ?? 'none'}`}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * The claim answer the card would get, built with the package's own draw so
 * the numbers are ones a learner could really see. A fixture: nothing is sent.
 */
function claimFixture(day: number, multiplier: number): DailyGiftState {
  const draw = giftDraw('lab-learner', '2026-09-16', day, multiplier);
  return {
    day,
    chai: draw.chai,
    baseAmount: draw.baseAmount,
    multiplier: draw.multiplier,
    tier: giftTierForStreakDay(day),
    tomorrowChai: giftDraw('lab-learner', '2026-09-16+1', day + 1, multiplier).chai,
    claimed: true,
    claimable: false,
    streakDays: day,
    earnedToday: true,
    localDay: '2026-09-16',
    balance: 40 + draw.chai,
    stopCost: 60,
    chaiToNextStop: Math.max(0, 60 - (40 + draw.chai)),
  };
}

function GiftBench({ colors }: { colors: Colors }) {
  const [day, setDay] = useState(7);
  const [phase, setPhase] = useState<GiftMomentPhase | null>(null);
  const [claimed, setClaimed] = useState<DailyGiftState | null>(null);
  const wire = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (wire.current) clearTimeout(wire.current);
  }, []);
  const tier: GiftTier = giftTierForStreakDay(day);

  // As the card does it: the moment opens on the tap, waits while the claim is
  // "on the wire" (900 ms here), and a moment closed meanwhile stays closed.
  const claim = (outcome: GiftMomentPhase, answer: DailyGiftState | null) => {
    if (wire.current) clearTimeout(wire.current);
    setClaimed(null);
    setPhase('waiting');
    wire.current = setTimeout(() => {
      setClaimed(answer);
      setPhase((open) => (open === null ? null : outcome));
    }, 900);
  };

  return (
    <View style={styles.pad}>
      <Note colors={colors}>
        Home's daily gift, as a tap opens it: the card's own moment and words, fed a pretend claim. Nothing is claimed. The box's size and bow follow the streak day,
        as the 2D box's do.
      </Note>
      <View style={styles.wrap}>
        {[1, 3, 5, 7].map((d) => (
          <Chip key={d} label={`Day ${d} (${giftTierForStreakDay(d)})`} selected={day === d} onPress={() => setDay(d)} colors={colors} testID={`screens-gift-day-${d}`} />
        ))}
      </View>
      <View style={styles.wrap}>
        <Chip label="Locked: tap the box" onPress={() => { setClaimed(null); setPhase('locked'); }} colors={colors} testID="screens-gift-locked" />
        <Chip label="Earned: open it" onPress={() => claim('opened', claimFixture(day, 1))} colors={colors} testID="screens-gift-open" />
        <Chip label="Earned, All-Access" onPress={() => claim('opened', claimFixture(day, 2))} colors={colors} testID="screens-gift-open-double" />
        <Chip label="Claim fails" onPress={() => claim('failed', null)} colors={colors} testID="screens-gift-fails" />
        <Chip label="Opened on another device" onPress={() => claim('already', claimFixture(day, 1))} colors={colors} testID="screens-gift-already" />
      </View>
      {phase ? <DailyGiftMoment phase={phase} claimed={claimed} tier={tier} day={day} onClose={() => setPhase(null)} /> : null}
    </View>
  );
}

function Note({ colors, children }: { colors: Colors; children: React.ReactNode }) {
  return <Text style={[styles.note, { color: colors.mutedForeground }]}>{children}</Text>;
}

/** Selected shows as a check mark, a heavier border and bold text, never colour alone. */
function Chip({
  label,
  onPress,
  selected = false,
  colors,
  testID,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  colors: Colors;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? colors.primary : colors.cardBorder,
          borderWidth: selected ? 2 : 1,
          backgroundColor: selected ? colors.primary : colors.card,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {selected ? <Feather name="check" size={14} color={colors.primaryForeground} /> : null}
      <Text style={[styles.chipText, { color: selected ? colors.primaryForeground : colors.foreground, fontFamily: selected ? AppFonts.bold : AppFonts.semibold }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  title: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 14 },
  pad: { paddingHorizontal: 16, marginTop: 14, gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bench: { borderRadius: 20, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  status: { fontFamily: AppFonts.semibold, fontSize: 14, textAlign: 'center' },
  note: { fontFamily: AppFonts.regular, fontSize: 13, lineHeight: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: 14 },
});
