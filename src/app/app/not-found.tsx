import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Compass } from "lucide-react";

export default function AppNotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Not found"
      description="That project, client, or record does not exist — or it has been archived."
      action={
        <Button asChild variant="secondary" size="md">
          <Link href="/app">Back to the dashboard</Link>
        </Button>
      }
    />
  );
}
