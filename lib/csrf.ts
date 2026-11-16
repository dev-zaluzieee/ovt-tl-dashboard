/**
 * CSRF guard of the BFF for state-changing requests: the browser must say the request comes from OUR origin
 * (`Origin`, else `Referer`). A JSON body must be `application/json` (a cross-site HTML form cannot send it without a
 * CORS preflight); the one raw upload route is exempt from the content-type rule (its type is the file's) and instead
 * requires the custom `X-File-Name` header, which a cross-site form cannot set either. Pure.
 */

export interface CsrfInput {
  method: string;
  origin: string | null;
  referer: string | null;
  contentType: string | null;
  hasBody: boolean;
  /** The raw file upload route: content type is the file's, `X-File-Name` required. */
  rawUpload: boolean;
  hasFileNameHeader: boolean;
  /** `NEXTAUTH_URL` origin (or the request's own origin when it is not set). */
  appOrigin: string;
}

export type CsrfVerdict = { ok: true } | { ok: false; reason: 'ORIGIN' | 'CONTENT_TYPE' };

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function checkCsrf(i: CsrfInput): CsrfVerdict {
  const m = i.method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return { ok: true };
  const seen = i.origin && i.origin !== 'null' ? originOf(i.origin) : i.origin === null ? originOf(i.referer) : null;
  if (!seen || seen !== i.appOrigin) return { ok: false, reason: 'ORIGIN' };
  if (i.rawUpload) {
    if (!i.hasFileNameHeader) return { ok: false, reason: 'CONTENT_TYPE' };
  } else if (i.hasBody && !/^application\/json\s*(;|$)/i.test(i.contentType ?? '')) {
    return { ok: false, reason: 'CONTENT_TYPE' };
  }
  return { ok: true };
}
