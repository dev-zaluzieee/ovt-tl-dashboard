'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { erpOrderDeepLink } from '@/lib/erpUrls';
import { officePortalOrderDeepLink } from '@/lib/officePortalUrls';
import { raynetEventDeepLink } from '@/lib/raynetUrls';
import { TeamFilter, type TeamSelection } from '@/app/components/teams/TeamFilter';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import {
  OrderValuePill,
  type OrderValueSyncBlock,
} from '@/app/components/retention/OrderValuePill';

type Problem = 'raynet_only' | 'no_admf' | 'nezastizen';

interface ProblematicRow {
  raynetEventId: number;
  title: string;
  scheduledFrom: string | null;
  categoryId: number | null;
  categoryLabel: string | null;
  order: {
    id: number;
    customerName: string | null;
    source_erp_order_id: number | null;
    admfExportStatus: 'none' | 'not_exported' | 'exported' | null;
  } | null;
  raynetCompanyId: number | null;
  orderValue: OrderValueSyncBlock | null;
  owner: { email: string | null; raynetId: string | null; name: string | null };
  problems: Problem[];
  nezastizen: { markedAt: string; by: string; note: string | null } | null;
}

interface Payload {
  from: string;
  to: string;
  rows: ProblematicRow[];
  truncated: boolean;
}

const PROBLEM_META: Record<Problem, { label: string; className: string }> = {
  raynet_only: {
    label: 'Není v systému',
    className: 'border-slate-400 bg-slate-100 text-slate-800',
  },
  no_admf: {
    label: 'Bez exportu ADMF',
    className: 'border-amber-400 bg-amber-50 text-amber-950',
  },
  nezastizen: {
    label: 'Nezastižen',
    className: 'border-rose-400 bg-rose-50 text-rose-900',
  },
};

/** Left-edge stripe by most-severe problem (matches retention portal accents). */
function stripeClass(problems: Problem[]): string {
  if (problems.includes('nezastizen')) return 'border-l-4 border-l-rose-400';
  if (problems.includes('no_admf')) return 'border-l-4 border-l-amber-400';
  return 'border-l-4 border-l-slate-300';
}

function formatDateTimeCs(raw: string | null): string {
  if (!raw) return '—';
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return raw;
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(t));
}

function formatDateCs(raw: string): string {
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return raw;
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(t));
}

export function ProblematicOrdersClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<TeamSelection | null>(null);
  const [density, setDensity] = useListDensity();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/problematic-orders', {
          headers: { Accept: 'application/json' },
        });
        const body = (await res.json()) as {
          success?: boolean;
          message?: string;
          data?: Payload;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setError(body.message || `Chyba při načítání (${res.status})`);
          setData(null);
          return;
        }
        setData(body.data);
      } catch {
        if (!cancelled) setError('Nepodařilo se spojit se serverem. Zkuste to znovu.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    if (!teamFilter) return rows;
    const emails = new Set(teamFilter.memberEmails.map((e) => e.toLowerCase()));
    const raynetIds = new Set(teamFilter.memberRaynetIds);
    return rows.filter((r) => {
      const email = r.owner.email?.toLowerCase();
      return (
        (email != null && emails.has(email)) ||
        (r.owner.raynetId != null && raynetIds.has(r.owner.raynetId))
      );
    });
  }, [data, teamFilter]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const isCompact = density === 'compact';
  const cellPad = isCompact ? 'px-2 py-1' : 'px-3 py-2.5';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Období{' '}
          <span className="font-medium text-gray-900">
            {formatDateCs(data.from)} – {formatDateCs(data.to)}
          </span>{' '}
          · nevyřízených:{' '}
          <span className="font-semibold text-gray-900">{filteredRows.length}</span>
          {teamFilter && data.rows.length !== filteredRows.length ? ` z ${data.rows.length}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <TeamFilter value={teamFilter?.id ?? null} onChange={setTeamFilter} />
          <DensityToggle density={density} onChange={setDensity} />
        </div>
      </div>

      {data.truncated && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          Seznam je omezen na prvních 2000 událostí z Raynetu za období.
        </div>
      )}

      {filteredRows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
          <p className="font-medium text-gray-900">Žádné problematické zakázky</p>
          <p className="mt-2 text-sm">
            {teamFilter
              ? `Pro tým „${teamFilter.name}“ nejsou v tomto období žádné nevyřízené zakázky.`
              : 'Ve zvoleném období nejsou žádné nevyřízené zakázky.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className={cellPad}>Problémy</th>
                <th className={cellPad}>Zákazník</th>
                <th className={`${cellPad} text-right`}>Hodnota</th>
                <th className={cellPad}>Termín</th>
                <th className={`${cellPad} text-right`}>Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((row) => {
                const compactTooltip = isCompact
                  ? [
                      row.title,
                      row.owner.name ? `OVT: ${row.owner.name}` : null,
                      row.categoryLabel,
                      row.nezastizen
                        ? `Nezastižen: ${row.nezastizen.by}${row.nezastizen.note ? ` – ${row.nezastizen.note}` : ''}`
                        : null,
                    ]
                      .filter((s): s is string => !!s)
                      .join('\n')
                    : undefined;
                return (
                  <tr key={row.raynetEventId} className={`align-top ${stripeClass(row.problems)}`} title={compactTooltip}>
                    <td className={cellPad}>
                      <div className="flex flex-col gap-1">
                        {row.problems.map((p) => (
                          <span
                            key={p}
                            className={`inline-block w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${PROBLEM_META[p].className}`}
                          >
                            {PROBLEM_META[p].label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={cellPad}>
                      <div className="font-medium text-gray-900">
                        {row.order?.customerName?.trim() || row.title}
                      </div>
                      {!isCompact && (
                        <>
                          {row.owner.name && (
                            <div className="text-xs text-gray-500">OVT: {row.owner.name}</div>
                          )}
                          {row.order && (
                            <div className="text-xs text-gray-400">Zakázka #{row.order.id}</div>
                          )}
                          {row.nezastizen && (
                            <div className="mt-0.5 text-xs text-rose-700">
                              Nezastižen: {row.nezastizen.by}
                              {row.nezastizen.note ? ` – ${row.nezastizen.note}` : ''}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className={`${cellPad} text-right`}>
                      {row.orderValue ? <OrderValuePill sync={row.orderValue} /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-gray-600`}>
                      <div>{formatDateTimeCs(row.scheduledFrom)}</div>
                      {!isCompact && row.categoryLabel && (
                        <div className="text-xs text-gray-400">{row.categoryLabel}</div>
                      )}
                    </td>
                    <td className={`${cellPad} text-right`}>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <a
                          href={raynetEventDeepLink(row.raynetEventId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border border-[#1E8449] px-2 py-1 text-xs font-medium text-[#1E8449] hover:bg-[#F1F8F4]"
                        >
                          Raynet
                        </a>
                        {row.raynetCompanyId != null && (
                          <Link
                            href={`/klient/${row.raynetCompanyId}`}
                            className="rounded-md border border-purple-300 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50"
                          >
                            Karta
                          </Link>
                        )}
                        {row.order && (
                          <a
                            href={officePortalOrderDeepLink(row.order.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Portál
                          </a>
                        )}
                        {row.order?.source_erp_order_id != null && (
                          <a
                            href={erpOrderDeepLink(row.order.source_erp_order_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-[#1565C0] px-2 py-1 text-xs font-medium text-[#1565C0] hover:bg-[#E3F2FD]"
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
      )}
    </div>
  );
}
