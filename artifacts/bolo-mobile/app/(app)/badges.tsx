import React from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { getListBadgesQueryKey } from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { BadgesGallery } from '@/components/BadgesGallery';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

export default function BadgesScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeLang, activeLanguage } = useLanguage();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({
      queryKey: getListBadgesQueryKey({ lang: activeLang }),
    });
    setRefreshing(false);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerLabel, { color: colors.foreground }]}>
          Badges
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          {activeLanguage?.name ?? 'Loading...'}
        </Text>
        <BadgesGallery lang={activeLang} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  sub: {
    fontFamily: AppFonts.semibold,
    fontSize: 15,
    marginTop: 4,
    marginBottom: 20,
  },
});
