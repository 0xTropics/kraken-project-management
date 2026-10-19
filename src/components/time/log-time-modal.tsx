"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalTrigger } from "@/components/ui/modal";
import { TimeEntryForm } from "./entry-form";
import type { TimeFormWorkItem, TimeProject } from "@/lib/data/time";

/**
 * "Log time" from inside a project. The project is fixed and the form closes on
 * the first save -- unlike `/app/time/new`, where staying put is the point,
 * here you came from a project page and want to go back to it.
 */
export function LogTimeModal({
  project,
  workItems,
}: {
  project: TimeProject;
  workItems: TimeFormWorkItem[];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <Button variant="primary" size="sm">
          <Plus />
          Log time
        </Button>
      </ModalTrigger>
      <ModalContent
        title={`Log time · ${project.name}`}
        description={project.client_name}
        size="md"
      >
        <div className="pb-4">
          <TimeEntryForm
            projects={[project]}
            workItems={workItems}
            defaultProjectId={project.id}
            lockProject
            onSaved={() => setOpen(false)}
            footerSlot={
              <Button variant="ghost" size="lg" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            }
          />
        </div>
      </ModalContent>
    </Modal>
  );
}
