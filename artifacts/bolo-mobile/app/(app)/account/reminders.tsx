// Daily reminder settings: on/off, time, cadence (which days), and quiet
// hours. Preferences are persisted on the device (notifications are scheduled
// per-device); the enabled flag + time are also mirrored to the account
// preferences so the setting shows up consistently across devices. Handles the
// notification-permission dance: value explanation before the OS prompt, and a
// path back through Settings when permission was previously denied.
import React from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUpdateAccountPreferences } from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';
import {
  ALL_DAYS,
  isWithinQuietHours,
  parseHHMM,
  toHHMM,
  type ReminderPrefs,
} from '@/lib/reminder-logic';
import {
  cancelAllReminders,
  getNotificationPermission,
  loadReminderPrefs,
  remindersSupported,
  requestNotificationPermission,
  rescheduleReminders,
  saveReminderPrefs,
} from '@/lib/reminders';
import { retirePushToken, syncPushToken } from '@/lib/push';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

type Permission = { granted: boolean; canAskAgain: boolean };

export default function RemindersScreen() {
  const colors = useColors();
  const router = useRouter();
  const updateServerPrefs = useUpdateAccountPreferences();

  const [prefs, setPrefs] = React.useState<ReminderPrefs | null>(null);
  const [permission, setPermission] = React.useState<Permission | null>(null);

  React.useEffect(() => {
    loadReminderPrefs().then(setPrefs);
    getNotificationPermission().then(setPermission);
  }, []);

  // Persist locally, mirror on/off + time to the account, and rebuild the
  // device schedule. The reschedule uses conservative inputs (streak unknown
  // here); the ReminderScheduler refines copy/skips as soon as fresh progress
  // data is available.
  const apply = async (next: ReminderPrefs) => {
    setPrefs(next);
    await saveReminderPrefs(next);
    updateServerPrefs.mutate({
      data: {
        dailyReminderEnabled: next.enabled,
        dailyReminderTime: next.enabled ? next.time : null,
      },
    });
    if (next.enabled) {
      await rescheduleReminders({ streakDays: 0, practicedToday: false });
    } else {
      await cancelAllReminders();
    }
  };

  const askPermission = async () => {
    const p = await requestNotificationPermission();
    setPermission(p);
    if (p.granted && prefs?.enabled) {
      await rescheduleReminders({ streakDays: 0, practicedToday: false });
    }
  };

  const openSettings = async () => {
    if (Platform.OS === 'web') return;
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(
        'Open Settings',
        'Enable notifications for Bolo! in your device settings.',
      );
    }
  };

  // Re-check permission when returning from Settings (screen refocus is
  // approximated by re-checking whenever the toggle is used again, plus this
  // manual refresh button case is covered by askPermission/openSettings).
  const toggleEnabled = async (on: boolean) => {
    if (!prefs) return;
    hapticLight();
    if (on && remindersSupported) {
      const current = await getNotificationPermission();
      setPermission(current);
      if (!current.granted && current.canAskAgain) {
        // Value explanation *before* the OS prompt — the OS only lets us ask
        // once, so make it count.
        Alert.alert(
          'Stay on your streak',
          'Bolo! can send one gentle reminder a day, at a time you choose, so your streak never breaks. You can change or turn this off anytime.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Allow notifications',
              onPress: async () => {
                const p = await requestNotificationPermission();
                setPermission(p);
                await apply({ ...prefs, enabled: true });
              },
            },
          ],
        );
        return;
      }
    }
    await apply({ ...prefs, enabled: on });
  };

  /**
   * The streak push toggle.
   *
   * THE PREFERENCE IS ENFORCED BY THE TOKEN, not by a server flag. Turning this
   * on hands the server this device's address; turning it off takes the address
   * away, and a server with no token for a device cannot reach it whatever it
   * decides to send. That is why this needs no schema change, and it is exactly
   * sufficient while there is one push message type. A second one needs
   * server-side preferences.
   *
   * It shares the OS permission with the daily reminder, so turning it on when
   * permission is already granted asks for nothing. Asking twice for one
   * permission is how an app burns its single chance at that dialog on iOS.
   */
  const toggleStreakRisk = async (on: boolean) => {
    if (!prefs) return;
    setPrefs({ ...prefs, streakRisk: on });
    await saveReminderPrefs({ ...prefs, streakRisk: on });
    if (!on) {
      await retirePushToken();
      return;
    }
    const current = await getNotificationPermission();
    setPermission(current);
    if (!current.granted) {
      const asked = current.canAskAgain
        ? await requestNotificationPermission()
        : current;
      setPermission(asked);
      if (!asked.granted) return;
    }
    await syncPushToken();
  };

  const quietOn = !!prefs?.quietStart && !!prefs?.quietEnd;
  const timeMin = prefs ? parseHHMM(prefs.time) : null;
  const timeInQuiet =
    !!prefs &&
    timeMin != null &&
    isWithinQuietHours(timeMin, prefs.quietStart, prefs.quietEnd);

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
        <Text style={[styles.title, { color: colors.foreground }]}>
          Daily reminder
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {!remindersSupported ? (
          <InfoCard
            icon="info"
            tint={colors.mutedForeground}
            text="Reminders are sent by your phone, so they're available in the installed iOS and Android apps — not in the web preview or Expo Go."
          />
        ) : null}

        {/* Master toggle */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Feather name="bell" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                Daily practice reminder
              </Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                One nudge a day — only if you haven’t practiced yet.
              </Text>
            </View>
            <Switch
              value={remindersSupported && (prefs?.enabled ?? false)}
              onValueChange={toggleEnabled}
              disabled={!prefs || !remindersSupported}
              trackColor={{ false: colors.muted, true: colors.primary }}
              thumbColor={colors.card}
            />
          </View>
        </View>

        {/* THE SERVER-SENT one, and separate from the daily reminder on purpose.
            One switch for every notification means a learner who dislikes one
            of them turns off all of them, and a lapsing streak is the single
            message they implicitly asked for by building the streak. */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Feather name="zap" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                Streak about to end
              </Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Only on an evening your streak would break. Never otherwise.
              </Text>
            </View>
            <Switch
              value={remindersSupported && (prefs?.streakRisk ?? false)}
              onValueChange={toggleStreakRisk}
              disabled={!prefs || !remindersSupported}
              trackColor={{ false: colors.muted, true: colors.primary }}
              thumbColor={colors.card}
            />
          </View>
        </View>

        {/* Permission problem states */}
        {remindersSupported && prefs?.enabled && permission && !permission.granted ? (
          <View
            style={[
              styles.card,
              styles.permissionCard,
              { backgroundColor: `${colors.gold}18`, borderColor: colors.gold },
            ]}
          >
            <Feather name="bell-off" size={20} color={colors.foreground} />
            <Text style={[styles.permText, { color: colors.foreground }]}>
              {permission.canAskAgain
                ? 'Bolo! needs notification permission to remind you.'
                : 'Notifications are turned off for Bolo! in your device settings.'}
            </Text>
            <ChunkyButton
              title={permission.canAskAgain ? 'Allow notifications' : 'Open Settings'}
              icon={permission.canAskAgain ? 'bell' : 'settings'}
              onPress={permission.canAskAgain ? askPermission : openSettings}
              style={{ alignSelf: 'stretch' }}
            />
          </View>
        ) : null}

        {remindersSupported && prefs?.enabled ? (
          <>
            {/* Time */}
            <SectionLabel>TIME</SectionLabel>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <TimeRow
                icon="clock"
                label="Reminder time"
                value={prefs.time}
                onChange={(t) => apply({ ...prefs, time: t })}
              />
              {timeInQuiet ? (
                <Text style={[styles.warnText, { color: colors.destructive }]}>
                  This time is inside your quiet hours, so no reminder will
                  fire. Move the time or adjust quiet hours.
                </Text>
              ) : null}
            </View>

            {/* Days */}
            <SectionLabel>DAYS</SectionLabel>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.daysRow}>
                {ALL_DAYS.map((d) => {
                  const on = prefs.days.includes(d);
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="button"
                      accessibilityLabel={DAY_NAMES[d]}
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        const days = on
                          ? prefs.days.filter((x) => x !== d)
                          : [...prefs.days, d].sort((a, b) => a - b);
                        // Never allow zero days — that's just "off".
                        if (days.length === 0) return;
                        apply({ ...prefs, days });
                      }}
                      style={[
                        styles.dayDot,
                        {
                          backgroundColor: on ? colors.primary : colors.muted,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          {
                            color: on
                              ? colors.primaryForeground
                              : colors.mutedForeground,
                          },
                        ]}
                      >
                        {DAY_LABELS[d]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 10 }]}>
                {prefs.days.length === 7
                  ? 'Every day'
                  : prefs.days.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ')}
              </Text>
            </View>

            {/* Quiet hours */}
            <SectionLabel>QUIET HOURS</SectionLabel>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Feather name="moon" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                    Quiet hours
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                    Never remind me between these times.
                  </Text>
                </View>
                <Switch
                  value={quietOn}
                  onValueChange={(on) => {
                    hapticLight();
                    void apply(
                      on
                        ? { ...prefs, quietStart: '22:00', quietEnd: '08:00' }
                        : { ...prefs, quietStart: null, quietEnd: null },
                    );
                  }}
                  trackColor={{ false: colors.muted, true: colors.primary }}
                  thumbColor={colors.card}
                />
              </View>
              {quietOn ? (
                <>
                  <Divider />
                  <TimeRow
                    icon="sunset"
                    label="Quiet from"
                    value={prefs.quietStart ?? '22:00'}
                    onChange={(t) => apply({ ...prefs, quietStart: t })}
                  />
                  <Divider />
                  <TimeRow
                    icon="sunrise"
                    label="Quiet until"
                    value={prefs.quietEnd ?? '08:00'}
                    onChange={(t) => apply({ ...prefs, quietEnd: t })}
                  />
                </>
              ) : null}
            </View>

            <InfoCard
              icon="zap"
              tint={colors.accent}
              text="Reminders get smarter as your streak grows — we'll warn you when a streak is at risk and cheer when a badge is one practice away."
            />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
      {children}
    </Text>
  );
}

function Divider() {
  const colors = useColors();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

function InfoCard({
  icon,
  tint,
  text,
}: {
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  text: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        styles.infoCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Feather name={icon} size={18} color={tint} />
      <Text style={[styles.infoText, { color: colors.mutedForeground }]}>{text}</Text>
    </View>
  );
}

/** "HH:MM" adjuster in 15-minute steps, wrapping across midnight. */
function TimeRow({
  icon,
  label,
  value,
  onChange,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useColors();
  const total = parseHHMM(value) ?? 0;
  const shift = (delta: number) => onChange(toHHMM(total + delta));
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
          {format12(total)}
        </Text>
      </View>
      <View style={styles.stepper}>
        <StepBtn icon="minus" onPress={() => shift(-15)} />
        <StepBtn icon="plus" onPress={() => shift(15)} />
      </View>
    </View>
  );
}

function StepBtn({
  icon,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.stepBtn, { backgroundColor: colors.muted }]}
    >
      <Feather name={icon} size={16} color={colors.foreground} />
    </Pressable>
  );
}

function format12(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${ampm}`;
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
  sectionLabel: {
    fontFamily: AppFonts.bold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 18,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 28, alignItems: 'center' },
  rowLabel: { fontFamily: AppFonts.bold, fontSize: 15 },
  rowSub: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  divider: { height: 1, marginVertical: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontFamily: AppFonts.bold, fontSize: 14 },
  permissionCard: { gap: 10, alignItems: 'flex-start' },
  permText: { fontFamily: AppFonts.semibold, fontSize: 14, lineHeight: 20 },
  warnText: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    marginTop: 10,
    lineHeight: 18,
  },
  infoCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  infoText: { flex: 1, fontFamily: AppFonts.regular, fontSize: 13, lineHeight: 19 },
});
