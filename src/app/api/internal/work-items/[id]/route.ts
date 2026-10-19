import { z } from "zod";
import { internalHandler, parseBody } from "@/lib/api/handler";
import { workItemUpdateInput } from "@/lib/api/schemas";
import { deleteWorkItem, updateWorkItem } from "@/lib/data/work-items";
import { badRequest } from "@/lib/errors";

/**
 * The project id is required alongside the item id so that every lookup is
 * scoped: an item belonging to another project is a 404 rather than a 403, and
 * the caller learns nothing about whether the id exists.
 */
const scoped = z.object({ project_id: z.string().uuid() });

export const PATCH = internalHandler<{ id: string }>(async ({ request, params }) => {
  const body = await parseBody(request, scoped.and(workItemUpdateInput));
  const { project_id: projectId, ...patch } = body;
  return updateWorkItem(projectId, params.id, patch);
});

export const DELETE = internalHandler<{ id: string }>(async ({ params, searchParams }) => {
  const projectId = searchParams.get("project_id");
  if (!projectId) throw badRequest("project_id is required");
  await deleteWorkItem(projectId, params.id);
  return null;
});
