import { Link, useLocation } from "wouter";
import { Home, Trophy, Gamepad2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { LanguagePicker } from "@/components/language-picker";
import { useLanguage } from "@/lib/language-context";
import { useTour } from "@/lib/tour-context";

export function BottomNav() {
  const [location] = useLocation();
  const { activeLang } = useLanguage();
  const { isOpen, currentNavHighlight } = useTour();

  const chatActive = location === "/chat";

  // Returns true when the given nav key should show a pulsing tour highlight.
  function isTourHighlighted(key: "home" | "chat" | "games" | "progress") {
    return isOpen && currentNavHighlight === key;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border pb-safe lg:hidden">
      <div className="flex h-16 items-center justify-around px-2 max-w-md mx-auto">
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
              isTourHighlighted("home") && "animate-pulse ring-2 ring-primary/60",
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
              isTourHighlighted("games") && "animate-pulse ring-2 ring-primary/60",
            )}
          >
            <Gamepad2 className="w-6 h-6" strokeWidth={location.startsWith("/games") ? 2.5 : 2} />
          </span>
          <span className="text-[10px] font-bold tracking-wide">Games</span>
        </Link>

        {/* Centre elevated Bolo parrot button */}
        <div className="relative flex flex-col items-center justify-center w-full h-full">
          <Link
            href="/chat"
            className="absolute -top-5 flex flex-col items-center gap-1 button-spring"
            aria-label="Chat with Bolo"
          >
            <div
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full border-4 shadow-lg transition-all",
                chatActive
                  ? "border-primary bg-primary/10 shadow-primary/30"
                  : "border-border bg-card shadow-black/10 hover:border-primary/50 hover:shadow-primary/20",
                isTourHighlighted("chat") && "animate-pulse ring-2 ring-primary/60",
              )}
            >
              <img
                src={`${import.meta.env.BASE_URL}mascot/mascot-wave.png`}
                alt="Bolo parrot"
                className="h-9 w-9 object-contain"
              />
            </div>
            <span
              className={cn(
                "text-[10px] font-bold tracking-wide mt-1",
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
              isTourHighlighted("progress") && "animate-pulse ring-2 ring-primary/60",
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
                className="flex flex-col items-center gap-1 text-muted-foreground/70 hover:text-muted-foreground transition-colors button-spring"
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
