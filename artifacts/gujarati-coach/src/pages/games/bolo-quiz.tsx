import { Award } from "lucide-react";
import { Redirect } from "wouter";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GameComingSoon } from "./_coming-soon";
import { useEntitlements } from "@/lib/entitlements";

export default function BoloQuizPage() {
  const { isPlus, isLoading } = useEntitlements();

  if (!isLoading && !isPlus) {
    return <Redirect to="/upgrade" />;
  }

  return (
    <GameComingSoon
      title="Bolo Quiz"
      description="A fresh daily quiz to test everything you have learned."
      Icon={Award}
      backHref="/games"
    >
      <BottomNav />
    </GameComingSoon>
  );
}
