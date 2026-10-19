import { cn } from "@/lib/cn";

/** A request's attached images as a grid of thumbnails, each opening full size. */
export function RequestImages({
  request,
  className,
}: {
  request: { image_ids: string[]; requester_name: string };
  className?: string;
}) {
  if (request.image_ids.length === 0) return null;
  return (
    <ul className={cn(className, "grid grid-cols-3 gap-2")}>
      {request.image_ids.map((imageId, index) => (
        <li key={imageId}>
          <a
            href={`/api/internal/requests/images/${imageId}`}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL behind a redirect */}
            <img
              src={`/api/internal/requests/images/${imageId}`}
              alt={`Image ${index + 1} from ${request.requester_name}`}
              className="aspect-square w-full object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
