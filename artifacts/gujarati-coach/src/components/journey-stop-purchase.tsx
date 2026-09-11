import { useStopPurchaseOrder } from '@/lib/use-stop-purchase-order';
import { zonesForJourney } from '@/lib/journeyLines';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, useGetJourneyStopUnlocks, useGetTokens, useListCategories, useUnlockJourneyStop, type JourneyStopTarget } from '@workspace/api-client-react';
import { ChaiWalletSheet } from '@/components/chai-wallet';
import { ownsJourneyStop, rememberJourneyStop, journeyStopUpgradeHref } from '@/lib/journey-stop-access';

/** Server-priced permanent ownership beside the existing subscription choices. */
export function JourneyStopPurchase({ target }: { target: JourneyStopTarget }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const offer = useGetJourneyStopUnlocks({ languageCode: target.languageCode });
  const wallet = useGetTokens();
  const [walletOpen, setWalletOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owned = ownsJourneyStop(offer.data?.unlockedStops, target);
  const categories = useListCategories({ lang: target.languageCode });
  const order = useStopPurchaseOrder(target, categories.data, offer.data?.unlockedStops);
  const categoryId = categories.data?.find(c => c.slug === zonesForJourney(target.journey)[target.zone - 1]?.slug)?.id;
  const cost = offer.data?.cost; const balance = wallet.data?.balance;
  const enough = cost != null && balance != null && balance >= cost;
  const openStop = () => {
    if (target.kind === 'lesson' && categoryId == null) { setError('The lesson could not be loaded. Please try again.'); return; }
    navigate(target.kind === 'lesson'
    ? `/practice/${categoryId}?group=${target.lessonGroupId}`
    : `/games/${target.kind === 'story' ? 'storybook' : target.kind === 'letter' ? 'letter-stop' : 'script-trace'}?journey=${target.journey}&zone=${target.zone}`);
  };
  const purchase = useUnlockJourneyStop({ mutation: {
    onSuccess: async () => { setError(null); await qc.invalidateQueries(); openStop(); },
    onError: e => {
      const body = e instanceof ApiError ? e.data as { error?: string } : null;
      setError(body?.error === 'previous_stop_required' ? 'Unlock the earlier stops first, in journey order.' : body?.error === 'insufficient_tokens' ? 'Not enough Chai. Buy more below, or subscribe to All-Access.' : 'The stop could not be unlocked. Please try again.');
      void wallet.refetch(); void offer.refetch();
    },
  } });
  return <section data-testid="journey-stop-purchase" className="mb-6 space-y-3 rounded-2xl border border-card-border bg-card p-4 text-left">
    <h2 className="text-lg font-bold">{owned ? 'This stop is yours' : 'Open this stop your way'}</h2>
    <p className="text-sm text-muted-foreground">{target.kind === 'story' ? 'Storybook' : target.kind === 'trace' ? 'Tracing' : target.kind === 'letter' ? 'Letter listening' : 'Lesson'} · Zone {target.zone}{balance != null ? ` · Your balance: ${balance} Chai` : ''}</p>
    {offer.isLoading && <p role="status">Loading price…</p>}
    {offer.isError && <button onClick={() => void offer.refetch()} className="text-primary underline">Couldn’t load the Chai price. Retry</button>}
    {!owned && !order.ready && !order.isError && <p role="status">Loading stop order…</p>}
    {!owned && order.ready && !order.canBuy && <div className="space-y-2 text-sm text-muted-foreground">
      <p>Stops unlock in journey order. Open the earlier stops first, or subscribe below.</p>
      {order.nextStop && <button className="font-bold text-primary underline" onClick={() => navigate(journeyStopUpgradeHref(order.nextStop!))}>Go to the next stop to unlock</button>}
    </div>}
    {order.isError && <button className="text-primary underline" onClick={order.retry}>Couldn’t load stop order. Retry</button>}
    {(owned || cost != null) && <button data-testid="use-currency-unlock" disabled={purchase.isPending || (target.kind === 'lesson' && categoryId == null) || (!owned && (!enough || !order.canBuy))} onClick={() => owned ? openStop() : purchase.mutate({ data: target })} className="w-full rounded-xl bg-primary p-3 font-bold text-primary-foreground disabled:opacity-50">{owned ? 'Open stop' : purchase.isPending ? 'Unlocking…' : `Unlock for ${cost} Chai`}</button>}
    {!owned && <>
      <p className="text-sm text-muted-foreground">Unlock this stop permanently with Chai, or subscribe below to open every zone.</p>
      <button data-testid="buy-currency-for-stop" onClick={() => { rememberJourneyStop(target); setWalletOpen(true); }} className="w-full rounded-xl border p-3 font-bold">Buy Chai</button>
    </>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {walletOpen && <ChaiWalletSheet open onOpenChange={open => { setWalletOpen(open); if (!open) void wallet.refetch(); }} />}
  </section>;
}
