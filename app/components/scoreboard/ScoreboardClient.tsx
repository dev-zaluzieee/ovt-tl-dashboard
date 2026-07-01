'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TeamFilter, type TeamSelection } from '@/app/components/teams/TeamFilter';

interface Row {
  ovtUserId: string | null;
  displayName: string;
  email: string | null;
  raynetId: string | null;
  zameraniCount: number;
  ordersCount: number;
  conversionPct: number | null;
  orderValue: number;
  problematicCount: number;
  escalationsTotal: number;
  escalationsChybaOvt: number;
  escalationsJinaChyba: number;
  escalationsOpen: number;
}

interface Payload {
  from: string;
  to: string;
  rows: Row[];
  totals: {
    zameraniCount: number;
    ordersCount: number;
    conversionPct: number | null;
    orderValue: number;
    problematicCount: number;
    escalationsTotal: number;
    escalationsChybaOvt: number;
    escalationsJinaChyba: number;
    escalationsOpen: number;
  };
  zameraniReliable: boolean;
  truncated: boolean;
}

type PresetId = 'today' | 'yesterday' | 'this_month' | 'prev_month';

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function windowFor(preset: PresetId): { from: string; to: string } {
  const now = new Date();
  if (preset === 'today') return { from: fmt(now), to: fmt(now) };
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { from: fmt(y), to: fmt(y) };
  }
  if (preset === 'this_month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(first), to: fmt(now) }; // month-to-date
  }
  // prev_month: full previous calendar month
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: fmt(first), to: fmt(last) };
}

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today', label: 'Dnes' },
  { id: 'yesterday', label: 'Včera' },
  { id: 'this_month', label: 'Tento měsíc' },
  { id: 'prev_month', label: 'Minulý měsíc' },
];

function formatKc(n: number): string {
  return `${new Intl.NumberFormat('cs-CZ').format(Math.round(n))} Kč`;
}

type SortKey =
  | 'orderValue'
  | 'ordersCount'
  | 'zameraniCount'
  | 'conversionPct'
  | 'problematicCount'
  | 'escalationsTotal'
  | 'escalationsChybaOvt';

export function ScoreboardClient() {
  const [preset, setPreset] = useState<PresetId>('today');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<TeamSelection | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('orderValue');

  const load = useCallback(async (p: PresetId) => {
    setLoading(true);
    setError(null);
    const { from, to } = windowFor(p);
    try {
      const res = await fetch(`/api/ovt-scoreboard?from=${from}&to=${to}`, {
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
    void load(preset);
  }, [preset, load]);

  // Team filter (client-side) on OVT rows.
  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    let filtered = all;
    if (teamFilter) {
      const emails = new Set(teamFilter.memberEmails.map((e) => e.toLowerCase()));
      const raynetIds = new Set(teamFilter.memberRaynetIds);
      filtered = all.filter((r) => {
        const email = r.email?.toLowerCase();
        return (
          (email != null && emails.has(email)) ||
          (r.raynetId != null && raynetIds.has(r.raynetId))
        );
      });
    }
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
      return (bv as number) - (av as number);
    });
  }, [data, teamFilter, sortKey]);

  const totals = useMemo(() => {
    // When a team filter is on, recompute totals from the visible rows.
    if (!teamFilter) return data?.totals ?? null;
    const t = rows.reduce(
      (acc, r) => {
        acc.zameraniCount += r.zameraniCount;
        acc.ordersCount += r.ordersCount;
        acc.orderValue += r.orderValue;
        acc.problematicCount += r.problematicCount;
        acc.escalationsTotal += r.escalationsTotal;
        acc.escalationsChybaOvt += r.escalationsChybaOvt;
        acc.escalationsJinaChyba += r.escalationsJinaChyba;
        acc.escalationsOpen += r.escalationsOpen;
        return acc;
      },
      {
        zameraniCount: 0,
        ordersCount: 0,
        orderValue: 0,
        problematicCount: 0,
        escalationsTotal: 0,
        escalationsChybaOvt: 0,
        escalationsJinaChyba: 0,
        escalationsOpen: 0,
      }
    );
    return {
      ...t,
      conversionPct: t.zameraniCount > 0 ? Math.round((t.ordersCount / t.zameraniCount) * 100) : null,
    };
  }, [data, rows, teamFilter]);

  const sortableTh = (key: SortKey, label: string) => (
    <th
      className="cursor-pointer px-3 py-2 text-right hover:text-gray-900"
      onClick={() => setSortKey(key)}
      title="Seřadit"
    >
      {label}
      {sortKey === key ? ' ↓' : ''}
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
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

      {data && (
        <p className="text-sm text-gray-500">
          Období {data.from === data.to ? data.from : `${data.from} – ${data.to}`}
        </p>
      )}

      {data && !data.zameraniReliable && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950" role="status">
          Počet zaměření se nepodařilo spolehlivě přiřadit k OVT (Raynet neposkytl vlastníka událostí) — hodnoty ve
          sloupci Zaměření a Konverze mohou chybět.
        </div>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-gray-100" aria-busy="true" />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </div>
      ) : !data || rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
          <p className="font-medium text-gray-900">Žádná data za zvolené období</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">OVT</th>
                {sortableTh('zameraniCount', 'Zaměření')}
                {sortableTh('ordersCount', 'Objednávky')}
                {sortableTh('conversionPct', 'Konverze')}
                {sortableTh('orderValue', 'Hodnota')}
                {sortableTh('problematicCount', 'Problémy')}
                {sortableTh('escalationsTotal', 'Eskalace')}
                <th
                  className="px-3 py-2 text-right"
                  title="Rozbití poslední eskalace: chyba OVT / jiná chyba / otevřené"
                >
                  Rozbití
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.ovtUserId ?? r.displayName} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{r.displayName}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{r.zameraniCount || '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{r.ordersCount}</td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {r.conversionPct == null ? '—' : `${r.conversionPct} %`}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatKc(r.orderValue)}</td>
                  <td className="px-3 py-2 text-right">
                    {r.problematicCount > 0 ? (
                      <span className="rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-950">
                        {r.problematicCount}
                      </span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.escalationsTotal > 0 ? (
                      <span className="rounded-md border border-rose-400 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-900">
                        {r.escalationsTotal}
                      </span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {r.escalationsTotal === 0 ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        {r.escalationsChybaOvt > 0 && (
                          <span
                            className="rounded-full bg-rose-600 px-1.5 py-0.5 font-semibold text-white"
                            title="Chyba OVT"
                          >
                            {r.escalationsChybaOvt} chyba
                          </span>
                        )}
                        {r.escalationsJinaChyba > 0 && (
                          <span
                            className="rounded-full bg-slate-500 px-1.5 py-0.5 font-semibold text-white"
                            title="Jiná chyba"
                          >
                            {r.escalationsJinaChyba} jiná
                          </span>
                        )}
                        {r.escalationsOpen > 0 && (
                          <span
                            className="rounded-full border border-amber-500 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-900"
                            title="Otevřené eskalace"
                          >
                            {r.escalationsOpen} otevř.
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
                <tr>
                  <td className="px-3 py-2">Celkem</td>
                  <td className="px-3 py-2 text-right">{totals.zameraniCount || '—'}</td>
                  <td className="px-3 py-2 text-right">{totals.ordersCount}</td>
                  <td className="px-3 py-2 text-right">
                    {totals.conversionPct == null ? '—' : `${totals.conversionPct} %`}
                  </td>
                  <td className="px-3 py-2 text-right">{formatKc(totals.orderValue)}</td>
                  <td className="px-3 py-2 text-right">{totals.problematicCount}</td>
                  <td className="px-3 py-2 text-right">{totals.escalationsTotal}</td>
                  <td className="px-3 py-2 text-right text-xs">
                    {totals.escalationsChybaOvt} / {totals.escalationsJinaChyba}
                    {' / '}
                    <span className="text-amber-900">{totals.escalationsOpen}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
