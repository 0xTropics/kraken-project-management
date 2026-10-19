import { sql } from "@/lib/db/client";
import type { BillingModel, ProjectStatus } from "@/lib/db/types";

export interface NavProject {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  billing_model: BillingModel;
  client_name: string;
  open_items: number;
}

/** Sidebar and command-palette payload: active work first, archived hidden. */
export async function getNavProjects(): Promise<NavProject[]> {
  return sql<NavProject[]>`
    select p.id, p.name, p.slug, p.status, p.billing_model, c.name as client_name,
           count(w.id) filter (
             where w.status in ('backlog','planned','in_progress')
           )::int as open_items
    from projects p
    join clients c on c.id = p.client_id
    left join work_items w on w.project_id = p.id
    where p.archived_at is null
    group by p.id, c.name
    order by
      case p.status when 'active' then 0 when 'paused' then 1 when 'completed' then 2 else 3 end,
      p.name
  `;
}
