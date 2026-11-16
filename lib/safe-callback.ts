/**
 * Same-site return URLs. A callback/return URL read from a query string must
 * never leave this origin: `//evil.com`, `/\evil.com` and `/<TAB>/evil.com`
 * (the URL parser strips tabs and newlines) all look relative but are not.
 *
 * Returns `pathname + search` of a same-origin URL, or "/" for anything else.
 */
export function safeCallbackPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  // Backslashes and control characters are rejected outright, never "fixed".
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return "/";
  try {
    const u = new URL(raw, "http://x");
    if (u.origin !== "http://x") return "/";
    // Dot segments can normalise to a path that starts with two slashes
    // (`/.//evil.com` -> `//evil.com`), which a redirect reads as another host.
    if (!u.pathname.startsWith("/") || u.pathname.startsWith("//")) return "/";
    return `${u.pathname}${u.search}`;
  } catch {
    return "/";
  }
}
