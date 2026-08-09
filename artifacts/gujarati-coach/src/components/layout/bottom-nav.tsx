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
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border pb-safe lg:hidden">
      {/* Daily XP counter — sits above the nav icons as a thin strip */}
      <div className="max-w-md mx-auto px-5 pt-1.5 pb-0">
        <XpCounter variant="chrome" />
      </div>
      <div className="flex h-14 items-center justify-around px-2 max-w-md mx-auto">
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

        {/* Centre elevated Bolo parrot button — the hero action. Sized and
            offset so the circle's BOTTOM edge stays where it always was
            (row top + 36px) while all the extra size protrudes upward, past
            the XP strip and above the nav's top border. bg-card stays on in
            the active state (tint is a gradient overlay) so the XP bar the
            circle overlaps never shows through. */}
        <div className="relative flex flex-col items-center justify-center w-full h-full">
          <Link
            href="/chat"
            className="absolute -top-11 flex flex-col items-center gap-1 button-spring"
            aria-label="Chat with Bolo"
          >
            <div
              className={cn(
                "flex h-20 w-20 items-center justify-center rounded-full border-4 bg-card shadow-lg transition-all",
                chatActive
                  ? "border-primary bg-gradient-to-b from-primary/15 to-primary/5 shadow-primary/30"
                  : "border-border shadow-black/10 hover:border-primary/50 hover:shadow-primary/20",
              )}
            >
              {/* Rigged Bolo in calm ambient mode: blinks and breathes, but no
                  big idle stunts — he's an always-on-screen nav element. */}
              <Mascot pose="wave" size={56} ambient="calm" />
            </div>
            <span
              className={cn(
                "text-[10px] font-bold tracking-wide leading-none mt-1",
                chatActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              Bolo
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

        {/* Globe language switcher — smaller/muted so it doesn't compete with the four primary tabs */}
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
