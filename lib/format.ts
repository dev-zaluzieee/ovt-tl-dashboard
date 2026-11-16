/**
 * Dates and money. Every day of the dashboard is a Europe/Prague day (the backend says so, L7 section 1): formatting
 * and day arithmetic never use the browser's zone. "Today" comes from the backend (`meta.today`), never `new Date()`.
 */

const TZ = 'Europe/Prague';

const partsFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export interface PragueParts {
  ymd: string;
  hour: number;
  minute: number;
}

/** Prague wall-clock parts of an instant (ISO string or ms). null for an unparsable value. */
export function pragueParts(input: string | number | null | undefined): PragueParts | null {
  if (input === null || input === undefined || input === '') return null;
  const ms = typeof input === 'number' ? input : Date.parse(input);
  if (Number.isNaN(ms)) return null;
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

export function pragueYmd(input: string | number): string | null {
  return pragueParts(input)?.ymd ?? null;
}

export function fmtTime(iso: string | null | undefined): string {
  const p = pragueParts(iso);
  return p ? `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` : '—';
}

export function fmtTimeRange(from: string | null | undefined, to: string | null | undefined): string {
  if (!from) return '—';
  return to ? `${fmtTime(from)}–${fmtTime(to)}` : fmtTime(from);
}

/** `16. 11. 2026` from a `YYYY-MM-DD` day. */
export function fmtYmd(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd ?? '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d}. ${m}. ${y}`;
}

/** `16. 11. 2026 14:35` from an instant, Prague time. */
export function fmtDateTime(iso: string | null | undefined): string {
  const p = pragueParts(iso);
  if (!p) return iso ? String(iso) : '—';
  return `${fmtYmd(p.ymd)} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** `16. 11.` short day of an instant. */
export function fmtShortDay(iso: string | null | undefined): string {
  const p = pragueParts(iso);
  if (!p) return '—';
  const [, m, d] = p.ymd.split('-').map(Number);
  return `${d}. ${m}.`;
}

/** `pondělí 16. listopadu 2026` */
export function fmtLongDay(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function shiftYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

export function isYmd(v: string | null | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function fmtKc(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `${new Intl.NumberFormat('cs-CZ').format(Math.round(n))} Kč`;
}

/** Plural of "událost" etc.: pick by Czech rules (1 / 2-4 / 5+). */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

/** Replaces ISO instants inside a text (`2026-11-16T15:44:04.706Z`) by Prague date and time, so no raw timestamp reaches the screen. */
export function humanizeTimestamps(text: string): string {
  return text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, (m) => fmtDateTime(m));
}
