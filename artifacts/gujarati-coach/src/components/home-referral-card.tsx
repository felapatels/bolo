import { Gift } from "lucide-react";
import { useGetReferral } from "@workspace/api-client-react";
import { REFERRAL_REWARD_CHAI, referralLink } from "@/lib/referral-code";
import { copyReferralLink, shareReferralLink } from "@/lib/referral-share";

// Task #1049: the referral entry point on home. Deliberately the COMPACT twin
// of the settings card (components/referral-card.tsx): gift icon, headline,
// one line of copy, one button. It never shows the raw code, the URL text,
// the Joined / Pending / Chai earned row or a Copy link button, those stay on
// the settings surface, which is where a learner goes to inspect their invite,
// not to send one.
//
// The treatment is the quiet bordered home card the phrasebook door uses, so
// it sits at the bottom of the page without competing with the boarding pass.
//
// The Chai number is REFERRAL_REWARD_CHAI (from @workspace/referral-link,
// contract-tested against the server's reward constants), never a literal,
// so home cannot advertise an amount the ledger does not pay.

export function HomeReferralCard() {
  const { data, isLoading, isError } = useGetReferral();

  // Nothing half-built on home: while the code is in flight, or if the query
  // failed, the card is simply absent rather than showing a dead button.
  if (isLoading || isError || !data?.code) return null;

  const link = referralLink(data.code);

  return (
    <section
      aria-label="Invite a friend"
      data-testid="home-referral-card"
      className="mt-8 rounded-3xl border border-card-border bg-card p-5 shadow-[0_4px_0_rgba(0,0,0,0.08)]"
    >
      {/* Narrow widths stack the button under the copy: side by side, the
          headline wraps mid-phrase and the line squeezes to three lines. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Gift className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-foreground">
              Invite a friend, earn Chai
            </p>
            <p className="text-sm font-semibold text-muted-foreground">
              You both get {REFERRAL_REWARD_CHAI} Chai when they finish their
              first practice.
            </p>
          </div>
        </div>
        <button
          type="button"
          data-testid="home-referral-share"
          onClick={() =>
            void shareReferralLink(link, async () => {
              // No share sheet at all (desktop Firefox, older Chrome): drop
              // the link on the clipboard rather than the button doing
              // nothing. Home stays quiet about it, the settings card is
              // where "Copied!" and the visible link live.
              await copyReferralLink(link);
            })
          }
          className="w-full shrink-0 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto sm:py-2.5"
        >
          Share invite
        </button>
      </div>
    </section>
  );
}
