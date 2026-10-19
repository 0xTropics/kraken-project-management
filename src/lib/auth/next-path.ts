/**
 * Where to send the operator after sign-in. `next` comes from the URL, so it is
 * attacker-chosen: `//evil.example`, `/\evil.example`, `/<TAB>/evil.example`,
 * and `/app/..//evil.example` all start with "/" yet can resolve to another
 * origin. Anything with a backslash or control character is refused outright.
 * The rest is resolved the way the browser will resolve it, dot segments and
 * percent-encoded dots included, and honoured only if the result stays on the
 * same origin with a path of `/app` or under `/app/`. The normalised path,
 * query, and hash are returned, never the raw input.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || /[\\\u0000-\u001f\u007f]/.test(next)) return "/app";
  const url = new URL(next, "http://n");
  if (url.origin !== "http://n" || !(url.pathname === "/app" || url.pathname.startsWith("/app/"))) return "/app";
  return url.pathname + url.search + url.hash;
}
