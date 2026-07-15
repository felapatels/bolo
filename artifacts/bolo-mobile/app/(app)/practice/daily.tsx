// Resolver route a tapped daily reminder deep-links into. It picks the best
// topic to practice right now (first topic with unmastered phrases, same rule
// as Home's "Start daily practice") and forwards into that session, so the
// notification can always point at one stable URL.
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useListCategories } from '@workspace/api-client-react';
import { FunFactLoader } from '@/components/FunFactLoader';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';

export default function DailyPracticeResolver() {
  const router = useRouter();
  const colors = useColors();
  const { activeLang } = useLanguage();
  const categories = useListCategories({ lang: activeLang });
  const routed = useRef(false);

  useEffect(() => {
    if (routed.current) return;
    if (categories.isLoading) return;
    routed.current = true;
    const list = categories.data ?? [];
    const target = list.find((c) => c.masteredCount < c.phraseCount) ?? list[0];
    if (target) {
      router.replace(`/(app)/practice/${target.id}`);
    } else {
      // Nothing to practice (or topics failed to load): land on Home.
      router.replace('/(app)/(tabs)');
    }
  }, [categories.isLoading, categories.data, router]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}
    >
      <FunFactLoader color={colors.primary} />
    </View>
  );
}
