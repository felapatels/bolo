import { useEffect, useRef } from "react";
import { Link, useParams } from "wouter";
import { Show } from "@clerk/react";
import { motion } from "framer-motion";
import { Loader2, PartyPopper } from "lucide-react";
import { Mascot } from "@/components/mascot";
import { AppStoreBadge } from "@/components/app-store-badge";
import { useReferralRedemption } from "@/components/referral-redeemer";
import { detectShortcutPlatform } from "@/lib/platform";
import {
  REFERRAL_REWARD_CHAI,
  normalizeReferralCode,
  referralLandingPath,
  rememberReferralCode,
} from "@/lib/referral-code";
import { cn } from "@/lib/utils";

// Referral R2, web slice. The page a shared referral link lands on.
//
// Two jobs, in this order:
//   1. Remember the code immediately, before anything can navigate away. This
//      is the only moment the code is guaranteed to be in hand, and signup is
//      about to take the visitor through Clerk and back.
//   2. Let the single redeemer (referral-redeemer) do the actual call, and
//      show whatever it reports.
//
// It never dead-ends. Whatever happens to the code, including an unknown or
// self-referring one, the visitor leaves through a working button: signed-out
// visitors to signup, signed-in learners into the app.
//
// A referral link is tapped on a PHONE far more often than anywhere else, and
// there is no deep link, so the tap lands here in a browser. Without a store
// badge the invited friend's only route was the web app, on the platform
// where they are most likely to want the native one. The badge picks the
// visitor's own store and stays muted and unlinked until that listing is live
// (APP_STORE_LIVE / PLAY_STORE_LIVE), so it can ship before either approval
// lands.

const CTA = "w-full rounded-2xl px-6 py-4 text-center text-base font-black";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-card-border bg-card p-8 text-center shadow-sm"
      >
        {children}
      </motion.div>
    </div>
  );
}


/**
 * Where this visitor's platform gets the app, or nothing at all.
 *
 * Apple on iOS, Play on Android, never both, matching add-to-home-screen's
 * rule. A desktop visitor has no store to point at and simply does not see
 * this: the web app is the right answer there, and it is already one button
 * away above.
 */
function StoreBadge({ placement }: { placement: string }) {
  const platform = detectShortcutPlatform();
  if (platform === "ios") {
    return (
      <div className="mt-6 flex justify-center" data-testid={`${placement}-ios`}>
        <AppStoreBadge placement={placement} />
      </div>
    );
  }
  if (platform === "android") {
    return (
      <div className="mt-6 flex justify-center" data-testid={`${placement}-android`}>
        <AppStoreBadge store="play" placement={placement} />
      </div>
    );
  }
  return null;
}

export default function Join() {
  const params = useParams<{ code?: string }>();
  const code = normalizeReferralCode(params.code ?? "");
  const { status, message, attempt } = useReferralRedemption();

  // Stored exactly once per code. Re-running this on later renders would put a
  // refused code straight back into storage after the redeemer had cleared it,
  // and the visitor would carry a dead code into their next session. Waking a
  // freshly signed-in visitor is not this effect's job either: the redeemer's
  // own effect re-fires when Clerk reports a session.
  const attemptRef = useRef(attempt);
  attemptRef.current = attempt;
  const storedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!code || storedRef.current === code) return;
    storedRef.current = code;
    rememberReferralCode(code);
    // A signed-in visitor can redeem right now; for a signed-out one this is a
    // no-op until Clerk reports a session.
    attemptRef.current();
  }, [code]);

  return (
    <>
      <Show when="signed-out">
        <Shell>
          <div className="mx-auto mb-2 h-24 w-24">
            <Mascot pose="wave" fill idle="none" />
          </div>
          <h1
            data-testid="join-invite-heading"
            className="text-2xl font-black text-foreground"
          >
            Your friend saved you a seat!
          </h1>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            Bolo! helps you find your way back to your family's language, one
            spoken phrase at a time. Create your account and finish your first
            practice, and you and your friend each get {REFERRAL_REWARD_CHAI}{" "}
            Chai.
          </p>
          {code && (
            <p className="mt-4 rounded-xl bg-primary/5 px-3 py-2.5 font-mono text-lg font-black tracking-[0.25em] text-foreground">
              {code}
            </p>
          )}
          <Link
            href={`/sign-up?redirect_url=${encodeURIComponent(
              referralLandingPath(code),
            )}`}
            data-testid="join-signup"
            className={cn(CTA, "mt-6 block bg-primary text-primary-foreground")}
          >
            Create my account
          </Link>
          <Link
            href="/sign-in"
            className="mt-3 block text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            I already have an account
          </Link>
          {/* Below both routes, not instead of them: the code is remembered in
              this browser, so creating the account here is still the shortest
              path to the Chai. The badge is for the visitor who would rather
              have the app. */}
          <StoreBadge placement="join-store-badge" />
        </Shell>
      </Show>

      <Show when="signed-in">
        <Shell>
          {status === "pending" ? (
            <div
              className="flex items-center justify-center py-8"
              role="status"
              aria-label="Applying your invite"
            >
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                <PartyPopper className="h-8 w-8" />
              </div>
              {status === "redeemed" ? (
                <>
                  <h1
                    data-testid="join-redeemed-heading"
                    className="text-2xl font-black text-foreground"
                  >
                    You're all set!
                  </h1>
                  <p className="mt-3 text-sm font-medium text-muted-foreground">
                    Finish your first practice and you and your friend each get{" "}
                    {REFERRAL_REWARD_CHAI} Chai.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-black text-foreground">
                    Welcome to Bolo!
                  </h1>
                  <p
                    data-testid="join-refusal"
                    className="mt-3 text-sm font-medium text-muted-foreground"
                  >
                    {message ??
                      "You're already signed in, so there's nothing to claim here."}
                  </p>
                </>
              )}
              <Link
                href="/app"
                data-testid="join-continue"
                className={cn(
                  CTA,
                  "mt-6 block bg-primary text-primary-foreground",
                )}
              >
                Start learning
              </Link>
              <StoreBadge placement="join-redeemed-store-badge" />
            </>
          )}
        </Shell>
      </Show>
    </>
  );
}