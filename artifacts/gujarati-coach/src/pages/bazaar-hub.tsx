import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { Mascot } from "@/components/mascot";
import { BazaarWelcome } from "@/components/bazaar-welcome";
import { BazaarHeader } from "@/components/bazaar-header";
import { SceneBand } from "@/components/scene-band";
import { ChaiWalletSheet } from "@/components/chai-wallet";
import { TRAIN_LOCO_SRC } from "@/components/train-svg";

/** The office's picture: the chalkboard on its easel, no words on it. */
const OFFICE_ART = `${import.meta.env.BASE_URL}games/script-trace.png`;

/**
 * THE BAZAAR IS A STREET WITH FOUR DOORS (mobile build 22, here build 23;
 * the owner's redesign: "Where would you like to go?"). It used to be one
 * long scroll of stalls; the hub now shows the tailor's scene and four
 * doors, each its own page:
 *
 *   The Tailor        outfits, headwear and accessories for Bolo
 *   Station Master    hats, uniforms and station essentials
 *   Ticket Counter    passes, boosts and first class upgrades
 *   Language Office   unlock new languages and content
 *
 * The greeting on arrival (BazaarWelcome) stays on the hub, and the Chai
 * pill in the header opens the wallet, as the old chai stall's band did.
 * Mobile twin: app/(app)/bazaar/index.tsx.
 */
export default function BazaarHubPage() {
  const [walletOpen, setWalletOpen] = useState(false);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-nav pt-4 lg:pb-12" data-testid="bazaar-hub">
      <BazaarWelcome />
      <BazaarHeader
        title="Bazaar"
        subtitle="Spend Chai, upgrade your journey."
        backHref="/app"
        onWallet={() => setWalletOpen(true)}
      />
      <div className="space-y-3">
        <SceneBand stall="tailor" testId="bazaar-hero" />
        <p className="pt-1 text-[15px] font-semibold text-primary">Where would you like to go?</p>
        <Door
          href="/bazaar/tailor"
          title="The Tailor"
          lines={["Outfits, headwear", "and accessories", "for Bolo."]}
          testId="bazaar-door-tailor"
          picture={<Mascot pose="wave" size={64} idle="none" />}
        />
        <Door
          href="/bazaar/station"
          title="Station Master"
          lines={["Hats, uniforms", "and station", "essentials."]}
          testId="bazaar-door-station"
          picture={<Mascot pose="thumbsup" size={64} idle="none" accessory="station-cap" />}
        />
        <Door
          href="/bazaar/tickets"
          title="Ticket Counter"
          lines={["Passes, boosts", "and first class", "upgrades."]}
          testId="bazaar-door-tickets"
          picture={<img src={TRAIN_LOCO_SRC} alt="" aria-hidden className="h-16 w-[66px] object-contain" />}
        />
        <Door
          href="/bazaar/languages"
          title="Language Office"
          lines={["Unlock new", "languages and", "content."]}
          testId="bazaar-door-languages"
          picture={<img src={OFFICE_ART} alt="" aria-hidden className="h-14 w-[70px] rounded-[10px] object-cover" />}
        />
      </div>
      <ChaiWalletSheet open={walletOpen} onOpenChange={setWalletOpen} />
    </div>
  );
}

function Door({
  href,
  title,
  lines,
  picture,
  testId,
}: {
  href: string;
  title: string;
  lines: string[];
  picture: ReactNode;
  testId: string;
}) {
  return (
    <Link
      href={href}
      aria-label={`${title}. ${lines.join(" ")}`}
      data-testid={testId}
      className="flex items-center gap-3.5 rounded-[18px] border-[1.5px] p-3 shadow-[0_4px_8px_rgba(43,26,18,0.12)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
      style={{ backgroundColor: "#FBF4E8", borderColor: "#E8D9BE" }}
    >
      <span
        className="flex h-[84px] w-[92px] shrink-0 items-center justify-center overflow-hidden rounded-[14px]"
        style={{ backgroundColor: "#F3E6D0" }}
      >
        {picture}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-black" style={{ color: "#2B1A0E" }}>
          {title}
        </span>
        <span className="mt-0.5 block whitespace-pre-line text-[13px] leading-[18px]" style={{ color: "#6B5B4E" }}>
          {lines.join("\n")}
        </span>
      </span>
      <ChevronRight className="h-[22px] w-[22px] shrink-0 text-muted-foreground" />
    </Link>
  );
}
