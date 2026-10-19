import { internalHandler, parseBody } from "@/lib/api/handler";
import { projectCreateInput } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { sql } from "@/lib/db/client";
import { conflict } from "@/lib/errors";
import { getProjectById } from "@/lib/data/projects";

export const POST = internalHandler(async ({ request, session }) => {
  const input = await parseBody(request, projectCreateInput);

  // The portal password is required at creation, and only its argon2id
  // digest is ever persisted. The plaintext never reaches the audit log either
  // -- `appendAudit` redacts the key, and it is not in the payload regardless.
  const portalPasswordHash = await hashPassword(input.portal_password);

  const [created] = await sql<{ id: string; slug: string }[]>`
    insert into projects ${sql({
      client_id: input.client_id,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      billing_model: input.billing_model,
      currency: input.currency,
      hourly_rate: input.billing_model === "hourly" ? (input.hourly_rate ?? null) : null,
      retainer_amount: input.billing_model === "retainer" ? (input.retainer_amount ?? null) : null,
      ...(input.billing_model === "maintenance"
        ? {
            build_fee: input.build_fee ?? null,
            maintenance_monthly: input.maintenance_monthly ?? null,
            maintenance_price_6: input.maintenance_price_6 ?? null,
            maintenance_price_12: input.maintenance_price_12 ?? null,
            maintenance_term_months: input.maintenance_term_months ?? 1,
            maintenance_starts_on: input.maintenance_starts_on ?? null,
          }
        : {}),
      tax_rate: input.tax_rate,
      portal_password_hash: portalPasswordHash,
      payment_instructions: input.payment_instructions ?? null,
      retainer_show_hours: input.retainer_show_hours,
      repo_url: input.repo_url ?? null,
      started_at: input.started_at ?? null,
    })}
    returning id, slug
  `;
  if (!created) throw conflict("Could not create that project");

  await appendAudit({
    ...userActor(session),
    projectId: created.id,
    action: "project.create",
    entityType: "project",
    entityId: created.id,
    payload: {
      name: input.name,
      slug: input.slug,
      billing_model: input.billing_model,
      currency: input.currency,
    },
  });

  return { project: await getProjectById(created.id) };
});
