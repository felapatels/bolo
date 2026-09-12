import React, { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

type Props = {
  art: ReactNode;
  artWidth?: number;
  title: string;
  range?: string;
  locked: boolean;
  busy?: boolean;
  error?: string | null;
  onOpen: () => void;
  onShop?: () => void;
  testID: string;
  giftTestID?: string;
  instructionTestID?: string;
  rangeTestID?: string;
  shopTestID?: string;
};

/** One horizontal resting row. A locked tap explains; it never claims a gift. */
export function DailyGiftRow({ art, artWidth = 56, title, range, locked, busy = false,
  error, onOpen, onShop, testID, giftTestID = `${testID}-art`,
  instructionTestID = `${testID}-locked`, rangeTestID = `${testID}-range`,
  shopTestID = `${testID}-shop`,
}: Props) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const wiggle = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => () => animation.current?.stop(), []);
  useEffect(() => {
    animation.current?.stop();
    wiggle.setValue(0);
    pop.setValue(0);
  }, [locked, reduceMotion, wiggle, pop]);

  const pressGift = () => {
    if (busy) return;
    if (!locked) { onOpen(); return; }
    hapticLight();
    AccessibilityInfo.announceForAccessibility(title);
    animation.current?.stop();
    wiggle.setValue(0);
    pop.setValue(0);
    if (reduceMotion) return;
    // The box answers first, then the instruction rises toward the learner.
    // Transforms leave the row's layout intact, and the words never leave it.
    animation.current = Animated.sequence([
      Animated.timing(wiggle, { toValue: 1, duration: 460, easing: Easing.linear, useNativeDriver: false }),
      Animated.timing(pop, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.spring(pop, { toValue: 0, friction: 5, tension: 90, useNativeDriver: false }),
    ]);
    animation.current.start();
  };
  const rotate = wiggle.interpolate({ inputRange: [0, .15, .35, .55, .75, 1], outputRange: ['0deg', '-9deg', '8deg', '-6deg', '4deg', '0deg'] });

  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        <Pressable testID={giftTestID} accessibilityRole="button" accessibilityState={{ disabled: busy }}
          accessibilityLabel={`Today's gift. ${title}. ${range ?? ''}`}
          accessibilityHint={locked ? 'Explains how to unlock your gift' : 'Opens your daily gift'}
          disabled={busy} onPress={pressGift} style={styles.giftButton}>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.artSlot}>
            <Animated.View style={{ width: artWidth, alignItems: 'center', transform: [{ rotate }, { scale: Math.min(1, 80 / artWidth) }] }}>{art}</Animated.View>
          </View>
          <View style={styles.copy}>
            <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>TODAY'S GIFT</Text>
            <Animated.View style={{ zIndex: 1, transform: [
              { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
              { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
            ] }}>
              <Text testID={locked ? instructionTestID : `${testID}-status`} style={[styles.title, { color: colors.foreground }]}>{busy ? 'Opening your gift…' : title}</Text>
            </Animated.View>
            {!!range && <Text testID={rangeTestID} style={[styles.range, { color: colors.mutedForeground }]}>{range}</Text>}
          </View>
        </Pressable>
        <Pressable testID={shopTestID} accessibilityRole="button" accessibilityLabel="Go Shopping"
          onPress={onShop} style={({ pressed }) => [styles.shop, { backgroundColor: colors.primary, opacity: pressed ? .8 : 1 }]}>
          <Feather name="shopping-bag" size={17} color="#fff" />
          <Text style={styles.shopText}>Shop</Text>
        </Pressable>
      </View>
      {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.foreground }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  giftButton: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64 },
  artSlot: { width: 80, height: 86, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  eyebrow: { fontFamily: AppFonts.extrabold, fontSize: 10, letterSpacing: .7 },
  title: { fontFamily: AppFonts.bold, fontSize: 13, lineHeight: 17 },
  range: { fontFamily: AppFonts.regular, fontSize: 11, lineHeight: 15 },
  shop: { width: 48, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
  shopText: { color: '#fff', fontFamily: AppFonts.bold, fontSize: 10 },
  error: { marginTop: 8, fontSize: 12, lineHeight: 17 },
});
