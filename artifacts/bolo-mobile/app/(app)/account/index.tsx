import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemePref, type ThemePref } from '@/contexts/ThemeContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

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
  const [name, setName] = React.useState('');
  const [avatarBusy, setAvatarBusy] = React.useState(false);
  const seeded = React.useRef(false);

  React.useEffect(() => {
    if (account.data && !seeded.current) {
      seeded.current = true;
      setPrefs(account.data.preferences);
      setName(account.data.profile.displayName ?? user?.firstName ?? '');
      // Bring the saved theme down so it applies on this device too.
      setThemePref(account.data.preferences.learning.theme as ThemePref);
    }
  }, [account.data, user?.firstName, setThemePref]);

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

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow photo access in Settings to choose a profile picture.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setAvatarBusy(true);
    try {
      const blob = await (await fetch(result.assets[0].uri)).blob();
      await user?.setProfileImage({ file: blob });
      await user?.reload();
      const res = await updateProfile.mutateAsync({
        data: { avatarUrl: user?.imageUrl ?? null },
      });
      if (account.data) applyAccount({ ...account.data, profile: res.profile });
    } catch {
      Alert.alert('Couldn’t update photo', 'Please try a different image.');
    } finally {
      setAvatarBusy(false);
    }
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
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : account.isError ? (
        <View style={styles.centerState}>
          <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            We couldn’t load your settings. Check your connection and try again.
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
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
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
            {nameChanged ? (
              <ChunkyButton
                title="Save name"
                icon="check"
                onPress={saveName}
                loading={updateProfile.isPending}
                style={{ marginTop: 14, alignSelf: 'stretch' }}
              />
            ) : null}
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
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Feather name="bell" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>Daily reminder</Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                  A nudge to keep your streak alive.
                </Text>
              </View>
              <Switch
                value={prefs?.notifications.dailyReminderEnabled ?? false}
                onValueChange={(on) =>
                  savePrefs({
                    dailyReminderEnabled: on,
                    // Give the reminder a sensible default time when first enabled.
                    dailyReminderTime: on
                      ? prefs?.notifications.dailyReminderTime ?? '09:00'
                      : prefs?.notifications.dailyReminderTime ?? null,
                  })
                }
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor={colors.card}
              />
            </View>
            {prefs?.notifications.dailyReminderEnabled ? (
              <>
                <Divider />
                <TimePickerRow
                  value={prefs.notifications.dailyReminderTime ?? '09:00'}
                  onChange={(t) => savePrefs({ dailyReminderTime: t })}
                />
              </>
            ) : null}
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
            <Divider />
            <StepperRow
              label="Daily goal"
              sub="Phrases to practice each day"
              value={prefs?.learning.dailyGoal ?? 10}
              min={5}
              max={100}
              step={5}
              format={(v) => `${v}`}
              onChange={(v) => savePrefs({ dailyGoal: v })}
            />
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
    },
  };
}

const PLAN_LABELS: Record<string, string> = {
  plus: 'Bolo! Plus',
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

/** Adjust an "HH:MM" time in 15-minute steps, wrapping across the day. */
function TimePickerRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useColors();
  const [h, m] = parseTime(value);
  const total = h * 60 + m;
  const shift = (delta: number) => {
    const next = (((total + delta) % 1440) + 1440) % 1440;
    onChange(toHHMM(Math.floor(next / 60), next % 60));
  };
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Feather name="clock" size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>Reminder time</Text>
        <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{formatTime12(h, m)}</Text>
      </View>
      <View style={styles.stepper}>
        <StepBtn icon="minus" onPress={() => shift(-15)} />
        <StepBtn icon="plus" onPress={() => shift(15)} />
      </View>
    </View>
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
            onPress={() => onChange(opt.value)}
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
});
