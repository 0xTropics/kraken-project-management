import { describe, expect, it } from "vitest";
import { clientRequestStatus } from "@/lib/requests/status";

describe("clientRequestStatus", () => {
  it.each([
    ["submitted", null, "submitted"],
    ["declined", null, "not_planned"],
    ["accepted", "backlog", "accepted"],
    ["accepted", "planned", "planned"],
    ["accepted", "in_progress", "in_progress"],
    ["accepted", "done", "done"],
    ["accepted", "wont_do", "not_planned"],
    ["accepted", null, "not_planned"],
  ] as const)("%s with item %s reads as %s", (status, item, expected) => {
    expect(clientRequestStatus(status, item)).toBe(expected);
  });
});
