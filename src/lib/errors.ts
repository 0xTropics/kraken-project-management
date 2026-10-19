/** Errors that carry an HTTP status and a client-safe message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (m: string, code?: string) => new ApiError(400, m, code);
export const unauthorized = (m = "Not authenticated") => new ApiError(401, m, "unauthorized");
export const forbidden = (m = "Not permitted") => new ApiError(403, m, "forbidden");
export const notFound = (m = "Not found") => new ApiError(404, m, "not_found");
export const conflict = (m: string, code?: string) => new ApiError(409, m, code);
export const tooManyRequests = (m: string) => new ApiError(429, m, "rate_limited");
