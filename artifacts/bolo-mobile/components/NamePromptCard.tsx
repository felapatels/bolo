import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useUser } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUpdateAccountProfile } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/** Persisted flag: the learner dismissed the one-time name prompt. */
export const NAME_PROMPT_DISMISSED_KEY = 'bolo.namePromptDismissed';

/**
 * One-time, dismissible prompt shown on the home screen when the Clerk
 * profile has no first name. Submitting goes through the same dual-write
 * path as settings (PATCH /account/profile updates Clerk and
 * users.display_name), then reloads the Clerk user so every consumer sees
 * the new name. Dismissal persists on device and never nags again;
 * settings remains the edit path.
 */
export function NamePromptCard() {
  const colors = useColors();
  const { user } = useUser();
  const updateProfile = useUpdateAccountProfile();
  // null = persisted dismissal still loading, so render nothing (no flash).
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(NAME_PROMPT_DISMISSED_KEY)
      .then((v) => { if (!cancelled) setDismissed(v === '1'); })
      .catch(() => { if (!cancelled) setDismissed(false); });
    return () => { cancelled = true; };
  }, []);

  if (!user || user.firstName || dismissed !== false) return null;

  const handleDismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(NAME_PROMPT_DISMISSED_KEY, '1').catch(() => {});
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await updateProfile.mutateAsync({ data: { displayName: trimmed } });
      await user.reload();
      handleDismiss();
    } catch {
      setSaving(false);
    }
  };

  return (
    <View
      testID="name-prompt-card"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          What should Bolo call you?
        </Text>
        <Pressable
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss name prompt"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID="name-prompt-dismiss"
        >
          <Feather name="x" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View style={styles.row}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="words"
          testID="name-prompt-input"
          style={[
            styles.input,
            { color: colors.foreground, borderColor: colors.border },
          ]}
        />
        <Pressable
          onPress={handleSave}
          disabled={!name.trim() || saving}
          accessibilityRole="button"
          accessibilityLabel="Save name"
          testID="name-prompt-save"
          style={[
            styles.saveBtn,
            { backgroundColor: colors.primary, opacity: !name.trim() || saving ? 0.5 : 1 },
          ]}
        >
          <Text style={[styles.saveText, { color: colors.primaryForeground }]}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.note, { color: colors.mutedForeground }]}>
        You can change this any time in Settings.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontFamily: AppFonts.bold, fontSize: 15, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: AppFonts.regular,
    fontSize: 15,
  },
  saveBtn: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontFamily: AppFonts.bold, fontSize: 14 },
  note: { fontFamily: AppFonts.regular, fontSize: 12 },
});
