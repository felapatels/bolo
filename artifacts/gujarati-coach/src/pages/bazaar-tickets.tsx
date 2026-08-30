import { useState } from "react";
import { BazaarHeader } from "@/components/bazaar-header";
import { SceneBand } from "@/components/scene-band";
import { AllAccessUpgradeCard } from "@/components/plus";
import { ChaiPackShop } from "@/components/chai-packs";
import {
  ChaiWalletSheet,
  ExpressMultiplierRow,
  FirstClassWalletRow,
  StationPauseRow,
  StreakRepairRow,
} from "@/components/chai-wallet";
import { useEntitlements } from "@/lib/entitlements";

/**
 * THE TICKET COUNTER (mobile build 22, here build 23; the owner's bazaar
 * mockup). The station master's counter, then PASSES & BOOSTS (First Class,
 * the mend when the server offers it, a Station Pause, the Express
 * Multiplier), UPGRADES with the All-Access card for learners without it,
 * and Chai packs at the foot. The rows are the WALLET'S OWN rows, imported
 * rather than re-typed, so a copy or price change lands on both surfaces at
 * once. The phone draws the passes as a rail of stamps; here they keep the
 * wallet's rows, which is the one thing on this page not yet twinned.
 * Mobile twin: app/(app)/bazaar/tickets.tsx.
 */
export default function TicketCounterPage() {
  const { isPlus, isLoading } = useEntitlements();
  const [walletOpen, setWalletOpen] = useState(false);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-nav pt-4 lg:pb-12" data-testid="bazaar-ticket-counter">
      <BazaarHeader title="Ticket Counter" subtitle="Passes, boosts and upgrades." centred onWallet={() => setWalletOpen(true)} />
      <div className="space-y-3.5">
        <SceneBand stall="ticket" testId="tickets-scene" />
        <Label>Passes &amp; boosts</Label>
        <FirstClassWalletRow />
        <StreakRepairRow />
        <StationPauseRow />
        <ExpressMultiplierRow />
        {!isLoading && !isPlus ? (
          <>
            <Label>Upgrades</Label>
            <AllAccessUpgradeCard />
          </>
        ) : null}
        <Label>Top up</Label>
        <ChaiPackShop />
        {/* The wallet is one tap away for the balance and the ledger: the
            header's pill, and this link under the counter for anyone who
            scrolled past it. */}
        <button
          type="button"
          onClick={() => setWalletOpen(true)}
          data-testid="bazaar-open-wallet"
          aria-label="Open your Chai wallet"
          className="mx-auto block px-3 py-2.5 text-sm font-bold text-primary hover:opacity-70"
        >
          Open the wallet
        </button>
      </div>
      <ChaiWalletSheet open={walletOpen} onOpenChange={setWalletOpen} />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="pt-1 text-xs font-black uppercase tracking-[1.4px] text-foreground">{children}</p>;
}
