/**
 * Base URL of the finance backend (`FINANCE_API_URL`, WITHOUT a path), server-side only. The Hotovost pages call
 * `${FINANCE_API_URL}/api/tl/cash/*` with the user's own SSO access token. Unset (or not http/https) = Hotovost is not set
 * up: the pages say so, the navigation entry stays; nothing falls back to a default address.
 */

export function getFinanceUrl(): string | null {
  const url = process.env.FINANCE_API_URL?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return url.replace(/\/+$/, '');
}
