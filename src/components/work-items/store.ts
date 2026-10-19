"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api, run } from "@/lib/client-api";
import type { WorkItemRow } from "@/lib/data/work-items";
import type { WorkItemStatus } from "@/lib/db/types";

export type Patch = Partial<
  Pick<
    WorkItemRow,
    "title" | "type" | "status" | "priority" | "milestone_id" | "client_visible" | "description"
  >
>;

/**
 * Optimistic local state over the server's list.
 *
 * Every mutation applies immediately, then reconciles. On failure the previous
 * snapshot is restored and the error is surfaced — an item that appears to move
 * and silently snaps back later is worse than one that never moved.
 */
export function useWorkItems(projectId: string, initial: WorkItemRow[]) {
  const router = useRouter();

  /**
   * Pending local edits, keyed by item id, each stamped with when it was
   * applied. Items are *derived* from the server list plus these overrides
   * rather than copied into state, so there is no snapshot to fall out of date.
   *
   * An override retires itself: once the server row is newer than the moment
   * the override was applied, the server has the change and the override is
   * dropped during render. That keeps a stale local edit from permanently
   * masking a change made elsewhere -- in another tab, for instance.
   */
  const [overrides, setOverrides] = React.useState<
    Map<string, { patch: Patch; appliedAt: number }>
  >(new Map());
  const [removed, setRemoved] = React.useState<Set<string>>(new Set());

  const items = React.useMemo(() => {
    return initial
      .filter((item) => !removed.has(item.id))
      .map((item) => {
        const override = overrides.get(item.id);
        if (!override) return item;
        if (Date.parse(item.updated_at) > override.appliedAt) return item;
        return { ...item, ...override.patch };
      });
  }, [initial, overrides, removed]);

  const applyOverride = React.useCallback((id: string, patch: Patch) => {
    setOverrides((current) => {
      const next = new Map(current);
      const existing = next.get(id);
      next.set(id, {
        patch: { ...(existing?.patch ?? {}), ...patch },
        appliedAt: Date.now(),
      });
      return next;
    });
  }, []);

  const dropOverride = React.useCallback((id: string) => {
    setOverrides((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  const mutate = React.useCallback(
    async (id: string, patch: Patch) => {
      applyOverride(id, patch);
      const result = await run(
        api<WorkItemRow>(`/api/internal/work-items/${id}`, {
          method: "PATCH",
          body: { project_id: projectId, ...patch },
        }),
        { error: "Could not save that change" },
      );
      if (result === null) dropOverride(id);
      else router.refresh();
      return result;
    },
    [applyOverride, dropOverride, projectId, router],
  );

  const move = React.useCallback(
    async (id: string, status: WorkItemStatus, orderedIds: string[]) => {
      applyOverride(id, { status });
      const result = await run(
        api("/api/internal/work-items/move", {
          method: "POST",
          body: { project_id: projectId, id, status, ordered_ids: orderedIds },
        }),
        { error: "Could not move that item" },
      );
      if (result === null) dropOverride(id);
      else router.refresh();
    },
    [applyOverride, dropOverride, projectId, router],
  );

  // The route has always validated all seven create fields; only this type was
  // narrow, which is why the quick-add's two were the only ones reachable.
  const create = React.useCallback(
    async (input: {
      title: string;
      type: WorkItemRow["type"];
      status?: WorkItemStatus;
      priority?: WorkItemRow["priority"];
      description?: string;
      milestone_id?: string | null;
      client_visible?: boolean;
    }) => {
      const result = await run(
        api<WorkItemRow>("/api/internal/work-items", {
          method: "POST",
          body: { project_id: projectId, ...input },
        }),
        { error: "Could not create that item" },
      );
      // A new row has no optimistic slot to fill, so the refresh is what shows
      // it. The quick-add clears itself on success either way.
      if (result) router.refresh();
      return result;
    },
    [projectId, router],
  );

  const remove = React.useCallback(
    async (id: string) => {
      setRemoved((current) => new Set(current).add(id));
      const result = await run(
        api(`/api/internal/work-items/${id}?project_id=${projectId}`, { method: "DELETE" }),
        { success: "Deleted.", error: "Could not delete that item" },
      );
      if (result === null) {
        setRemoved((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      } else {
        router.refresh();
      }
    },
    [projectId, router],
  );

  const bulk = React.useCallback(
    async (ids: string[], action: Record<string, unknown>, successMessage: string) => {
      const result = await run(
        api("/api/internal/work-items/bulk", {
          method: "POST",
          body: { project_id: projectId, ids, action },
        }),
        { success: successMessage, error: "Could not apply that change" },
      );
      if (result !== null) router.refresh();
      return result;
    },
    [projectId, router],
  );

  return { items, mutate, move, create, remove, bulk };
}
