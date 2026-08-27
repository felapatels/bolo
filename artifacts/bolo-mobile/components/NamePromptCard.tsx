import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useUser } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useUpdateAccountProfile,
  useGetAccount,
  getGetAccountQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Confetti } from '@/components/Confetti';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * How long the welcome holds before the lightbox closes itself.
 *
 * IT MUST OUTLAST THE BURST. At 1900 it did not: Confetti's default pacing
 * starts pieces over 1200ms and takes 2200 to 4000ms to land them, so the modal
 * unmounted with the celebration still in the air and the owner saw nothing.
 * The burst pace lands everything inside ~1920ms; this holds past that.
 */
const WELCOME_MS = 2400;

/** Persisted flag: the learner dismissed the one-time username prompt. */
export const USERNAME_PROMPT_DISMISSED_KEY = 'bolo.usernamePromptDismissed';
/** The retired key. Named so nobody reuses it and re-suppresses the new prompt. */
export const NAME_PROMPT_DISMISSED_KEY = 'bolo.namePromptDismissed';

/**
 * One-time, dismissible home prompt for the PUBLIC USERNAME.
 *
 * IT USED TO ASK FOR A DISPLAY NAME. Changed 2026-08-25: "the username prompt
 * should be on the homepage instead of the display name prompt". The display
 * name is private and Clerk already has a first name for most learners, so
 * that prompt asked for something the app mostly had. The username is the one
 * thing the app cannot derive and must not default: it is what other learners
 * see, and until it exists the learner appears on no global surface at all.
 *
 * A NEW DISMISSAL KEY, DELIBERATELY. Anybody who dismissed the old prompt
 * would otherwise never see this one, and they are exactly the population that
 * needs asking, since every existing account has username null.
 *
 * DISMISSIBLE, AND THAT IS THE POINT. A username is opt-in by an act, and a
 * prompt that cannot be closed is not a choice.
 *
 * A LIGHTBOX, NOT A CARD IN THE PAGE, since 2026-08-27 (chat 12): "let's make
 * the pick a username a lightbox type thing that sits over the stats until
 * it's dismissed or saved". In the flow it pushed the whole home page down,
 * so the boarding pass and the stats banner sat below the fold on first run,
 * for a prompt most learners answer once.
 *
 * TWO WAYS OUT, AND THEY ARE NOT THE SAME WAY. The X is the ACT: it writes the
 * dismissal and the prompt never returns. Tapping the backdrop only snoozes it
 * for this mount, and it is back on the next launch. That split is deliberate:
 * a lightbox nobody can tap away is a trap, but a stray tap on a dimmed
 * backdrop must not silently opt a learner out of every social surface in the
 * app for good.
 */
export function NamePromptCard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const updateProfile = useUpdateAccountProfile();
  const account = useGetAccount();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // null = persisted dismissal still loading, so render nothing (no flash).
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  // Backdrop tap: gone for this mount, back next launch. Never persisted.
  const [snoozed, setSnoozed] = useState(false);
  // The saved name, held just long enough to say hello with it.
  const [welcome, setWelcome] = useState<string | null>(null);
  const welcomeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // A timer that outlives its screen is a crash waiting for a slow render.
  useEffect(
    () => () => {
      if (welcomeTimer.current) clearTimeout(welcomeTimer.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(USERNAME_PROMPT_DISMISSED_KEY)
      .then((v) => { if (!cancelled) setDismissed(v === '1'); })
      .catch(() => { if (!cancelled) setDismissed(false); });
    return () => { cancelled = true; };
  }, []);

  // Waits for the account rather than assuming: rendering while the profile
  // loads would flash the prompt at somebody who already has a name.
  const profile = account.data?.profile;
  if (!user || !profile || profile.username || dismissed !== false) return null;

  const handleDismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(USERNAME_PROMPT_DISMISSED_KEY, '1').catch(() => {});
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile.mutateAsync({ data: { username: trimmed } });
      await qc.invalidateQueries({ queryKey: getGetAccountQueryKey() });
      // A BEAT TO SAY HELLO, then out. Asked for on sight: "let's do a quick
      // confetti burst celebration when they enter their username and save,
      // with a Welcome [username]". Picking a username is the moment a learner
      // becomes visible to everyone else in the app, and it used to be
      // acknowledged by the box simply vanishing.
      setWelcome(trimmed);
      welcomeTimer.current = setTimeout(() => {
        welcomeTimer.current = null;
        handleDismiss();
      }, WELCOME_MS);
    } catch (err) {
      // THE SERVER'S OWN SENTENCE. Only it knows which rule broke: shape, a
      // reserved word, the profanity screen, or a name already taken.
      const data = (err as { data?: { error?: string } } | null)?.data;
      setError(data?.error ?? 'Couldn’t save that. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={!snoozed}
      transparent
      animationType="fade"
      // The Android back button snoozes rather than dismisses, for the same
      // reason the backdrop does.
      onRequestClose={() => setSnoozed(true)}
      statusBarTranslucent
    >
      <Pressable
        testID="name-prompt-backdrop"
        accessibilityRole="button"
        accessibilityLabel="Close for now"
        onPress={() => setSnoozed(true)}
        style={styles.backdrop}
      >
        {/* HIGH, NOT CENTRED. Centred, it landed squarely on the boarding
            pass: "move that up and don't cover the boarding pass widget"
            (owner, chat 12). The hero is the one thing on this page a learner
            might want to reach WHILE deciding about a username, and a prompt
            that hides the reason you opened the app is the wrong prompt.
            Measured off the safe area rather than a flat number, so a notch, a
            Dynamic Island and an Android status bar all put it in the same
            place relative to the greeting. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.top, { paddingTop: insets.top + 96 }]}
        >
          {/* Swallows taps so a press INSIDE the card never reaches the
              backdrop behind it and closes the thing being filled in. */}
          <Pressable onPress={() => {}} style={styles.cardWrap}>
    {welcome ? (
      <View
        testID="name-prompt-welcome"
        style={[
          styles.card,
          styles.welcomeCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>
          Welcome, {welcome}!
        </Text>
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          You’re on the Everyone board and the feed now.
        </Text>
      </View>
    ) : (
    <View
      testID="name-prompt-card"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Pick a username
        </Text>
        <Pressable
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss username prompt"
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
          placeholder="Your username"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
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
          accessibilityLabel="Save username"
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
      {error ? (
        <Text style={[styles.note, { color: '#EF4444' }]}>{error}</Text>
      ) : null}
      <Text style={[styles.note, { color: colors.mutedForeground }]}>
        This is the name other learners see on the Everyone board and feed. You
        can change it any time in Settings, or skip and stay anonymous.
      </Text>
    </View>
    )}
          </Pressable>
        </KeyboardAvoidingView>
        {/* OVER THE CARD AND OUT OF THE WAY OF IT. pointerEvents none so the
            burst never eats the tap that closes the lightbox behind it. */}
        {welcome ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Confetti pace="burst" />
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17, 12, 8, 0.55)' },
  top: { flex: 1, justifyContent: 'flex-start', paddingHorizontal: 20 },
  cardWrap: { width: '100%' },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    // NO marginBottom. It had one for the days it sat in the page flow and
    // needed clearing from the card under it; in a lightbox that margin is
    // just the box hanging off centre.
    gap: 10,
    // It floats now, so it casts. iOS shadow; Android takes elevation.
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
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
  welcomeCard: { alignItems: 'center', paddingVertical: 22, gap: 6 },
  welcomeTitle: { fontFamily: AppFonts.extrabold, fontSize: 20, textAlign: 'center' },
  note: { fontFamily: AppFonts.regular, fontSize: 12 },
});
