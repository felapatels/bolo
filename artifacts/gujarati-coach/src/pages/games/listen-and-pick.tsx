import { Headphones } from "lucide-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GameComingSoon } from "./_coming-soon";

export default function ListenAndPickPage() {
  return (
    <GameComingSoon
      title="Listen & Pick"
      description="Hear a word or phrase and choose the right translation."
      Icon={Headphones}
      backHref="/games"
    >
      <BottomNav />
    </GameComingSoon>
  );
}
