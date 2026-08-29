// THE FIRST-RUN GATE, build 19, wrapping the signed-in home route. Sends an
// account that has not finished the walkthrough to its next step, once, and
// otherwise renders home untouched. Mobile twin: FirstRunBootstrapper in
// bolo-mobile/app/(app)/_layout.tsx; the rules are in lib/walkthrough.ts.
//
// FAILS OPEN. While the account is loading, or if the fetch errors, home
// renders as it always has; the redirect fires only on a loaded account that
// says the walkthrough is still owed. A first-run account therefore sees home
// for the beat before its account lands, which the old B1 gate did too.
import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useGetAccount } from "@workspace/api-client-react";
import { firstRunPath, hasDismissedWalkthrough } from "@/lib/walkthrough";

export function FirstRunGate({ children }: { children: ReactNode }) {
  const account = useGetAccount();
  const learning = account.data?.preferences?.learning;
  const to = learning && !hasDismissedWalkthrough() ? firstRunPath(learning) : null;
  if (to) return <Redirect to={to} />;
  return <>{children}</>;
}
