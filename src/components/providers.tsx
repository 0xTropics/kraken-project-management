"use client";

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Client context that every surface needs. Kept in one place so a new page
 * cannot forget it — a missing TooltipProvider is a render-time crash, not a
 * degraded experience.
 *
 * It also stamps `data-hydrated` on <html> once React has taken over. Nothing
 * in the product depends on it; the screenshot and audit harnesses wait for it
 * so they never interact with a form that would still fall back to a native
 * submit.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
  }, []);

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={300}>
      {children}
    </TooltipProvider>
  );
}
