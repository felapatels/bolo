import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChunkyButton } from '@/components/ChunkyButton';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * A VOICE GAME STOPS WHEN THE LEARNER HAS SAID NO TO AI (2026-09-15).
 *
 * India turned its consent switch on, and the server refuses a take from a
 * learner who declined (useSpeakAndScore returns `consent_required`). Last Call
 * and Answer Back used to treat any refusal as "Scoring hit a snag", re-ask the
 * same line, and hit the same refusal forever (ledger X101, trap 5). This card
 * is what they show instead: what is off, and the one place to change it.
 *
 * It sits over the round without ending it, so the clock stays paused and
 * nothing is lost if the learner leaves. The app-wide AiConsentNotice alert may
 * appear too; this card is the part that stays.
 */
export function AiConsentBlockedCard({
  gameName,
  onLeave,
  testID,
}: {
  gameName: string;
  onLeave: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]} testID={testID}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>AI permission is off</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          {`${gameName} listens to you with AI, and you have turned that off. Turn AI permission on in Account to play.`}
        </Text>
        <ChunkyButton
          title="Open Account"
          icon="user"
          onPress={() => router.push('/(app)/account')}
          style={{ alignSelf: 'stretch', marginTop: 18 }}
        />
        <ChunkyButton
          title="Leave"
          variant="secondary"
          onPress={onLeave}
          style={{ alignSelf: 'stretch', marginTop: 10 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.45)' },
  card: { width: '100%', maxWidth: 420, borderRadius: 24, borderWidth: 1, padding: 22 },
  title: { fontFamily: AppFonts.bold, fontSize: 22, textAlign: 'center' },
  body: { fontFamily: AppFonts.regular, fontSize: 15, marginTop: 8, textAlign: 'center' },
});
