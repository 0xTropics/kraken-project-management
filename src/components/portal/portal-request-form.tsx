"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ACCEPTED_ORIGINAL_TYPES, MAX_IMAGES, MAX_ORIGINAL_BYTES } from "@/lib/requests/images";
import { shrinkImage } from "@/lib/requests/shrink";

const NAME_KEY = "kraken.portal.requester-name";
const ACCEPTED = ACCEPTED_ORIGINAL_TYPES as readonly string[];

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

const subscribeNever = () => () => {};

function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private window: the name is a convenience, not state */
  }
}

/**
 * The client's request form. Plain text only; images are shrunk in the browser
 * before upload (Vercel's 4.5 MB body limit) and re-checked by the server.
 * Inert in the internal preview, like the portal's other actions.
 */
export function PortalRequestForm({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  // The remembered name is read through useSyncExternalStore so the server
  // render ("") and the first client render agree; typing overrides it.
  const storedName = React.useSyncExternalStore(subscribeNever, readName, () => "");
  const [typedName, setName] = React.useState<string | null>(null);
  const name = typedName ?? storedName;
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "error" | "success"; text: string } | null>(
    null,
  );
  const fileInput = React.useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = [...list];
    const ok = picked.filter((f) => ACCEPTED.includes(f.type) && f.size <= MAX_ORIGINAL_BYTES);
    const rejected = picked.find((f) => !ok.includes(f));
    setMessage(
      rejected
        ? { tone: "error", text: `${rejected.name}: use a PNG, JPEG, WebP or GIF under 15 MB.` }
        : null,
    );
    setFiles((current) => [...current, ...ok].slice(0, MAX_IMAGES));
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (preview) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = new FormData();
      data.set("title", title);
      data.set("body", body);
      data.set("requester_name", name);
      for (const [index, file] of files.entries()) {
        const blob = await shrinkImage(file);
        const ext = blob.type === "image/webp" ? "webp" : "jpg";
        data.append("images", blob, `image-${index + 1}.${ext}`);
      }
      const response = await fetch("/api/portal/requests", { method: "POST", body: data });
      if (response.status === 413) {
        // Vercel's body cap answers before our route does, and not in JSON.
        setMessage({ tone: "error", text: "Those images are too large together — try fewer." });
        return;
      }
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        issues?: { message: string }[];
      };
      if (!response.ok) {
        setMessage({
          tone: "error",
          text: result.issues?.[0]?.message ?? result.error ?? "That didn't send. Try again.",
        });
        return;
      }
      rememberName(name);
      setTitle("");
      setBody("");
      setFiles([]);
      setMessage({ tone: "success", text: "Request sent. You'll see its status in the list." });
      router.refresh();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "That didn't send. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title" htmlFor="request-title" required>
        <Input
          id="request-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          disabled={preview}
        />
      </Field>
      <Field label="What do you need, and why?" htmlFor="request-body" required>
        <Textarea
          id="request-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={6}
          required
          disabled={preview}
        />
      </Field>
      <Field label="Your name" htmlFor="request-name" required>
        <Input
          id="request-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoComplete="name"
          required
          disabled={preview}
        />
      </Field>

      <div className="space-y-1.5">
        <p id="request-images-label" className="text-xs font-medium text-[var(--text-secondary)]">
          Images <span className="font-normal text-[var(--text-tertiary)]">(optional, up to {MAX_IMAGES})</span>
        </p>
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-labelledby="request-images-label">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-inset)] px-2 py-1 text-xs text-[var(--text-secondary)]"
              >
                <span className="max-w-[12rem] truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {files.length < MAX_IMAGES && (
          <label className="relative inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--accent)]">
            <ImagePlus className="size-4" aria-hidden="true" />
            Add images
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED.join(",")}
              multiple
              className="sr-only"
              onChange={(e) => addFiles(e.target.files)}
              disabled={preview}
            />
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="lg" disabled={busy || preview}>
          {busy && <Loader2 className="animate-spin" />}
          Send request
        </Button>
        <p
          role="status"
          aria-live="polite"
          className={
            message?.tone === "error"
              ? "text-sm text-[var(--danger-text)]"
              : "text-sm text-[var(--success-text)]"
          }
        >
          {message?.text}
        </p>
      </div>
    </form>
  );
}
