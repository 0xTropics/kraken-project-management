import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { createClientRequest, createProject, createWorkItem, resetDatabase } from "../setup/factories";

beforeEach(resetDatabase);

describe("client_requests schema", () => {
  it("starts submitted with no decision", async () => {
    const project = await createProject();
    const request = await createClientRequest(project.id);
    expect(request).toMatchObject({ status: "submitted", decided_at: null, work_item_id: null, decline_note: null });
  });

  it("refuses a decided status without decided_at, and a submitted one with it", async () => {
    const project = await createProject();
    const request = await createClientRequest(project.id);
    await expect(sql`update client_requests set status = 'declined' where id = ${request.id}`).rejects.toThrow(/check/i);
    await expect(sql`update client_requests set decided_at = now() where id = ${request.id}`).rejects.toThrow(/check/i);
  });

  it("allows a decline note only on a declined request", async () => {
    const project = await createProject();
    const request = await createClientRequest(project.id);
    await expect(sql`update client_requests set decline_note = 'no' where id = ${request.id}`).rejects.toThrow(/check/i);
    await sql`update client_requests set status = 'declined', decided_at = now(), decline_note = 'no' where id = ${request.id}`;
  });

  it("enforces text limits", async () => {
    const project = await createProject();
    await expect(createClientRequest(project.id, { title: "x".repeat(201) })).rejects.toThrow(/check/i);
    await expect(createClientRequest(project.id, { body: "  " })).rejects.toThrow(/check/i);
    await expect(createClientRequest(project.id, { requester_name: "x".repeat(101) })).rejects.toThrow(/check/i);
  });

  it("keeps an accepted request when its work item is deleted", async () => {
    const project = await createProject();
    const item = await createWorkItem(project.id);
    const request = await createClientRequest(project.id);
    await sql`update client_requests set status = 'accepted', decided_at = now(), work_item_id = ${item.id} where id = ${request.id}`;
    await sql`delete from work_items where id = ${item.id}`;
    const [after] = await sql<{ status: string; work_item_id: string | null }[]>`
      select status::text, work_item_id from client_requests where id = ${request.id}`;
    if (!after) throw new Error("request vanished");
    expect(after).toEqual({ status: "accepted", work_item_id: null });
  });

  it("refuses an image type outside the allow-list and an oversize image", async () => {
    const project = await createProject();
    const request = await createClientRequest(project.id);
    await expect(sql`insert into client_request_images (request_id, storage_path, content_type, byte_size)
      values (${request.id}, 'a', 'image/svg+xml', 10)`).rejects.toThrow(/check/i);
    await expect(sql`insert into client_request_images (request_id, storage_path, content_type, byte_size)
      values (${request.id}, 'b', 'image/png', 1572865)`).rejects.toThrow(/check/i);
  });

  it("is locked down like every other table", async () => {
    const rows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select relname, relrowsecurity from pg_class
      where relname in ('client_requests','client_request_images') order by relname`;
    expect(rows).toEqual([
      { relname: "client_request_images", relrowsecurity: true },
      { relname: "client_requests", relrowsecurity: true },
    ]);
  });
});
