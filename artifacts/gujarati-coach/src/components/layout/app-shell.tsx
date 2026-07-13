import type { ReactNode } from "react";
import { DesktopNav } from "@/components/layout/desktop-nav";

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
 * only provides the surrounding shell and background.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-surface min-h-[100dvh] bg-background">
      <DesktopNav />
      <div className="lg:pl-64">{children}</div>
    </div>
  );
}
