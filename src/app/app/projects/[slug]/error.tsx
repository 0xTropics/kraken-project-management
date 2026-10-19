"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";

export default function ProjectError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-[80rem] px-4 py-6 md:px-6">
      <ErrorState
        title="This tab could not load"
        description={
          <>
            The project itself is fine — only this view failed to render.
            {error.digest && (
              <span className="mt-1 block font-mono text-2xs opacity-70">{error.digest}</span>
            )}
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <Button variant="primary" size="md" onClick={() => retry()}>
              Try again
            </Button>
            <Button asChild variant="secondary" size="md">
              <Link href="/app/projects">All projects</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
