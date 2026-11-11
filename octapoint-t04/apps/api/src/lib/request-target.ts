/**
 * Returns the request target ("/api/v1/path?query") to sign or verify.
 * - Origin-form input ("/api/v1/x?a=1", what a Node server receives in req.url) is returned unchanged:
 *   this is "exactly as sent".
 * - A full URL ("https://host/api/v1/x?a=1", what fetch/Hono expose) is reduced to path + query
 *   without re-encoding. An empty query ("?") cannot be told apart from no query in this form.
 */
export function requestTarget(input: string): string {
  if (input.startsWith('/')) return input;
  const url = new URL(input);
  return url.pathname + url.search;
}
