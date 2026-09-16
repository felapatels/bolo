// BOLO LAB: the 3D runtime, every control in one place.
//
// WHY IT EXISTS. The owner asked (2026-09-16) to see the 3D Bolo working
// before the designer's bird arrives: "why can't we build the functionality
// first using a stand-in glb file? Lets do it on one fork (Africa). I want to
// see how it will function and look." This is where that is seen: moods, all
// fifty clips, the beak speaking a real Swahili line, the wardrobe sockets,
// drag to turn, Reduce Motion, small sizes, and the still fallback.
//
// NOT LINKED FROM ANYWHERE, and outside the signed-in group on purpose, so it
// opens on a simulator with no account (nothing here reads or writes data):
//
//   xcrun simctl openurl booted "bolo-mobile://bolo-lab"
//
// The route (app/bolo-lab.tsx) is only a gate: it requires this file when the
// lab is on, so a release build never loads the 3D stack at launch.
//
// REACH: mobile only for now. The same stage page renders on the web; a web
// lab route is the follow-up, mobile first by the owner's standing rule.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  CLIPS,
  mouthTrackFromAlignment,
  type Alignment,
  type Capabilities,
  type ClipGroup,
  type ClipName,
  type Framing,
  type Mood,
} from '@workspace/bolo-character';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { Bolo3D, type Bolo3DHandle } from '@/components/bolo3d/Bolo3D';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { CHARACTER } from '@/lib/bolo3d';
import { playAssetAudio, type PlaybackHandle } from '@/lib/audio';

// One real line from this fork's coach voice, with ElevenLabs' own
// per-character timings: generated once on 2026-09-16, see its JSON.
const SAMPLE = require('../../assets/bolo3d/lab/swahili-karibu.alignment.json') as { text: string; alignment: Alignment };
const SAMPLE_AUDIO: number = require('../../assets/bolo3d/lab/swahili-karibu.mp3');
const SAMPLE_MEANING = 'How are you? You are very welcome. Let us learn Swahili together!';

const MOODS: { mood: Mood; label: string }[] = [
  { mood: 'idle', label: 'Idle' },
  { mood: 'listen', label: 'Listening' },
  { mood: 'think', label: 'Thinking' },
  { mood: 'talk', label: 'Talking' },
  { mood: 'sleep', label: 'Asleep' },
];

const GROUPS: { group: ClipGroup; title: string }[] = [
  { group: 'core', title: 'Core' },
  { group: 'parrot', title: 'Bird behaviour' },
  { group: 'expression', title: 'Expression' },
  { group: 'movement', title: 'Movement and flight' },
  { group: 'games', title: 'Games and lessons' },
];

const SIZES = [
  { label: 'Small', height: 180 },
  { label: 'Medium', height: 280 },
  { label: 'Large', height: 400 },
] as const;

export function BoloLab() {
  const colors = useColors();
  const router = useRouter();
  const stage = useRef<Bolo3DHandle>(null);
  const playback = useRef<PlaybackHandle | null>(null);

  const [mood, setMood] = useState<Mood>('idle');
  const [framing, setFraming] = useState<Framing>('full');
  const [height, setHeight] = useState<number>(SIZES[2].height);
  const [cap, setCap] = useState(false);
  const [bandana, setBandana] = useState(false);
  const [reduced, setReduced] = useState<boolean | undefined>(undefined);
  const [still, setStill] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [status, setStatus] = useState('Loading the 3D bird');
  const [speaking, setSpeaking] = useState(false);

  const track = useMemo(() => mouthTrackFromAlignment(SAMPLE.alignment), []);

  useEffect(() => () => playback.current?.stop(), []);

  const speak = async () => {
    playback.current?.stop();
    stage.current?.silence();
    setMood('talk');
    setSpeaking(true);
    setStatus('Speaking the Swahili line');
    playback.current = await playAssetAudio(
      SAMPLE_AUDIO,
      () => {
        stage.current?.silence();
        setSpeaking(false);
        setMood('idle');
        setStatus('Finished speaking');
      },
      // Fires once the clip is actually sounding (lib/audio.ts). The same seam
      // a lesson screen would use, so this is the integration, not a mock-up.
      () => stage.current?.speak(track, 40),
    );
  };

  const stopSpeaking = () => {
    playback.current?.stop();
    playback.current = null;
    stage.current?.silence();
    setSpeaking(false);
    setMood('idle');
  };

  const fileClips = capabilities?.clips.filter((c) => c.source === 'file').length ?? 0;
  const derivedSockets = capabilities?.sockets.filter((s) => s.source !== 'missing').length ?? 0;
  const mappedJoints = capabilities?.joints.filter((j) => j.node).length ?? 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }} testID="bolo-lab-scroll">
        <View style={styles.header}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            style={styles.back}
          >
            <Feather name="chevron-left" size={26} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Bolo Lab</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>The 3D runtime, before Bolo arrives</Text>
          </View>
          <Pressable
            onPress={() => router.push('/bolo-lab-screens')}
            accessibilityRole="button"
            accessibilityLabel="Bolo in the screens"
            testID="bolo-lab-open-screens"
            style={[styles.screensLink, { borderColor: colors.primary }]}
          >
            <Text style={[styles.screensLinkText, { color: colors.primary }]}>Screens</Text>
            <Feather name="chevron-right" size={16} color={colors.primary} />
          </Pressable>
        </View>

        {CHARACTER.rig.standIn ? (
          <View style={[styles.banner, { borderColor: colors.gold, backgroundColor: colors.card }]} testID="bolo-lab-standin-banner">
            <Feather name="alert-triangle" size={16} color={colors.foreground} />
            <Text style={[styles.bannerText, { color: colors.foreground }]}>
              STAND-IN, NOT BOLO. {CHARACTER.rig.credit?.title} by {CHARACTER.rig.credit?.author}. Every screen talks to it in Bolo's names, so her
              file replaces it without code changes.
            </Text>
          </View>
        ) : null}

        <View style={[styles.stageCard, { borderColor: colors.cardBorder, backgroundColor: colors.muted }]}>
          <Bolo3D
            ref={stage}
            testID="bolo-lab-stage"
            mood={mood}
            framing={framing}
            interactive
            reducedMotion={reduced}
            forceFallback={still}
            wear={{ attach_head: cap ? 'standin-cap' : null, attach_body: bandana ? 'standin-bandana' : null }}
            posterPose="wave"
            posterSize={Math.round(height * 0.55)}
            style={{ height }}
            onReady={(caps, ms) => {
              setCapabilities(caps);
              setLoadMs(ms);
              setStatus('Ready. Touch her head, wings, feet or body; drag sideways to spin her');
            }}
            onClip={(e) => {
              if (e.phase === 'start') setStatus(`Playing ${e.clip.replace(/_/g, ' ')} (${e.source === 'file' ? "from the file" : 'stand-in motion'})`);
            }}
            onTap={(part, reaction) =>
              setStatus(part ? `Touched her ${part}${reaction ? `: ${reaction.replace(/_/g, ' ')}` : ''}` : 'Touched beside her')
            }
            onError={(message) => setStatus(`3D problem, showing the still bird: ${message}`)}
          />
          <Text style={[styles.status, { color: colors.mutedForeground }]} testID="bolo-lab-status">
            {status}
          </Text>
        </View>

        <Section title="Speak" colors={colors}>
          <Text style={[styles.sampleText, { color: colors.foreground }]}>{SAMPLE.text}</Text>
          <Text style={[styles.sampleMeaning, { color: colors.mutedForeground }]}>{SAMPLE_MEANING}</Text>
          <View style={styles.row}>
            <Chip
              label={speaking ? 'Stop' : 'Say it'}
              icon={speaking ? 'square' : 'volume-2'}
              onPress={speaking ? stopSpeaking : speak}
              colors={colors}
              testID="bolo-lab-speak"
              strong
            />
          </View>
          <Text style={[styles.note, { color: colors.mutedForeground }]}>
            The beak follows ElevenLabs' own timing for each letter: {track.length} mouth shapes, closing on every m, b and p.
          </Text>
        </Section>

        <Section title="Mood" colors={colors}>
          <View style={styles.wrap}>
            {MOODS.map(({ mood: m, label }) => (
              <Chip key={m} label={label} selected={mood === m} onPress={() => setMood(m)} colors={colors} testID={`bolo-lab-mood-${m}`} />
            ))}
          </View>
        </Section>

        {GROUPS.map(({ group, title }) => (
          <Section key={group} title={title} colors={colors}>
            <View style={styles.wrap}>
              {CLIPS.filter((c) => c.group === group).map((clip) => (
                <Chip
                  key={clip.name}
                  label={clip.name.replace(/_/g, ' ')}
                  onPress={() => stage.current?.play(clip.name as ClipName)}
                  colors={colors}
                  testID={`bolo-lab-clip-${clip.name}`}
                />
              ))}
            </View>
          </Section>
        ))}

        <Section title="Wardrobe sockets" colors={colors}>
          <View style={styles.wrap}>
            <Chip label="Cap (attach_head)" selected={cap} onPress={() => setCap((v) => !v)} colors={colors} testID="bolo-lab-wear-cap" />
            <Chip label="Bandana around the neck" selected={bandana} onPress={() => setBandana((v) => !v)} colors={colors} testID="bolo-lab-wear-bandana" />
          </View>
          <Text style={[styles.note, { color: colors.mutedForeground }]}>
            Placeholder pieces, sized from the bird they are put on: the bandana follows the measured outline of her neck and turns with it. Real garments are their own commission.
          </Text>
        </Section>

        <Section title="View" colors={colors}>
          <View style={styles.wrap}>
            <Chip label="Whole bird" selected={framing === 'full'} onPress={() => setFraming('full')} colors={colors} testID="bolo-lab-framing-full" />
            <Chip label="Close up" selected={framing === 'bust'} onPress={() => setFraming('bust')} colors={colors} testID="bolo-lab-framing-bust" />
          </View>
          <View style={styles.wrap}>
            {SIZES.map((s) => (
              <Chip key={s.label} label={`${s.label}, ${s.height} pt`} selected={height === s.height} onPress={() => setHeight(s.height)} colors={colors} testID={`bolo-lab-size-${s.height}`} />
            ))}
          </View>
          <View style={styles.wrap}>
            <Chip
              label="Reduce Motion"
              selected={reduced === true}
              onPress={() => setReduced((v) => (v ? undefined : true))}
              colors={colors}
              testID="bolo-lab-reduce-motion"
            />
            <Chip label="Still fallback" selected={still} onPress={() => setStill((v) => !v)} colors={colors} testID="bolo-lab-still" />
          </View>
        </Section>

        <Section title="What the loaded file offers" colors={colors}>
          {capabilities ? (
            <View style={{ gap: 6 }} testID="bolo-lab-capabilities">
              <Fact label="Rig" value={`${capabilities.label}, loaded in ${loadMs} ms`} colors={colors} />
              <Fact label="Size" value={`${capabilities.triangles.toLocaleString()} triangles, ${(capabilities.bytes / 1024 / 1024).toFixed(2)} MB`} colors={colors} />
              <Fact label="Clips" value={`${fileClips} of ${capabilities.clips.length} from the file, the rest stand-in motion`} colors={colors} />
              <Fact label="Face" value={capabilities.face === 'shape-keys' ? 'Shape keys' : capabilities.face === 'jaw' ? 'Jaw only, no shape keys' : 'None'} colors={colors} />
              <Fact label="Joints" value={`${mappedJoints} of ${capabilities.joints.length} mapped, pivots from ${capabilities.pivots === 'skin' ? 'skin weights' : 'bones'}`} colors={colors} />
              <Fact label="Sockets" value={`${derivedSockets} of 4 (${capabilities.sockets.map((s) => s.source).join(', ')})`} colors={colors} />
              <Fact
                label="Brief audit"
                value={capabilities.audit.ok ? 'Passes' : `Fails: ${capabilities.audit.failed.join(', ')}`}
                colors={colors}
              />
            </View>
          ) : (
            <Text style={[styles.note, { color: colors.mutedForeground }]}>Waiting for the stage.</Text>
          )}
        </Section>

        {CHARACTER.rig.credit ? (
          <Text style={[styles.credit, { color: colors.mutedForeground }]}>
            "{CHARACTER.rig.credit.title}" by {CHARACTER.rig.credit.author}, {CHARACTER.rig.credit.license}, {CHARACTER.rig.credit.source}. Trimmed and its eyes
            re-seated for this lab.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

type Colors = ReturnType<typeof useColors>;

function Section({ title, colors, children }: { title: string; colors: Colors; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {children}
    </View>
  );
}

function Fact({ label, value, colors }: { label: string; value: string; colors: Colors }) {
  return (
    <Text style={[styles.fact, { color: colors.foreground }]}>
      <Text style={{ fontFamily: AppFonts.bold }}>{label}: </Text>
      {value}
    </Text>
  );
}

/**
 * Selected is shown three ways, never by colour alone: a check mark, a heavier
 * border and bold text (the owner is partially colour blind).
 */
function Chip({
  label,
  onPress,
  selected = false,
  icon,
  strong = false,
  colors,
  testID,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  strong?: boolean;
  colors: Colors;
  testID?: string;
}) {
  const filled = selected || strong;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: filled ? colors.primary : colors.cardBorder,
          borderWidth: filled ? 2 : 1,
          backgroundColor: filled ? colors.primary : colors.card,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {selected ? <Feather name="check" size={14} color={colors.primaryForeground} /> : null}
      {icon ? <Feather name={icon} size={14} color={filled ? colors.primaryForeground : colors.foreground} /> : null}
      <Text
        style={[
          styles.chipText,
          { color: filled ? colors.primaryForeground : colors.foreground, fontFamily: filled ? AppFonts.bold : AppFonts.semibold },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  back: { padding: 4 },
  screensLink: { flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 2, borderRadius: 999, paddingLeft: 12, paddingRight: 8, paddingVertical: 6 },
  screensLinkText: { fontFamily: AppFonts.bold, fontSize: 14 },
  title: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 14 },
  banner: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12, padding: 10, borderWidth: 2, borderRadius: 12, alignItems: 'flex-start' },
  bannerText: { flex: 1, fontFamily: AppFonts.semibold, fontSize: 13, lineHeight: 18 },
  stageCard: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  status: { fontFamily: AppFonts.semibold, fontSize: 13, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  section: { marginHorizontal: 16, marginTop: 18, gap: 8 },
  sectionTitle: { fontFamily: AppFonts.bold, fontSize: 17 },
  row: { flexDirection: 'row', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: 14 },
  sampleText: { fontFamily: AppFonts.bold, fontSize: 18 },
  sampleMeaning: { fontFamily: AppFonts.regular, fontSize: 14 },
  note: { fontFamily: AppFonts.regular, fontSize: 13, lineHeight: 18 },
  fact: { fontFamily: AppFonts.regular, fontSize: 14, lineHeight: 20 },
  credit: { fontFamily: AppFonts.regular, fontSize: 12, lineHeight: 17, marginHorizontal: 16, marginTop: 24 },
});
