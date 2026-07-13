import { Link, useLocation } from "wouter";
import { Home, Trophy, Users } from "lucide-react";
import { useListIncomingFriendRequests } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const [location] = useLocation();

  // Shares the react-query cache with the Friends page, so accepting or
  // declining a request there invalidates this and the badge updates live.
  const { data: incoming } = useListIncomingFriendRequests();
  const pendingCount = incoming?.length ?? 0;

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
          href="/friends" 
          className={cn(
            "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors button-spring",
            location === "/friends" ? "text-accent" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <div className="relative">
            <Users className="w-6 h-6" strokeWidth={location === "/friends" ? 2.5 : 2} />
            {pendingCount > 0 && (
              <span
                aria-label={`${pendingCount} pending friend ${pendingCount === 1 ? "request" : "requests"}`}
                className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black leading-none text-primary-foreground shadow-sm ring-2 ring-card"
              >
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold tracking-wide">Friends</span>
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
