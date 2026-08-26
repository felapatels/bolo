/**
 * /nest — the operations cockpit, inside the product.
 *
 * THREE STATES AND ONLY THREE. Checking, the cockpit, or the app's own
 * not-found page. There is no "you are not allowed" state and there must never
 * be one: a refusal that names the thing it is refusing tells a stranger
 * exactly what to keep probing. Everything about this route behaves as though
 * the page simply does not exist.
 *
 * WHY IT ASKS BEFORE IT RENDERS. The iframe's source is itself gated, so an
 * unauthorised viewer would get a 404 INSIDE the frame: a broken box on an
 * otherwise working page, which reads as a bug rather than as an answer. The
 * cheap redirect endpoint is the gate check, chosen because it touches no
 * database at all, and the frame only mounts once it has said yes.
 *
 * WHY AN IFRAME AT ALL. The cockpit is 157KB of hand-written HTML, CSS and
 * vanilla JS in one document. It shares nothing with this app's Tailwind setup
 * and its selectors are generic enough (.card, .tile, .note, .row) that
 * injecting it would collide in both directions. The frame also keeps its bugs
 * inside itself rather than loose in a bundle customers download, which is the
 * exact risk the owner accepted knowingly when they chose to put an internal
 * tool on the customer-facing domain.
 *
 * A REAL PORT INTO REACT was the third option and was rejected as weeks of work
 * that converts something deliverable tonight into a project.
 */
import { useEffect } from "react";
import {
  useGetNestRedirect,
  getGetNestRedirectQueryKey,
} from "@workspace/api-client-react";
import NotFound from "@/pages/not-found";

export default function NestPage() {
  // The gate check. `retry: false` matters: a 404 here is an ANSWER, and
  // retrying it three times would delay the not-found page for everybody who
  // is not the owner while telling them nothing new.
  const { isLoading, isError } = useGetNestRedirect({
    query: { retry: false, queryKey: getGetNestRedirectQueryKey() },
  });

  // The tab name is the owner's, not the product's. It stops a screen-share or
  // a browser history from advertising the tool by title.
  useEffect(() => {
    const previous = document.title;
    document.title = "The Nest";
    return () => {
      document.title = previous;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Opening the nest…</p>
      </div>
    );
  }

  // ANY failure is a not-found, not just a 404. A 500 or a dropped connection
  // must not fall through to rendering the frame, because the frame is the one
  // thing that must never appear for somebody the server did not clear.
  if (isError) return <NotFound />;

  return (
    <div className="min-h-screen bg-background">
      {/*
        SANDBOXED, and same-origin is deliberate rather than an oversight:
        without allow-same-origin the document cannot send its own cookies, and
        cookies are exactly how the gated /api/nest/page and the two endpoints
        it calls authenticate. Scripts are allowed because the cockpit IS a
        script.

        allow-popups ADDED 2026-08-26, and it was a real bug rather than a
        tightening worth keeping. The cockpit is 49 target="_blank" links to
        App Store Connect, the Play Console, GitHub, Neon, PostHog and Sentry,
        and every single one was SILENTLY INERT: a sandbox without allow-popups
        drops a _blank navigation on the floor with no error, no console line
        and no visible failure, so the page looked fine and nothing it offered
        actually worked. Reported by the owner as "none of the links work".

        allow-popups-to-escape-sandbox goes with it so the tab that opens is a
        normal tab. Without it every opened page INHERITS this sandbox, which
        would give the Play Console no forms and no popups of its own, and it
        would break in ways nobody would connect back to here.

        What is still withheld: no forms, no downloads, no top-level
        navigation, so a bug in there still cannot walk the learner's own tab
        somewhere else. That was always the property worth having; blocking the
        links never was.
      */}
      <iframe
        src="/api/nest/page"
        title="The Nest"
        className="h-screen w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        data-testid="nest-frame"
      />
    </div>
  );
}
