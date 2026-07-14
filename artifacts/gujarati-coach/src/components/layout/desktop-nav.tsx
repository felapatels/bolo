import { Link, useLocation } from "wouter";
import { Home, Trophy, Users, Crown, LogOut, Settings, type LucideIcon } from "lucide-react";
import { useListIncomingFriendRequests } from "@workspace/api-client-react";
import { useUser, useClerk } from "@clerk/react";
import { cn } from "@/lib/utils";
import { useLanguage, nativeTextProps } from "@/lib/language-context";
import { useEntitlements } from "@/lib/entitlements";
import { FloatingTag, SoundWavePulse } from "@/lib/motion";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Active-state accent, matching the mobile bottom nav's per-tab colors. */
  activeClass: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Home", icon: Home, activeClass: "text-primary" },
  { href: "/friends", label: "Friends", icon: Users, activeClass: "text-accent" },
  { href: "/progress", label: "Progress", icon: Trophy, activeClass: "text-secondary" },
];

/**
 * The persistent desktop navigation. Rendered by the app shell and only visible
 * at the `lg` breakpoint and up — phones keep the bottom nav instead. Mirrors
 * the mobile nav's destinations, active-state colors, and the live friend
 * request badge, and adds the account controls a desktop layout expects.
 */
export function DesktopNav() {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { activeLanguage } = useLanguage();
  const { isPlus, isLoading } = useEntitlements();

  // Shares the react-query cache with the Friends page and the mobile bottom
  // nav, so accepting/declining a request updates every badge live.
  const { data: incoming } = useListIncomingFriendRequests();
  const pendingCount = incoming?.length ?? 0;

  const nativeProps = nativeTextProps(activeLanguage);
  const upgradeActive = location === "/upgrade";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-card-border bg-card/80 backdrop-blur-md lg:flex">
      {/* Brand */}
      <Link
        href="/app"
        className="flex items-center gap-2.5 px-6 pt-8 pb-6 button-spring"
      >
        <img
          src={`${import.meta.env.BASE_URL}logo.svg`}
          alt="Bolo!"
          className="h-9 w-9"
        />
        <span className="text-2xl font-black tracking-tight text-foreground">
          Bolo!
        </span>
        <SoundWavePulse className="ml-0.5 text-primary" size={18} bars={4} />
      </Link>

      {/* Primary destinations */}
      <nav className="flex flex-1 flex-col gap-1.5 px-4">
        {NAV_ITEMS.map((item) => {
          const active = location === item.href;
          const Icon = item.icon;
          const showBadge = item.href === "/friends" && pendingCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-base font-bold transition-colors button-spring",
                active
                  ? cn("bg-muted", item.activeClass)
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <span className="relative">
                <Icon
                  className="h-6 w-6"
                  strokeWidth={active ? 2.5 : 2}
                />
                {showBadge && (
                  <span
                    aria-label={`${pendingCount} pending friend ${pendingCount === 1 ? "request" : "requests"}`}
                    className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black leading-none text-primary-foreground shadow-sm ring-2 ring-card"
                  >
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          );
        })}

        {/* Upgrade — only for learners who aren't already on the top tier. */}
        {!isLoading && !isPlus && (
          <Link
            href="/upgrade"
            className={cn(
              "mt-1 flex items-center gap-3 rounded-2xl px-4 py-3 text-base font-black transition-all button-spring",
              upgradeActive
                ? "bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/20"
                : "bg-gradient-to-r from-primary/10 to-secondary/10 text-primary hover:from-primary/15 hover:to-secondary/15",
            )}
            aria-current={upgradeActive ? "page" : undefined}
          >
            <Crown className="h-6 w-6" fill="currentColor" />
            Go Plus
          </Link>
        )}
      </nav>

      {/* Active language tag — a bit of launch-video life in the shell. */}
      {activeLanguage && (
        <div className="px-6 pb-4">
          <FloatingTag
            className="bg-secondary/10 text-secondary"
            style={nativeProps.style}
            dir={nativeProps.dir}
          >
            {activeLanguage.nativeName}
          </FloatingTag>
        </div>
      )}

      {/* Account — the user block links to account settings & subscription
          management; keep the separate sign-out button beside it. */}
      <div className="flex items-center gap-2 border-t border-card-border px-4 py-4">
        <Link
          href="/account"
          title="Account & settings"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors button-spring",
            location.startsWith("/account")
              ? "bg-muted"
              : "hover:bg-muted/60",
          )}
          aria-current={location.startsWith("/account") ? "page" : undefined}
        >
          {user?.imageUrl ? (
            <img
              src={user.imageUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-card-border"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-black text-primary">
              {(user?.firstName ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-foreground">
              {user?.firstName ?? "Your account"}
            </p>
            <p className="truncate text-xs font-medium text-muted-foreground">
              {isPlus ? "Bolo! Plus · Settings" : "Free plan · Settings"}
            </p>
          </div>
          <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
        <button
          onClick={() => signOut({ redirectUrl: basePath || "/" })}
          title="Sign out"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground button-spring"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
