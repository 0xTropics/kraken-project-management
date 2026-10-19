import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { POST as submitRoute } from "@/app/api/portal/requests/route";
import { GET as imageRoute } from "@/app/api/portal/requests/images/[id]/route";
import { signPortalSession } from "@/lib/auth/portal-session";
import { getPortalRequests, portalScopeFromToken } from "@/lib/data/portal";
import { createClientRequest, createProject, createWorkItem, resetDatabase } from "../setup/factories";

/**
 * The portal's first write path, driven through the real route handlers with a
 * real signed cookie. The project must come from the cookie and nothing else,
 * and nothing the client uploads is trusted to be what it claims.
 */

beforeEach(resetDatabase);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const BASE = "http://localhost:3100";

async function cookieFor(projectId: string) {
  return `kraken_portal=${await signPortalSession(projectId, 1)}`;
}

function form(fields: Record<string, string>, files: File[] = []): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  for (const f of files) data.append("images", f);
  return data;
}

const valid = { title: "CSV export", body: "For the auditors.", requester_name: "Priya" };
const png = () => new File([PNG], "shot.png", { type: "image/png" });

async function submit(projectId: string | null, data: FormData, headers: Record<string, string> = {}) {
  const request = new Request(`${BASE}/api/portal/requests`, {
    method: "POST",
    headers: { ...(projectId ? { cookie: await cookieFor(projectId) } : {}), ...headers },
    body: data,
  });
  const response = await submitRoute(request, undefined);
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function image(projectId: string, id: string) {
  const request = new Request(`${BASE}/api/portal/requests/images/${id}`, {
    headers: { cookie: await cookieFor(projectId) },
  });
  return imageRoute(request, { params: Promise.resolve({ id }) });
}

describe("submitting a request from the portal", () => {
  it("stores the request and its image against the cookie's project", async () => {
    const project = await createProject();
    const result = await submit(project.id, form(valid, [png()]));
    expect(result.status).toBe(201);
    const [row] = await sql<{ project_id: string; images: number; content_type: string }[]>`
      select r.project_id,
             (select count(*)::int from client_request_images i where i.request_id = r.id) as images,
             (select content_type from client_request_images i where i.request_id = r.id limit 1) as content_type
      from client_requests r where r.id = ${result.body.request.id}`;
    expect(row).toEqual({ project_id: project.id, images: 1, content_type: "image/png" });
  });

  it("stores the sniffed type, not the claimed one", async () => {
    const project = await createProject();
    const result = await submit(project.id, form(valid, [new File([PNG], "lies.gif", { type: "image/gif" })]));
    expect(result.status).toBe(201);
    const [img] = await sql<{ content_type: string; storage_path: string }[]>`
      select content_type, storage_path from client_request_images`;
    expect(img?.content_type).toBe("image/png");
    expect(img?.storage_path).toMatch(new RegExp(`^requests/${project.id}/[0-9a-f-]+/[0-9a-f-]+\\.png$`));
  });

  it("ignores a project_id in the form", async () => {
    const mine = await createProject();
    const theirs = await createProject();
    const result = await submit(mine.id, form({ ...valid, project_id: theirs.id }));
    expect(result.status).toBe(201);
    expect(await sql`select 1 from client_requests where project_id = ${theirs.id}`).toHaveLength(0);
  });

  it("refuses an anonymous submission", async () => {
    expect((await submit(null, form(valid))).status).toBe(401);
  });

  it("refuses a foreign Origin", async () => {
    const project = await createProject();
    expect((await submit(project.id, form(valid), { origin: "https://evil.example" })).status).toBe(403);
    expect((await submit(project.id, form(valid), { origin: BASE })).status).toBe(201);
  });

  it("refuses more than three images, an oversize image, and a non-image, storing nothing", async () => {
    const project = await createProject();
    expect((await submit(project.id, form(valid, [png(), png(), png(), png()]))).status).toBe(400);
    const big = new Uint8Array(1_572_865);
    big.set(PNG.subarray(0, 8));
    expect((await submit(project.id, form(valid, [new File([big], "b.png", { type: "image/png" })]))).status).toBe(400);
    const svg = new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "c.png", { type: "image/png" });
    expect((await submit(project.id, form(valid, [svg]))).status).toBe(400);
    expect(await sql`select 1 from client_requests`).toHaveLength(0);
  });

  it("refuses missing text with field errors", async () => {
    const project = await createProject();
    expect((await submit(project.id, form({ title: "", body: "x", requester_name: "P" }))).status).toBe(422);
    expect((await submit(project.id, form({ body: "x", requester_name: "P" }))).status).toBe(422);
  });

  it("allows ten requests in 24 hours and refuses the eleventh", async () => {
    const project = await createProject();
    await createClientRequest(project.id, { created_at: sql`now() - interval '25 hours'` as unknown as string });
    for (let n = 0; n < 9; n++) await createClientRequest(project.id);
    expect((await submit(project.id, form(valid))).status).toBe(201);
    const refused = await submit(project.id, form(valid));
    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe("rate_limited");
  });

  it("lets only one of two simultaneous submissions take the last slot", async () => {
    const project = await createProject();
    for (let n = 0; n < 9; n++) await createClientRequest(project.id);
    const [a, b] = await Promise.all([submit(project.id, form(valid)), submit(project.id, form(valid))]);
    expect([a.status, b.status].sort()).toEqual([201, 429]);
  });
});

describe("reading requests in the portal", () => {
  it("lists only this project's requests, with status but no work-item internals", async () => {
    const a = await createProject();
    const b = await createProject();
    const item = await createWorkItem(a.id, {
      title: "INTERNAL-TITLE",
      description: "INTERNAL-DESC",
      status: "in_progress",
      client_visible: false,
    });
    const mine = await createClientRequest(a.id, { title: "MINE" });
    await sql`update client_requests set status = 'accepted', decided_at = now(), work_item_id = ${item.id} where id = ${mine.id}`;
    await createClientRequest(b.id, { title: "THEIRS" });

    const scope = await portalScopeFromToken(await signPortalSession(a.id, 1));
    if (!scope) throw new Error("scope");
    const list = await getPortalRequests(scope);
    expect(list.map((r) => r.title)).toEqual(["MINE"]);
    expect(list[0]?.status).toBe("in_progress");
    const text = JSON.stringify(list);
    expect(text).not.toContain("INTERNAL-TITLE");
    expect(text).not.toContain("INTERNAL-DESC");
    expect(text).not.toContain(item.id);
  });

  it("serves an image only to its own project, and 404s a malformed id", async () => {
    const a = await createProject();
    const b = await createProject();
    const created = await submit(a.id, form(valid, [png()]));
    const [img] = await sql<{ id: string }[]>`
      select id from client_request_images where request_id = ${created.body.request.id}`;
    if (!img) throw new Error("image row");
    expect((await image(a.id, img.id)).status).toBe(302);
    expect((await image(b.id, img.id)).status).toBe(404);
    expect((await image(a.id, "not-a-uuid")).status).toBe(404);
  });
});
