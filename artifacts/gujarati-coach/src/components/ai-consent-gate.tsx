import { useState, type ReactNode } from 'react';
import { Mic, MessageCircle, Volume2, Shield } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AI_CONSENT_ENABLED, AI_CONSENT_GREETING, AI_CONSENT_SUBTITLE, AI_CONSENT_CARDS, AI_CONSENT_IF_NO, AI_CONSENT_ACCEPT_LABEL, AI_CONSENT_DECLINE_LABEL, AI_CONSENT_SETTINGS_LABEL } from '@workspace/ai-consent';
import { useGetAiConsent, useSetAiConsent, getGetAiConsentQueryKey, getGetEntitlementsQueryKey, type Entitlements } from '@workspace/api-client-react';
import { Mascot } from '@/components/mascot';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { AiConsentNotice } from '@/components/ai-consent-notice';

export function AiConsentBoundary({ children }: { children: ReactNode }) {
  return AI_CONSENT_ENABLED ? <EnabledBoundary>{children}</EnabledBoundary> : <>{children}</>;
}
function EnabledBoundary({ children }: { children: ReactNode }) {
  const query = useGetAiConsent();
  if (query.isLoading) return <div role="status" className="min-h-screen grid place-items-center">Checking AI permission…</div>;
  if (!query.data) return <div className="min-h-screen flex flex-col items-center justify-center gap-4"><p>Couldn't check AI permission.</p><Button onClick={() => void query.refetch()}>Try again</Button></div>;
  if (query.data.decision === null) return <ConsentScreen />;
  return <><AiConsentNotice />{children}</>;
}
const icons = { mic: Mic, 'message-circle': MessageCircle, 'volume-2': Volume2, shield: Shield };
function ConsentScreen({ onDecided }: { onDecided?: () => void }) {
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
      onDecided?.();
    } catch { setError("Your choice wasn't saved. Please try again."); }
  };
  return <div className="bg-background text-foreground p-6 sm:p-8" data-testid="ai-consent-gate"><div className="mx-auto w-full max-w-[560px] space-y-4">
    <div className="flex items-center gap-4"><h1 className="flex-1 rounded-2xl border-2 bg-card p-4 text-xl sm:text-2xl font-bold">{AI_CONSENT_GREETING}</h1><Mascot pose="wave" className="w-24 shrink-0" /></div>
    <p className="text-center text-muted-foreground">{AI_CONSENT_SUBTITLE}</p>
    {AI_CONSENT_CARDS.map(card => { const Icon = icons[card.icon]; return <div key={card.icon} className="flex gap-3 rounded-2xl p-4" style={{ backgroundColor: card.background }}><Icon className="h-6 w-6 shrink-0" style={{ color: card.color }} /><div><h2 className="font-bold text-slate-900">{card.title}</h2><p data-testid={card.icon === 'shield' ? 'ai-consent-reassurance-and-memory' : undefined} className="mt-1 text-sm leading-relaxed text-slate-700">{card.body}</p></div></div>; })}
    <p className="text-sm text-muted-foreground">{AI_CONSENT_IF_NO}</p>
    {error && <p role="alert">{error}</p>}
    <div className="flex gap-3"><Button variant="outline" disabled={mutation.isPending} onClick={() => void decide(false)} className="h-auto min-h-14 flex-1 whitespace-normal border-2" data-testid="ai-consent-decline">{AI_CONSENT_DECLINE_LABEL}</Button><Button disabled={mutation.isPending} onClick={() => void decide(true)} className="h-auto min-h-14 flex-1 whitespace-normal" data-testid="ai-consent-accept">{AI_CONSENT_ACCEPT_LABEL}</Button></div>
    {mutation.isPending && <p role="status" className="text-center">Saving your choice…</p>}
    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="block text-center text-sm text-primary underline">Privacy policy</a>
  </div></div>;
}
export function AiConsentSettings() {
  const [open, setOpen] = useState(false);
  if (!AI_CONSENT_ENABLED) return null;
  return <><Button variant="outline" onClick={() => setOpen(true)}>{AI_CONSENT_SETTINGS_LABEL} · Review permission</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto p-0"><DialogTitle className="sr-only">AI permission</DialogTitle><ConsentScreen onDecided={() => setOpen(false)} /></DialogContent></Dialog></>;
}
