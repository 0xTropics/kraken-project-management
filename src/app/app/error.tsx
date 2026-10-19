"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      description={
        process.env.NODE_ENV === "development"
          ? error.message
          : "This page could not be loaded. Trying again usually fixes it."
      }
      action={
        <Button variant="secondary" size="md" onClick={reset}>
          <RotateCw />
          Try again
        </Button>
      }
    />
  );
}
