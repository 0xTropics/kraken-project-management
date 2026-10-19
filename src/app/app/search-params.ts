export type Search = Record<string, string | string[] | undefined>;

/** The first value of a search param, or "" — a repeated key keeps its first. */
export function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
