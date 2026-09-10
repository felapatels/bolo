import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AI_CONSENT_TITLE,
  AI_CONSENT_WHAT_LEAVES,
  AI_CONSENT_FEATURES,
  AI_RECIPIENTS,
  AI_CONSENT_REASSURANCE_AND_MEMORY,
  AI_CONSENT_IF_NO,
  AI_CONSENT_ACCEPT_LABEL,
  AI_CONSENT_DECLINE_LABEL,
} from '@workspace/ai-consent';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useSetAiConsent,
  getGetEntitlementsQueryKey,
  getGetAiConsentQueryKey,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { ChunkyButton } from '@/components/ChunkyButton';

/**
 * THE CONSENT SCREEN. Apple 5.1.1(i) and 5.1.2(i).
 *
 * Rendered by every door that would send the learner's voice or conversation
 * onward. It is not a route: mounting it at the doors is what makes it
 * unavoidable, and a consent component that exists but is mounted nowhere is a
 * compliance artefact that looks finished and protects nobody.
 *
 * THREE THINGS HERE ARE NOT STYLE CHOICES.
 *
 * 1. The reassurance and the memory clause are ONE <Text>. They arrive as one
 *    string from @workspace/ai-consent for the same reason. Split across two
 *    list items, any truncation or collapse shows the comforting half alone.
 *
 * 2. THE REFUSAL IS A REAL BUTTON. Full width, the same height as the accept,
 *    with a real label. It is OUTLINED where the accept is FILLED, so the two
 *    differ in SHAPE and not only in colour: the owner is partially colour
 *    blind, and Apple reads a hidden or greyed-out "no" as not having offered a
 *    choice at all. Never make this a text link in a corner.
 *
 * 3. It renders only when the caller passes `shouldAsk`, which is FALSE while
 *    the entitlements snapshot is loading. Undefined is not undecided.
 */
export function AiConsentGate({ onDecided }: { onDecided?: (granted: boolean) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { refetch } = useEntitlements();
  const queryClient = useQueryClient();
  const mutation = useSetAiConsent();
  const [busy, setBusy] = useState(false);

  // THE WRITE LIVES HERE, not in the door's hook, because this component mounts
  // only while a learner is being asked. See hooks/useAiConsentGate.ts.
  const decide = useCallback(
    async (granted: boolean) => {
      setBusy(true);
      try {
        await mutation.mutateAsync({ data: { granted } });
        // Both keys: the decision rides the entitlements snapshot AND has its
        // own endpoint, and a stale entitlements cache leaves the door still
        // asking after the learner has answered.
        await queryClient.invalidateQueries({ queryKey: getGetAiConsentQueryKey() });
        await queryClient.invalidateQueries({ queryKey: getGetEntitlementsQueryKey() });
        refetch();
        onDecided?.(granted);
      } finally {
        setBusy(false);
      }
    },
    [mutation, queryClient, refetch, onDecided],
  );
  const onAccept = useCallback(() => void decide(true), [decide]);
  const onDecline = useCallback(() => void decide(false), [decide]);

  return (
    <View
      style={[s.backdrop, { backgroundColor: colors.background, paddingTop: insets.top }]}
      testID="ai-consent-gate"
    >
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[s.title, { color: colors.foreground }]} testID="ai-consent-title">
          {AI_CONSENT_TITLE}
        </Text>

        <Text style={[s.para, { color: colors.foreground }]} testID="ai-consent-what-leaves">
          {AI_CONSENT_WHAT_LEAVES}
        </Text>

        <View style={s.list}>
          {AI_CONSENT_FEATURES.map((f) => (
            <View key={f} style={s.row}>
              {/* A shape, not a colour: the marker has to read for a learner who
                  cannot separate the accent from the text. */}
              <Text style={[s.bullet, { color: colors.foreground }]}>•</Text>
              <Text style={[s.rowText, { color: colors.foreground }]}>{f}</Text>
            </View>
          ))}
        </View>

        {AI_RECIPIENTS.map((r) => (
          <Text
            key={r.name}
            style={[s.para, { color: colors.foreground }]}
            testID={`ai-consent-recipient-${r.name}`}
          >
            <Text style={s.strong}>{r.name}</Text>
            {' receives '}
            {r.receives}
          </Text>
        ))}

        {/* ONE NODE. See the header comment. The testID is asserted, and so is
            the fact that BOTH halves are inside this single element. */}
        <Text
          style={[s.para, { color: colors.foreground }]}
          testID="ai-consent-reassurance-and-memory"
        >
          {AI_CONSENT_REASSURANCE_AND_MEMORY}
        </Text>

        <Text style={[s.para, { color: colors.mutedForeground }]} testID="ai-consent-if-no">
          {AI_CONSENT_IF_NO}
        </Text>
      </ScrollView>

      <View style={[s.actions, { paddingBottom: insets.bottom + 12 }]}>
        <ChunkyButton
          title={AI_CONSENT_ACCEPT_LABEL}
          onPress={onAccept}
          disabled={busy}
          testID="ai-consent-accept"
          style={s.fullWidth}
        />
        <Pressable
          onPress={onDecline}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={AI_CONSENT_DECLINE_LABEL}
          testID="ai-consent-decline"
          style={({ pressed }) => [
            s.decline,
            {
              borderColor: colors.foreground,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[s.declineText, { color: colors.foreground }]}>
            {AI_CONSENT_DECLINE_LABEL}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  body: { paddingHorizontal: 24, paddingTop: 24, gap: 16 },
  title: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  para: { fontSize: 16, lineHeight: 24 },
  strong: { fontWeight: '700' },
  list: { gap: 6 },
  row: { flexDirection: 'row', gap: 10 },
  bullet: { fontSize: 16, lineHeight: 24 },
  rowText: { fontSize: 16, lineHeight: 24, flex: 1 },
  actions: { paddingHorizontal: 24, paddingTop: 8, gap: 12 },
  fullWidth: { width: '100%' },
  // OUTLINED, and the same height as the filled accept above it. The shape is
  // the difference, so it survives a colour-blind reader and a greyscale
  // screenshot.
  decline: {
    width: '100%',
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  declineText: { fontSize: 16, fontWeight: '700' },
});
