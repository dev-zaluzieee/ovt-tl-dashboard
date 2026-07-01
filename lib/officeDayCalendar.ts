/**
 * Výpočty pro denní kalendář obchodníků (časová osa v lokálním čase pro vybrané datum).
 */

/** Výchozí pracovní okno [8:00, 19:00) — sloupce začínají v 8:00, poslední slot 18:00–19:00. */
export const DEFAULT_DAY_START_HOUR = 8;
/** Hodina *za koncem* posledního slotu (half-open interval konec dne v mřížce). */
export const DEFAULT_DAY_END_EXCLUSIVE = 19;

export type OfficeDayEventLike = {
  scheduledFrom: string | null;
  scheduledTill: string | null;
};

/** Parsuje datum z API (ISO nebo „YYYY-MM-DD HH:mm“) na ms, nebo null. */
export function parseEventMs(raw: string | null): number | null {
  if (!raw) {
    return null;
  }
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** Začátek kalendářního dne v lokálním čase (00:00). */
export function localDayStartMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** Začátek dané hodiny v lokálním čase uvnitř vybraného dne. */
export function localHourStartMs(ymd: string, hour: number): number {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d, hour, 0, 0, 0).getTime();
}

/** Počet hodin od půlnoci lokálně (0–24+ pro jistotu s DST). */
function hoursSinceLocalMidnight(ms: number, day0: number): number {
  return (ms - day0) / (60 * 60 * 1000);
}

/**
 * Určí mřížku [startHour, endExclusive) rozšířenou podle událostí.
 * Výchozí okno odpovídá [8:00, 19:00) — poslední zobrazený slot začíná v 18:00.
 */
export function computeVisibleHourRange(
  ymd: string,
  events: OfficeDayEventLike[],
  opts?: {
    defaultStartHour?: number;
    defaultEndExclusive?: number;
  }
): { startHour: number; endExclusive: number } {
  const defStart = opts?.defaultStartHour ?? DEFAULT_DAY_START_HOUR;
  const defEndEx = opts?.defaultEndExclusive ?? DEFAULT_DAY_END_EXCLUSIVE;

  const day0 = localDayStartMs(ymd);
  const dayEnd = day0 + 24 * 60 * 60 * 1000;

  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;

  for (const ev of events) {
    const a = parseEventMs(ev.scheduledFrom);
    let b = parseEventMs(ev.scheduledTill);
    if (a == null && b == null) {
      continue;
    }
    if (a != null && b == null) {
      b = a + 60 * 60 * 1000;
    }
    if (a == null && b != null) {
      const aa = b - 60 * 60 * 1000;
      const lo = Math.max(aa, day0);
      const hi = Math.min(b, dayEnd);
      if (hi > lo) {
        minMs = Math.min(minMs, lo);
        maxMs = Math.max(maxMs, hi);
      }
      continue;
    }
    if (a != null && b != null && b < a) {
      b = a + 30 * 60 * 1000;
    }
    if (a != null && b != null) {
      const lo = Math.max(a, day0);
      const hi = Math.min(b, dayEnd);
      if (hi > lo) {
        minMs = Math.min(minMs, lo);
        maxMs = Math.max(maxMs, hi);
      }
    }
  }

  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    return { startHour: defStart, endExclusive: defEndEx };
  }

  const startH = Math.floor(hoursSinceLocalMidnight(minMs, day0));
  const endHExcl = Math.ceil(hoursSinceLocalMidnight(maxMs, day0) - 1e-9);

  let startHour = Math.min(defStart, startH);
  let endExclusive = Math.max(defEndEx, endHExcl);

  startHour = Math.max(0, Math.min(startHour, 23));
  endExclusive = Math.max(startHour + 1, Math.min(endExclusive, 24));

  return { startHour, endExclusive };
}

export type ClampedInterval = {
  startMs: number;
  endMs: number;
  /** 0–1 vzhledem k celé viditelné časové ose */
  leftPct: number;
  widthPct: number;
};

/**
 * Přemapuje interval události na procenta uvnitř [gridStartMs, gridEndMs).
 * Mimo okno ořízne; neplatné časy → null.
 */
export function eventBarGeometry(
  ev: OfficeDayEventLike,
  ymd: string,
  gridStartHour: number,
  gridEndExclusive: number
): ClampedInterval | null {
  const day0 = localDayStartMs(ymd);
  const gridStartMs = localHourStartMs(ymd, gridStartHour);
  const gridEndMs = localHourStartMs(ymd, gridEndExclusive);
  const total = gridEndMs - gridStartMs;
  if (total <= 0) {
    return null;
  }

  let s = parseEventMs(ev.scheduledFrom);
  let e = parseEventMs(ev.scheduledTill);

  if (s == null && e == null) {
    return null;
  }
  if (s == null && e != null) {
    s = e - 60 * 60 * 1000;
  }
  if (e != null && s != null && e < s) {
    e = s + 30 * 60 * 1000;
  }
  if (e == null && s != null) {
    e = s + 60 * 60 * 1000;
  }
  if (s == null || e == null) {
    return null;
  }

  const lo = Math.max(s, gridStartMs);
  const hi = Math.min(e, gridEndMs);
  if (hi <= lo) {
    return null;
  }

  const leftPct = ((lo - gridStartMs) / total) * 100;
  const widthPct = ((hi - lo) / total) * 100;
  return { startMs: lo, endMs: hi, leftPct, widthPct };
}

/**
 * Horizontální pozice „teď“ v časové ose (0–100 %), stejně jako u pruhů událostí.
 * Vrátí hodnotu jen pokud `ymd` odpovídá kalendářnímu dni `nowMs` v lokálním čase.
 * Čas mimo [gridStartHour, gridEndExclusive) se ořízne na okraj mřížky.
 */
export function nowIndicatorLeftPct(
  ymd: string,
  gridStartHour: number,
  gridEndExclusive: number,
  nowMs: number = Date.now()
): number | null {
  const parts = ymd.split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return null;
  }
  const [yy, mm, dd] = parts;
  const t = new Date(nowMs);
  if (t.getFullYear() !== yy || t.getMonth() !== mm - 1 || t.getDate() !== dd) {
    return null;
  }
  const gridStartMs = localHourStartMs(ymd, gridStartHour);
  const gridEndMs = localHourStartMs(ymd, gridEndExclusive);
  const total = gridEndMs - gridStartMs;
  if (total <= 0) {
    return null;
  }
  const clamped = Math.min(Math.max(nowMs, gridStartMs), gridEndMs);
  return ((clamped - gridStartMs) / total) * 100;
}

/** Přiřadí pruhům „linky“ (0,1,…) aby se překrývající události nestrhávaly. */
export function assignOverlapLanes<T extends { startMs: number; endMs: number }>(
  items: T[]
): (T & { lane: number })[] {
  const sorted = [...items].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const laneEnds: number[] = [];
  const out: (T & { lane: number })[] = [];

  for (const it of sorted) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > it.startMs) {
      lane += 1;
    }
    if (lane === laneEnds.length) {
      laneEnds.push(it.endMs);
    } else {
      laneEnds[lane] = it.endMs;
    }
    out.push({ ...it, lane });
  }
  return out;
}

/** Hodiny pro hlavičku tabulky: startHour .. endExclusive-1 */
export function hourLabels(startHour: number, endExclusive: number): number[] {
  const a: number[] = [];
  for (let h = startHour; h < endExclusive; h += 1) {
    a.push(h);
  }
  return a;
}
