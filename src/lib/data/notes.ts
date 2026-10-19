import { sql } from "@/lib/db/client";
import type { ProgressNote, ProjectNote, Timestamp } from "@/lib/db/types";

export interface ProgressNoteRow extends ProgressNote {
  work_item_title: string | null;
}

/** The project's progress feed, newest first. */
export async function listProgressNotes(
  projectId: string,
  limit = 200,
): Promise<ProgressNoteRow[]> {
  return sql<ProgressNoteRow[]>`
    select n.*, w.title as work_item_title
    from progress_notes n
    left join work_items w on w.id = n.work_item_id
    where n.project_id = ${projectId}
    order by n.created_at desc
    limit ${limit}
  `;
}

export async function listProjectNotes(projectId: string): Promise<ProjectNote[]> {
  return sql<ProjectNote[]>`
    select * from project_notes
    where project_id = ${projectId}
    order by updated_at desc
  `;
}

export interface NoteWorkItemOption {
  id: string;
  title: string;
  updated_at: Timestamp;
}

/** Work items a new progress note can be attached to. */
export async function listNoteWorkItems(projectId: string): Promise<NoteWorkItemOption[]> {
  return sql<NoteWorkItemOption[]>`
    select id, title, updated_at
    from work_items
    where project_id = ${projectId} and status <> 'wont_do'
    order by updated_at desc
    limit 100
  `;
}
