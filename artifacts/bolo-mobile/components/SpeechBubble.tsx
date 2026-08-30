import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * A line from Bolo, in a bubble with its tail on the right, pointing at the
 * bird beside it (build 22, the owner's Progress mockup: "Nice work, Alex!
 * You're 6 phrases away from Phrase Master."). The tail is a rotated square
 * drawn twice, border colour under card colour, so the bubble's hairline
 * carries round the point. Pass nested Text to colour a word.
 */
export function SpeechBubble({
  children,
  style,
  testID,
  tail = 'right',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Where the bird is: beside the bubble ('right') or above it ('up'),
   *  the latter for a header too tight to seat the bubble beside the bird
   *  (the Leaderboard, build 22). */
  tail?: 'right' | 'up' | 'down';
}) {
  const colors = useColors();
  const tailPos = tail === 'up' ? styles.tailUp : tail === 'down' ? styles.tailDown : styles.tailRight;
  const tailBorderPos = tail === 'up' ? styles.tailUpBorder : tail === 'down' ? styles.tailDownBorder : styles.tailRightBorder;
  return (
    <View style={[styles.wrap, style]} testID={testID}>
      <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.text, { color: colors.foreground }]}>{children}</Text>
      </View>
      <View pointerEvents="none" style={[styles.tail, tailPos, tailBorderPos, { backgroundColor: colors.border }]} />
      <View pointerEvents="none" style={[styles.tail, tailPos, { backgroundColor: colors.card }]} />
    </View>
  );
}

const TAIL = 12;

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', maxWidth: '100%' },
  bubble: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#1A1338',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  text: { fontFamily: AppFonts.semibold, fontSize: 13, lineHeight: 19 },
  tail: {
    position: 'absolute',
    width: TAIL,
    height: TAIL,
    transform: [{ rotate: '45deg' }],
    borderRadius: 2,
  },
  tailRight: { right: -TAIL / 2 + 1, top: '50%', marginTop: -TAIL / 2 },
  tailRightBorder: { right: -TAIL / 2, width: TAIL + 1.5, height: TAIL + 1.5, marginTop: -(TAIL + 1.5) / 2 },
  // Up: near the right end of the top edge, under the bird's feet.
  tailUp: { top: -TAIL / 2 + 1, right: 22 },
  tailUpBorder: { top: -TAIL / 2, right: 22 - 0.75, width: TAIL + 1.5, height: TAIL + 1.5 },
  // Down: the middle of the bottom edge, over the bird's head (the paywall).
  tailDown: { bottom: -TAIL / 2 + 1, left: '50%', marginLeft: -TAIL / 2 },
  tailDownBorder: { bottom: -TAIL / 2, left: '50%', marginLeft: -(TAIL + 1.5) / 2, width: TAIL + 1.5, height: TAIL + 1.5 },
});
