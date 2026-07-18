import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

export default function PhraseBuilderScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.header}>
        <ChunkyButton
          title=""
          icon="arrow-left"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.backBtn}
        />
        <Text style={[styles.title, { color: colors.foreground }]}>
          Phrase Builder
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={styles.center}>
        <Feather name="layers" size={48} color={colors.primary} />
        <Text style={[styles.comingSoon, { color: colors.foreground }]}>
          Coming Soon
        </Text>
        <Text style={[styles.desc, { color: colors.mutedForeground }]}>
          Arrange word tiles into correct phrases.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: { width: 44, height: 44, minWidth: 0 },
  title: { fontFamily: AppFonts.bold, fontSize: 18 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  comingSoon: { fontFamily: AppFonts.extrabold, fontSize: 26 },
  desc: { fontFamily: AppFonts.regular, fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
