// The flashback lightbox: the words and the sheet. The copy and the rule for
// when it shows live in lib/flashbackLightbox.ts. Same shell as the
// first-word primer, so the two beats on the practice screen read as one
// family. Web twin: components/flashback-lightbox.tsx.
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Mascot } from '@/components/Mascot';
import { ChunkyButton } from '@/components/ChunkyButton';
import { AppFonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { FLASHBACK_LIGHTBOX_COPY } from '@/lib/flashbackLightbox';

export function FlashbackLightbox({
  visible,
  onEnter,
  onSkip,
}: {
  visible: boolean;
  onEnter: () => void;
  onSkip: () => void;
}) {
  const colors = useColors();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onSkip}>
      <View style={styles.backdrop}>
        <View
          testID="flashback-lightbox"
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.top}>
            <Mascot pose="thumbsup" size={96} motion="float" />
          </View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            {FLASHBACK_LIGHTBOX_COPY.eyebrow.toUpperCase()}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {FLASHBACK_LIGHTBOX_COPY.title}
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            {FLASHBACK_LIGHTBOX_COPY.body}
          </Text>
          <ChunkyButton
            testID="flashback-lightbox-enter"
            title={FLASHBACK_LIGHTBOX_COPY.enter}
            icon="arrow-right"
            onPress={onEnter}
            style={{ marginTop: 10, alignSelf: 'stretch' }}
          />
          <Pressable
            testID="flashback-lightbox-skip"
            accessibilityRole="button"
            onPress={onSkip}
            style={({ pressed }) => [styles.skip, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
              {FLASHBACK_LIGHTBOX_COPY.skip}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    maxWidth: 380,
    padding: 22,
    width: '100%',
  },
  top: { alignItems: 'center' },
  eyebrow: { fontFamily: AppFonts.extrabold, fontSize: 11, letterSpacing: 1.4, textAlign: 'center' },
  title: { fontFamily: AppFonts.extrabold, fontSize: 22, textAlign: 'center' },
  body: { fontFamily: AppFonts.regular, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  skip: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  skipText: { fontFamily: AppFonts.bold, fontSize: 14 },
});
