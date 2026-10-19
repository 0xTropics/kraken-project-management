import { MessageSquarePlus } from "lucide-react";
import type { PortalRequest } from "@/lib/data/portal";
import { CLIENT_FACING_META } from "@/lib/requests/status";
import { formatDate } from "@/lib/format";
import { PortalPill } from "./primitives";
import { PortalRequestForm } from "./portal-request-form";

/**
 * The Requests tab: the form beside the project's requests. Same viewport rule
 * as the overview -- from `lg` the page is still and each panel scrolls inside
 * its own `relative`, focusable box; below `lg` the document scrolls instead.
 */
export function PortalRequests({
  requests,
  preview = false,
}: {
  requests: PortalRequest[];
  preview?: boolean;
}) {
  // The preview has no portal cookie, so it reads images through the internal route.
  const imageBase = preview ? "/api/internal/requests/images" : "/api/portal/requests/images";

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section
        aria-labelledby="new-request-heading"
        tabIndex={0}
        className="relative min-h-0 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 lg:overflow-y-auto"
      >
        <h2 id="new-request-heading" className="text-lg font-semibold text-[var(--text-primary)]">
          Request a feature
        </h2>
        <p className="mb-5 mt-1 text-sm text-[var(--text-secondary)]">
          Describe what you need and why. You&rsquo;ll see its status in the list once it&rsquo;s
          been reviewed.
        </p>
        <PortalRequestForm preview={preview} />
      </section>

      <section
        aria-label="Your requests"
        className="flex min-h-0 flex-col rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-panel)]"
      >
        <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] px-4 pb-3 pt-4">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
            Requests
          </h2>
          {requests.length > 0 && (
            <span className="text-xs tabular-nums text-[var(--text-tertiary)]">{requests.length}</span>
          )}
        </header>
        {requests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center lg:flex-1 lg:justify-center">
            <MessageSquarePlus aria-hidden="true" className="size-5 text-[var(--text-tertiary)]" />
            <p className="max-w-[28ch] text-sm text-[var(--text-secondary)]">
              Requests you send will appear here with their status.
            </p>
          </div>
        ) : (
          <div
            tabIndex={0}
            aria-label="Your requests, scrollable"
            className="relative min-h-0 flex-1 lg:overflow-y-auto"
          >
            <ul className="divide-y divide-[var(--border-subtle)]">
              {requests.map((request) => {
                const meta = CLIENT_FACING_META[request.status];
                return (
                  <li key={request.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 break-words text-base font-medium text-[var(--text-primary)]">
                        {request.title}
                      </h3>
                      <PortalPill tone={meta.tone}>{meta.label}</PortalPill>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                      by {request.requester_name} · {formatDate(String(request.created_at).slice(0, 10))}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">
                      {request.body}
                    </p>
                    {request.decline_note && (
                      <p className="mt-2 whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--bg-inset)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                        <span className="font-medium text-[var(--text-primary)]">Note: </span>
                        {request.decline_note}
                      </p>
                    )}
                    {request.image_ids.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {request.image_ids.map((id, index) => (
                          <li key={id}>
                            <a
                              href={`${imageBase}/${id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL behind a redirect; next/image cannot optimise it */}
                              <img
                                src={`${imageBase}/${id}`}
                                alt={`Image ${index + 1} attached to ${request.title}`}
                                className="size-20 object-cover"
                                loading="lazy"
                              />
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
