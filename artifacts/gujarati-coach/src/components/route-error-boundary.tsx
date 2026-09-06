/**
 * THE THIRD NET UNDER A STALE BUILD, and the only one that catches a throw
 * during render.
 *
 * `React.lazy` reports a failed chunk by throwing where the route renders, and
 * Suspense catches promises, not throws, so before this existed one dead chunk
 * unmounted the whole app: the white page the owner hit on 2026-09-06. See
 * lib/staleBuild.ts for the trace, including why the missing chunk comes back
 * as `200 text/html` rather than a 404.
 *
 * IT PREFERS A RELOAD TO A MESSAGE. If the error reads like a chunk that is no
 * longer on the server, the tab reloads itself once and the learner sees a
 * blink instead of an apology. The panel below is for the two cases a reload
 * cannot fix: an error that is not about a chunk at all, and a chunk error
 * that has already had its one reload, which is the loop guard doing its job.
 *
 * IT IS NOT A GENERAL ERROR SCREEN. It sits directly under the router so a
 * broken page never takes the app with it, and it says the one true thing it
 * knows, which is that this screen did not load. Sentry gets the detail.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { looksLikeStaleChunk, reloadForStaleBuild } from "@/lib/staleBuild";

interface Props {
  children: ReactNode;
}
interface State {
  failed: boolean;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The reload is attempted here rather than in the render so it happens
    // once per failure, not once per paint. It returns false when the cooldown
    // refuses it, and then the panel below is what the learner gets.
    if (looksLikeStaleChunk(error) && reloadForStaleBuild()) return;
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-base font-bold text-foreground">
          This screen did not load.
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Reloading usually fixes it. Nothing you have done has been lost.
        </p>
        <button
          type="button"
          data-testid="route-error-reload"
          onClick={() => window.location.reload()}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground"
        >
          Reload
        </button>
      </div>
    );
  }
}
