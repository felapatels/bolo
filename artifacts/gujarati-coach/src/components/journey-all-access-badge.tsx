import { Sparkles } from 'lucide-react';
import { BADGE } from '@/lib/ticket-stock';

export function JourneyAllAccessBadge({ testId }: { testId?: string }) {
  return <span data-testid={testId} className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide" style={{ background: BADGE.brassBg, borderColor: BADGE.brassEdge, color: BADGE.ink }}><Sparkles className="h-2.5 w-2.5" />All-Access</span>;
}
