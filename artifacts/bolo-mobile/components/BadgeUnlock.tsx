import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { hapticNotify } from '@/lib/haptics';
import Animated from 'react-native-reanimated';
import { appear, appearDown, appearPlain, appearZoom, useAppearSkip } from '@/lib/entrance';
import type { EarnedBadge } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { badgeIcon } from '@/lib/badge-icons';
import { Confetti } from './Confetti';
import { Mascot } from './Mascot';

/**
 * Full-screen "Badge unlocked!" celebration shown the moment one or more badges
 * are newly earned during practice. Rains confetti and names each badge, mirror-
 * ing the web badge-unlock experience. Dismissed by tapping anywhere or the
 * button; the parent controls visibility via the `badges` array.
 */
export function BadgeUnlock({
  badges,
  onDismiss,
}: {
  badges: EarnedBadge[];
  onDismiss: () => void;
}) {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const active = badges.length > 0;

  React.useEffect(() => {
    if (active) {
      hapticNotify(Haptics.NotificationFeedbackType.Success);
    }
  }, [active]);

  if (!active) return null;

  return (
    <Modal
      visible={active}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        onPress={onDismiss}
        style={[styles.backdrop, { backgroundColor: `${colors.background}F2` }]}
      >
        <Confetti />

        <Animated.View entering={appear(appearZoom(0))}>
          <Mascot pose="cheer" size={132} motion="bounce" />
        </Animated.View>

        <Animated.Text
          entering={skipEnter ? undefined : appearDown(0, 400)}
          style={[styles.kicker, { color: colors.secondary }]}
        >
          {badges.length > 1 ? 'Badges unlocked!' : 'Badge unlocked!'}
        </Animated.Text>

        <View style={styles.cards}>
          {badges.map((badge, i) => (
            <Animated.View
              key={badge.key}
              entering={skipEnter ? undefined : appearZoom(150 + i * 160)}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View
                style={[styles.iconWrap, { backgroundColor: colors.secondary }]}
              >
                <MaterialCommunityIcons
                  name={badgeIcon(badge.iconName)}
                  size={40}
                  color={colors.secondaryForeground}
                />
              </View>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {badge.title}
              </Text>
              <Text style={[styles.desc, { color: colors.mutedForeground }]}>
                {badge.description}
              </Text>
            </Animated.View>
          ))}
        </View>

        <Animated.View
          entering={skipEnter ? undefined : appearPlain()}
          style={styles.actions}
        >
          <Pressable
            onPress={onDismiss}
            style={[styles.button, { backgroundColor: colors.primary }]}
          >
            <Text
              style={[styles.buttonText, { color: colors.primaryForeground }]}
            >
              Awesome!
            </Text>
          </Pressable>
          {/* Secondary escape hatch: the freshly earned badge lives on the
              Progress tab — link there instead of dead-ending at dismiss.
              Mirrors the web BadgeUnlock's "See progress" action. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onDismiss();
              router.push('/(app)/(tabs)/progress');
            }}
            style={styles.seeProgress}
          >
            <Text style={[styles.seeProgressText, { color: colors.mutedForeground }]}>
              See progress
            </Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  kicker: {
    fontFamily: AppFonts.extrabold,
    fontSize: 14,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 24,
  },
  cards: {
    width: '100%',
    maxWidth: 360,
    gap: 16,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420, // a card, not a banner, on an iPad (build 25)
    alignSelf: 'center',
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingVertical: 26,
    paddingHorizontal: 24,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 24, textAlign: 'center' },
  desc: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  actions: {
    alignItems: 'center',
  },
  button: {
    marginTop: 32,
    paddingHorizontal: 44,
    paddingVertical: 16,
    borderRadius: 20,
  },
  buttonText: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  seeProgress: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  seeProgressText: { fontFamily: AppFonts.bold, fontSize: 14 },
});
