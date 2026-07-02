'use client';

/**
 * TL "prehled-dne → seznam" view.
 *
 * Self-contained: manages its own search / pagination / sort / density
 * state. Two operating modes:
 *   - No search (or < 3 chars): shows the currently selected day only
 *     (uses the `events` prop passed by parent).
 *   - Search ≥ 3 chars: fires against `/api/raynet/office-day-events/search`
 *     which does Raynet fulltext across the whole history. Result includes
 *     `totalCount`; we page through with a "Načíst další" button.
 *
 * Also owns the only TL-writable action on B2B: a checkbox toggle per row
 * (optimistic UI, PATCH to `/api/tl-raynet-events/:id/b2b`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { erpOrderDeepLink } from '@/lib/erpUrls';
import { officePortalOrderDeepLink } from '@/lib/officePortalUrls';
import { raynetEventDeepLink } from '@/lib/raynetUrls';
import type { CalendarEventRow } from './OfficeDayCalendarGrid';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { RetentionBadge } from '@/app/components/retention/RetentionBadge';
import { B2BBadge } from '@/app/components/shared/B2BBadge';

interface Props {
  /** Selected day's events (parent passes filtered set; used when search empty). */
  dayEvents: CalendarEventRow[];
  /** Day picker value — shown in the "no results" hint. */
  ymd: string;
  /** True when parent is fetching the day. Used to disable Load-more etc. */
  dayLoading?: boolean;
}

const PAGE_LIMIT = 100;
const FULLTEXT_MIN_CHARS = 3;

function formatDateTimeCs(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(t));
}

function eventScheduleMs(ev: CalendarEventRow): number {
  if (!ev.scheduledFrom) return 0;
  const iso = ev.scheduledFrom.includes('T')
    ? ev.scheduledFrom
    : ev.scheduledFrom.replace(' ', 'T');
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function ownerLabel(owners: CalendarEventRow['owners']): string {
  if (!owners || owners.length === 0) return '—';
  return owners
    .map((o) => o.raynet_name?.trim() || o.app_email || `#${o.raynet_id}`)
    .join(', ');
}

type SortKey = 'default' | 'scheduled' | 'owner' | 'customer';
type SortDir = 'asc' | 'desc';

export function OfficeDaySeznam({ dayEvents, ymd, dayLoading }: Props) {
  const [q, setQ] = useState('');
  const [density, setDensity] = useListDensity();
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Fulltext search state.
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRows, setSearchRows] = useState<CalendarEventRow[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchOffset, setSearchOffset] = useState(0);

  // Optimistic B2B state — orderId → override value (until re-fetch confirms).
  const [b2bOverride, setB2bOverride] = useState<Map<number, boolean>>(
    () => new Map()
  );
  const [b2bSaving, setB2bSaving] = useState<Set<number>>(() => new Set());

  const trimmed = q.trim();
  const fulltextActive = trimmed.length >= FULLTEXT_MIN_CHARS;

  // Fire fulltext search (debounced) when the query changes.
  useEffect(() => {
    if (!fulltextActive) {
      setSearchRows([]);
      setSearchTotal(0);
      setSearchOffset(0);
      setSearchError(null);
      return;
    }
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const qs = new URLSearchParams({
          fulltext: trimmed,
          offset: '0',
          limit: String(PAGE_LIMIT),
        });
        const res = await fetch(
          `/api/raynet/office-day-events/search?${qs.toString()}`,
          { signal: controller.signal, headers: { Accept: 'application/json' } }
        );
        const body = (await res.json()) as {
          success?: boolean;
          message?: string;
          data?: { events: CalendarEventRow[]; totalCount: number };
        };
        if (!res.ok || !body.success || !body.data) {
          setSearchError(body.message || `Chyba (${res.status})`);
          setSearchRows([]);
          setSearchTotal(0);
          setSearchOffset(0);
        } else {
          setSearchRows(body.data.events);
          setSearchTotal(body.data.totalCount);
          setSearchOffset(body.data.events.length);
        }
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return;
        setSearchError(e instanceof Error ? e.message : 'Chyba spojení.');
        setSearchRows([]);
        setSearchTotal(0);
        setSearchOffset(0);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [fulltextActive, trimmed]);

  const loadMore = useCallback(async () => {
    if (!fulltextActive || searchLoading) return;
    setSearchLoading(true);
    try {
      const qs = new URLSearchParams({
        fulltext: trimmed,
        offset: String(searchOffset),
        limit: String(PAGE_LIMIT),
      });
      const res = await fetch(
        `/api/raynet/office-day-events/search?${qs.toString()}`,
        { headers: { Accept: 'application/json' } }
      );
      const body = (await res.json()) as {
        success?: boolean;
        message?: string;
        data?: { events: CalendarEventRow[]; totalCount: number };
      };
      if (!res.ok || !body.success || !body.data) {
        setSearchError(body.message || `Chyba (${res.status})`);
      } else {
        setSearchRows((prev) => [...prev, ...body.data!.events]);
        setSearchTotal(body.data.totalCount);
        setSearchOffset((prev) => prev + body.data!.events.length);
      }
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Chyba spojení.');
    } finally {
      setSearchLoading(false);
    }
  }, [fulltextActive, searchLoading, trimmed, searchOffset]);

  const rows: CalendarEventRow[] = fulltextActive ? searchRows : dayEvents;

  const sortedRows = useMemo(() => {
    const cp = [...rows];
    if (sortKey === 'default') {
      // In search mode default = newest first (from Raynet DESC).
      // In day mode default = chronological (soonest first).
      cp.sort((a, b) => eventScheduleMs(a) - eventScheduleMs(b));
      if (fulltextActive) cp.reverse();
      return cp;
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    cp.sort((a, b) => {
      switch (sortKey) {
        case 'scheduled':
          return dir * (eventScheduleMs(a) - eventScheduleMs(b));
        case 'owner':
          return dir * ownerLabel(a.owners).localeCompare(ownerLabel(b.owners), 'cs');
        case 'customer': {
          const av = (a.order?.customerName || a.title || '').toLocaleLowerCase('cs');
          const bv = (b.order?.customerName || b.title || '').toLocaleLowerCase('cs');
          return dir * av.localeCompare(bv, 'cs');
        }
      }
    });
    return cp;
  }, [rows, sortKey, sortDir, fulltextActive]);

  const isCompact = density === 'compact';
  const cellPad = isCompact ? 'px-2 py-1' : 'px-3 py-2.5';

  const handleSort = (key: Exclude<SortKey, 'default'>) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else {
        setSortKey('default');
        setSortDir('desc');
      }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortMarker = (key: Exclude<SortKey, 'default'>) => {
    if (sortKey !== key) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const toggleB2b = useCallback(
    async (ev: CalendarEventRow) => {
      const current = b2bOverride.has(ev.raynetEventId)
        ? b2bOverride.get(ev.raynetEventId)!
        : ev.b2b;
      const next = !current;
      setB2bOverride((prev) => {
        const m = new Map(prev);
        m.set(ev.raynetEventId, next);
        return m;
      });
      setB2bSaving((prev) => {
        const s = new Set(prev);
        s.add(ev.raynetEventId);
        return s;
      });
      try {
        const res = await fetch(
          `/api/tl-raynet-events/${ev.raynetEventId}/b2b`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: next }),
          }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Chyba (${res.status})`);
        }
      } catch (e) {
        // Revert optimistic state.
        setB2bOverride((prev) => {
          const m = new Map(prev);
          m.set(ev.raynetEventId, current);
          return m;
        });
        console.error('[b2b toggle] failed', e);
      } finally {
        setB2bSaving((prev) => {
          const s = new Set(prev);
          s.delete(ev.raynetEventId);
          return s;
        });
      }
    },
    [b2bOverride]
  );

  const b2bValue = (ev: CalendarEventRow): boolean =>
    b2bOverride.has(ev.raynetEventId) ? b2bOverride.get(ev.raynetEventId)! : ev.b2b;

  return (
    <div className="space-y-4">
      {/* ── Search + toolbar ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Hledat (${FULLTEXT_MIN_CHARS}+ znaků prohledá celou historii, jinak jen dnešní den)…`}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 pr-8 text-sm placeholder:text-gray-400 focus:border-[#1E8449] focus:outline-none focus:ring-1 focus:ring-[#1E8449]"
          />
          {q.length > 0 && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Vymazat hledání"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>
        <DensityToggle density={density} onChange={setDensity} />
      </div>

      {/* Mode indicator */}
      {fulltextActive && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          Vyhledávání napříč celou historií:{' '}
          <span className="font-semibold">„{trimmed}"</span>
          {searchTotal > 0 && (
            <>
              {' '}
              — nalezeno {searchTotal}, zobrazeno {searchRows.length}.
            </>
          )}
        </div>
      )}

      {searchError && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {searchError}
        </div>
      )}

      {searchLoading && searchRows.length === 0 && (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────── */}
      {rows.length === 0 && !searchLoading && !dayLoading && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600 shadow-sm">
          <p className="font-medium text-gray-900">Žádné události</p>
          <p className="mt-2 text-sm">
            {fulltextActive
              ? `Fulltext „${trimmed}" nenalezl žádné shody.`
              : `Pro ${ymd} nejsou žádné události.`}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className={cellPad}>
                    <button
                      type="button"
                      onClick={() => handleSort('scheduled')}
                      className={`inline-flex items-center gap-1 ${sortKey === 'scheduled' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Termín <span className="text-[10px]">{sortMarker('scheduled')}</span>
                    </button>
                  </th>
                  <th className={cellPad}>Kategorie</th>
                  <th className={cellPad}>
                    <button
                      type="button"
                      onClick={() => handleSort('customer')}
                      className={`inline-flex items-center gap-1 ${sortKey === 'customer' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Zákazník / titul <span className="text-[10px]">{sortMarker('customer')}</span>
                    </button>
                  </th>
                  <th className={cellPad}>
                    <button
                      type="button"
                      onClick={() => handleSort('owner')}
                      className={`inline-flex items-center gap-1 ${sortKey === 'owner' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      OVT <span className="text-[10px]">{sortMarker('owner')}</span>
                    </button>
                  </th>
                  <th className={`${cellPad} text-center`}>B2B</th>
                  <th className={cellPad}>Signály</th>
                  <th className={`${cellPad} text-right`}>Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRows.map((ev) => {
                  const b2b = b2bValue(ev);
                  const saving = b2bSaving.has(ev.raynetEventId);
                  return (
                    <tr key={ev.raynetEventId} className="align-top">
                      <td className={`${cellPad} whitespace-nowrap text-gray-800`}>
                        {formatDateTimeCs(ev.scheduledFrom)}
                      </td>
                      <td className={`${cellPad} whitespace-nowrap text-gray-600`}>
                        {ev.categoryLabel ?? '—'}
                      </td>
                      <td className={cellPad}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {ev.order?.customerName?.trim() || ev.title}
                          </span>
                          <B2BBadge b2b={b2b} size="xs" />
                        </div>
                        {ev.order && !isCompact && (
                          <div className="text-xs text-gray-400">
                            #{ev.order.id}
                          </div>
                        )}
                      </td>
                      <td className={`${cellPad} whitespace-nowrap text-gray-700`}>
                        {ownerLabel(ev.owners)}
                      </td>
                      <td className={`${cellPad} text-center`}>
                        <label className="inline-flex cursor-pointer items-center gap-1">
                          <input
                            type="checkbox"
                            checked={b2b}
                            disabled={saving}
                            onChange={() => void toggleB2b(ev)}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                            aria-label={`B2B pro událost ${ev.raynetEventId}`}
                          />
                        </label>
                      </td>
                      <td className={cellPad}>
                        <div className="flex flex-wrap items-center gap-1">
                          <RetentionBadge
                            inRetention={ev.inRetention}
                            inRetentionRequested={ev.inRetentionRequested}
                          />
                          {ev.order?.admfExportStatus === 'exported' && (
                            <span
                              className="rounded-md border border-emerald-500 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900"
                              title="ADMF exportováno"
                            >
                              ADMF ✓
                            </span>
                          )}
                          {ev.order?.admfExportStatus === 'not_exported' && (
                            <span
                              className="rounded-md border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
                              title="ADMF neexportováno"
                            >
                              ADMF ⚠
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`${cellPad} whitespace-nowrap text-right`}>
                        <div className="flex flex-nowrap justify-end gap-1.5">
                          <a
                            href={raynetEventDeepLink(ev.raynetEventId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 rounded-md border border-[#1E8449] px-2 py-1 text-xs font-medium text-[#1E8449] hover:bg-[#F1F8F4]"
                          >
                            Raynet
                          </a>
                          {ev.order && (
                            <a
                              href={officePortalOrderDeepLink(ev.order.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Portál
                            </a>
                          )}
                          {ev.order?.source_erp_order_id != null && (
                            <a
                              href={erpOrderDeepLink(ev.order.source_erp_order_id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-md border border-[#1565C0] px-2 py-1 text-xs font-medium text-[#1565C0] hover:bg-[#E3F2FD]"
                            >
                              ERP
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {fulltextActive && searchRows.length < searchTotal && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-600">
                Zobrazeno {searchRows.length} z {searchTotal}
              </p>
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={searchLoading}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                {searchLoading ? 'Načítání…' : 'Načíst další'}
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
