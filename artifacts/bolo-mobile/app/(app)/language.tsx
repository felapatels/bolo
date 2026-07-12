import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import type { Language } from '@workspace/api-client-react';

export default function LanguageModal() {
  const colors = useColors();
  const router = useRouter();
  const { languages, activeLang, setActiveLang, isLoading } = useLanguage();

  const choose = (code: string) => {
    setActiveLang(code);
    router.back();
  };

  return (
    <Screen padTop={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Choose a language
        </Text>
        <Pressable
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={[styles.closeBtn, { backgroundColor: colors.muted }]}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator
          color={colors.primary}
          style={{ marginTop: 40 }}
          size="large"
        />
      ) : (
        <FlatList
          data={languages}
          keyExtractor={(l) => l.code}
          contentContainerStyle={{ padding: 20, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <LanguageRow
              language={item}
              active={item.code === activeLang}
              onPress={() => choose(item.code)}
            />
          )}
        />
      )}
    </Screen>
  );
}

function LanguageRow({
  language,
  active,
  onPress,
}: {
  language: Language;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: active ? `${colors.primary}14` : colors.card,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={[
            nativeTextStyle(language, { bold: true }),
            styles.native,
            { color: colors.foreground },
          ]}
        >
          {language.nativeName}
        </Text>
        <Text style={[styles.name, { color: colors.mutedForeground }]}>
          {language.name} · {language.script}
        </Text>
      </View>
      {active ? (
        <Feather name="check-circle" size={22} color={colors.primary} />
      ) : (
        <Feather name="circle" size={22} color={colors.border} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  native: { fontSize: 22 },
  name: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: 3 },
});
