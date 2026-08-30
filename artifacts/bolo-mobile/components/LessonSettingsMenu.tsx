import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CONTENT_MAX_W } from '@/lib/contentWidth';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * Lesson-screen audio settings: a header gear that opens the audio controls as
 * LABELED items, plus the display-only language chip that sits beside it.
 *
 * Built on the house modal-as-bottom-sheet pattern (same construction as the
 * chat language picker and the phrase report sheet) — there is no menu/popover
 * primitive in this app and no bottom-sheet dependency. `onRequestClose` is
 * what gives the Android back gesture; the backdrop Pressable gives
 * outside-tap; each item closes the sheet on select.
 *
 * The items themselves are supplied by the screen so each one keeps its own
 * existing state and preference key — this component never holds a copy.
 */

/**
 * OWNER-APPROVED item wording, verbatim (#1044). These strings are not the
 * implementer's to pick — both lesson screens read them from here so the two
 * can never word the same control differently. All three items are real on
 * both screens: review gained its own meaning-audio segment in #1046, so it
 * no longer omits `meaning`.
 */
export const LESSON_AUDIO_LABELS = {
  phrase: 'Autoplay phrase',
  feedback: 'Spoken feedback',
  meaning: 'Speak meaning',
} as const;

export type LessonSettingsItem = {
  /** Stable id; also drives the item testID (`settings-item-<key>`). */
  key: string;
  /** The visible text label — use LESSON_AUDIO_LABELS, never a fresh string. */
  label: string;
  /** One line naming what the item does in its CURRENT state. */
  description: string;
  /** Current on/off condition, shown as a visible ON / OFF state. */
  enabled: boolean;
  iconOn: React.ComponentProps<typeof Feather>['name'];
  iconOff: React.ComponentProps<typeof Feather>['name'];
  onToggle: () => void;
  /** Visibly disabled (e.g. the coach voice master switch is off). */
  disabled?: boolean;
};

export function LessonSettingsMenu({ items }: { items: LessonSettingsItem[] }) {
  const colors = useColors();
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Audio settings"
        hitSlop={8}
        testID="lesson-settings-button"
        style={[styles.gearBtn, { backgroundColor: colors.card }]}
      >
        <Feather name="settings" size={20} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable
          style={styles.backdrop}
          onPress={close}
          accessibilityLabel="Close audio settings"
          testID="lesson-settings-backdrop"
        >
          {/* Taps inside the sheet must not reach the closing backdrop. */}
          <Pressable
            onPress={() => {}}
            testID="lesson-settings-sheet"
            style={[
              styles.sheet,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
            {/* Title only — owner ruling: no subtitle under it. */}
            <Text style={[styles.title, { color: colors.foreground }]}>Audio</Text>

            {items.map((item) => (
              <Pressable
                key={item.key}
                testID={`settings-item-${item.key}`}
                disabled={item.disabled}
                onPress={() => {
                  item.onToggle();
                  close();
                }}
                accessibilityRole="switch"
                accessibilityState={{ checked: item.enabled, disabled: !!item.disabled }}
                accessibilityLabel={`${item.label} audio ${item.enabled ? 'on' : 'off'}`}
                accessibilityHint={item.description}
                style={({ pressed }) => [
                  styles.item,
                  {
                    borderColor: item.enabled ? colors.secondary : colors.border,
                    backgroundColor: pressed ? colors.muted : colors.card,
                    opacity: item.disabled ? 0.4 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.itemIcon,
                    { backgroundColor: item.enabled ? colors.secondary : colors.muted },
                  ]}
                >
                  <Feather
                    name={item.enabled ? item.iconOn : item.iconOff}
                    size={18}
                    color={item.enabled ? '#fff' : colors.mutedForeground}
                  />
                </View>
                <View style={styles.itemText}>
                  <Text style={[styles.itemLabel, { color: colors.foreground }]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.itemDescription, { color: colors.mutedForeground }]}>
                    {item.description}
                  </Text>
                </View>
                <Text
                  testID={`settings-item-${item.key}-state`}
                  style={[
                    styles.itemState,
                    { color: item.enabled ? colors.secondary : colors.mutedForeground },
                  ]}
                >
                  {item.enabled ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/**
 * Display-only language code beside the gear. Inert by ruling: no press
 * handler, no button role, not focusable — the language cannot be changed
 * mid-lesson. The slot is sized for THREE characters so switching between a
 * two- and three-letter code (`sat`, `mni`, …) never reflows the header, and
 * the code is never truncated (`sat` shortened to `SA` would read as Sanskrit).
 */
export function LanguageChip({ code }: { code: string }) {
  const colors = useColors();
  if (!code) return null;
  return (
    <View
      accessible={false}
      testID="language-chip"
      style={[styles.chip, { backgroundColor: colors.muted }]}
    >
      <Text style={[styles.chipText, { color: colors.mutedForeground }]} numberOfLines={1}>
        {code.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gearBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minWidth: 40,
    height: 26,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  chipText: {
    fontFamily: AppFonts.bold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    // Capped to the content column on an iPad; the full width on a phone (build 25).
    width: '100%',
    maxWidth: CONTENT_MAX_W,
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 10,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  title: {
    fontFamily: AppFonts.bold,
    fontSize: 18,
    marginBottom: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemLabel: {
    fontFamily: AppFonts.bold,
    fontSize: 15,
  },
  itemDescription: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
  itemState: {
    fontFamily: AppFonts.extrabold,
    fontSize: 12,
    letterSpacing: 0.6,
  },
});
