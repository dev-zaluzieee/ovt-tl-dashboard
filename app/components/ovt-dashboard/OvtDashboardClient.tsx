'use client';

/**
 * Výkon OVT — one table, one merged model of what happened to every order
 * whose zaměření fell in the selected period (Karel, 2026-08-06 — replacing
 * the earlier Zaměření/Konverze/Problematické/Eskalace columns, which read
 * as five disconnected numbers, with one funnel: every order resolves as
 * exactly one of "TL had to step in", "went to retention", "neuzavřeno", or
 * "success" — independent signals under the hood (real data can't guarantee
 * a clean partition), reconciled into one chart via precedence.
 *
 * Table row: name (default-sorted alphabetically) + a stacked mini-bar of
 * the four outcomes + the success revenue number. Click a name to expand a
 * detail panel: a donut of the same breakdown for that one OVT (the "deep
 * insight into one person" half of the job a cross-OVT bar can't do), plus
 * the order-level list for whichever slice you click — sorted by zaměření
 * date, per Karel's ask.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { TeamFilter, type TeamSelection } from '@/app/components/teams/TeamFilter';
import { erpOrderDeepLink } from '@/lib/erpUrls';
import { raynetEventDeepLink, raynetCompanyDeepLink } from '@/lib/raynetUrls';
import { officePortalOrderDeepLink } from '@/lib/officePortalUrls';

type BucketKey = 'nucenResitTl' | 'toRetention' | 'neuzavreno' | 'success';
const BUCKET_KEYS: BucketKey[] = ['nucenResitTl', 'toRetention', 'neuzavreno', 'success'];

interface OutcomeOrder {
  orderId: number;
  customerName: string | null;
  zamereniAt: string;
  sourceErpOrderId: number | null;
  raynetCompanyId: number | null;
  raynetEventId: number | null;
  valueSDph: number | null;
}

interface OutcomeBucket {
  count: number;
  valueSDph: number;
  orders: OutcomeOrder[];
}

interface Row {
  ovtUserId: string | null;
  displayName: string;
  email: string | null;
  totalOrders: number;
  buckets: Record<BucketKey, OutcomeBucket>;
  overlapCount: number;
  pieSlices: Record<BucketKey, number>;
}

interface Payload {
  from: string;
  to: string;
  rows: Row[];
  totals: {
    totalOrders: number;
    buckets: Record<BucketKey, { count: number; valueSDph: number }>;
    overlapCount: number;
  };
}

type PresetId =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'prev_week'
  | 'this_month'
  | 'prev_month'
  | 'custom';

type SortKey = 'name' | 'success' | 'problems';

// ── Status colors — these ARE status semantics (critical / warning /
// negative / good), not arbitrary categorical hues, so status colors are
// the right slot per the dataviz palette rules. Reused from colors already
// meaningful elsewhere in this app (rose=chyba/escalace, amber=warning,
// green=#1E8449 success) rather than inventing a new palette.
const BUCKET_META: Record<BucketKey, { label: string; color: string; track: string }> = {
  nucenResitTl: { label: 'Řešil TL', color: '#e34948', track: '#fbe4e3' }, // critical
  toRetention: { label: 'Do retence', color: '#eda100', track: '#fdf0d9' }, // warning
  neuzavreno: { label: 'Neuzavřeno', color: '#6b7280', track: '#e5e7eb' }, // negative, neutral
  success: { label: 'Úspěch', color: '#1E8449', track: '#dcefe3' }, // good
};
const UNCLASSIFIED_COLOR = '#e5e7eb';
const UNCLASSIFIED_LABEL = 'Bez rozhodnutí';

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayOf(d: Date): Date {
  const out = new Date(d);
  const dow = out.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  out.setDate(out.getDate() + diff);
  return out;
}

function windowFor(preset: PresetId): { from: string; to: string } {
  const now = new Date();
  if (preset === 'today') return { from: fmt(now), to: fmt(now) };
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { from: fmt(y), to: fmt(y) };
  }
  if (preset === 'this_week') return { from: fmt(mondayOf(now)), to: fmt(now) };
  if (preset === 'prev_week') {
    const thisMonday = mondayOf(now);
    const prevMonday = new Date(thisMonday);
    prevMonday.setDate(thisMonday.getDate() - 7);
    const prevSunday = new Date(thisMonday);
    prevSunday.setDate(thisMonday.getDate() - 1);
    return { from: fmt(prevMonday), to: fmt(prevSunday) };
  }
  if (preset === 'this_month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(first), to: fmt(now) };
  }
  if (preset === 'prev_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(first), to: fmt(last) };
  }
  return { from: fmt(now), to: fmt(now) };
}

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today', label: 'Dnes' },
  { id: 'yesterday', label: 'Včera' },
  { id: 'this_week', label: 'Tento týden' },
  { id: 'prev_week', label: 'Minulý týden' },
  { id: 'this_month', label: 'Tento měsíc' },
  { id: 'prev_month', label: 'Minulý měsíc' },
  { id: 'custom', label: 'Vlastní…' },
];

function formatKc(n: number): string {
  return `${new Intl.NumberFormat('cs-CZ').format(Math.round(n))} Kč`;
}

function formatDateCs(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

/** Every order in a row belongs to exactly one slice here (pieSlices +
 *  the unclassified remainder) — this is what both the stacked mini-bar
 *  and the donut render, so the two visuals always tell the same story. */
function slicesOf(row: Row): Array<{ key: BucketKey | 'unclassified'; count: number; color: string; label: string }> {
  const out: Array<{ key: BucketKey | 'unclassified'; count: number; color: string; label: string }> = [];
  for (const k of BUCKET_KEYS) {
    const count = row.pieSlices[k];
    if (count > 0) out.push({ key: k, count, color: BUCKET_META[k].color, label: BUCKET_META[k].label });
  }
  const classified = BUCKET_KEYS.reduce((s, k) => s + row.pieSlices[k], 0);
  const rest = row.totalOrders - classified;
  if (rest > 0) out.push({ key: 'unclassified', count: rest, color: UNCLASSIFIED_COLOR, label: UNCLASSIFIED_LABEL });
  return out;
}

function StackedMiniBar({ row }: { row: Row }) {
  const slices = slicesOf(row);
  if (row.totalOrders === 0) return <span className="text-xs text-gray-400">—</span>;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full" title={`${row.totalOrders} zakázek`}>
      {slices.map((s, i) => (
        <span
          key={s.key}
          style={{ width: `${(s.count / row.totalOrders) * 100}%`, backgroundColor: s.color }}
          className={i > 0 ? 'ml-px' : undefined}
          title={`${s.label}: ${s.count}`}
        />
      ))}
    </div>
  );
}

/** SVG donut — segments as stroke-dasharray arcs, clickable, with a center
 *  total. Legend is separate (always present for ≥2 series per the dataviz
 *  accessibility rule) so identity never relies on the arc color alone. */
function Donut({
  row,
  activeBucket,
  onSliceClick,
}: {
  row: Row;
  activeBucket: BucketKey | null;
  onSliceClick: (key: BucketKey) => void;
}) {
  const r = 40;
  const sw = 16;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * r;
  const slices = slicesOf(row);
  // Running offset built via reduce (not a mutated outer variable) so the
  // per-arc math stays pure across renders.
  const arcs = slices.reduce<Array<{ slice: (typeof slices)[number]; len: number; offset: number }>>(
    (acc, s) => {
      const frac = row.totalOrders > 0 ? s.count / row.totalOrders : 0;
      const len = frac * circumference;
      const prev = acc[acc.length - 1];
      const offset = prev ? prev.offset + prev.len : 0;
      acc.push({ slice: s, len, offset });
      return acc;
    },
    []
  );

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-28 w-28 flex-shrink-0">
        {arcs.map(({ slice: s, len, offset }) => {
          const clickable = s.key !== 'unclassified';
          const isActive = clickable && activeBucket === s.key;
          return (
            <circle
              key={s.key}
              r={r}
              cx={cx}
              cy={cy}
              fill="none"
              stroke={s.color}
              strokeWidth={isActive ? sw + 3 : sw}
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              className={clickable ? 'cursor-pointer transition-[stroke-width]' : undefined}
              onClick={clickable ? () => onSliceClick(s.key as BucketKey) : undefined}
              tabIndex={clickable ? 0 : undefined}
              role={clickable ? 'button' : undefined}
              aria-label={clickable ? `${s.label}: ${s.count} zakázek` : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') onSliceClick(s.key as BucketKey);
                    }
                  : undefined
              }
            />
          );
        })}
        <text x={cx} y={cy - 3} textAnchor="middle" className="fill-gray-900 text-[18px] font-bold">
          {row.totalOrders}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-gray-500 text-[8px]">
          zakázek
        </text>
      </svg>
      <ul className="space-y-1 text-xs">
        {slices.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              disabled={s.key === 'unclassified'}
              onClick={() => s.key !== 'unclassified' && onSliceClick(s.key as BucketKey)}
              className={`flex items-center gap-1.5 rounded px-1 py-0.5 text-left ${
                s.key !== 'unclassified' ? 'hover:bg-gray-100' : 'cursor-default'
              } ${activeBucket === s.key ? 'font-semibold text-gray-900' : 'text-gray-600'}`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
              <span className="tabular-nums text-gray-500">({s.count})</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrderDeepLinks({ o }: { o: OutcomeOrder }) {
  return (
    <span className="inline-flex gap-2">
      <a href={officePortalOrderDeepLink(o.orderId)} target="_blank" rel="noreferrer" className="text-[#1E8449] hover:underline">
        Portál
      </a>
      {o.sourceErpOrderId != null && (
        <a href={erpOrderDeepLink(o.sourceErpOrderId)} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
          ERP
        </a>
      )}
      {o.raynetEventId != null && (
        <a href={raynetEventDeepLink(o.raynetEventId)} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
          Raynet
        </a>
      )}
      {o.raynetCompanyId != null && (
        <a href={raynetCompanyDeepLink(o.raynetCompanyId)} target="_blank" rel="noreferrer" className="text-purple-700 hover:underline">
          Karta
        </a>
      )}
    </span>
  );
}

export function OvtDashboardClient() {
  const [preset, setPreset] = useState<PresetId>('this_month');
  const [customFrom, setCustomFrom] = useState<string>(() => windowFor('this_month').from);
  const [customTo, setCustomTo] = useState<string>(() => windowFor('this_month').to);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<TeamSelection | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<BucketKey>('success');

  const activeWindow = useMemo(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo };
    return windowFor(preset);
  }, [preset, customFrom, customTo]);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ovt-outcomes?from=${from}&to=${to}`, {
        headers: { Accept: 'application/json' },
      });
      const body = (await res.json()) as { success?: boolean; message?: string; data?: Payload };
      if (!res.ok || !body.success || !body.data) {
        setError(body.message || `Chyba při načítání (${res.status})`);
        setData(null);
        return;
      }
      setData(body.data);
    } catch {
      setError('Nepodařilo se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeWindow.from > activeWindow.to) {
      setError('Datum „od" musí být před datem „do" (nebo stejné).');
      setData(null);
      return;
    }
    void load(activeWindow.from, activeWindow.to);
    setExpanded(null);
    setActiveBucket('success');
  }, [activeWindow, load]);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    let filtered = all;
    if (teamFilter) {
      const emails = new Set(teamFilter.memberEmails.map((e) => e.toLowerCase()));
      filtered = all.filter((r) => r.email != null && emails.has(r.email.toLowerCase()));
    }
    const dirMul = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return dirMul * a.displayName.localeCompare(b.displayName, 'cs');
      if (sortKey === 'success') return dirMul * (a.buckets.success.valueSDph - b.buckets.success.valueSDph);
      const probA = a.buckets.nucenResitTl.count + a.buckets.toRetention.count + a.buckets.neuzavreno.count;
      const probB = b.buckets.nucenResitTl.count + b.buckets.toRetention.count + b.buckets.neuzavreno.count;
      return dirMul * (probA - probB);
    });
  }, [data, teamFilter, sortKey, sortDir]);

  const setSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir(key === 'name' ? 'asc' : 'desc');
      }
    },
    [sortKey]
  );

  const totals = useMemo(() => {
    if (!teamFilter) return data?.totals ?? null;
    return rows.reduce(
      (acc, r) => {
        acc.totalOrders += r.totalOrders;
        acc.buckets.success.valueSDph += r.buckets.success.valueSDph;
        return acc;
      },
      { totalOrders: 0, buckets: { success: { valueSDph: 0 } } }
    );
  }, [data, rows, teamFilter]);

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-[#1E8449]">Výkon OVT</h1>
        <p className="mt-2 text-gray-600">
          Co se stalo se zakázkami podle data zaměření. Klikněte na jméno pro detail a rozpad na
          jednotlivé zakázky.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                preset === p.id ? 'bg-white text-[#1E8449] shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
              aria-pressed={preset === p.id}
            >
              {p.label}
            </button>
          ))}
        </div>
        <TeamFilter value={teamFilter?.id ?? null} onChange={setTeamFilter} />
      </div>

      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <label className="text-xs font-medium text-gray-600" htmlFor="ovt-dash-from">
            Od
          </label>
          <input
            id="ovt-dash-from"
            type="date"
            value={customFrom}
            max={customTo}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          />
          <label className="text-xs font-medium text-gray-600" htmlFor="ovt-dash-to">
            Do
          </label>
          <input
            id="ovt-dash-to"
            type="date"
            value={customTo}
            min={customFrom}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
        <span>
          Období {activeWindow.from === activeWindow.to ? activeWindow.from : `${activeWindow.from} – ${activeWindow.to}`}
        </span>
        {!loading && totals && (
          <>
            <span>·</span>
            <span>{totals.totalOrders} zakázek</span>
            <span>·</span>
            <span>Úspěšná tržba {formatKc(totals.buckets.success.valueSDph)}</span>
            {!!data && data.totals.overlapCount > 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900" title="Zakázky spadající do více kategorií najednou">
                {data.totals.overlapCount} zakázek ve více kategoriích
              </span>
            )}
          </>
        )}
      </div>

      {loading && !data ? (
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" aria-busy="true" />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
          <p className="font-medium text-gray-900">Žádná data za zvolené období</p>
        </div>
      ) : (
        <div
          className={`overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm transition-opacity ${
            loading ? 'opacity-60' : ''
          }`}
        >
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="cursor-pointer px-3 py-2 text-left hover:text-gray-900" onClick={() => setSort('name')}>
                  OVT{sortArrow('name')}
                </th>
                <th className="cursor-pointer px-3 py-2 text-left hover:text-gray-900" onClick={() => setSort('problems')}>
                  Rozložení zakázek{sortArrow('problems')}
                </th>
                <th className="cursor-pointer px-3 py-2 text-right hover:text-gray-900" onClick={() => setSort('success')}>
                  Úspěšná tržba{sortArrow('success')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const key = r.ovtUserId ?? r.displayName;
                const isOpen = expanded === key;
                return (
                  <Fragment key={key}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : key)}
                          className="flex items-center gap-1.5 font-medium text-gray-900 hover:text-[#1E8449]"
                          aria-expanded={isOpen}
                        >
                          <span className="w-3 text-gray-400">{isOpen ? '▾' : '▸'}</span>
                          {r.displayName}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <StackedMiniBar row={r} />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                        {formatKc(r.buckets.success.valueSDph)}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={3} className="bg-[#F8FAFC] px-4 py-4">
                          <div className="mb-4">
                            <Donut row={r} activeBucket={activeBucket} onSliceClick={setActiveBucket} />
                          </div>

                          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                            <div className="flex items-center justify-between border-b border-gray-100 px-2.5 py-1.5">
                              <span className="text-xs font-semibold text-gray-700">
                                {BUCKET_META[activeBucket].label} — {r.buckets[activeBucket].count} zakázek
                                {activeBucket === 'success' && r.buckets.success.count > 0 && (
                                  <> · {formatKc(r.buckets.success.valueSDph)}</>
                                )}
                              </span>
                            </div>
                            {r.buckets[activeBucket].orders.length === 0 ? (
                              <p className="px-2.5 py-3 text-xs text-gray-500">Žádné zakázky v této kategorii.</p>
                            ) : (
                              <table className="min-w-full divide-y divide-gray-100 text-xs">
                                <thead className="bg-gray-50 text-gray-500">
                                  <tr>
                                    <th className="px-2.5 py-1.5 text-left">Zakázka</th>
                                    <th className="px-2.5 py-1.5 text-left">Zákazník</th>
                                    <th className="px-2.5 py-1.5 text-left">Zaměření</th>
                                    {activeBucket === 'success' && <th className="px-2.5 py-1.5 text-right">Hodnota</th>}
                                    <th className="px-2.5 py-1.5 text-right">Odkazy</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {r.buckets[activeBucket].orders.map((o) => (
                                    <tr key={o.orderId}>
                                      <td className="px-2.5 py-1.5 font-medium text-gray-900">#{o.orderId}</td>
                                      <td className="px-2.5 py-1.5 text-gray-700">{o.customerName ?? '—'}</td>
                                      <td className="px-2.5 py-1.5 text-gray-500">{formatDateCs(o.zamereniAt)}</td>
                                      {activeBucket === 'success' && (
                                        <td className="px-2.5 py-1.5 text-right text-gray-900">
                                          {o.valueSDph != null ? formatKc(o.valueSDph) : '—'}
                                        </td>
                                      )}
                                      <td className="px-2.5 py-1.5 text-right">
                                        <OrderDeepLinks o={o} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {totals && (
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
                <tr>
                  <td className="px-3 py-2">Celkem</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{totals.totalOrders} zakázek</td>
                  <td className="px-3 py-2 text-right">{formatKc(totals.buckets.success.valueSDph)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
