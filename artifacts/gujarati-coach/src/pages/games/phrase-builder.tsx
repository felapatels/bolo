import { Layers } from "lucide-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GameComingSoon } from "./_coming-soon";

export default function PhraseBuilderPage() {
  return (
    <GameComingSoon
      title="Phrase Builder"
      description="Arrange word tiles into correct phrases."
      Icon={Layers}
      backHref="/games"
    >
      <BottomNav />
    </GameComingSoon>
  );
}
