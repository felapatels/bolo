// Voice selection screen: Plus learners pick their preferred TTS voice.
// The catalog is the same ten curated ElevenLabs premade voices listed in
// the server's VOICE_CATALOG. Free learners see the picker locked with an
// upgrade banner. Auto (null) is always shown as the first option.
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  useGetAccount,
  getGetAccountQueryKey,
  useUpdateAccountPreferences,
  type VoiceCatalogEntry,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { playBase64Audio } from '@/lib/audio';
import { synthesizeSpeech } from '@workspace/api-client-react';

// Fixed sample phrase used to audition each voice in the picker.
const VOICE_SAMPLE_TEXT = 'Namaste, I am learning your language.';

// Module-level audio cache: voiceId → base64 audio. Shared across renders so
// re-tapping a voice that's already been fetched plays instantly.
const mobileSampleCache = new Map<string, string>();

// Curated voice catalog — matches the server's VOICE_CATALOG exactly.
const VOICE_CATALOG: VoiceCatalogEntry[] = [
  {
    id: 'JBFqnCBsd6RMkjVDRZzb',
    name: 'George',
    gender: 'male',
    description: 'Warm British male with a calm, trustworthy tone.',
  },
  {
    id: 'nPczCjzI2devNBz1zQrb',
    name: 'Brian',
    gender: 'male',
    description: 'Deep, resonant American male — great for North Indian languages.',
  },
  {
    id: 'cjVigY5qzO86Huf0OWal',
    name: 'Eric',
    gender: 'male',
    description: 'Friendly, clear American male with a bright, energetic style.',
  },
  {
    id: 'IKne3meq5aSn9XLyUdCD',
    name: 'Charlie',
    gender: 'male',
    description: 'Upbeat, natural male voice with lively prosody.',
  },
  {
    id: 'pqHfZKP75CvOlQylNhV4',
    name: 'Bill',
    gender: 'male',
    description: 'Strong, narrative male with commanding presence.',
  },
  {
    id: 'onwK4e9ZLuTAKqWW03F9',
    name: 'Daniel',
    gender: 'male',
    description: 'Authoritative British male with a measured, formal delivery.',
  },
  {
    id: 'Xb7hH8MSUJpSbSDYk0k2',
    name: 'Alice',
    gender: 'female',
    description: 'Confident British female with a clear, professional tone.',
  },
  {
    id: 'XB0fDUnXU5powFXDhCwa',
    name: 'Charlotte',
    gender: 'female',
    description: 'Warm, expressive female voice with a Swedish lilt.',
  },
  {
    id: 'FGY2WhTYpPnrIDTdsKH5',
    name: 'Laura',
    gender: 'female',
    description: 'Bright, upbeat female voice — cheerful and encouraging.',
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah',
    gender: 'female',
    description: 'Gentle, articulate American female with natural warmth.',
  },
];

export default function VoiceScreen() {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const account = useGetAccount();
  const updatePrefs = useUpdateAccountPreferences();
  const { isPlus } = useEntitlements();
  const isPaid = isPlus;

  const current = account.data?.preferences.learning.ttsVoice ?? null;
  const [saving, setSaving] = React.useState<string | null | 'auto'>(undefined as unknown as string | null);

  const select = async (voiceId: string | null) => {
    if (!isPaid) return;
    setSaving(voiceId ?? 'auto');
    try {
      const res = await updatePrefs.mutateAsync({ data: { ttsVoice: voiceId } });
      if (account.data) {
        qc.setQueryData(getGetAccountQueryKey(), {
          ...account.data,
          preferences: res.preferences,
        });
      }
    } catch {
      // ignore — the server error is non-blocking
    } finally {
      setSaving(undefined as unknown as string | null);
    }
  };

  return (
    <Screen padTop={false}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.muted }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Voice</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Free-tier upgrade banner */}
        {!isPaid ? (
          <View
            style={[
              styles.upgradeBanner,
              { backgroundColor: `${colors.primary}18`, borderColor: colors.primary },
            ]}
          >
            <Feather name="star" size={18} color={colors.primary} />
            <Text style={[styles.upgradeText, { color: colors.foreground }]}>
              Voice selection is an{' '}
              <Text style={{ color: colors.primary, fontFamily: AppFonts.extrabold }}>
                All-Access
              </Text>{' '}
              feature. Upgrade to pick your preferred voice.
            </Text>
          </View>
        ) : (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Your chosen voice plays for all languages on every device.
          </Text>
        )}

        {/* Auto (recommended) */}
        <VoiceRow
          id={null}
          name="Auto (recommended)"
          gender={null}
          description="Uses the best voice for each language automatically."
          active={current === null}
          locked={!isPaid}
          saving={saving === 'auto'}
          onPress={() => select(null)}
          colors={colors}
        />

        {/* Catalog voices */}
        {VOICE_CATALOG.map((v) => (
          <VoiceRow
            key={v.id}
            id={v.id}
            name={v.name}
            gender={v.gender}
            description={v.description}
            active={current === v.id}
            locked={!isPaid}
            saving={saving === v.id}
            onPress={() => select(v.id)}
            colors={colors}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

function VoiceRow({
  id,
  name,
  gender,
  description,
  active,
  locked,
  saving,
  onPress,
  colors,
}: {
  id: string | null;
  name: string;
  gender: 'male' | 'female' | null;
  description: string;
  active: boolean;
  locked: boolean;
  saving: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [sampleState, setSampleState] = React.useState<'idle' | 'loading' | 'playing'>('idle');
  const currentPlayerRef = React.useRef<{ stop: () => void } | null>(null);

  async function handlePlaySample() {
    // Stop any in-progress playback for this row.
    if (currentPlayerRef.current) {
      currentPlayerRef.current.stop();
      currentPlayerRef.current = null;
    }

    if (sampleState === 'playing') {
      setSampleState('idle');
      return;
    }

    setSampleState('loading');
    try {
      let base64 = mobileSampleCache.get(id!);
      let format = 'mp3';

      if (!base64) {
        const result = await synthesizeSpeech({ text: VOICE_SAMPLE_TEXT, previewVoiceId: id! });
        base64 = result.audioBase64;
        format = result.format;
        mobileSampleCache.set(id!, base64);
      }

      setSampleState('playing');
      const handle = await playBase64Audio(base64, format, () => {
        setSampleState('idle');
        currentPlayerRef.current = null;
      });
      currentPlayerRef.current = handle;
    } catch {
      setSampleState('idle');
    }
  }

  return (
    <View
      style={[
        styles.voiceRow,
        {
          backgroundColor: active ? `${colors.primary}12` : colors.card,
          borderColor: active ? colors.primary : colors.border,
          opacity: locked ? 0.6 : 1,
        },
      ]}
    >
      {/* Selection area */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled: locked }}
        onPress={locked ? undefined : onPress}
        disabled={saving}
        style={{ flex: 1 }}
      >
        <View style={styles.rowTop}>
          <Text style={[styles.voiceName, { color: colors.foreground }]}>{name}</Text>
          {gender ? (
            <View
              style={[
                styles.genderChip,
                {
                  backgroundColor:
                    gender === 'female' ? `${colors.accent}25` : `${colors.primary}18`,
                },
              ]}
            >
              <Text
                style={[
                  styles.genderText,
                  { color: gender === 'female' ? colors.accent : colors.primary },
                ]}
              >
                {gender}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.voiceDesc, { color: colors.mutedForeground }]}>
          {description}
        </Text>
      </Pressable>

      {/* Play sample button — only for named voices */}
      {id && !locked ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sampleState === 'playing' ? 'Stop sample' : 'Play voice sample'}
          onPress={handlePlaySample}
          disabled={sampleState === 'loading'}
          style={styles.sampleBtn}
        >
          {sampleState === 'loading' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : sampleState === 'playing' ? (
            <Feather name="square" size={16} color={colors.primary} />
          ) : (
            <Feather name="play" size={16} color={colors.mutedForeground} />
          )}
        </Pressable>
      ) : (
        <View style={styles.indicator}>
          {locked ? (
            <Feather name="lock" size={16} color={colors.mutedForeground} />
          ) : saving ? (
            <Feather name="loader" size={18} color={colors.primary} />
          ) : active ? (
            <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
              <Feather name="check" size={13} color={colors.primaryForeground} />
            </View>
          ) : (
            <View style={[styles.emptyCircle, { borderColor: colors.border }]} />
          )}
        </View>
      )}

      {/* Selection indicator when play button is shown */}
      {id && !locked ? (
        <View style={styles.indicator}>
          {saving ? (
            <Feather name="loader" size={18} color={colors.primary} />
          ) : active ? (
            <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
              <Feather name="check" size={13} color={colors.primaryForeground} />
            </View>
          ) : (
            <View style={[styles.emptyCircle, { borderColor: colors.border }]} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  hint: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  upgradeText: { flex: 1, fontFamily: AppFonts.semibold, fontSize: 14, lineHeight: 20 },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 10,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  voiceName: { fontFamily: AppFonts.bold, fontSize: 15 },
  voiceDesc: { fontFamily: AppFonts.regular, fontSize: 13, lineHeight: 18 },
  genderChip: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  genderText: { fontFamily: AppFonts.semibold, fontSize: 11 },
  indicator: { width: 24, alignItems: 'center' },
  sampleBtn: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
});
