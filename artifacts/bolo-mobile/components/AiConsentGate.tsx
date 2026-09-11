import { openPrivacyPolicyAlways } from '@/lib/legal';
import { AiConsentNotice } from '@/components/AiConsentNotice';
import { useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions, ActivityIndicator, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { AI_CONSENT_ENABLED, AI_CONSENT_GREETING, AI_CONSENT_SUBTITLE, AI_CONSENT_CARDS, AI_CONSENT_IF_NO, AI_CONSENT_ACCEPT_LABEL, AI_CONSENT_DECLINE_LABEL, AI_CONSENT_SETTINGS_LABEL } from '@workspace/ai-consent';
import { useGetAiConsent, useSetAiConsent, getGetAiConsentQueryKey, getGetEntitlementsQueryKey, type Entitlements } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { Mascot } from '@/components/Mascot';

// The wrapper skips even consent-specific requests while the rollout is off.
export function AiConsentBoundary({ children }: { children: ReactNode }) {
  return AI_CONSENT_ENABLED ? <EnabledBoundary>{children}</EnabledBoundary> : <>{children}</>;
}
function EnabledBoundary({ children }: { children: ReactNode }) {
  const query = useGetAiConsent();
  const colors = useColors();
  if (query.isLoading) return <View style={[s.loading, { backgroundColor: colors.background }]}><ActivityIndicator accessibilityLabel="Checking AI permission" /></View>;
  if (!query.data) return <View style={[s.loading, { backgroundColor: colors.background }]}><Text style={{ color: colors.foreground }}>Couldn't check AI permission.</Text><Pressable accessibilityRole="button" onPress={() => void query.refetch()}><Text style={{ color: colors.primary, padding: 20 }}>Try again</Text></Pressable></View>;
  // A saved refusal opens the rest of the app; only an explicit Account action asks again.
  if (query.data.decision === null) return <AiConsentGate />;
  return <><AiConsentNotice />{children}</>;
}
export function AiConsentGate({ onDecided }: { onDecided?: (granted: boolean) => void }) {
  return AI_CONSENT_ENABLED ? <ConsentScreen onDecided={onDecided} /> : null;
}
function ConsentScreen({ onDecided, onClose }: { onDecided?: (granted: boolean) => void; onClose?: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= 768;
  const cache = useQueryClient();
  const mutation = useSetAiConsent();
  const [error, setError] = useState('');
  const decide = async (granted: boolean) => {
    if (mutation.isPending) return;
    setError('');
    try {
      const saved = await mutation.mutateAsync({ data: { granted } });
      cache.setQueryData(getGetAiConsentQueryKey(), saved);
      cache.setQueryData<Entitlements>(getGetEntitlementsQueryKey(), current => current ? { ...current, aiConsent: saved } : current);
      void cache.invalidateQueries({ queryKey: getGetEntitlementsQueryKey() });
      onDecided?.(granted);
    } catch {
      setError("Your choice wasn't saved. Please try again.");
    }
  };
  return <View style={[s.backdrop, { backgroundColor: colors.background }]} testID="ai-consent-gate">
    <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={[s.column, { maxWidth: wide ? 560 : 380 }]}>
        {onClose && <Pressable accessibilityRole="button" onPress={onClose} disabled={mutation.isPending}><Text style={{ color: colors.primary, textAlign: 'right', padding: 8 }}>Close</Text></Pressable>}
        <View style={s.headingRow}>
          <View style={[s.headingCard, { borderColor: colors.border, backgroundColor: colors.card }]}><Text accessibilityRole="header" style={[s.heading, { color: colors.foreground, fontSize: wide ? 22 : 18 }]}>{AI_CONSENT_GREETING}</Text></View>
          <Mascot pose="wave" size={wide ? 112 : 84} />
        </View>
        <Text style={[s.subtitle, { color: colors.mutedForeground, fontSize: wide ? 18 : 14 }]}>{AI_CONSENT_SUBTITLE}</Text>
        {AI_CONSENT_CARDS.map(card => <View key={card.icon} style={[s.card, { backgroundColor: card.background, padding: wide ? 20 : 12 }]}>
          <Feather name={card.icon} size={wide ? 26 : 22} color={card.color} />
          <View style={s.cardText}><Text style={[s.cardTitle, { fontSize: wide ? 18 : 14 }]}>{card.title}</Text><Text testID={card.icon === 'shield' ? 'ai-consent-reassurance-and-memory' : undefined} style={[s.cardBody, { fontSize: wide ? 16 : 12.5, lineHeight: wide ? 23 : 18 }]}>{card.body}</Text></View>
        </View>)}
        <Text style={[s.explanation, { color: colors.mutedForeground }]}>{AI_CONSENT_IF_NO}</Text>
        {!!error && <Text accessibilityRole="alert" style={{ color: colors.foreground }}>{error}</Text>}
        <View style={s.actions}>
          <Pressable accessibilityRole="button" disabled={mutation.isPending} onPress={() => void decide(false)} testID="ai-consent-decline" style={[s.button, { borderColor: colors.primary }]}><Text style={[s.buttonText, { color: colors.primary }]}>{AI_CONSENT_DECLINE_LABEL}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={mutation.isPending} onPress={() => void decide(true)} testID="ai-consent-accept" style={[s.button, { backgroundColor: colors.primary, borderColor: colors.primary }]}><Text style={[s.buttonText, { color: '#fff' }]}>{AI_CONSENT_ACCEPT_LABEL}</Text></Pressable>
        </View>
        {mutation.isPending && <ActivityIndicator accessibilityLabel="Saving your choice" />}
        <Pressable accessibilityRole="link" onPress={() => void openPrivacyPolicyAlways()}><Text style={[s.privacy, { color: colors.primary }]}>Privacy policy</Text></Pressable>
      </View>
    </ScrollView>
  </View>;
}
export function AiConsentSettings() {
  const [open, setOpen] = useState(false);
  const colors = useColors();
  if (!AI_CONSENT_ENABLED) return null;
  return <><Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ padding: 16 }}><Text style={{ color: colors.foreground, fontWeight: '700' }}>{AI_CONSENT_SETTINGS_LABEL}</Text><Text style={{ color: colors.mutedForeground }}>Review or change AI permission</Text></Pressable>
    <Modal visible={open} onRequestClose={() => setOpen(false)} animationType="slide"><ConsentScreen onDecided={() => setOpen(false)} onClose={() => setOpen(false)} /></Modal></>;
}
const s = StyleSheet.create({
  backdrop: { flex: 1 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center' },
  column: { width: '100%', gap: 12 }, headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingCard: { flex: 1, borderRadius: 20, borderWidth: 2, padding: 16 }, heading: { fontWeight: '800' },
  subtitle: { textAlign: 'center', lineHeight: 24, marginBottom: 4 },
  card: { flexDirection: 'row', gap: 12, borderRadius: 18 }, cardText: { flex: 1, gap: 4 },
  cardTitle: { color: '#172033', fontWeight: '700' }, cardBody: { color: '#344054' },
  explanation: { fontSize: 12, lineHeight: 18 }, actions: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, borderWidth: 2, borderRadius: 16, minHeight: 56, padding: 12, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '700', textAlign: 'center' }, privacy: { textAlign: 'center', padding: 8, textDecorationLine: 'underline' },
});
