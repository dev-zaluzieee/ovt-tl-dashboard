/**
 * Geometry of the day calendar (time axis in Europe/Prague wall-clock time; the backend's `now` draws the marker).
 * Pure.
 */

import { pragueParts } from './format';

export const DEFAULT_START_HOUR = 8;
export const DEFAULT_END_EXCLUSIVE = 19;

export interface TimedLike {
  startsAt: string;
  endsAt: string | null;
}

/** Minutes since Prague midnight of `ymd` for an instant; clamped to the day (0..1440). */
function minutesOnDay(iso: string, ymd: string): number | null {
  const p = pragueParts(iso);
  if (!p) return null;
  if (p.ymd < ymd) return 0;
  if (p.ymd > ymd) return 1440;
  return p.hour * 60 + p.minute;
}

/** Interval of an event in minutes of the day; a missing end = 60 min, an end before the start = 30 min. */
export function eventMinutes(ev: TimedLike, ymd: string): { start: number; end: number } | null {
  const s = minutesOnDay(ev.startsAt, ymd);
  if (s === null) return null;
  let e = ev.endsAt ? minutesOnDay(ev.endsAt, ymd) : null;
  if (e === null) e = s + 60;
  if (e <= s) e = s + 30;
  return { start: s, end: Math.min(e, 1440) };
}

/** Grid [startHour, endExclusive), widened to fit the events. */
export function visibleHourRange(ymd: string, events: TimedLike[]): { startHour: number; endExclusive: number } {
  let startHour = DEFAULT_START_HOUR;
  let endExclusive = DEFAULT_END_EXCLUSIVE;
  for (const ev of events) {
    const m = eventMinutes(ev, ymd);
    if (!m) continue;
    startHour = Math.min(startHour, Math.floor(m.start / 60));
    endExclusive = Math.max(endExclusive, Math.ceil(m.end / 60));
  }
  startHour = Math.max(0, Math.min(startHour, 23));
  endExclusive = Math.max(startHour + 1, Math.min(endExclusive, 24));
  return { startHour, endExclusive };
}

export interface Bar<T> {
  item: T;
  leftPct: number;
  widthPct: number;
  start: number;
  end: number;
  lane: number;
}

export function barGeometry(ev: TimedLike, ymd: string, startHour: number, endExclusive: number): { leftPct: number; widthPct: number; start: number; end: number } | null {
  const m = eventMinutes(ev, ymd);
  if (!m) return null;
  const g0 = startHour * 60;
  const g1 = endExclusive * 60;
  const lo = Math.max(m.start, g0);
  const hi = Math.min(m.end, g1);
  if (hi <= lo) return null;
  const total = g1 - g0;
  return { leftPct: ((lo - g0) / total) * 100, widthPct: ((hi - lo) / total) * 100, start: lo, end: hi };
}

/** Overlapping bars get their own lanes so they never cover each other. */
export function assignLanes<T>(bars: Array<Omit<Bar<T>, 'lane'>>): Bar<T>[] {
  const sorted = [...bars].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  return sorted.map((b) => {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > b.start) lane += 1;
    if (lane === laneEnds.length) laneEnds.push(b.end);
    else laneEnds[lane] = b.end;
    return { ...b, lane };
  });
}

/** Position of "now" on the axis (0-100 %); null unless `nowMs` is on `ymd` (Prague). */
export function nowLeftPct(ymd: string, startHour: number, endExclusive: number, nowMs: number): number | null {
  const p = pragueParts(nowMs);
  if (!p || p.ymd !== ymd) return null;
  const g0 = startHour * 60;
  const g1 = endExclusive * 60;
  const m = Math.min(Math.max(p.hour * 60 + p.minute, g0), g1);
  return ((m - g0) / (g1 - g0)) * 100;
}
