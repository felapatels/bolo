import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { BottomNav } from "@/components/layout/bottom-nav";
import { DesktopNav } from "@/components/layout/desktop-nav";
import { PageTransition } from "@/lib/motion";

/**
 * The frame around the authenticated app.
 *
 * - On phones it's a pass-through: pages render as before and keep their own
 *   mobile bottom nav. Only the branded background surface is added.
 * - At the `lg` breakpoint the persistent {@link DesktopNav} sidebar appears and
 *   content is inset to make room for it, so pages fill the full desktop width
 *   instead of a phone-width column.
 *
 * Page bodies stay responsible for their own internal layout; this component
 * only provides the surrounding shell and background. Because React keeps this
 * shell mounted while only the page component swaps, the content is wrapped in
 * a {@link PageTransition} keyed by location so each navigation gently fades
 * and slides the new page in instead of snapping.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="app-surface min-h-[100dvh] bg-background">
      <DesktopNav />
      <div className="lg:pl-64">
        <PageTransition key={location}>{children}</PageTransition>
      </div>
      {/* Mobile bottom nav — mounted ONCE here, deliberately OUTSIDE the
          transform-animated PageTransition subtree. Any animated ancestor
          (framer transform mid-transition, or a CSS animation that fills
          forwards) becomes a containing block and turns the nav's
          `position: fixed` into container-relative, which made it scroll with
          page content. Pages under this shell must NOT mount their own
          BottomNav, and need enough bottom padding (~pb-28) so the last
          element clears it. */}
      <BottomNav />
    </div>
  );
}
