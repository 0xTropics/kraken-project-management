"use client";

import { toast } from "sonner";

export interface ApiFailure {
  error: string;
  code?: string | null;
  issues?: { path: string; message: string }[];
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: ApiFailure,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/**
 * The single fetch wrapper for every mutation in the client. Throws a typed
 * error carrying the server's field-level issues, so forms can show them
 * inline rather than as an opaque toast.
 */
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const failure = parsed as ApiFailure;
    throw new ApiRequestError(
      response.status,
      failure.error ?? `Request failed (${response.status})`,
      failure,
    );
  }
  return parsed as T;
}

/**
 * Maps the API's `issues` onto `{ field: message }` for inline display. An
 * issue with no path, or a failure with no issues, lands on `_form`; anything
 * that is not an API failure maps to `{}`.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiRequestError)) return {};
  const issues = error.body.issues ?? [];
  if (issues.length === 0) return { _form: error.message };
  const out: Record<string, string> = {};
  for (const issue of issues) out[issue.path || "_form"] = issue.message;
  return out;
}

/** Runs a mutation, surfaces failures as a toast, and returns null on failure. */
export async function run<T>(
  promise: Promise<T>,
  messages: { success?: string; error?: string } = {},
): Promise<T | null> {
  try {
    const result = await promise;
    if (messages.success) toast.success(messages.success);
    return result;
  } catch (error) {
    const message =
      error instanceof ApiRequestError
        ? error.message
        : (messages.error ?? "Something went wrong");
    toast.error(message);
    return null;
  }
}
