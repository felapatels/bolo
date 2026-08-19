import { Link, useLocation } from "wouter";
import { Home, Trophy, Gamepad2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { LanguagePicker } from "@/components/language-picker";
import { useLanguage } from "@/lib/language-context";
import { XpCounter } from "@/components/XpCounter";
import { Mascot } from "@/components/mascot";

export function BottomNav() {
  const [location] = useLocation();
  const { activeLang } = useLanguage();
  const chatActive = location === "/chat";

  return (
    // Floating pill, mirrors the mobile app's tab bar: inset 14px from both
    // edges, 32px radius, opaque card background, 1px border all round, soft
    // drop shadow, and lifted off the bottom edge by the safe-area inset with
    // mobile's 14px minimum gap as the floor (see .nav-float in index.css).
    <div className="fixed left-0 right-0 z-40 nav-float bg-card border border-border lg:hidden">
      {/* Daily XP counter, sits above the nav icons as a thin strip */}
      <div className="max-w-md mx-auto px-5 pt-1.5 pb-0">
        <XpCounter variant="chrome" />
      </div>
      {/* Icon row, mobile's bar geometry exactly: 74px tall including its
          6px top / 8px bottom padding, so the 60px slot inside matches. */}
      <div className="flex h-[74px] items-center justify-around px-2 pt-1.5 pb-2 max-w-md mx-auto">
        <Link 
          href="/app" 
          className={cn(
            "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors button-spring",
            location === "/app" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span
            className={cn(
              "flex flex-col items-center gap-1 rounded-full p-1 transition-all",
            )}
          >
            <Home className="w-6 h-6" strokeWidth={location === "/app" ? 2.5 : 2} />
          </span>
          <span className="text-[10px] font-bold tracking-wide">Home</span>
        </Link>
        <Link 
          href="/games" 
          className={cn(
            "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors button-spring",
            location.startsWith("/games") ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span
            className={cn(
              "flex flex-col items-center gap-1 rounded-full p-1 transition-all",
            )}
          >
            <Gamepad2 className="w-6 h-6" strokeWidth={location.startsWith("/games") ? 2.5 : 2} />
          </span>
          <span className="text-[10px] font-bold tracking-wide">Games</span>
        </Link>

        {/* Centre elevated Bolo parrot button, the hero action, mirroring the
            mobile tab bar's raised bubble: a 58px circle holding a 44px
            mascot, anchored from the BOTTOM of its slot (like mobile) so its
            lower edge sits 34px below the pill's top edge and ~24px of the
            circle breaks out above it, mobile's exact relationship to the
            bar's visible top edge. Web's extra XP strip pushes the icon row
            26px further down than mobile's, so the label is pinned to the
            shared label line instead of riding directly under the circle.
            bg-card stays on in the active state (tint is a gradient overlay)
            so the XP bar the circle overlaps never shows through. */}
        <div className="relative flex flex-col items-center justify-center w-full h-full">
          <Link
            href="/chat"
            className="relative flex h-full w-full flex-col items-center justify-end pb-1.5 button-spring"
            aria-label="Chat with Bolo"
          >
            <div
              className={cn(
                "absolute bottom-[63px] flex h-[58px] w-[58px] items-center justify-center rounded-full border-[2.5px] bg-card shadow-lg transition-all",
                chatActive
                  ? "border-primary bg-gradient-to-b from-primary/15 to-primary/5 shadow-primary/30"
                  : "border-border shadow-black/10 hover:border-primary/50 hover:shadow-primary/20",
              )}
            >
              {/* Rigged Bolo in calm ambient mode: blinks and breathes, but no
                  big idle stunts, he's an always-on-screen nav element. */}
              <Mascot pose="wave" size={44} ambient="calm" />
            </div>
            {/* Two hard lines, never wrapped: "Bolo Chat" on one line is ~56px
                of 11px bold text in a 55px slot at 320px, so it would wrap or
                clip. Stacked, each word is ~26px and the block's last line
                keeps the shared label baseline (justify-end + pb-1.5), so the
                other four labels do not move and the 74px row does not grow.
                Brand colour in both states: this is the primary destination,
                and muted-foreground left it reading as an afterthought under
                the big empty circle gap. */}
            <span className="flex flex-col items-center text-[11px] font-bold leading-[1.1] tracking-wide text-primary">
              <span className="whitespace-nowrap">Bolo</span>
              <span className="whitespace-nowrap">Chat</span>
            </span>
          </Link>
        </div>

        <Link 
          href="/progress" 
          className={cn(
            "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors button-spring",
            location === "/progress" ? "text-secondary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span
            className={cn(
              "flex flex-col items-center gap-1 rounded-full p-1 transition-all",
            )}
          >
            <Trophy className="w-6 h-6" strokeWidth={location === "/progress" ? 2.5 : 2} />
          </span>
          <span className="text-[10px] font-bold tracking-wide">Progress</span>
        </Link>

        {/* Globe language switcher, smaller/muted so it doesn't compete with the four primary tabs */}
        <div className="flex flex-col items-center justify-center w-full h-full">
          <LanguagePicker
            trigger={
              <button
                className="flex flex-col items-center gap-1 text-muted-foreground/70 dark:text-muted-foreground hover:text-muted-foreground transition-colors button-spring"
                aria-label="Change language"
              >
                <Globe className="w-5 h-5" strokeWidth={1.75} />
                <span className="text-[9px] font-bold tracking-wide uppercase">{activeLang}</span>
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}
