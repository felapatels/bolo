import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAccountMemories,
  useForgetAccountMemories,
} from '@workspace/api-client-react';

import { Screen } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * WHAT BOLO REMEMBERS, AND THE WAY TO MAKE HIM STOP.
 *
 * Bolo began keeping notes between sessions on 2026-08-27, and `GET` and
 * `DELETE /account/memories` shipped with the feature itself. Then nothing on
 * any client called them for a day: the chat screen carried the disclosure and
 * there was no screen behind it. Many of these learners are children, so this
 * is a privacy control rather than a settings toy. Web twin:
 * `pages/account.tsx` plus `components/bolo-memories.tsx`.
 *
 * IT RENDERS EVEN WHEN THE LIST IS EMPTY. Hiding the screen until there is
 * something in it reproduces the exact silence being fixed: a parent looking
 * for what is held would find nothing and learn nothing, and "nothing is held"
 * is the answer they came for.
 *
 * A FAILED LOAD SAYS SO RATHER THAN RENDERING AS EMPTY, for the same reason.
 * The dangerous wrong answer here is not a spinner, it is a confident
 * "nothing kept" that is really a network error.
 *
 * THE SENTENCES ARE ENGLISH whatever language the lesson was in, because they
 * are written to be read by the model. The copy says so rather than leaving a
 * Gujarati learner to puzzle over English sentences about themselves.
 */
export default function MemoriesScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useGetAccountMemories();
  const forget = useForgetAccountMemories();

  const memories = data?.memories ?? [];

  const confirmForget = () => {
    Alert.alert(
      'Make Bolo forget everything?',
      `This deletes all ${memories.length} ${
        memories.length === 1 ? 'note' : 'notes'
      } Bolo has kept about you. He’ll still chat exactly as before, he just starts again not knowing you. Your progress, badges and friends aren’t affected. This can’t be undone.`,
      [
        { text: 'Keep them', style: 'cancel' },
        {
          text: 'Forget everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await forget.mutateAsync();
              await queryClient.invalidateQueries();
            } catch {
              Alert.alert(
                'Couldn’t clear the notes',
                'Something went wrong. Please try again.',
              );
            }
          },
        },
      ],
    );
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
          What Bolo Remembers
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Bolo keeps a few short notes about you so he can pick up where you
            left off. He writes them in English whatever language you’re
            learning, because the notes are for him rather than for you. He
            never keeps a recording or a transcript of anything you say.
          </Text>

          {isLoading ? (
            <View testID="memories-loading" style={styles.stateRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
                Checking what Bolo has written down…
              </Text>
            </View>
          ) : isError ? (
            <Text
              testID="memories-error"
              style={[styles.stateText, { color: colors.destructive ?? '#EF4444' }]}
            >
              Couldn’t load Bolo’s notes just now. Please try again later.
            </Text>
          ) : memories.length === 0 ? (
            <Text
              testID="memories-empty"
              style={[styles.stateText, { color: colors.mutedForeground }]}
            >
              Bolo hasn’t written anything down about you yet.
            </Text>
          ) : (
            <View testID="memories-list" style={styles.list}>
              {memories.map((m) => (
                <View
                  key={m.id}
                  testID={`memory-${m.id}`}
                  style={[styles.memoryRow, { borderColor: colors.border }]}
                >
                  <Text style={[styles.memoryText, { color: colors.foreground }]}>
                    {m.memory}
                  </Text>
                  <Text style={[styles.memoryDate, { color: colors.mutedForeground }]}>
                    {formatRemembered(m.createdAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {memories.length > 0 ? (
            <ChunkyButton
              title="Make Bolo forget everything"
              icon="trash-2"
              variant="secondary"
              onPress={confirmForget}
              disabled={forget.isPending}
              loading={forget.isPending}
              style={{ marginTop: 4, alignSelf: 'stretch' }}
            />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

/**
 * "Remembered on 5 August 2026". A bad or missing date must never take the
 * row down: the sentence is what the learner came to read, and a timestamp is
 * a nicety beside it.
 */
export function formatRemembered(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Remembered earlier';
  return `Remembered on ${d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: { fontFamily: AppFonts.bold, fontSize: 18 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
  },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 14, lineHeight: 20 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stateText: { fontFamily: AppFonts.regular, fontSize: 14, lineHeight: 20 },
  list: { gap: 10 },
  memoryRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  memoryText: { fontFamily: AppFonts.semibold, fontSize: 15, lineHeight: 21 },
  memoryDate: { fontFamily: AppFonts.regular, fontSize: 12 },
});
