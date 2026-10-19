import type { ClientRequestStatus, WorkItemStatus } from "@/lib/db/types";

/**
 * What a client sees for one of their requests. Derived from the request and
 * its linked work item every time it is read, never stored, so moving the item
 * on the board moves the request in the portal for free.
 */
export type ClientFacingStatus =
  | "submitted"
  | "accepted"
  | "planned"
  | "in_progress"
  | "done"
  | "not_planned";

export function clientRequestStatus(
  status: ClientRequestStatus,
  itemStatus: WorkItemStatus | null,
): ClientFacingStatus {
  if (status === "submitted") return "submitted";
  if (status === "declined") return "not_planned";
  switch (itemStatus) {
    case null:
    case "wont_do":
      return "not_planned";
    case "backlog":
      return "accepted";
    case "planned":
      return "planned";
    case "in_progress":
      return "in_progress";
    case "done":
      return "done";
  }
}

export const CLIENT_FACING_META: Record<
  ClientFacingStatus,
  { label: string; tone: "neutral" | "info" | "warning" | "success" }
> = {
  submitted: { label: "Submitted", tone: "neutral" },
  accepted: { label: "Accepted", tone: "info" },
  planned: { label: "Planned", tone: "info" },
  in_progress: { label: "In progress", tone: "warning" },
  done: { label: "Done", tone: "success" },
  not_planned: { label: "Not planned", tone: "neutral" },
};
