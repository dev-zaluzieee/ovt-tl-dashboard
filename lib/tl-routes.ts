/**
 * Allow-list of backend routes (`/api/tl2/*`) the browser may reach through `/api/tl/*`.
 * Pure. Everything else answers 404, so the BFF is never an open relay to the whole backend.
 * Segments are plain `[A-Za-z0-9-]` (no dots, no encoded characters); ids are numeric.
 * The recordings routes (`calls/lookup`, `calls/customer-phones`) are NOT here: they are called by the app's own
 * server routes (`/api/calls/*`), which also hold the recordings service client.
 */

export type ProxyMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Event / order / resolution / target id: numeric, no leading zero. */
const ID = '[1-9][0-9]{0,15}';

interface Route {
  method: ProxyMethod;
  re: RegExp;
  /** Query parameters forwarded to the backend (everything else is dropped). */
  query?: readonly string[];
  /** Has a JSON body. */
  body?: boolean;
}

const DATES = ['from', 'to'] as const;
const PERSON = ['person'] as const;

const ROUTES: readonly Route[] = [
  { method: 'GET', re: /^meta$/ },
  { method: 'GET', re: /^people$/, query: ['side'] },
  { method: 'GET', re: /^search$/, query: ['q', 'scope', 'limit'] },
  { method: 'GET', re: /^resolutions$/, query: ['kind', 'key'] },
  { method: 'POST', re: new RegExp(`^resolutions/${ID}/undo$`) },

  { method: 'GET', re: /^ovt\/day$/, query: ['date', 'person', 'q'] },
  { method: 'POST', re: new RegExp(`^ovt/orders/${ID}/b2b$`), body: true },
  { method: 'GET', re: /^ovt\/problems$/, query: ['kind', 'current', ...DATES, 'reason', ...PERSON, 'q', 'closed'] },
  { method: 'POST', re: /^ovt\/problems\/close$/, body: true },
  { method: 'POST', re: /^ovt\/problems\/nedopadlo$/, body: true },
  { method: 'GET', re: /^ovt\/results$/, query: [...DATES, ...PERSON] },
  { method: 'GET', re: /^ovt\/results\/visits$/, query: [...DATES, ...PERSON, 'bucket', 'reason'] },

  { method: 'GET', re: /^mvt\/day$/, query: ['date', 'person', 'q'] },
  { method: 'GET', re: /^mvt\/overview$/ },
  { method: 'GET', re: /^mvt\/missing$/, query: [...DATES, 'includeHandled', ...PERSON] },
  { method: 'POST', re: /^mvt\/missing\/close$/, body: true },
  { method: 'GET', re: /^mvt\/reopens$/, query: [...DATES, ...PERSON, 'open', 'side'] },
  { method: 'POST', re: new RegExp(`^mvt/events/${ID}/reopen$`), body: true },
  { method: 'GET', re: /^mvt\/doplatek$/, query: [...DATES, 'includeResolved', ...PERSON, 'severity'] },
  { method: 'POST', re: /^mvt\/doplatek\/resolve$/, body: true },
  { method: 'GET', re: /^mvt\/rescues$/, query: [...DATES, ...PERSON, 'q'] },
  { method: 'GET', re: /^mvt\/montaz-claims$/, query: [...DATES, 'includeResolved', ...PERSON] },
  { method: 'GET', re: /^mvt\/submissions$/, query: ['status', 'outcome', 'fitter', 'q', 'eventId', ...DATES, 'page', 'perPage'] },
  { method: 'GET', re: new RegExp(`^mvt/submissions/${ID}$`) },

  { method: 'GET', re: /^calls\/search$/, query: ['q'] },

  { method: 'GET', re: /^review-qr$/ },
  { method: 'PUT', re: /^review-qr\/settings$/, body: true },
  { method: 'PUT', re: /^review-qr\/defaults$/, body: true },
  { method: 'PUT', re: /^review-qr\/regions$/, body: true },
  { method: 'POST', re: /^review-qr\/targets$/, body: true },
  { method: 'PUT', re: new RegExp(`^review-qr/targets/${ID}$`), body: true },
  { method: 'DELETE', re: new RegExp(`^review-qr/targets/${ID}$`) },
  { method: 'GET', re: /^review-qr\/prompts$/, query: ['days', 'limit'] },
];

export function matchRoute(method: string, segments: readonly string[]): Route | null {
  if (segments.length === 0 || segments.length > 5) return null;
  if (segments.some((s) => !/^[A-Za-z0-9-]{1,40}$/.test(s))) return null;
  const path = segments.join('/');
  return ROUTES.find((r) => r.method === method && r.re.test(path)) ?? null;
}

/** JSON bodies are small; anything bigger is refused before it is read. */
export const JSON_MAX_BYTES = 256 * 1024;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[1-9][0-9]{0,15}$/;
const INT_RE = /^[0-9]{1,5}$/;

/** Validates one forwarded query value; false = refuse (the request is answered 400, nothing reaches the backend). */
export function validQueryValue(key: string, value: string): boolean {
  switch (key) {
    case 'date':
    case 'from':
    case 'to':
      return DATE_RE.test(value);
    case 'person':
      return value === 'none' || ID_RE.test(value);
    case 'eventId':
      return ID_RE.test(value);
    case 'q':
    case 'fitter':
      return value.length >= 1 && value.length <= 100 && !/[\u0000-\u001f]/.test(value);
    case 'current':
    case 'includeHandled':
    case 'includeResolved':
    case 'open':
      return value === '1' || value === 'true';
    case 'closed':
      return value === 'hide' || value === 'show' || value === 'only';
    case 'side':
      return value === 'ovt' || value === 'mvt' || value === 'all';
    case 'scope':
      return value === 'ovt' || value === 'mvt' || value === 'all';
    case 'kind':
    case 'status':
      return /^[a-z_,]{1,80}$/.test(value);
    case 'reason':
    case 'bucket':
    case 'outcome':
    case 'severity':
      return /^[a-z_]{1,40}$/.test(value);
    case 'key':
      return /^[\w:-]{1,40}$/.test(value);
    case 'limit':
    case 'days':
    case 'page':
    case 'perPage':
      return INT_RE.test(value);
    default:
      return false;
  }
}
