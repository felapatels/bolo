import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useReportPhrase } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

// Spec B2: the four report reasons, in display order. Values match the
// server's PHRASE_REPORT_REASONS enum.
const REASONS = [
  { value: 'translation_wrong', label: 'Translation wrong' },
  { value: 'transliteration_wrong', label: 'Transliteration wrong' },
  { value: 'audio_wrong', label: 'Audio wrong' },
  { value: 'other', label: 'Other' },
] as const;
type ReasonValue = (typeof REASONS)[number]['value'];

interface PhraseReportButtonProps {
  phraseId: number;
  /**
   * Called immediately when a reason is tapped (fire-and-forget) so the
   * parent can show its transient "Thanks, we'll check it" toast.
   */
  onReported: () => void;
}

/**
 * Low-prominence flag affordance on the practice phrase card (Spec B2).
 * Two taps total: tap the flag, tap a reason. The optional note (280 chars)
 * is never required. Submission is fire-and-forget: the parent toast fires
 * immediately, failures are silent, and practice flow never changes.
 */
export function PhraseReportButton({
  phraseId,
  onReported,
}: PhraseReportButtonProps) {
  const colors = useColors();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const report = useReportPhrase();

  const close = () => {
    setOpen(false);
    setNote('');
  };

  const submit = (reason: ReasonValue) => {
    const trimmed = note.trim();
    // Fire-and-forget (Spec B2): the server derives language_code/stage from
    // the phrase row; errors are silently absorbed.
    report.mutate(
      {
        id: phraseId,
        data: { reason, ...(trimmed ? { note: trimmed } : {}) },
      },
      { onError: () => {} },
    );
    close();
    onReported();
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Report a problem with this phrase"
        accessibilityRole="button"
        hitSlop={10}
        style={({ pressed }) => [styles.flagBtn, { opacity: pressed ? 0.9 : 0.55 }]}
      >
        <Feather name="flag" size={15} color={colors.mutedForeground} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <Pressable style={styles.backdrop} onPress={close}>
          {/* Stop backdrop-press from closing when tapping the sheet itself */}
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => {}}
          >
            <Text style={[styles.title, { color: colors.foreground }]}>
              What's wrong with this phrase?
            </Text>
            {REASONS.map((r) => (
              <Pressable
                key={r.value}
                onPress={() => submit(r.value)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.reasonBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.background : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.reasonText, { color: colors.foreground }]}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
            <TextInput
              value={note}
              onChangeText={setNote}
              maxLength={280}
              placeholder="Optional note"
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel="Optional note"
              multiline
              // Same guard as the web twin, and for the same measured reason:
              // 39 of the first 42 phrase_reports rows carried the reporter's
              // email instead of their explanation. autoComplete covers
              // Android, textContentType covers iOS. autoCorrect is left ON
              // deliberately, since this is prose and spelling help is wanted.
              autoComplete="off"
              textContentType="none"
              style={[
                styles.noteInput,
                { borderColor: colors.border, color: colors.foreground },
              ]}
            />
            <Pressable
              onPress={close}
              accessibilityRole="button"
              style={styles.cancelBtn}
            >
              <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flagBtn: {
    padding: 6,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 28,
  },
  sheet: {
    // Capped to the content column on an iPad; the full width on a phone (build 25).
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  reasonBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  reasonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  noteInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 56,
    fontSize: 14,
    textAlignVertical: 'top',
    marginTop: 2,
  },
  cancelBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
