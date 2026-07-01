'use client';

/**
 * Landing list for the Daktela call review workflow. Shows orders whose phone
 * numbers cross-reference with recorded calls; each row deep-links to that
 * customer's /klient/[id]/hovory page for actual playback.
 *
 * All processing is server-side (see /api/orders-with-calls). This client
 * only handles filtering + display.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { erpOrderDeepLink } from '@/lib/erpUrls';
import { officePortalOrderDeepLink } from '@/lib/officePortalUrls';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';

interface OrderRow {
  id: number;
  raynet_id: number | null;
  name: string | null;
  phone: string | null;
  phone_key: string;
  user_id: string | null;
  source_erp_order_id: number | null;
  created_at: string;
  call_count: number;
  last_call_time: string | null;
  agents: string[];
}

function formatDateTimeCs(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(t));
}

function formatDateCs(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(t));
}

export function OrdersWithCallsClient() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [ovtFilter, setOvtFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [density, setDensity] = useListDensity();
  const isCompact = density === 'compact';
  const cellPad = isCompact ? 'px-2 py-1' : 'px-3 py-2.5';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(
        `/api/orders-with-calls${qs.size > 0 ? `?${qs}` : ''}`,
        { headers: { Accept: 'application/json' } }
      );
      const body = (await res.json()) as {
        success?: boolean;
        message?: string;
        data?: { orders: OrderRow[] };
      };
      if (!res.ok || !body.success || !body.data) {
        setError(body.message || `Chyba při načítání (${res.status})`);
        setRows([]);
        return;
      }
      setRows(body.data.orders);
    } catch {
      setError('Nepodařilo se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const ovts = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.user_id) s.add(r.user_id);
    return [...s].sort((a, b) => a.localeCompare(b, 'cs'));
  }, [rows]);

  const agents = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) for (const a of r.agents) s.add(a);
    return [...s].sort((a, b) => a.localeCompare(b, 'cs'));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (ovtFilter && r.user_id !== ovtFilter) return false;
      if (agentFilter && !r.agents.includes(agentFilter)) return false;
      if (needle.length > 0) {
        const parts = [
          r.name,
          r.phone,
          r.phone_key,
          r.user_id,
          `#${r.id}`,
          String(r.id),
          r.source_erp_order_id != null ? String(r.source_erp_order_id) : '',
        ];
        if (
          !parts.some((p) => (p ?? '').toLowerCase().includes(needle))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rows, ovtFilter, agentFilter, q]);

  return (
    <div className="space-y-5">
      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700" htmlFor="from">
            Od:
          </label>
          <input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
          <label className="text-sm font-medium text-gray-700" htmlFor="to">
            Do:
          </label>
          <input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Vymazat
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={ovtFilter}
            onChange={(e) => setOvtFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="">OVT: všichni</option>
            {ovts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="">Agent: všichni</option>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
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

      <div className="relative min-w-[220px]">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hledat: zákazník, telefon, OVT, ID objednávky…"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 pr-8 text-sm placeholder:text-gray-400 focus:border-[#1E8449] focus:outline-none focus:ring-1 focus:ring-[#1E8449]"
        />
        {q.length > 0 && (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label="Vymazat"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading && rows.length === 0 && (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600 shadow-sm">
          <p className="font-medium text-gray-900">Žádné shody</p>
          <p className="mt-2 text-sm">
            {rows.length === 0
              ? 'Nenašli jsme žádné objednávky s párovaným hovorem.'
              : 'Žádná řádka nesplňuje aktuální filtry.'}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <p className="text-sm text-gray-600">
              Zobrazeno {filtered.length}
              {rows.length !== filtered.length ? ` z ${rows.length}` : ''}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className={cellPad}>Zákazník</th>
                  <th className={cellPad}>Telefon</th>
                  <th className={cellPad}>OVT</th>
                  <th className={`${cellPad} text-right`}>Hovorů</th>
                  <th className={cellPad}>Poslední hovor</th>
                  <th className={cellPad}>Objednávka</th>
                  <th className={`${cellPad} text-right`}>Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className={cellPad}>
                      <div className="font-medium text-gray-900">
                        {r.name ?? `Zakázka #${r.id}`}
                      </div>
                      {!isCompact && r.agents.length > 0 && (
                        <div className="text-xs text-gray-400">
                          Agent: {r.agents.slice(0, 2).join(', ')}
                          {r.agents.length > 2 ? '…' : ''}
                        </div>
                      )}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap font-mono text-gray-800`}>
                      {r.phone ?? '—'}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-gray-700`}>
                      {r.user_id ?? '—'}
                    </td>
                    <td className={`${cellPad} text-right`}>
                      <span className="rounded-md border border-emerald-500 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900">
                        {r.call_count}
                      </span>
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-gray-600`}>
                      {formatDateTimeCs(r.last_call_time)}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-gray-600`}>
                      #{r.id}
                      {!isCompact && (
                        <div className="text-xs text-gray-400">
                          vytvořeno {formatDateCs(r.created_at)}
                        </div>
                      )}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-right`}>
                      <div className="flex flex-nowrap justify-end gap-1.5">
                        {r.raynet_id != null ? (
                          <Link
                            href={`/klient/${r.raynet_id}/hovory`}
                            className="shrink-0 rounded-md bg-[#1565C0] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0d4f9c]"
                          >
                            → Hovory
                          </Link>
                        ) : (
                          <span
                            className="shrink-0 rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-400"
                            title="Chybí raynet_id — bez karty klienta."
                          >
                            → Hovory
                          </span>
                        )}
                        <a
                          href={officePortalOrderDeepLink(r.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Portál
                        </a>
                        {r.source_erp_order_id != null && (
                          <a
                            href={erpOrderDeepLink(r.source_erp_order_id)}
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
