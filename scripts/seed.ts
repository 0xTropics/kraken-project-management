/**
 * Demo data for development, screenshots, and manual review.
 *
 * Everything here is fictional. Dates are generated relative to today so the
 * dashboard's "this month" panels are never empty, and the mix deliberately
 * includes the awkward cases: an unapproved note, a goodwill discount, a
 * retainer project, and a voided invoice.
 *
 *   npm run db:seed
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { sql } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { endOfMonth, startOfMonth } from "@/lib/format";
import { requestImagePath, storage } from "@/lib/storage";
import {
  billInstallment,
  createDraftInvoice,
  createMaintenanceDraft,
  finalizeInvoice,
  markInvoicePaid,
  setInvoicePublished,
  voidInvoice,
} from "@/lib/invoices/engine";
import type { WorkItemPriority, WorkItemStatus, WorkItemType } from "@/lib/db/types";
import { resetDatabase } from "../test/setup/factories";

const PORTAL_PASSWORD = "seagrass-lantern-42";

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}
function monthStart(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return iso(d);
}
function monthEnd(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset + 1);
  d.setDate(0);
  return iso(d);
}

async function main() {
  console.log("Seeding Kraken demo data ...\n");

  await resetDatabase();

  /* -- operator ---------------------------------------------------------- */
  const email = process.env.KRAKEN_SEED_EMAIL ?? "operator@example.com";
  const password = process.env.KRAKEN_SEED_PASSWORD ?? "Password";
  const [operator] = await sql<{ id: string }[]>`
    insert into internal_users (email, name, password_hash)
    values (${email}, ${"Morgan Hale"}, ${await hashPassword(password)})
    returning id
  `;

  /* -- clients ----------------------------------------------------------- */
  const clients = await sql<{ id: string; name: string }[]>`
    insert into clients (name, notes) values
      (${"Northwind Botanicals"},
       ${"Prefers a Monday call. Invoices go to accounts@, not to Priya."}),
      (${"Meridian Freight"},
       ${"Retainer since January. Slow to reply in Q3 — chase twice."}),
      (${"Halcyon Studio"},
       ${"Design-led. Send screenshots, not descriptions."})
    returning id, name
  `;
  const [northwind, meridian, halcyon] = clients;

  /* -- client contacts ----------------------------------------------------
   * Northwind gets two, matching its own note above: invoices go to Accounts,
   * so Accounts is the primary contact and Priya is not. Meridian and Halcyon
   * each get a single primary contact.
   */
  await sql`
    insert into client_contacts (client_id, name, email, is_primary) values
      (${northwind.id}, ${"Priya Raman"}, ${"priya@northwind-botanicals.example"}, ${false}),
      (${northwind.id}, ${"Accounts"}, ${"accounts@northwind-botanicals.example"}, ${true}),
      (${meridian.id}, ${"Tom Okafor"}, ${"tom@meridianfreight.example"}, ${true}),
      (${halcyon.id}, ${"Ines Duarte"}, ${"ines@halcyonstudio.example"}, ${true})
  `;

  /* -- projects ---------------------------------------------------------- */
  const portalHash = await hashPassword(PORTAL_PASSWORD);
  const projects = await sql<{ id: string; slug: string; name: string }[]>`
    insert into projects (
      client_id, name, slug, description, status, billing_model, currency,
      hourly_rate, retainer_amount, tax_rate, portal_password_hash,
      payment_instructions, retainer_show_hours, repo_url, started_at
    ) values
      (${northwind.id}, ${"Greenhouse Operations"}, ${"greenhouse-ops"},
       ${"A replacement for the spreadsheet that runs propagation scheduling, bench allocation, and daily task lists across the three Northwind sites."},
       ${"active"}, ${"hourly"}, ${"USD"}, ${165}, ${null}, ${0}, ${portalHash},
       ${"E-transfer to billing@example.com, or USDC on Base — address on request."},
       ${false}, ${"https://github.com/example/greenhouse-ops"}, ${"2026-02-02"}),

      (${meridian.id}, ${"Dispatch Portal"}, ${"dispatch-portal"},
       ${"Ongoing development and support for the Meridian dispatch portal: driver assignment, load boards, and the customer tracking page."},
       ${"active"}, ${"retainer"}, ${"CAD"}, ${null}, ${4200}, ${0.05}, ${portalHash},
       ${"E-transfer to billing@example.com. Net 15."},
       ${true}, ${"https://github.com/example/meridian-dispatch"}, ${"2026-01-12"}),

      (${halcyon.id}, ${"Halcyon Marketing Site"}, ${"halcyon-site"},
       ${"A static marketing site with a headless CMS, built and handed over in the spring."},
       ${"completed"}, ${"hourly"}, ${"USD"}, ${140}, ${null}, ${0}, ${portalHash},
       ${"Cash or e-transfer."}, ${false}, ${null}, ${"2026-03-09"}),

      (${halcyon.id}, ${"Halcyon Client App"}, ${"halcyon-app"},
       ${"A client-facing project tracker for Halcyon's own customers, sharing the design system from the marketing site."},
       ${"active"}, ${"hourly"}, ${"USD"}, ${150}, ${null}, ${0}, ${portalHash},
       ${"Cash or e-transfer."}, ${false}, ${null}, ${daysAgo(52)})
    returning id, slug, name
  `;
  const greenhouse = projects[0];
  const dispatch = projects[1];
  const halcyonSite = projects[2];
  const halcyonApp = projects[3];

  /* -- milestones -------------------------------------------------------- */
  const milestones = await sql<{ id: string; name: string; project_id: string }[]>`
    insert into milestones (project_id, name, target_date, status, client_visible, sort_order) values
      (${greenhouse.id}, ${"Propagation scheduling"}, ${daysAgo(-14)}, ${"open"}, ${true}, ${0}),
      (${greenhouse.id}, ${"Bench allocation"}, ${daysAgo(-45)}, ${"open"}, ${true}, ${1}),
      (${greenhouse.id}, ${"Internal cleanup"}, ${null}, ${"open"}, ${false}, ${2}),
      (${dispatch.id}, ${"Q3 improvements"}, ${daysAgo(-21)}, ${"open"}, ${true}, ${0}),
      (${halcyonApp.id}, ${"First release"}, ${daysAgo(-30)}, ${"open"}, ${true}, ${0})
    returning id, name, project_id
  `;
  const mPropagation = milestones[0].id;
  const mBench = milestones[1].id;
  const mInternal = milestones[2].id;
  const mDispatchQ3 = milestones[3].id;
  const mHalcyonRelease = milestones[4].id;

  /* -- work items -------------------------------------------------------- */
  type Item = [string, WorkItemType, WorkItemStatus, WorkItemPriority, string | null, boolean, string | null];
  const items: [string, Item[]][] = [
    [greenhouse.id, [
      ["Propagation calendar with per-variety germination windows", "feature", "done", "high", mPropagation, true, "Varieties carry their own germination window; the calendar derives sow dates backwards from the target transplant week."],
      ["Bulk sow-date shift for a whole batch", "feature", "done", "medium", mPropagation, true, null],
      ["Bench allocation grid", "feature", "in_progress", "high", mBench, true, "Drag a batch onto a bench; capacity is computed from tray size and bench area."],
      ["Overwintering bench reservations", "feature", "planned", "medium", mBench, true, null],
      ["Daily task list per site", "feature", "planned", "high", mPropagation, true, null],
      ["Printable pick list for the packing shed", "feature", "backlog", "low", null, false, null],
      ["Germination rate report", "feature", "in_progress", "medium", mPropagation, false, "Implemented the report with a 30/60/90 day window selector. Numbers reconcile against the sample batch."],
      ["Sow-date shift loses the note on the batch", "bug", "in_progress", "high", null, true, "Reproduces when the batch has an empty note; the update writes null over the existing value."],
      ["Timezone drift on the calendar at month boundaries", "bug", "done", "high", null, true, null],
      ["Bench grid scrolls the page on iPad", "bug", "planned", "medium", mBench, true, null],
      ["Upgrade to the new query client", "chore", "done", "low", mInternal, false, null],
      ["Add integration tests around the scheduler", "chore", "in_progress", "medium", mInternal, false, null],
      ["Retire the legacy CSV importer", "chore", "backlog", "low", mInternal, false, null],
      // A chore the client is deliberately shown. Since 2026-09-05 `client_visible`
      // is the whole rule and type is not a second gate, so this reaches the portal
      // while the three chores above -- all client_visible=false -- do not.
      ["Migrate the photo store to signed URLs", "chore", "planned", "medium", null, true, "Existing photo links stop being guessable; nothing changes in how you upload."],
    ]],
    [dispatch.id, [
      ["Load board filtering by lane and equipment type", "feature", "done", "high", mDispatchQ3, true, null],
      ["Driver assignment conflicts surfaced inline", "feature", "in_progress", "high", mDispatchQ3, true, null],
      ["Customer tracking page refresh", "feature", "planned", "medium", mDispatchQ3, true, null],
      ["Dispatcher keyboard shortcuts", "feature", "backlog", "low", null, false, null],
      ["Tracking page shows stale ETA after a reassignment", "bug", "in_progress", "high", null, true, "Cache key omitted the assignment id. Added it and backfilled the invalidation."],
      ["Nightly export occasionally writes a partial file", "bug", "planned", "high", null, false, null],
      ["Move scheduled jobs off the web dyno", "chore", "planned", "medium", null, false, null],
    ]],
    [halcyonSite.id, [
      ["Headless CMS integration", "feature", "done", "high", null, true, null],
      ["Case study template", "feature", "done", "medium", null, true, null],
      ["Contact form with spam filtering", "feature", "done", "medium", null, true, null],
      ["Open Graph images render blank on Safari", "bug", "done", "medium", null, true, null],
    ]],
    [halcyonApp.id, [
      ["Project timeline view", "feature", "in_progress", "high", mHalcyonRelease, true, null],
      ["Client comment threads", "feature", "planned", "high", mHalcyonRelease, true, null],
      ["Shared design tokens package", "feature", "done", "medium", mHalcyonRelease, true, null],
      ["File attachments on comments", "feature", "backlog", "medium", null, false, null],
      ["Timeline misaligns on the week boundary", "bug", "in_progress", "medium", mHalcyonRelease, true, null],
      ["Set up preview deployments", "chore", "done", "low", null, false, null],
    ]],
  ];

  const itemIds: Record<string, string[]> = {};
  for (const [projectId, rows] of items) {
    itemIds[projectId] = [];
    for (const [index, [title, type, status, priority, milestoneId, visible, description]] of rows.entries()) {
      const [row] = await sql<{ id: string }[]>`
        insert into work_items (project_id, milestone_id, type, status, priority, title,
                                description, client_visible, sort_order, updated_at)
        values (${projectId}, ${milestoneId}, ${type}, ${status}, ${priority}, ${title},
                ${description}, ${visible}, ${index}, now() - ${`${index * 9 + 2} hours`}::interval)
        returning id
      `;
      itemIds[projectId].push(row.id);
    }
  }

  // The completed_at trigger stamps now() on insert, which would date every
  // Done card in the portal to the seed day. Backdate each to the day its
  // progress note and time entries below say it finished, and move updated_at
  // with it: finishing was the item's last change. The updated_at trigger is
  // suspended inside this transaction only, so it cannot overwrite that.
  const completedDaysAgo: [string, number][] = [
    ["Propagation calendar with per-variety germination windows", 2],
    ["Timezone drift on the calendar at month boundaries", 9],
    ["Upgrade to the new query client", 12],
    ["Bulk sow-date shift for a whole batch", 14],
    ["Load board filtering by lane and equipment type", 4],
    ["Shared design tokens package", 7],
    ["Set up preview deployments", 14],
    ["Open Graph images render blank on Safari", 97],
    ["Case study template", 99],
    ["Contact form with spam filtering", 103],
    ["Headless CMS integration", 108],
  ];
  await sql.begin(async (tx) => {
    await tx`alter table work_items disable trigger work_items_updated_at`;
    for (const [title, ago] of completedDaysAgo) {
      const [row] = await tx<{ id: string }[]>`
        update work_items
        set completed_at = now() - make_interval(days => ${ago}),
            updated_at = now() - make_interval(days => ${ago})
        where title = ${title} and status = 'done'
        returning id
      `;
      if (!row) throw new Error(`seed: no done work item titled ${title}`);
    }
    await tx`alter table work_items enable trigger work_items_updated_at`;
  });

  /* -- progress notes ---------------------------------------------------- */
  const notes: [string, string, boolean, number][] = [
    [greenhouse.id, "Propagation calendar is live on staging. The germination windows now come from the variety record rather than a hard-coded table, so adding a variety no longer needs a deploy.", true, 2],
    [greenhouse.id, "Bench allocation grid is drawing correctly at three sites. Capacity maths still needs the tray-size lookup wired in before it can be trusted.", true, 5],
    [greenhouse.id, "Fixed the month-boundary timezone drift on the calendar. Root cause was a date being constructed in local time and read back in UTC.", true, 9],
    [greenhouse.id, "Implemented the germination rate report behind a window selector, added six tests around the scheduler, and moved the report query into a view. Blocked on confirmation of which window is the default.", false, 1],
    [greenhouse.id, "Reproduced the sow-date note bug. The update statement writes every column including the untouched note. Narrowed to the batch update path; fix not yet applied.", false, 3],
    [greenhouse.id, "Upgraded the query client and removed the deprecated cache configuration. All existing tests pass.", true, 12],
    [dispatch.id, "Load board filtering shipped. Lane and equipment type are both indexed, so the board stays responsive at ten thousand rows.", true, 4],
    [dispatch.id, "Driver assignment conflicts now appear inline rather than after save. Still deciding whether a soft conflict should block the assignment.", true, 11],
    [dispatch.id, "Found the stale ETA cause — the cache key omitted the assignment id. Fix is in review.", false, 2],
    [halcyonApp.id, "Design tokens are now a shared package consumed by both the marketing site and the app, so a colour change lands in one place.", true, 7],
    [halcyonApp.id, "Timeline view renders the first release milestone. Week-boundary alignment is off by one column and is being worked on.", true, 3],
    [halcyonSite.id, "Site is live and handed over. CMS accounts transferred to Ines, DNS moved, and the old host has been cancelled.", true, 96],
  ];
  for (const [projectId, body, approved, ago] of notes) {
    await sql`
      insert into progress_notes (project_id, body, approved_at, created_at, updated_at)
      values (${projectId}, ${body},
              ${approved ? sql`now() - ${`${ago} days`}::interval` : null},
              now() - ${`${ago} days`}::interval, now() - ${`${ago} days`}::interval)
    `;
  }

  /* -- client requests --------------------------------------------------- */
  // One of each state the portal shows: waiting, accepted onto the board, and
  // declined with a note. The submitted one carries an image so the thumbnail
  // path is exercised locally.
  const [benchItem] = await sql<{ id: string }[]>`
    select id from work_items where project_id = ${greenhouse.id} and title = ${"Bench allocation grid"}
  `;
  if (!benchItem) throw new Error("seed: bench allocation item missing");
  const [submittedRequest] = await sql<{ id: string }[]>`
    insert into client_requests (project_id, title, body, requester_name, created_at)
    values (${greenhouse.id}, ${"Export the pick list as CSV"},
            ${"The packing shed wants to load the daily pick list into their label printer, which only takes CSV."},
            ${"Priya Nair"}, now() - interval '5 hours')
    returning id
  `;
  if (!submittedRequest) throw new Error("seed: request insert returned no row");
  // The printout the client is talking about, so the portal shows a real attachment.
  const seedPng = readFileSync(new URL("./seed-assets/pick-list.png", import.meta.url));
  const [seedImage] = await sql<{ id: string }[]>`select gen_random_uuid() as id`;
  if (!seedImage) throw new Error("seed: uuid");
  const seedImagePath = requestImagePath(greenhouse.id, submittedRequest.id, seedImage.id, "png");
  await storage().put(seedImagePath, new Uint8Array(seedPng), "image/png");
  await sql`
    insert into client_request_images (id, request_id, storage_path, content_type, byte_size)
    values (${seedImage.id}, ${submittedRequest.id}, ${seedImagePath}, ${"image/png"}, ${seedPng.length})
  `;
  await sql`
    insert into client_requests (project_id, title, body, requester_name, status, work_item_id, decided_at, created_at)
    values (${greenhouse.id}, ${"Drag batches onto benches"},
            ${"Dragging a batch straight onto a bench would save the team a lot of retyping."},
            ${"Priya Nair"}, ${"accepted"}, ${benchItem.id}, now() - interval '20 days', now() - interval '21 days')
  `;
  await sql`
    insert into client_requests (project_id, title, body, requester_name, status, decline_note, decided_at, created_at)
    values (${greenhouse.id}, ${"Native iPad app"},
            ${"Could the bench grid be an iPad app so it works offline in the greenhouse?"},
            ${"Owen Marsh"}, ${"declined"}, ${"Out of scope for this phase — let's revisit after launch."},
            now() - interval '9 days', now() - interval '10 days')
  `;

  /* -- project notes ----------------------------------------------------- */
  await sql`
    insert into project_notes (project_id, title, body) values
      (${greenhouse.id}, ${"Architecture decisions"},
       ${"## Scheduling\n\nSow dates are derived, never stored. The calendar computes backwards from the target transplant week using the variety's germination window. Storing them caused three separate drift bugs in the spreadsheet era.\n\n## Sites\n\nSite is a first-class dimension. Every query that touches benches or tasks must filter by site; there is no \"all sites\" write path.\n\n## Testing\n\nThe scheduler has a golden-file test per variety. Regenerate with `npm run test:golden -- --update` and read the diff before committing it."}),
      (${greenhouse.id}, ${"Client quirks"},
       ${"Priya reviews on Mondays. Anything shipped Friday afternoon sits unlooked-at until then, so prefer Thursday deploys.\n\nThe packing shed still runs a Windows 10 tablet on Chrome 109. Check layout there before calling a UI change done."}),
      (${greenhouse.id}, ${"Credentials and access"},
       ${"Staging database credentials are in 1Password under \"Northwind — staging\". Production access requires Priya's approval each time; there is no standing credential.\n\nThe DNS registrar login is held by the client, not by us."}),
      (${dispatch.id}, ${"Architecture decisions"},
       ${"## Jobs\n\nScheduled jobs run on a separate worker. Anything added to the web process will be killed by the platform's request timeout.\n\n## Caching\n\nTracking-page reads are cached for sixty seconds. Every cache key must include the assignment id — omitting it caused the stale ETA bug."}),
      (${halcyonApp.id}, ${"Design system"},
       ${"Tokens live in `packages/tokens` and are consumed by both the site and the app. Never hard-code a colour; add a token and use it, so the two products cannot drift apart."})
  `;

  /* -- time entries ------------------------------------------------------ */
  const timeRows: [string, number, number, number, string, string | null][] = [
    // project, daysAgo, worked, billed, description, discount reason
    //
    // The first block is anchored to today so the current-month dashboard is
    // never empty, whatever day of the month the seed is run on.
    [greenhouse.id, 0, 3.5, 3.5, "Bench capacity lookup and tray-size table", null],
    [greenhouse.id, 0, 1.5, 1, "Standup and scope questions", "Call time, half not billed"],
    [dispatch.id, 0, 2.5, 2.5, "Assignment conflict edge cases", null],
    [halcyonApp.id, 0, 2, 2, "Timeline column alignment", null],
    [greenhouse.id, 1, 5, 5, "Daily task list — per-site filtering", null],
    [dispatch.id, 1, 3, 3, "Load board pagination", null],
    [greenhouse.id, 2, 4.5, 4.5, "Bench allocation grid — capacity maths and drag targets", null],
    [greenhouse.id, 3, 3, 3, "Bench allocation grid — layout at three sites", null],
    [greenhouse.id, 5, 6, 5, "Sow-date shift bug investigation", "Longer than quoted; not charging the extra hour"],
    [greenhouse.id, 8, 5.5, 5.5, "Daily task list — data model and queries", null],
    [greenhouse.id, 9, 2.5, 2.5, "Timezone drift fix and regression test", null],
    [greenhouse.id, 12, 7, 7, "Propagation calendar — variety germination windows", null],
    [greenhouse.id, 15, 4, 4, "Propagation calendar — bulk shift", null],
    [greenhouse.id, 34, 6, 6, "Propagation calendar — first pass", null],
    [greenhouse.id, 36, 5, 4, "Client call and scope rework", "Scoping call, not billed"],
    [greenhouse.id, 40, 7.5, 7.5, "Variety import and data clean-up", null],
    [greenhouse.id, 42, 6, 6, "Site model and bench schema", null],
    [greenhouse.id, 66, 8, 8, "Project setup, schema, and CI", null],
    [greenhouse.id, 68, 5, 5, "Discovery workshop write-up", null],
    [dispatch.id, 4, 5, 5, "Driver assignment conflict detection", null],
    [dispatch.id, 6, 3.5, 3.5, "Load board filter indexes", null],
    [dispatch.id, 11, 6, 6, "Load board filtering UI", null],
    [dispatch.id, 33, 7, 7, "Tracking page groundwork", null],
    [dispatch.id, 38, 4, 4, "Nightly export investigation", null],
    [dispatch.id, 64, 6.5, 6.5, "Q3 planning and estimates", null],
    [halcyonApp.id, 1, 3, 3, "Timeline view — week columns", null],
    [halcyonApp.id, 3, 4.5, 4.5, "Timeline view — milestone rendering", null],
    [halcyonApp.id, 7, 6, 6, "Shared token package extraction", null],
    [halcyonApp.id, 14, 5, 5, "App shell and routing", null],
    [halcyonApp.id, 37, 6, 6, "Design review and component inventory", null],
    [halcyonSite.id, 96, 6, 6, "Handover, DNS, and CMS accounts", null],
    [halcyonSite.id, 99, 7, 7, "Case study template", null],
    [halcyonSite.id, 104, 8, 7, "Contact form and spam filtering", "Rework after a mistaken assumption on my part"],
    [halcyonSite.id, 110, 6.5, 6.5, "CMS integration", null],
  ];
  for (const [projectId, ago, worked, billed, description, reason] of timeRows) {
    const pool = itemIds[projectId] ?? [];
    const workItemId = pool.length > 0 ? pool[(ago * 7) % pool.length] : null;
    await sql`
      insert into time_entries (project_id, work_item_id, date, hours_worked, hours_billed,
                                discount_reason, description, created_at)
      values (${projectId}, ${workItemId}, ${daysAgo(ago)}, ${worked}, ${billed}, ${reason}, ${description},
              now() - ${`${ago} days`}::interval)
    `;
  }

  /* -- invoices ---------------------------------------------------------- */
  // Two months back: issued and paid. One month back: issued and published.
  // Current month: a draft in progress. Plus one void, to prove the path.
  const paid = await createDraftInvoice({
    projectId: greenhouse.id,
    periodStart: monthStart(-2),
    periodEnd: monthEnd(-2),
    actorId: operator.id,
  });
  await finalizeInvoice(paid.id, operator.id);
  await markInvoicePaid(paid.id, "etransfer", "Received 3 days after issue", operator.id);
  await setInvoicePublished(paid.id, true, operator.id);

  const sent = await createDraftInvoice({
    projectId: greenhouse.id,
    periodStart: monthStart(-1),
    periodEnd: monthEnd(-1),
    actorId: operator.id,
  });
  await finalizeInvoice(sent.id, operator.id);
  await setInvoicePublished(sent.id, true, operator.id);

  const retainerPaid = await createDraftInvoice({
    projectId: dispatch.id,
    periodStart: monthStart(-1),
    periodEnd: monthEnd(-1),
    actorId: operator.id,
  });
  await finalizeInvoice(retainerPaid.id, operator.id);
  await markInvoicePaid(retainerPaid.id, "crypto", "USDC on Base — 0x9f2c…4ae1", operator.id);
  await setInvoicePublished(retainerPaid.id, true, operator.id);

  const mistake = await createDraftInvoice({
    projectId: halcyonSite.id,
    // The months its entries (96-110 days ago) actually fall in. A fixed
    // `monthStart(-4)` drifts off them late in a month and leaves the draft
    // with no lines, which finalize refuses.
    periodStart: startOfMonth(daysAgo(110)),
    periodEnd: endOfMonth(daysAgo(96)),
    actorId: operator.id,
  });
  await finalizeInvoice(mistake.id, operator.id);
  await voidInvoice(mistake.id, operator.id);

  const reissued = await createDraftInvoice({
    projectId: halcyonSite.id,
    // The months its entries (96-110 days ago) actually fall in. A fixed
    // `monthStart(-4)` drifts off them late in a month and leaves the draft
    // with no lines, which finalize refuses.
    periodStart: startOfMonth(daysAgo(110)),
    periodEnd: endOfMonth(daysAgo(96)),
    actorId: operator.id,
  });
  await finalizeInvoice(reissued.id, operator.id);
  await markInvoicePaid(reissued.id, "cash", null, operator.id);
  await setInvoicePublished(reissued.id, true, operator.id);

  await createDraftInvoice({
    projectId: dispatch.id,
    periodStart: monthStart(0),
    periodEnd: monthEnd(0),
    actorId: operator.id,
  });

  /* -- a build + maintenance client --------------------------------------
   * A build fee in thirds: one billed and paid, one issued, one still to bill
   * -- so Bill installment stays reachable for the dialog's axe check -- and a
   * 12-month maintenance term drafted from this month. The Invoices tab's
   * panel, the PDF, and the a11y/responsive gates then see every state.
   */
  const [juniper] = await sql<{ id: string }[]>`
    insert into clients (name, notes)
    values (${"Juniper Dental"}, ${"New site with online booking. Prepaid a year of maintenance."})
    returning id
  `;
  await sql`
    insert into client_contacts (client_id, name, email, is_primary)
    values (${juniper.id}, ${"Dr. Amara Singh"}, ${"amara@juniperdental.example"}, ${true})
  `;
  const [juniperSite] = await sql<{ id: string; slug: string; name: string }[]>`
    insert into projects (
      client_id, name, slug, description, status, billing_model, currency, tax_rate,
      portal_password_hash, payment_instructions, started_at,
      build_fee, maintenance_monthly, maintenance_price_6, maintenance_price_12,
      maintenance_term_months, maintenance_starts_on
    ) values (
      ${juniper.id}, ${"Juniper Dental Website"}, ${"juniper-site"},
      ${"A new marketing site with online booking, then hosting, updates and security patches."},
      ${"active"}, ${"maintenance"}, ${"CAD"}, ${0.13}, ${portalHash},
      ${"E-transfer to billing@example.com."}, ${daysAgo(80)},
      ${9000}, ${150}, ${840}, ${1620}, ${12}, ${monthStart(0)}
    )
    returning id, slug, name
  `;
  const signing = await billInstallment(juniperSite.id, { amount: 3000, description: "One third on signing" }, operator.id);
  await finalizeInvoice(signing.id, operator.id);
  await markInvoicePaid(signing.id, "etransfer", null, operator.id);
  await setInvoicePublished(signing.id, true, operator.id);
  const design = await billInstallment(juniperSite.id, { amount: 3000, description: "One third at design sign-off" }, operator.id);
  await finalizeInvoice(design.id, operator.id);
  await createMaintenanceDraft(juniperSite.id, operator.id);

  /* -- a little audit history ------------------------------------------- */
  await sql`
    insert into audit_log (actor_type, actor_id, actor_label, project_id, action, entity_type, payload, created_at) values
      (${"portal"}, ${greenhouse.id}, ${"greenhouse-ops"}, ${greenhouse.id}, ${"portal.login"}, ${"project"}, ${sql.json({ success: true })}, now() - interval '2 days')
  `;
  await sql`
    insert into portal_login_attempts (project_id, slug, ip, success, created_at) values
      (${greenhouse.id}, ${"greenhouse-ops"}, ${"203.0.113.24"}::inet, ${true}, now() - interval '2 days'),
      (${greenhouse.id}, ${"greenhouse-ops"}, ${"203.0.113.24"}::inet, ${false}, now() - interval '2 days' - interval '3 minutes'),
      (${dispatch.id}, ${"dispatch-portal"}, ${"198.51.100.7"}::inet, ${true}, now() - interval '9 days')
  `;

  const [counts] = await sql<{ projects: number; items: number; entries: number; invoices: number }[]>`
    select (select count(*) from projects)     as projects,
           (select count(*) from work_items)   as items,
           (select count(*) from time_entries) as entries,
           (select count(*) from invoices)     as invoices
  `;

  console.log(`  ${counts.projects} projects, ${counts.items} work items, ${counts.entries} time entries, ${counts.invoices} invoices\n`);
  console.log("  Internal sign-in");
  console.log(`    ${email} / ${password}`);
  console.log("\n  Client portals (same password for all demo projects)");
  for (const p of [...projects, juniperSite]) console.log(`    /portal/${p.slug}  ${PORTAL_PASSWORD}`);
  console.log("");

  await sql.end({ timeout: 5 });
}

main().catch(async (error: unknown) => {
  console.error("\nSeed failed:", error);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
