import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import {
  acceptClientRequest,
  countSubmittedRequests,
  declineClientRequest,
  getClientRequest,
  listClientRequests,
  listRequestsForWorkItems,
  listSubmittedRequests,
} from "@/lib/data/client-requests";
import { createClientRequest, createInternalUser, createProject, resetDatabase } from "../setup/factories";

let actor: { userId: string; email: string };
beforeEach(async () => {
  await resetDatabase();
  const user = await createInternalUser();
  actor = { userId: user.id, email: user.email };
});

describe("accepting a request", () => {
  it("creates one backlog feature with the documented description, and links it", async () => {
    const project = await createProject();
    const request = await createClientRequest(project.id, {
      title: "CSV export",
      body: "For the auditors.",
      requester_name: "Priya",
    });
    const { workItemId } = await acceptClientRequest(request.id, actor);

    const [item] = await sql<
      { type: string; status: string; title: string; description: string; client_visible: boolean; project_id: string }[]
    >`select type::text, status::text, title, description, client_visible, project_id
      from work_items where id = ${workItemId}`;
    if (!item) throw new Error("item");
    expect(item).toMatchObject({
      type: "feature",
      status: "backlog",
      title: "CSV export",
      client_visible: false,
      project_id: project.id,
    });
    expect(item.description).toMatch(/^For the auditors\.\n\nRequested by Priya via the client portal on .+\.$/);

    const after = await getClientRequest(request.id);
    expect(after).toMatchObject({ status: "accepted", work_item_id: workItemId, item_status: "backlog" });
    expect(after?.decided_at).not.toBeNull();
    expect(
      await sql`select 1 from audit_log where action = 'client_request.accept' and entity_id = ${request.id}`,
    ).toHaveLength(1);
  });

  it("refuses to decide a request twice", async () => {
    const project = await createProject();
    const request = await createClientRequest(project.id);
    await acceptClientRequest(request.id, actor);
    await expect(acceptClientRequest(request.id, actor)).rejects.toMatchObject({ status: 409 });
    await expect(declineClientRequest(request.id, null, actor)).rejects.toMatchObject({ status: 409 });
    expect(await sql`select 1 from work_items`).toHaveLength(1);
  });

  it("404s an unknown id", async () => {
    await expect(
      acceptClientRequest("00000000-0000-0000-0000-000000000000", actor),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("declining a request", () => {
  it("stores the note, creates no work, and treats a blank note as none", async () => {
    const project = await createProject();
    const a = await createClientRequest(project.id);
    const b = await createClientRequest(project.id);
    await declineClientRequest(a.id, "Out of scope for this phase.", actor);
    await declineClientRequest(b.id, "   ", actor);
    expect(await getClientRequest(a.id)).toMatchObject({
      status: "declined",
      decline_note: "Out of scope for this phase.",
    });
    expect(await getClientRequest(b.id)).toMatchObject({ status: "declined", decline_note: null });
    expect(await sql`select 1 from work_items`).toHaveLength(0);
    expect(await sql`select 1 from audit_log where action = 'client_request.decline'`).toHaveLength(2);
  });
});

describe("the inbox", () => {
  it("counts and lists only submitted requests on unarchived projects", async () => {
    const live = await createProject({ name: "Live" });
    const archived = await createProject();
    await sql`update projects set archived_at = now() where id = ${archived.id}`;
    await createClientRequest(live.id, { title: "NEW-1" });
    await createClientRequest(live.id, { title: "NEW-2" });
    const decided = await createClientRequest(live.id, { title: "DECIDED" });
    await declineClientRequest(decided.id, null, actor);
    await createClientRequest(archived.id, { title: "ARCHIVED" });

    expect(await countSubmittedRequests()).toBe(2);
    const { items, total } = await listSubmittedRequests();
    expect(total).toBe(2);
    expect(items.map((r) => r.title).sort()).toEqual(["NEW-1", "NEW-2"]);
    expect(items[0]?.project_name).toBe("Live");
  });

  it("filters by status and project", async () => {
    const a = await createProject();
    const b = await createProject();
    await createClientRequest(a.id, { title: "A" });
    await createClientRequest(b.id, { title: "B" });
    expect((await listClientRequests({ status: "submitted", projectId: a.id })).map((r) => r.title)).toEqual(["A"]);
    expect(await listClientRequests({ status: "declined" })).toHaveLength(0);
  });

  it("still renders an accepted request whose work item was deleted", async () => {
    const project = await createProject();
    const request = await createClientRequest(project.id);
    const { workItemId } = await acceptClientRequest(request.id, actor);
    await sql`delete from work_items where id = ${workItemId}`;
    expect(await getClientRequest(request.id)).toMatchObject({
      status: "accepted",
      work_item_id: null,
      item_status: null,
    });
  });
});

describe("requests behind work items", () => {
  it("maps each linked item in the project to its request", async () => {
    const project = await createProject();
    const other = await createProject();
    const linked = await createClientRequest(project.id, { requester_name: "Priya" });
    await createClientRequest(project.id);
    const elsewhere = await createClientRequest(other.id);
    const { workItemId } = await acceptClientRequest(linked.id, actor);
    await acceptClientRequest(elsewhere.id, actor);

    const rows = await listRequestsForWorkItems(project.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ work_item_id: workItemId, request_id: linked.id, requester_name: "Priya", image_ids: [] });
  });
});
