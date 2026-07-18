import { Zap } from "lucide-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GameComingSoon } from "./_coming-soon";

export default function SpeedRoundPage() {
  return (
    <GameComingSoon
      title="Speed Round"
      description="Race against the clock to answer as many as you can."
      Icon={Zap}
      backHref="/games"
    >
      <BottomNav />
    </GameComingSoon>
  );
}
