import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getGetReferralQueryKey,
  useRedeemReferral,
} from "@workspace/api-client-react";
import {
  claimPendingReferralCode,
  clearPendingReferralCode,
} from "@/lib/referral-code";

// Referral R2, web slice. The SINGLE owner of POST /referral/redeem on web.
//
// Why a provider rather than a call inside the landing page: two surfaces need
// the redemption to happen (the landing page, for someone who is already
// signed in or who came straight back after signing up, and the rest of the
// app, for someone whose signup dropped them on home instead). If both called
// redeem, the loser of the race would read its own attribution back as
// "You have already used a referral code." and show a refusal for a redemption
// that actually succeeded. One owner, one call, one outcome everyone reads.

export type ReferralRedemptionStatus =
  | "idle"
  | "pending"
  | "redeemed"
  | "refused";

export type ReferralRedemption = {
  status: ReferralRedemptionStatus;
  /** The server's own refusal wording; null unless status is "refused". */
  message: string | null;
  /** Re-checks storage for a pending code. Safe to call repeatedly. */
  attempt: () => void;
};

const ReferralRedemptionContext = createContext<ReferralRedemption>({
  status: "idle",
  message: null,
  attempt: () => {},
});

export function useReferralRedemption(): ReferralRedemption {
  return useContext(ReferralRedemptionContext);
}

// R1 serves its ruled copy in the error body, so the surface echoes the server
// instead of keeping a second copy of those strings that could drift.
const FALLBACK_REFUSAL = "That code didn't work, but you can keep going.";

function refusalMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: unknown } | undefined;
    if (data && typeof data.error === "string" && data.error) return data.error;
  }
  return FALLBACK_REFUSAL;
}

export function ReferralRedemptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded, isSignedIn } = useUser();
  const queryClient = useQueryClient();
  const redeem = useRedeemReferral();
  const [status, setStatus] = useState<ReferralRedemptionStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  // The mutation object is a new identity every render; holding it in a ref
  // keeps `attempt` stable so the effect below does not re-fire on rerenders.
  const redeemRef = useRef(redeem);
  redeemRef.current = redeem;
  // Same reason for the query client: `attempt` must only change identity when
  // the auth state does. Callers re-run effects off it, and a per-render
  // identity would re-fire those effects on every state change this provider
  // makes (including the one it makes on refusal).
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const startedRef = useRef(false);

  const attempt = useCallback(() => {
    if (startedRef.current) return;
    if (!isLoaded || !isSignedIn) return;
    // startedRef makes this single-flight within one mounted provider; the
    // claim makes it single-flight across a reload or a second tab.
    const claim = claimPendingReferralCode();
    if (!claim) return;
    const { code, firstAttempt } = claim;

    startedRef.current = true;
    setStatus("pending");
    void (async () => {
      try {
        await redeemRef.current.mutateAsync({ data: { code } });
        // Attribution is recorded. Nothing is granted yet: both sides are paid
        // at activation, on this learner's first attempt.
        clearPendingReferralCode();
        setMessage(null);
        setStatus("redeemed");
        await queryClientRef.current.invalidateQueries({
          queryKey: getGetReferralQueryKey(),
        });
      } catch (err) {
        // Every refusal is terminal for this code. A repeat redemption, a
        // self-referral and an unknown code all stay refused however many
        // times they are retried, so the slot is cleared rather than left to
        // re-fire on the next page load.
        clearPendingReferralCode();
        if (!firstAttempt && err instanceof ApiError && err.status === 409) {
          // This browser already sent a redeem for this exact code, so the
          // 409 is our own earlier attempt answering back. Attribution landed;
          // refusing here would tell a first-time referee they had already
          // used a code, for the redemption that just worked.
          setMessage(null);
          setStatus("redeemed");
          return;
        }
        setMessage(refusalMessage(err));
        setStatus("refused");
      }
    })();
  }, [isLoaded, isSignedIn]);

  // Covers the learner who signed up and landed somewhere other than the
  // referral landing page.
  useEffect(() => {
    attempt();
  }, [attempt]);

  return (
    <ReferralRedemptionContext.Provider value={{ status, message, attempt }}>
      {children}
    </ReferralRedemptionContext.Provider>
  );
}
