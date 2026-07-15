// Shared loading state: a spinner paired with a random "fun fact about
// India" that fades/slides in, turning dead network-wait time into a small
// moment of delight instead of a bare spinner. Drop this in anywhere a
// screen currently renders a lone <ActivityIndicator /> for a lesson,
// phrase-list, or scoring fetch.
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { appear } from '@/lib/entrance';
import { useColors } from '@/hooks/useColors';
import { pickFunFact } from '@/lib/funFacts';

type Props = {
  size?: 'small' | 'large';
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function FunFactLoader({ size = 'large', color, style }: Props) {
  const colors = useColors();
  // Picked once per mount: these loaders mount for the duration of a single
  // loading state, so the fact should stay put rather than shuffle mid-wait.
  const [fact] = React.useState(() => pickFunFact());

  return (
    <View style={[styles.wrap, style]}>
      <ActivityIndicator size={size} color={color ?? colors.primary} />
      {fact ? (
        <Animated.View
          entering={appear(FadeInDown.duration(450).delay(150))}
          style={styles.factWrap}
        >
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Did you know?
          </Text>
          <Text style={[styles.fact, { color: colors.foreground }]}>
            {fact}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  factWrap: {
    marginTop: 16,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  fact: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
  },
});
