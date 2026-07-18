import { Link2 } from "lucide-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GameComingSoon } from "./_coming-soon";

export default function WordMatchPage() {
  return (
    <GameComingSoon
      title="Word Match"
      description="Match words to their translations before time runs out."
      Icon={Link2}
      backHref="/games"
    >
      <BottomNav />
    </GameComingSoon>
  );
}
