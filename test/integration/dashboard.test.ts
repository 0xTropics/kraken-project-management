import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { getInProgressItems } from "@/lib/data/dashboard";
import { createProject, resetDatabase } from "../setup/factories";

beforeEach(resetDatabase);

/**
 * `set_updated_at()` rewrites updated_at on every UPDATE, so recency is pinned
 * by inserting with an explicit value -- the trigger does not fire on INSERT.
 */
async function item(
  projectId: string,
  title: string,
  status: string,
  priority: "low" | "medium" | "high" = "medium",
  ageDays = 0,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into work_items (project_id, type, status, priority, title, updated_at)
    values (${projectId}, 'feature', ${status}, ${priority}, ${title},
            now() - ${`${ageDays} days`}::interval)
    returning id
  `;
  if (!row) throw new Error("item: insert returned no row");
  return row.id;
}

describe("getInProgressItems", () => {
  it("returns only in-progress items, high priority first, then most recently touched", async () => {
    const project = await createProject();
    await item(project.id, "LOW", "in_progress", "low", 0);
    await item(project.id, "MED-OLD", "in_progress", "medium", 2);
    await item(project.id, "MED-NEW", "in_progress", "medium", 1);
    const high = await item(project.id, "HIGH", "in_progress", "high", 5);
    await item(project.id, "PLANNED", "planned", "high");
    await item(project.id, "DONE", "done", "high");
    await item(project.id, "BACKLOG", "backlog", "high");

    const { items, total } = await getInProgressItems();
    expect(items.map((i) => i.title)).toEqual(["HIGH", "MED-NEW", "MED-OLD", "LOW"]);
    expect(total).toBe(4);
    expect(items[0]).toMatchObject({
      id: high,
      type: "feature",
      priority: "high",
      project_name: project.name,
      project_slug: project.slug,
    });
  });

  it("excludes items on archived projects", async () => {
    const live = await createProject();
    const archived = await createProject();
    await sql`update projects set archived_at = now() where id = ${archived.id}`;
    await item(live.id, "LIVE", "in_progress");
    await item(archived.id, "ARCHIVED", "in_progress");

    const { items, total } = await getInProgressItems();
    expect(items.map((i) => i.title)).toEqual(["LIVE"]);
    expect(total).toBe(1);
  });

  it("caps the list but reports the true total", async () => {
    const project = await createProject();
    for (let n = 0; n < 10; n++) await item(project.id, `ITEM-${n}`, "in_progress");

    const { items, total } = await getInProgressItems();
    expect(items).toHaveLength(8);
    expect(total).toBe(10);
  });

  it("is empty with a zero total when nothing is in progress", async () => {
    const project = await createProject();
    await item(project.id, "PLANNED", "planned");
    expect(await getInProgressItems()).toEqual({ items: [], total: 0 });
  });
});
