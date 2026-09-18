/**
 * Search params arrive as `?status=&page=2` from a form that submits every
 * field. An empty string is not "draft" and not "no filter" to zod, so strip
 * blanks here and let the schemas treat absence as the default.
 */
export function cleanParams(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
): Record<string, string> {
  const entries =
    input instanceof URLSearchParams ? [...input.entries()] : Object.entries(input);

  const out: Record<string, string> = {};
  for (const [key, raw] of entries) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.trim() !== '') out[key] = value.trim();
  }
  return out;
}
