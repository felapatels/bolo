import { cn } from "@/lib/utils";

// Home loading skeleton (task 902): ticket-and-card-shaped placeholder blocks
// matching home's real layout, shown while the categories query is in flight.
// Replaces the old full-screen blocking spinner. Pure CSS: animate-pulse is
// collapsed to a static frame by the global prefers-reduced-motion rule in
// index.css, which is exactly the right reduced-motion treatment here.

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-muted", className)} />;
}

/** A lighter inner line on top of a muted surface (the ticket body). */
function Line({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-full bg-background/70", className)} />
  );
}

export function HomeSkeleton() {
  return (
    <div
      data-testid="home-skeleton"
      role="status"
      aria-label="Loading your home"
      className="min-h-[100dvh] pb-nav lg:pb-12"
    >
      <header className="mx-auto w-full max-w-6xl px-6 pt-6 pb-2 lg:px-10 lg:pt-6">
        {/* Greeting row: mascot circle + two text lines. */}
        <div className="flex items-center gap-3">
          <Block className="h-[76px] w-[76px] shrink-0 rounded-full lg:h-[92px] lg:w-[92px]" />
          <div className="min-w-0 space-y-2">
            <Block className="h-8 w-44 rounded-xl lg:w-64" />
            <Block className="h-5 w-32 rounded-xl lg:w-52" />
          </div>
        </div>

        {/* Language picker + chat pills. */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Block className="h-12 w-40" />
          <Block className="h-12 w-44" />
        </div>

        {/* Stats banner. */}
        <Block className="mt-6 h-[118px] w-full rounded-3xl lg:h-[140px]" />
      </header>

      <main className="mx-auto mt-8 w-full max-w-6xl px-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="min-w-0 space-y-8 lg:col-span-2">
            {/* Boarding-pass ticket shape: body + dashed perforation + stub. */}
            <div
              className="flex items-stretch overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm"
              aria-hidden
            >
              <div className="min-w-0 flex-1 animate-pulse bg-muted p-5 lg:p-6">
                <Line className="h-3 w-28" />
                <Line className="mt-2.5 h-6 w-2/3" />
                <Line className="mt-2.5 h-4 w-1/2" />
                <div className="mt-5 border-t-2 border-dashed border-background" />
                <Line className="mt-4 h-4 w-40" />
              </div>
              <div className="w-px self-stretch border-l-2 border-dashed border-background" />
              <div className="w-16 shrink-0 animate-pulse bg-muted" />
            </div>

            {/* Topic grid. */}
            <section>
              <Block className="mb-4 h-6 w-44 rounded-xl" />
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Block key={i} className="h-40 rounded-3xl" />
                ))}
              </div>
            </section>
          </div>

          {/* Right rail cards. */}
          <aside className="min-w-0 space-y-6 lg:col-span-1">
            <Block className="h-24 rounded-3xl" />
            <Block className="h-24 rounded-3xl" />
          </aside>
        </div>
      </main>
    </div>
  );
}
