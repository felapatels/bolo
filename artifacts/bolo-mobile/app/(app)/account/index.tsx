import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
// Use React Native's built-in Image (not expo-image): this screen only shows a
// simple avatar, and expo-image's native view fails to resolve in some Expo Go
// versions, hard-crashing the whole Account screen.
import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useUser, useClerk } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAccount,
  getGetAccountQueryKey,
  useUpdateAccountProfile,
  useUpdateAccountPreferences,
  useDeleteAccount,
  type Account,
  type UpdatePreferencesInput,
} from '@workspace/api-client-react';
import { FunFactLoader } from '@/components/FunFactLoader';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemePref, type ThemePref } from '@/contexts/ThemeContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import {
  loadSpokenFeedback,
  saveSpokenFeedback,
  loadSilentMode,
  saveSilentMode,
} from '@/lib/settings';
import { loadSoundPref, saveSoundPref } from '@/lib/soundPref';
import { loadMeaningAudio, saveMeaningAudio } from '@/lib/meaning-audio';
import {
  apiFailureDetail,
  apiFailureMessage,
  reportApiFailure,
} from '@/lib/apiErrors';
import { loadCoachVoicePref, saveCoachVoicePref } from '@/lib/coachVoicePref';
import { hapticLight } from '@/lib/haptics';

// The account & settings hub. Everything that used to live as a lone sign-out
// icon on Home now lives here: profile (name + avatar), identity changes
// (email/password via Clerk on their own screens), notification and learning
// preferences (persisted through the backend account endpoints), the
// subscription-management entry point (which routes into its own screen), and
// the guarded account deletion.
export default function AccountScreen() {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { activeLanguage } = useLanguage();
  const { setThemePref } = useThemePref();

  const account = useGetAccount();
  const updateProfile = useUpdateAccountProfile();
  const updatePrefs = useUpdateAccountPreferences();
  const deleteAccount = useDeleteAccount();

  // Local mirror of the server preferences so toggles feel instant. Seeded once
  // from the first successful load; the server response then keeps it in sync.
  const [prefs, setPrefs] = React.useState<Account['preferences'] | null>(null);

  // Device-local practice preference: whether the coach's feedback is read
  // aloud after scoring. Stored on this device only (same pattern as the
  // auto-stop setting), so it applies instantly and never syncs.
  const [spokenFeedback, setSpokenFeedback] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    loadSpokenFeedback().then((enabled) => {
      if (!cancelled) setSpokenFeedback(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const changeSpokenFeedback = (enabled: boolean) => {
    hapticLight();
    setSpokenFeedback(enabled);
    void saveSpokenFeedback(enabled);
  };

  // Device-local practice preference: whether the coach says the English
  // meaning after each phrase clip. Same async-load shape as spokenFeedback.
  const [meaningAudio, setMeaningAudio] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    loadMeaningAudio().then((enabled) => {
      if (!cancelled) setMeaningAudio(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const changeMeaningAudio = (enabled: boolean) => {
    hapticLight();
    setMeaningAudio(enabled);
    void saveMeaningAudio(enabled);
  };

  // Silent mode: skip coach voice auto-play on each phrase so the learner can
  // read the word themselves and record immediately. Device-local, like above.
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [timezoneModalVisible, setTimezoneModalVisible] = React.useState(false);
  const [timezoneInput, setTimezoneInput] = React.useState('');
  const [silentMode, setSilentMode] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    loadSilentMode().then((enabled) => {
      if (!cancelled) setSilentMode(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const changeSilentMode = (enabled: boolean) => {
    hapticLight();
    setSilentMode(enabled);
    void saveSilentMode(enabled);
  };

  // Device-local: whether sound effects (audio cues) play during practice.
  // Default on. Same async-load pattern as spokenFeedback / silentMode above.
  const [soundOn, setSoundOn] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    loadSoundPref().then((enabled) => {
      if (!cancelled) setSoundOn(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const changeSoundOn = (enabled: boolean) => {
    hapticLight();
    setSoundOn(enabled);
    void saveSoundPref(enabled);
  };

  // Device-local: whether Bolo's voice plays (phrase audio, meaning audio,
  // feedback read-aloud, band call-outs, chat replies, greeting). Default on.
  const [coachVoiceOn, setCoachVoiceOn] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    loadCoachVoicePref().then((enabled) => {
      if (!cancelled) setCoachVoiceOn(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const changeCoachVoiceOn = (enabled: boolean) => {
    hapticLight();
    setCoachVoiceOn(enabled);
    void saveCoachVoicePref(enabled);
  };

  type VoiceMode = 'on' | 'tap' | 'off';

  /** One control, two stored keys. The pairing coachVoice=off plus
   *  silentMode=off was expressible and meaningless: nothing to skip,
   *  and the card entered playing_coach with no audio. Three states
   *  cannot express it. */
  const voiceMode: VoiceMode = !coachVoiceOn
    ? 'off'
    : silentMode
      ? 'tap'
      : 'on';

  const VOICE_MODE_SUB: Record<VoiceMode, string> = {
    on: 'Bolo speaks, and phrases play on their own',
    tap: 'Bolo speaks, but you tap to hear each phrase',
    off: 'Bolo is silent everywhere',
  };

  /** Segmented already fires the tap haptic, and the two states that write
   *  both keys would call changeCoachVoiceOn and changeSilentMode back to
   *  back, firing hapticLight twice. So this sets state and persists
   *  directly, matching those handlers' bodies exactly minus the haptic.
   *  'off' deliberately leaves silentMode as it is. */
  const changeVoiceMode = (mode: string) => {
    if (mode === 'off') {
      setCoachVoiceOn(false);
      void saveCoachVoicePref(false);
      return;
    }
    setCoachVoiceOn(true);
    void saveCoachVoicePref(true);
    const silent = mode === 'tap';
    setSilentMode(silent);
    void saveSilentMode(silent);
  };

  const [name, setName] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [shareStats, setShareStats] = React.useState(true);
  const [avatarBusy, setAvatarBusy] = React.useState(false);
  const seeded = React.useRef(false);

  React.useEffect(() => {
    if (account.data && !seeded.current) {
      seeded.current = true;
      setPrefs(account.data.preferences);
      setName(account.data.profile.displayName ?? user?.firstName ?? '');
      setUsername(account.data.profile.username ?? '');
      setShareStats(account.data.profile.shareStats ?? true);
      // Bring the saved theme down so it applies on this device too.
      setThemePref(account.data.preferences.learning.theme as ThemePref);
    }
  }, [account.data, user?.firstName, setThemePref]);

  // The settings load is the app's ONLY unmasked API failure (home and the
  // tabs fall back silently), so when it fails the cause has to reach Sentry
  // with its status, endpoint and Clerk auth reason — not just a friendly line
  // on screen. Keyed on the error object so one failure reports once.
  React.useEffect(() => {
    if (account.isError) reportApiFailure('account.load', account.error);
  }, [account.isError, account.error]);

  const applyAccount = (next: Account) => {
    qc.setQueryData(getGetAccountQueryKey(), next);
  };

  // Persist a subset of the preferences, updating the local mirror optimistically
  // and reconciling with the server's authoritative response.
  const savePrefs = async (patch: UpdatePreferencesInput) => {
    const previous = prefs;
    setPrefs((p) => (p ? mergePrefs(p, patch) : p));
    try {
      const res = await updatePrefs.mutateAsync({ data: patch });
      setPrefs(res.preferences);
      if (account.data) applyAccount({ ...account.data, preferences: res.preferences });
    } catch {
      setPrefs(previous ?? null);
      account.refetch();
      Alert.alert('Couldn’t save', 'That change didn’t stick. Please try again.');
    }
  };

  /**
   * The PUBLIC name, and the private toggle beside it.
   *
   * Separate from displayName and not a rename of it: the display name was
   * chosen while it was private, and publishing it on the learner's behalf is
   * not ours to do. See lib/db users.username.
   */
  const saveUsername = async () => {
    const trimmed = username.trim();
    if (!trimmed || trimmed === (account.data?.profile.username ?? '')) return;
    try {
      const res = await updateProfile.mutateAsync({ data: { username: trimmed } });
      if (account.data) applyAccount({ ...account.data, profile: res.profile });
    } catch (err) {
      // The server's sentence is the useful one: it says WHY, whether that is
      // shape, a reserved word, the profanity screen or a name already taken.
      const data = (err as { data?: { error?: string } } | null)?.data;
      Alert.alert(
        'Couldn’t save that username',
        data?.error ?? 'Please pick another and try again.',
      );
      setUsername(account.data?.profile.username ?? '');
    }
  };

  const saveShareStats = async (next: boolean) => {
    const previous = shareStats;
    setShareStats(next);
    try {
      const res = await updateProfile.mutateAsync({ data: { shareStats: next } });
      if (account.data) applyAccount({ ...account.data, profile: res.profile });
    } catch {
      setShareStats(previous);
      Alert.alert('Couldn’t save', 'That change didn’t stick. Please try again.');
    }
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === (account.data?.profile.displayName ?? '')) return;
    try {
      const res = await updateProfile.mutateAsync({ data: { displayName: trimmed } });
      if (account.data) applyAccount({ ...account.data, profile: res.profile });
      // The backend mirrors the name to Clerk; reload so Home reflects it too.
      await user?.reload();
    } catch {
      Alert.alert('Couldn’t save', 'We couldn’t update your name. Please try again.');
    }
  };

  const pickAvatarFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow photo access in Settings to choose a profile picture.',
      );
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
    } catch (err) {
      console.error('[account] launchImageLibraryAsync failed', err);
      Alert.alert('Something went wrong', 'We couldn’t open your photo library. Please try again.');
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    await uploadAvatar(result.assets[0].uri);
  };

  const pickAvatarFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Camera access needed',
        'Allow camera access in Settings to take a profile picture.',
      );
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
    } catch (err) {
      console.error('[account] launchCameraAsync failed', err);
      Alert.alert('Something went wrong', 'We couldn’t open the camera. Please try again.');
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    await uploadAvatar(result.assets[0].uri);
  };

  const uploadAvatar = async (uri: string) => {
    setAvatarBusy(true);
    try {
      // Clerk's string overload requires a base64 data URL, not a file:// URI.
      // Read the picked image via expo-file-system and build one.
      let dataUrl: string;
      try {
        const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });
        dataUrl = `data:${mime};base64,${base64}`;
      } catch (err) {
        console.error('[account] failed to read picked image as base64', err);
        Alert.alert('Something went wrong', "We couldn't read that photo. Please try a different image.");
        return;
      }
      try {
        await user?.setProfileImage({ file: dataUrl });
        await user?.reload();
      } catch (err) {
        console.error('[account] Clerk setProfileImage failed', err);
        Alert.alert('Something went wrong', "We couldn't upload your photo. Please try again.");
        return;
      }
      try {
        const res = await updateProfile.mutateAsync({
          data: { avatarUrl: user?.imageUrl ?? null },
        });
        if (account.data) applyAccount({ ...account.data, profile: res.profile });
      } catch (err) {
        console.error('[account] failed to sync avatarUrl to backend', err);
        Alert.alert(
          'Photo uploaded, but not saved',
          'Your new photo uploaded but we couldn’t save it to your account. Please try again.',
        );
      }
    } finally {
      setAvatarBusy(false);
    }
  };

  const pickAvatar = () => {
    Alert.alert('Update profile picture', undefined, [
      { text: 'Take Photo', onPress: pickAvatarFromCamera },
      { text: 'Choose from Library', onPress: pickAvatarFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const doSignOut = async () => {
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all your progress. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount.mutateAsync();
              await signOut();
              router.replace('/(auth)/sign-in');
            } catch {
              Alert.alert(
                'Couldn’t delete account',
                'Something went wrong. Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const avatarUrl = user?.imageUrl ?? account.data?.profile.avatarUrl ?? null;
  const email =
    user?.primaryEmailAddress?.emailAddress ?? account.data?.profile.email ?? '—';
  const nameChanged =
    name.trim().length > 0 && name.trim() !== (account.data?.profile.displayName ?? '');

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerLabel, { color: colors.foreground }]}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      {account.isLoading ? (
        <FunFactLoader color={colors.primary} style={{ marginTop: 48 }} />
      ) : account.isError ? (
        <View style={styles.centerState}>
          <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            {apiFailureMessage(account.error)}
          </Text>
          {/* Deliberately visible: the failing endpoint + status (and Clerk's
              reason on a 401). This screen is the only one that surfaces an API
              failure instead of falling back silently, so its screenshot has to
              be diagnostic on its own — App Review's build 34 rejection was
              unactionable precisely because this line did not exist. */}
          <Text style={[styles.stateDetail, { color: colors.mutedForeground }]}>
            {apiFailureDetail(account.error)}
          </Text>
          <ChunkyButton
            title="Retry"
            icon="refresh-cw"
            onPress={() => account.refetch()}
            style={{ marginTop: 6, alignSelf: 'stretch' }}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE }}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.profileRow}>
              <Pressable
                accessibilityLabel="Change profile picture"
                onPress={pickAvatar}
                disabled={avatarBusy}
                style={styles.avatarWrap}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.muted }]}>
                    <Feather name="user" size={30} color={colors.mutedForeground} />
                  </View>
                )}
                <View style={[styles.avatarBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
                  {avatarBusy ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Feather name="camera" size={13} color={colors.primaryForeground} />
                  )}
                </View>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DISPLAY NAME</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  onBlur={saveName}
                  placeholder="Your name"
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={100}
                  style={[
                    styles.nameInput,
                    { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                />
              </View>
            </View>
            <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
              Private. This is what Bolo calls you, and nobody else sees it.
            </Text>
            {nameChanged ? (
              <ChunkyButton
                title="Save name"
                icon="check"
                onPress={saveName}
                loading={updateProfile.isPending}
                style={{ marginTop: 14, alignSelf: 'stretch' }}
              />
            ) : null}

            <View style={{ marginTop: 18 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>USERNAME</Text>
              <TextInput
                testID="account-username"
                value={username}
                onChangeText={setUsername}
                onBlur={saveUsername}
                placeholder="Pick a public name"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                style={[
                  styles.nameInput,
                  { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
                ]}
              />
              {/* SAYS WHAT IT COSTS, BEFORE IT IS SET. A learner should know a
                  name is public at the moment they choose it, not after
                  somebody sees it. */}
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                Public. This is the name other learners see on the Everyone
                board and feed. Leave it empty to stay off both entirely.
              </Text>
            </View>

            <Pressable
              testID="account-share-stats"
              accessibilityRole="switch"
              accessibilityState={{ checked: shareStats }}
              accessibilityLabel="Share my stats"
              onPress={() => {
                hapticLight();
                void saveShareStats(!shareStats);
              }}
              style={[styles.shareRow, { borderColor: colors.border }]}
            >
              <Feather
                name={shareStats ? 'check-square' : 'square'}
                size={18}
                color={shareStats ? colors.primary : colors.mutedForeground}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.shareTitle, { color: colors.foreground }]}>
                  Share my stats
                </Text>
                {/* The exit for somebody who named themselves and later wants
                    out: turning this off must not cost them the name. */}
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                  Off keeps your username and takes you off the Everyone board
                  and feed. Your friends still see you.
                </Text>
              </View>
            </Pressable>
          </View>

          {/* Subscription */}
          <SectionLabel>SUBSCRIPTION</SectionLabel>
          <View style={[styles.card, styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <NavRow
              icon="star"
              label="Plan & billing"
              value={planLabel(account.data?.subscription.tier)}
              onPress={() => router.push('/(app)/account/subscription')}
            />
          </View>

          {/* Account / identity */}
          <SectionLabel>ACCOUNT</SectionLabel>
          <View style={[styles.card, styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <NavRow
              icon="mail"
              label="Email"
              value={email}
              onPress={() => router.push('/(app)/account/email')}
            />
            <Divider />
            <NavRow
              icon="lock"
              label="Password"
              value="••••••••"
              onPress={() => router.push('/(app)/account/password')}
            />
          </View>

          {/* Notifications */}
          <SectionLabel>NOTIFICATIONS</SectionLabel>
          <View style={[styles.card, styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <NavRow
              icon="bell"
              label="Daily reminder"
              value={
                prefs?.notifications.dailyReminderEnabled
                  ? `On · ${formatReminderTime(prefs.notifications.dailyReminderTime ?? '19:00')}`
                  : 'Off'
              }
              onPress={() => router.push('/(app)/account/reminders')}
            />
          </View>

          {/* Learning */}
          <SectionLabel>LEARNING</SectionLabel>
          <View style={[styles.card, styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <NavRow
              icon="globe"
              label="Language"
              value={activeLanguage?.name ?? '…'}
              onPress={() => router.push('/(app)/language')}
            />
            {/* Daily goal — hidden. XP already carries daily progress, and
                a configurable attempts target on top of it was a second
                number doing a similar job. The value still drives the goal
                celebration and the home arc; only the control is gone.
                Re-enable by removing the {false && …} wrapper. */}
            {false && (<><Divider />
            <StepperRow
              label="Daily goal"
              sub="Phrases to practice each day"
              value={prefs?.learning.dailyGoal ?? 10}
              min={5}
              max={100}
              step={5}
              format={(v) => `${v}`}
              onChange={(v) => savePrefs({ dailyGoal: v })}
            /></>)}
            <Divider />
            <View style={styles.themeBlock}>
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Feather name="droplet" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>Theme</Text>
              </View>
              <Segmented
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                value={prefs?.learning.theme ?? 'system'}
                onChange={(v) => {
                  const theme = v as ThemePref;
                  setThemePref(theme);
                  savePrefs({ theme });
                }}
              />
            </View>
            {/* Voice row — temporarily disabled while TTS provider is being
                evaluated. Re-enable by removing the {false && …} wrapper. */}
            {false && (<><Divider />
            <NavRow
              icon="volume-2"
              label="Voice"
              value={voiceLabel(prefs?.learning.ttsVoice ?? null)}
              onPress={() => router.push('/(app)/account/voice')}
            /></>)}
            <Divider />
            <NavRow
              icon="clock"
              label="Timezone"
              value={prefs?.learning.timezone ?? detectedTz}
              onPress={() => {
                setTimezoneInput(prefs?.learning.timezone ?? detectedTz);
                setTimezoneModalVisible(true);
              }}
            />
          </View>

          {/* Audio — every sound setting in one place. They were spread
              across the Learning card with Theme, Voice and Timezone
              between them, so a learner hunting for one had to read the
              whole list. Coach voice leads because the three below it
              are all narrower cases of it. */}
          <SectionLabel>AUDIO</SectionLabel>
          <View style={[styles.card, styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.themeBlock}>
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Feather name="mic" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                    Bolo's voice
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                    {VOICE_MODE_SUB[voiceMode]}
                  </Text>
                </View>
              </View>
              <Segmented
                options={[
                  { value: 'on', label: 'On' },
                  { value: 'tap', label: 'Tap to play' },
                  { value: 'off', label: 'Off' },
                ]}
                value={voiceMode}
                onChange={changeVoiceMode}
              />
            </View>
            <Divider />
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Feather name="message-circle" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.rowLabel,
                    { color: coachVoiceOn ? colors.foreground : colors.mutedForeground },
                  ]}
                >
                  Speak meaning
                </Text>
                <Text
                  style={[
                    styles.rowSub,
                    { color: coachVoiceOn ? colors.mutedForeground : colors.border },
                  ]}
                >
                  Say the English meaning after each phrase
                </Text>
              </View>
              <Switch
                accessibilityLabel="Speak meaning"
                value={meaningAudio}
                onValueChange={changeMeaningAudio}
                disabled={!coachVoiceOn}
                trackColor={{ true: colors.primary }}
              />
            </View>
            <Divider />
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Feather name="volume-2" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.rowLabel,
                    { color: coachVoiceOn ? colors.foreground : colors.mutedForeground },
                  ]}
                >
                  Spoken feedback
                </Text>
                <Text
                  style={[
                    styles.rowSub,
                    { color: coachVoiceOn ? colors.mutedForeground : colors.border },
                  ]}
                >
                  Read the coach's feedback aloud after each score
                </Text>
              </View>
              <Switch
                accessibilityLabel="Spoken feedback"
                testID="spoken-feedback-switch"
                value={spokenFeedback}
                onValueChange={changeSpokenFeedback}
                disabled={!coachVoiceOn}
                trackColor={{ true: colors.primary }}
              />
            </View>
            <Divider />
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Feather name="volume-2" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                  Sound effects
                </Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                  Play sounds for ticket tears and chat
                </Text>
              </View>
              <Switch
                accessibilityLabel="Sound effects"
                value={soundOn}
                onValueChange={changeSoundOn}
                trackColor={{ true: colors.primary }}
              />
            </View>
          </View>

          {/* Social */}
          <SectionLabel>SOCIAL</SectionLabel>
          <View style={[styles.card, styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <NavRow
              icon="users"
              label="Friends"
              value="Add friends and compete on the leaderboard"
              onPress={() => router.push('/(app)/(tabs)/friends')}
            />
          </View>

          {/* Support */}
          <SectionLabel>SUPPORT</SectionLabel>
          <View style={[styles.card, styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <NavRow
              icon="mail"
              label="Contact Us"
              value="Send us a message"
              onPress={() => router.push('/(app)/account/contact')}
            />
          </View>

          {/* Sign out */}
          <ChunkyButton
            title="Sign out"
            icon="log-out"
            variant="secondary"
            onPress={doSignOut}
            style={{ marginTop: 24, alignSelf: 'stretch' }}
          />

          {/* Danger zone */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            onPress={confirmDelete}
            disabled={deleteAccount.isPending}
            style={styles.deleteBtn}
          >
            {deleteAccount.isPending ? (
              <ActivityIndicator color={colors.destructive} />
            ) : (
              <>
                <Feather name="trash-2" size={18} color={colors.destructive} />
                <Text style={[styles.deleteText, { color: colors.destructive }]}>
                  Delete account
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      )}

      {/* Timezone picker modal */}
      <Modal
        visible={timezoneModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTimezoneModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setTimezoneModalVisible(false)}
        >
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Timezone</Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              IANA timezone name used for daily streak. Detected: {detectedTz}
            </Text>
            <TextInput
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={timezoneInput}
              onChangeText={setTimezoneInput}
              placeholder="e.g. America/New_York"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setTimezoneModalVisible(false)}
                style={[styles.modalBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const tz = timezoneInput.trim() || null;
                  setTimezoneModalVisible(false);
                  await savePrefs({ timezone: tz });
                }}
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function mergePrefs(
  base: Account['preferences'],
  patch: UpdatePreferencesInput,
): Account['preferences'] {
  return {
    notifications: {
      dailyReminderEnabled:
        patch.dailyReminderEnabled ?? base.notifications.dailyReminderEnabled,
      dailyReminderTime:
        patch.dailyReminderTime !== undefined
          ? patch.dailyReminderTime
          : base.notifications.dailyReminderTime,
    },
    learning: {
      activeLanguage:
        patch.activeLanguage !== undefined ? patch.activeLanguage : base.learning.activeLanguage,
      dailyGoal: patch.dailyGoal ?? base.learning.dailyGoal,
      theme: patch.theme ?? base.learning.theme,
      timezone:
        patch.timezone !== undefined ? patch.timezone : base.learning.timezone,
      hasCompletedTour:
        patch.hasCompletedTour !== undefined
          ? patch.hasCompletedTour
          : base.learning.hasCompletedTour,
      ttsVoice:
        patch.ttsVoice !== undefined ? patch.ttsVoice : base.learning.ttsVoice,
    },
  };
}

// Voice catalog name lookup for the NavRow display value.
const VOICE_NAMES: Record<string, string> = {
  JBFqnCBsd6RMkjVDRZzb: 'George',
  nPczCjzI2devNBz1zQrb: 'Brian',
  cjVigY5qzO86Huf0OWal: 'Eric',
  IKne3meq5aSn9XLyUdCD: 'Charlie',
  pqHfZKP75CvOlQylNhV4: 'Bill',
  onwK4e9ZLuTAKqWW03F9: 'Daniel',
  Xb7hH8MSUJpSbSDYk0k2: 'Alice',
  XB0fDUnXU5powFXDhCwa: 'Charlotte',
  FGY2WhTYpPnrIDTdsKH5: 'Laura',
  EXAVITQu4vr4xnSDxMaL: 'Sarah',
};

function voiceLabel(voiceId: string | null | undefined): string {
  if (!voiceId) return 'Auto';
  return VOICE_NAMES[voiceId] ?? 'Custom';
}

const PLAN_LABELS: Record<string, string> = {
  plus: 'Bolo! All-Access',
  family: 'Bolo! Family',
  one_language: 'One Language',
  free: 'Free',
};

function planLabel(tier: string | undefined): string {
  return tier ? PLAN_LABELS[tier] ?? 'Free' : '…';
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{children}</Text>;
}

function Divider() {
  const colors = useColors();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

function NavRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <PressableScale onPress={onPress} style={styles.row} scaleTo={0.98}>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
    </PressableScale>
  );
}

function StepperRow({
  label,
  sub,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  sub: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const colors = useColors();
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Feather name="target" size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sub}</Text>
      </View>
      <View style={styles.stepper}>
        <StepBtn icon="minus" onPress={dec} disabled={value <= min} />
        <Text style={[styles.stepValue, { color: colors.foreground }]}>{format(value)}</Text>
        <StepBtn icon="plus" onPress={inc} disabled={value >= max} />
      </View>
    </View>
  );
}

function StepBtn({
  icon,
  onPress,
  disabled,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.stepBtn,
        { backgroundColor: colors.muted, opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <Feather name={icon} size={16} color={colors.foreground} />
    </Pressable>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.muted }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              // Light tap only when the selection actually changes.
              if (!active) hapticLight();
              onChange(opt.value);
            }}
            style={[
              styles.segment,
              active && { backgroundColor: colors.card },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: active ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "HH:MM" -> "7:00 PM" for the reminder NavRow value. */
function formatReminderTime(t: string): string {
  const [h, m] = parseTime(t);
  return formatTime12(h, m);
}

function parseTime(t: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (match) {
    const h = Math.min(23, Math.max(0, Number(match[1])));
    const m = Math.min(59, Math.max(0, Number(match[2])));
    return [h, m];
  }
  return [9, 0];
}

function toHHMM(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTime12(h: number, m: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: { fontFamily: AppFonts.bold, fontSize: 18 },
  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
  },
  listCard: { paddingVertical: 4, paddingHorizontal: 0 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarWrap: { width: 72, height: 72 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  fieldHint: { fontFamily: AppFonts.regular, fontSize: 11, lineHeight: 15, marginTop: 6 },
  shareRow: {
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    padding: 12,
  },
  shareTitle: { fontFamily: AppFonts.bold, fontSize: 14 },
  nameInput: {
    fontFamily: AppFonts.semibold,
    fontSize: 16,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sectionLabel: {
    fontFamily: AppFonts.extrabold,
    fontSize: 12,
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 10,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowIcon: { width: 24, alignItems: 'center' },
  rowLabel: { fontFamily: AppFonts.bold, fontSize: 15 },
  rowSub: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  divider: { height: 1, marginHorizontal: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    fontFamily: AppFonts.extrabold,
    fontSize: 16,
    minWidth: 28,
    textAlign: 'center',
  },
  themeBlock: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  segmented: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentText: { fontFamily: AppFonts.bold, fontSize: 14 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    marginTop: 8,
  },
  deleteText: { fontFamily: AppFonts.bold, fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  modalTitle: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  modalSub: { fontFamily: AppFonts.regular, fontSize: 13, lineHeight: 18 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: AppFonts.regular,
    fontSize: 14,
  },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalBtnPrimary: { borderWidth: 0 },
  modalBtnText: { fontFamily: AppFonts.bold, fontSize: 14 },
  centerState: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 40,
    paddingHorizontal: 28,
  },
  stateText: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },
  stateDetail: {
    fontFamily: AppFonts.regular,
    fontSize: 11,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 16,
    opacity: 0.75,
    marginTop: -6,
  },
});
