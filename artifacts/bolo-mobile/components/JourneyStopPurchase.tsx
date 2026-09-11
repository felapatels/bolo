import { useStopPurchaseOrder } from '@/lib/useStopPurchaseOrder';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, useGetJourneyStopUnlocks, useGetTokens, useListCategories, useUnlockJourneyStop, type JourneyStopTarget } from '@workspace/api-client-react';
import { ChaiWalletSheet } from '@/components/ChaiWallet';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { ownsJourneyStop, journeyStopCategorySlug } from '@/lib/journeyStopAccess';

/** Context on the existing subscription screen, with server-priced Chai options. */
export function JourneyStopPurchase({ target }: { target: JourneyStopTarget }) {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const offer = useGetJourneyStopUnlocks({ languageCode: target.languageCode });
  const tokens = useGetTokens();
  const [walletOpen, setWalletOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owned = ownsJourneyStop(offer.data?.unlockedStops, target);
  const categories = useListCategories({ lang: target.languageCode });
  const order = useStopPurchaseOrder(target, categories.data, offer.data?.unlockedStops);
  const categoryId = categories.data?.find(c => c.slug === journeyStopCategorySlug(target))?.id;
  const cost = offer.data?.cost;
  const balance = tokens.data?.balance;
  const enough = cost != null && balance != null && balance >= cost;
  const openStop = () => {
    if (target.kind === 'lesson' && categoryId == null) { setError('The lesson could not be loaded. Please try again.'); return; }
    if (target.kind === 'lesson') router.replace({ pathname: '/(app)/practice/[id]', params: { id: String(categoryId), group: String(target.lessonGroupId) } });
    else router.replace({ pathname: target.kind === 'story' ? '/(app)/(tabs)/games/storybook' : target.kind === 'letter' ? '/(app)/(tabs)/games/letter-stop' : '/(app)/(tabs)/games/script-trace', params: { journey: String(target.journey), zone: String(target.zone) } });
  };
  const purchase = useUnlockJourneyStop({ mutation: {
    onSuccess: async () => {
      setError(null);
      // Ownership changes the map, practice, story, trace, wallet and gift meter.
      await qc.invalidateQueries();
      openStop();
    },
    onError: e => {
      const body = e instanceof ApiError ? e.data as { error?: string } : null;
      setError(body?.error === 'previous_stop_required' ? 'Unlock the earlier stops first, in journey order.' : body?.error === 'insufficient_tokens' ? 'Not enough Chai. Buy more below, or subscribe to All-Access.' : 'The stop could not be unlocked. Please try again.');
      void tokens.refetch();
      void offer.refetch();
    },
  } });
  return <View testID="journey-stop-purchase" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>{owned ? 'This stop is yours' : 'Open this stop your way'}</Text>
    <Text style={{ color: colors.mutedForeground }}>{target.kind === 'story' ? 'Storybook' : target.kind === 'trace' ? 'Tracing' : target.kind === 'letter' ? 'Letter listening' : 'Lesson'} · Zone {target.zone}{balance != null ? ` · Your balance: ${balance} Chai` : ''}</Text>
    {offer.isLoading ? <ActivityIndicator /> : null}
    {offer.isError ? <Pressable accessibilityRole="button" onPress={() => { void offer.refetch(); }}><Text style={{ color: colors.primary }}>Couldn’t load the Chai price. Tap to retry.</Text></Pressable> : null}
    {!owned && !order.ready && !order.isError && <Text style={{ color: colors.mutedForeground }}>Loading stop order…</Text>}
    {!owned && order.ready && !order.canBuy && <View style={{ gap: 8 }}>
      <Text style={{ color: colors.mutedForeground }}>Stops unlock in journey order. Open the earlier stops first, or subscribe below.</Text>
      {order.nextStop && <Pressable accessibilityRole="button" onPress={() => {
        const next = order.nextStop!;
        router.replace({ pathname: '/(app)/paywall', params: { reason: 'journey_stop', lang: next.languageCode, stopKind: next.kind, journey: String(next.journey), zone: String(next.zone), ...(next.lessonGroupId ? { lessonGroupId: String(next.lessonGroupId) } : {}) } });
      }}><Text style={{ color: colors.primary }}>Go to the next stop to unlock</Text></Pressable>}
    </View>}
    {order.isError && <Pressable accessibilityRole="button" onPress={order.retry}><Text style={{ color: colors.primary }}>Couldn’t load stop order. Tap to retry.</Text></Pressable>}
    {(owned || cost != null) && <Pressable testID="use-chai-unlock" accessibilityRole="button" disabled={purchase.isPending || (target.kind === 'lesson' && categoryId == null) || (!owned && (!enough || !order.canBuy))} onPress={() => owned ? openStop() : purchase.mutate({ data: target })} style={[styles.button, { backgroundColor: colors.primary, opacity: purchase.isPending || (target.kind === 'lesson' && categoryId == null) || (!owned && (!enough || !order.canBuy)) ? 0.5 : 1 }]}>
      <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{owned ? 'Open stop' : purchase.isPending ? 'Unlocking…' : `Unlock for ${cost} Chai`}</Text>
    </Pressable>}
    {!owned && <>
      <Text style={{ color: colors.mutedForeground }}>Unlock this stop permanently with Chai, or subscribe below to open every zone.</Text>
      <Pressable testID="buy-chai-for-stop" accessibilityRole="button" onPress={() => setWalletOpen(true)} style={[styles.button, { borderWidth: 1, borderColor: colors.border }]}><Text style={[styles.buttonText, { color: colors.foreground }]}>Buy Chai</Text></Pressable>
    </>}
    {error && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text>}
    {walletOpen && <ChaiWalletSheet visible onClose={() => { setWalletOpen(false); void tokens.refetch(); }} />}
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 16, gap: 12, borderWidth: 1, borderRadius: 18, marginBottom: 20 }, title: { fontSize: 19, fontFamily: AppFonts.bold }, button: { borderRadius: 12, padding: 14, alignItems: 'center' }, buttonText: { fontFamily: AppFonts.bold } });
