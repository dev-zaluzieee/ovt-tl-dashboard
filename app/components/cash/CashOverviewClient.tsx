'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cashGet } from '@/lib/cash-api';
import {
  cashTotals,
  filterPersons,
  fmtCzk,
  parseCashPersons,
  parseRoleFilter,
  personName,
  roleCounts,
  sortPersons,
  type CashPerson,
  type RoleFilter,
  type SortDir,
  type SortKey,
} from '@/lib/cash';
import { fmtYmd, plural, pragueYmd } from '@/lib/format';
import { useListDensity } from '@/app/components/retention/listDensity';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { PageHeader, Skeleton, btnSmall, inputCls } from '@/app/components/ui/kit';
import { useUrlParams } from '@/app/components/ui/filters';
import { useLoad } from '@/app/components/ui/useLoad';
import { CashLoadError, Stat } from './CashUi';

function day(iso: string | null): string {
  if (!iso) return '—';
  const ymd = pragueYmd(iso);
  return ymd ? fmtYmd(ymd) : iso;
}

const ROLE_TABS: ReadonlyArray<{ value: RoleFilter; label: string; title: string }> = [
  { value: 'ovt', label: 'OVT', title: 'Zaměřovači' },
  { value: 'mvt', label: 'MVT', title: 'Montéři' },
  { value: 'all', label: 'Vše', title: 'Všichni' },
];

/**
 * Hotovost: read-only cash balances of every person in the field (surveyors and fitters), as finance sees them. No team
 * filter: the switch OVT / MVT / Vše comes from the `role` of the finance answer. One dense row per person.
 */
export function CashOverviewClient() {
  const { get, set } = useUrlParams();
  const role = parseRoleFilter(get('role'));
  const onlyActive = get('all') !== '1';
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'overdue', dir: 'desc' });
  const [density, setDensity] = useListDensity();
  const { data, error, loading, reload } = useLoad<CashPerson[]>('cash-persons', async (signal) => parseCashPersons(await cashGet('persons', signal)));

  const counts = useMemo(() => roleCounts(data ?? [], onlyActive), [data, onlyActive]);
  const rows = useMemo(() => sortPersons(filterPersons(data ?? [], { role, q, onlyActive }), sort.key, sort.dir), [data, role, q, onlyActive, sort]);
  const totals = useMemo(() => cashTotals(rows), [rows]);

  const pad = density === 'compact' ? 'px-2 py-0.5' : 'px-2 py-1.5';

  function th(label: string, key: SortKey, align: 'left' | 'right' = 'left', title?: string) {
    const active = sort.key === key;
    return (
      <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`${pad} font-medium ${align === 'right' ? 'text-right' : 'text-left'}`} title={title}>
        <button type="button" className="select-none uppercase tracking-wide hover:text-gray-800" onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}>
          {label}
          {active && <span className="ml-1 text-gray-400">{sort.dir === 'desc' ? '↓' : '↑'}</span>}
        </button>
      </th>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Hotovost" subtitle="Kolik hotovosti mají lidé v terénu u sebe, co je po termínu (vklad do banky do neděle) a kdo ještě čeká na inventuru od financí. Jen ke čtení, vše ostatní řeší finance." />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-gray-300 text-sm" role="tablist" aria-label="Role">
            {ROLE_TABS.map((t, i) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={role === t.value}
                title={t.title}
                onClick={() => set({ role: t.value === 'all' ? null : t.value })}
                className={`px-3 py-1.5 font-semibold transition-colors ${i > 0 ? 'border-l border-gray-300' : ''} ${role === t.value ? 'bg-[#1E8449] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {t.label}
                {data && <span className="ml-1.5 text-xs font-normal opacity-80">{counts[t.value]}</span>}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hledat jméno nebo e-mail…"
            aria-label="Hledat osobu"
            className={`${inputCls} min-w-[220px] flex-1 sm:flex-none sm:w-72`}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={onlyActive} onChange={(e) => set({ all: e.target.checked ? null : '1' })} />
            Jen aktivní
          </label>
          <DensityToggle density={density} onChange={setDensity} />
          <button type="button" className={btnSmall} onClick={reload}>Obnovit</button>
        </div>

        {data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Osob" value={String(totals.count)} sub={`${totals.activated} aktivováno (inventura)`} />
            <Stat label="Hotovost u lidí" value={fmtCzk(totals.balance)} sub="jen aktivované osoby" />
            <Stat label="Po termínu" value={fmtCzk(totals.overdue)} sub={`${totals.overdueCount} ${plural(totals.overdueCount, 'osoba', 'osoby', 'osob')}`} tone={totals.overdue > 0 ? 'red' : 'ok'} />
            <Stat label="Čeká na inventuru" value={String(totals.waiting)} sub="appka zatím neaktivní" />
          </div>
        )}

        {error && <CashLoadError error={error} onRetry={reload} />}
        {!data && !error && <Skeleton />}

        {data && (
          <div className={`overflow-x-auto rounded-lg border border-gray-200 bg-white ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[860px] table-fixed whitespace-nowrap text-xs">
              <colgroup>
                <col />
                <col className="w-[70px]" />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
                <col className="w-[110px]" />
                <col className="w-[110px]" />
                <col className="w-[120px]" />
                <col className="w-[100px]" />
                <col className="w-[70px]" />
              </colgroup>
              <thead className="border-b border-gray-200 bg-gray-50 text-[11px] text-gray-500">
                <tr>
                  {th('Osoba', 'name')}
                  {th('Role', 'role')}
                  {th('Zůstatek', 'balance', 'right')}
                  {th('Po termínu', 'overdue', 'right')}
                  {th('Drží od', 'held')}
                  {th('Inventura', 'inventura')}
                  {th('Poslední pohyb', 'last')}
                  {th('Bez dokladu', 'proof', 'right', 'Vklady z banky bez nahraného dokladu')}
                  {th('Zázn.', 'count', 'right')}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((p) => {
                  const activated = p.inventura_at !== null;
                  const overdue = Number(p.overdue_czk);
                  return (
                    <tr key={p.id} className={`hover:bg-gray-50 ${activated ? '' : 'text-gray-400'}`}>
                      <td className={`${pad} truncate`} title={p.email}>
                        <Link href={`/hotovost/${p.id}`} className="font-medium text-blue-700 hover:underline">
                          {personName(p)}
                        </Link>
                        {!p.active && <span className="ml-1.5 text-gray-400">neaktivní</span>}
                        {p.erp_user_id === null && (
                          <span className="ml-1.5 text-amber-700" title="Osoba z financí zatím není spárovaná s účtem v ERP">bez ERP</span>
                        )}
                      </td>
                      <td className={`${pad} uppercase text-gray-500`}>{p.role}</td>
                      <td className={`${pad} text-right tabular-nums`}>{activated ? fmtCzk(p.balance_czk) : <span title="Čeká na inventuru">—</span>}</td>
                      <td className={`${pad} text-right tabular-nums ${overdue > 0 ? 'font-semibold text-red-700' : ''}`}>
                        {activated ? (overdue > 0 ? fmtCzk(overdue) : '0 Kč') : '—'}
                      </td>
                      <td className={pad}>{activated && overdue > 0 ? day(p.held_since) : '—'}</td>
                      <td className={pad}>{activated ? day(p.inventura_at) : <span className="text-amber-700">čeká</span>}</td>
                      <td className={pad}>{day(p.last_entry_at)}</td>
                      <td className={`${pad} text-right tabular-nums`}>
                        {p.missing_proof_count > 0 ? (
                          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white" title="Vklady z banky bez nahraného dokladu">
                            {p.missing_proof_count}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className={`${pad} text-right tabular-nums`}>{p.entry_count}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-2 py-6 text-center text-gray-500">
                      Žádné osoby pro zvolený filtr.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
