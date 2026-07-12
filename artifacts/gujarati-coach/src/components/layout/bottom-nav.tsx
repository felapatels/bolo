import { Link, useLocation } from "wouter";
import { Home, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const [location] = useLocation();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border pb-safe">
      <div className="flex h-16 items-center justify-around px-6 max-w-md mx-auto">
        <Link 
          href="/app" 
          className={cn(
            "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors button-spring",
            location === "/app" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Home className="w-6 h-6" strokeWidth={location === "/app" ? 2.5 : 2} />
          <span className="text-[10px] font-bold tracking-wide">Home</span>
        </Link>
        <Link 
          href="/progress" 
          className={cn(
            "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors button-spring",
            location === "/progress" ? "text-secondary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Trophy className="w-6 h-6" strokeWidth={location === "/progress" ? 2.5 : 2} />
          <span className="text-[10px] font-bold tracking-wide">Progress</span>
        </Link>
      </div>
    </div>
  );
}
