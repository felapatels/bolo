// Adding empty TooltipProvider since we import it in App.tsx
import React from 'react';

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
