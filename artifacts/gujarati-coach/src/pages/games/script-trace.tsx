import { PenLine } from "lucide-react";
import { Redirect } from "wouter";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GameComingSoon } from "./_coming-soon";
import { useEntitlements } from "@/lib/entitlements";

export default function ScriptTracePage() {
  const { isPlus, isLoading } = useEntitlements();

  if (!isLoading && !isPlus) {
    return <Redirect to="/upgrade" />;
  }

  return (
    <GameComingSoon
      title="Script Trace"
      description="Trace native-script characters stroke by stroke."
      Icon={PenLine}
      backHref="/games"
    >
      <BottomNav />
    </GameComingSoon>
  );
}
