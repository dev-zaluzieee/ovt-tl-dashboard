'use client';

/**
 * Poslané na retence — durable audit list of TL-routed retention sends.
 *
 * Source: ceniky-2 `retention_logs` rows with `tl_user_id` set, over a date
 * window. Read-only. Per-TL summary + filter on top; each row shows who sent
 * it, the reason, and the office follow-up (still queued / taken / rejected),
 * with deep links out to the office portal (order + history), Raynet and ERP.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  officePortalOrderDeepLink,
  officePortalOrderHistoryDeepLink,
} from '@/lib/officePortalUrls';
import { erpOrderDeepLink } from '@/lib/erpUrls';
import { raynetEventDeepLink } from '@/lib/raynetUrls';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';

interface SendRow {
  id: string;
  order_id: string | null;
  tl_user_id: string;
  user_id: string;
  reason: string;
  created_at: string;
  decision: string | null;
  processed_at: string | null;
  processed_by: string | null;
  order_customer_name: string | null;
  order_source_erp_order_id: string | null;
  order_source_raynet_event_id: string | null;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateTimeCs(iso: string): string {
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/** TL-routed reason is stored as "Posláno team leaderem OVT - <tl>: <text>";
 *  the TL is its own column here, so keep only <text> and drop placeholder "-". */
function cleanReason(reason: string): string | null {
  const s = (reason ?? '').trim();
  if (!s) return null;
  const idx = s.indexOf(': ');
  const tail = idx >= 0 ? s.slice(idx + 2).trim() : s;
  return tail && tail !== '-' ? tail : null;
}

interface OfficeStatus {
  label: string;
  cls: string;
  sub: string | null;
}

function officeStatus(r: SendRow): OfficeStatus {
  if (!r.processed_at) {
    return {
      label: 'Čeká ve frontě',
      cls: 'border-amber-400 bg-amber-50 text-amber-800',
      sub: null,
    };
  }
  const when = formatDateTimeCs(r.processed_at);
  const by = r.processed_by ? ` · ${r.processed_by}` : '';
  if (r.decision === 'REJECTED') {
    return {
      label: 'Zamítnuto',
      cls: 'border-rose-400 bg-rose-50 text-rose-800',
      sub: `${when}${by}`,
    };
  }
  return {
    label: 'Převzato do retence',
    cls: 'border-emerald-500 bg-emerald-50 text-emerald-900',
    sub: `${when}${by}`,
  };
}

const ALL = '__all__';

export function TlRetentionSendsClient() {
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return ymd(d);
  });
  const [to, setTo] = useState<string>(() => ymd(new Date()));

  const [rows, setRows] = useState<SendRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tlFilter, setTlFilter] = useState<string>(ALL);

  const [density, setDensity] = useListDensity();
  const isCompact = density === 'compact';
  const cellPad = isCompact ? 'px-2 py-1' : 'px-3 py-2.5';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(`/api/tl-retention-sends?${qs.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      const body = (await res.json()) as {
        success?: boolean;
        message?: string;
        data?: SendRow[];
      };
      if (!res.ok || !body.success || !body.data) {
        setError(body.message || `Chyba při načítání (${res.status})`);
        setRows(null);
        return;
      }
      setRows(body.data);
    } catch {
      setError('Nepodařilo se spojit se serverem.');
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Per-TL counts across the whole (unfiltered) window.
  const perTl = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.tl_user_id, (m.get(r.tl_user_id) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const visibleRows = useMemo(() => {
    const list = rows ?? [];
    return tlFilter === ALL ? list : list.filter((r) => r.tl_user_id === tlFilter);
  }, [rows, tlFilter]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-gray-500">
            Od
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-normal normal-case text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
          <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-gray-500">
            Do
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-normal normal-case text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
          {perTl.length > 1 && (
            <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-gray-500">
              Team leader
              <select
                value={tlFilter}
                onChange={(e) => setTlFilter(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-normal normal-case text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value={ALL}>Všichni</option>
                {perTl.map(([tl]) => (
                  <option key={tl} value={tl}>
                    {tl}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DensityToggle density={density} onChange={setDensity} />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Načítání…' : 'Obnovit'}
          </button>
        </div>
      </div>

      {/* Per-TL summary */}
      {rows != null && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTlFilter(ALL)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              tlFilter === ALL
                ? 'border-[#1E8449] bg-[#E8F5E9] text-[#1E8449]'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Vše: {rows.length}
          </button>
          {perTl.map(([tl, n]) => (
            <button
              key={tl}
              type="button"
              onClick={() => setTlFilter(tl)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                tlFilter === tl
                  ? 'border-[#1E8449] bg-[#E8F5E9] text-[#1E8449]'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tl}: {n}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading && !rows && (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {rows != null && rows.length === 0 && !loading && (
        <p className="text-sm text-gray-600">
          V tomto období TL neposlal do retence žádnou zakázku.
        </p>
      )}

      {rows != null && rows.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className={cellPad}>Zakázka</th>
                  <th className={cellPad}>Poslal TL</th>
                  <th className={cellPad}>Důvod</th>
                  <th className={cellPad}>Stav v retenci</th>
                  <th className={`${cellPad} text-right`}>Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.map((r) => {
                  const st = officeStatus(r);
                  const reason = cleanReason(r.reason);
                  const orderId = r.order_id;
                  return (
                    <tr key={r.id} className="align-top border-l-4 border-l-emerald-500">
                      <td className={`${cellPad} whitespace-nowrap`}>
                        <div className="font-medium text-gray-900">
                          {r.order_customer_name ??
                            (orderId ? `Zakázka #${orderId}` : '(bez zakázky)')}
                        </div>
                        {r.user_id && (
                          <div className="text-xs text-gray-500">OVT: {r.user_id}</div>
                        )}
                        {!isCompact && orderId && (
                          <div className="text-xs text-gray-400">#{orderId}</div>
                        )}
                      </td>
                      <td className={`${cellPad} whitespace-nowrap text-gray-700`}>
                        <div className="truncate">{r.tl_user_id}</div>
                        <div className="text-xs text-gray-400">
                          {formatDateTimeCs(r.created_at)}
                        </div>
                      </td>
                      <td className={cellPad}>
                        {reason ? (
                          <p
                            className={`text-gray-800 ${isCompact ? 'line-clamp-2' : 'whitespace-pre-line'}`}
                            title={isCompact ? reason : undefined}
                          >
                            {reason}
                          </p>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className={cellPad}>
                        <span
                          className={`inline-block w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${st.cls}`}
                        >
                          {st.label}
                        </span>
                        {st.sub && !isCompact && (
                          <div className="mt-0.5 text-xs text-gray-400">{st.sub}</div>
                        )}
                      </td>
                      <td className={`${cellPad} whitespace-nowrap text-right`}>
                        <div className="flex flex-nowrap justify-end gap-1.5">
                          {orderId && (
                            <>
                              <a
                                href={officePortalOrderHistoryDeepLink(orderId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 rounded-md border border-[#1E8449] px-2 py-1 text-xs font-medium text-[#1E8449] hover:bg-[#F1F8F4]"
                              >
                                Historie
                              </a>
                              <a
                                href={officePortalOrderDeepLink(orderId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 rounded-md border border-[#1565C0] px-2 py-1 text-xs font-medium text-[#1565C0] hover:bg-[#E3F2FD]"
                              >
                                Zakázka
                              </a>
                            </>
                          )}
                          {r.order_source_raynet_event_id != null && (
                            <a
                              href={raynetEventDeepLink(r.order_source_raynet_event_id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-md border border-amber-500 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                            >
                              Raynet
                            </a>
                          )}
                          {r.order_source_erp_order_id != null && (
                            <a
                              href={erpOrderDeepLink(r.order_source_erp_order_id)}
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
        </div>
      )}
    </div>
  );
}
