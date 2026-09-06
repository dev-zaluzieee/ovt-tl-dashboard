'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TeamFilter, type TeamSelection } from '@/app/components/teams/TeamFilter';
import { type CashPerson, fmtCzk, fmtDate, personName } from './cashTypes';

/**
 * Hotovost — read-only per-person cash balances for team leaders. Same numbers
 * finance sees on vyuctovani.systeeem.cz (via ceniky-2 → finance service API).
 * Compact, one row per person. Team filter matches by Raynet id or e-mail.
 */

type SortKey = 'name' | 'balance' | 'overdue' | 'held' | 'inventura' | 'last';

export function CashOverviewClient() {
  const [persons, setPersons] = useState<CashPerson[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamSelection | null>(null);
  const [onlyOvt, setOnlyOvt] = useState(true);
  const [onlyActive, setOnlyActive] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'overdue', dir: 'desc' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/cash/persons', { credentials: 'include' });
        const json = await res.json();
        if (!res.ok || !json.success) {
          if (!cancelled) setError(json.message || json.error || 'Načtení selhalo.');
          return;
        }
        if (!cancelled) setPersons(json.data.persons as CashPerson[]);
      } catch {
        if (!cancelled) setError('Chyba spojení.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    let list = persons ?? [];
    if (onlyOvt) list = list.filter((p) => p.role === 'ovt');
    if (onlyActive) list = list.filter((p) => p.active);
    if (team) {
      const emails = new Set(team.memberEmails.map((e) => e.toLowerCase()));
      const raynetIds = new Set(team.memberRaynetIds);
      list = list.filter(
        (p) =>
          (p.raynet_user_id != null && raynetIds.has(String(p.raynet_user_id))) ||
          emails.has(p.email.toLowerCase())
      );
    }
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return dir * personName(a).localeCompare(personName(b), 'cs');
        case 'balance':
          return dir * (Number(a.balance_czk) - Number(b.balance_czk));
        case 'overdue':
          return dir * (Number(a.overdue_czk) - Number(b.overdue_czk));
        case 'held':
          return dir * (a.held_since ?? '9999').localeCompare(b.held_since ?? '9999') * -1;
        case 'inventura':
          return dir * (a.inventura_at ?? '').localeCompare(b.inventura_at ?? '');
        case 'last':
          return dir * (a.last_entry_at ?? '').localeCompare(b.last_entry_at ?? '');
      }
    });
  }, [persons, onlyOvt, onlyActive, team, sort]);

  const totals = useMemo(() => {
    const activated = rows.filter((p) => p.inventura_at != null);
    return {
      count: rows.length,
      activated: activated.length,
      balance: activated.reduce((s, p) => s + Number(p.balance_czk), 0),
      overdue: activated.reduce((s, p) => s + Number(p.overdue_czk), 0),
      overdueCount: activated.filter((p) => Number(p.overdue_czk) > 0).length,
    };
  }, [rows]);

  function th(label: string, key: SortKey, align: 'left' | 'right' = 'left') {
    const active = sort.key === key;
    return (
      <th
        className={`cursor-pointer select-none px-2 py-1 font-medium hover:text-gray-800 ${align === 'right' ? 'text-right' : 'text-left'}`}
        onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}
      >
        {label}
        {active && <span className="ml-1 text-gray-400">{sort.dir === 'desc' ? '↓' : '↑'}</span>}
      </th>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <TeamFilter value={team?.id ?? null} onChange={setTeam} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={onlyOvt} onChange={(e) => setOnlyOvt(e.target.checked)} />
          Jen OVT
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          Jen aktivní
        </label>
      </div>

      {persons && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Osob" value={String(totals.count)} sub={`${totals.activated} aktivováno (inventura)`} />
          <Stat label="Hotovost u lidí" value={fmtCzk(totals.balance)} sub="jen aktivované osoby" />
          <Stat
            label="Po termínu"
            value={fmtCzk(totals.overdue)}
            sub={`${totals.overdueCount} osob`}
            tone={totals.overdue > 0 ? 'red' : 'ok'}
          />
          <Stat label="Čeká na inventuru" value={String(totals.count - totals.activated)} sub="appka zatím neaktivní" />
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}
      {loading && <p className="text-sm text-gray-500">Načítám…</p>}

      {!loading && persons && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <table className="w-full table-fixed whitespace-nowrap text-xs">
            <colgroup>
              <col />
              <col className="w-[70px]" />
              <col className="w-[120px]" />
              <col className="w-[120px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col className="w-[70px]" />
            </colgroup>
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                {th('Osoba', 'name')}
                <th className="px-2 py-1 text-left font-medium">Role</th>
                {th('Zůstatek', 'balance', 'right')}
                {th('Po termínu', 'overdue', 'right')}
                {th('Drží od', 'held')}
                {th('Inventura', 'inventura')}
                {th('Poslední pohyb', 'last')}
                <th className="px-2 py-1 text-right font-medium">Zázn.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((p) => {
                const activated = p.inventura_at != null;
                const overdue = Number(p.overdue_czk);
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${activated ? '' : 'text-gray-400'}`}>
                    <td className="truncate px-2 py-1" title={p.email}>
                      <Link href={`/hotovost/${p.id}`} className="font-medium text-blue-700 hover:underline">
                        {personName(p)}
                      </Link>
                      {!p.active && <span className="ml-1.5 text-gray-400">neaktivní</span>}
                    </td>
                    <td className="px-2 py-1 uppercase text-gray-500">{p.role}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {activated ? fmtCzk(Number(p.balance_czk)) : <span title="Čeká na inventuru">—</span>}
                    </td>
                    <td className={`px-2 py-1 text-right tabular-nums ${overdue > 0 ? 'font-semibold text-red-700' : ''}`}>
                      {activated ? (overdue > 0 ? fmtCzk(overdue) : '0 Kč') : '—'}
                    </td>
                    <td className="px-2 py-1">{activated && overdue > 0 ? fmtDate(p.held_since) : '—'}</td>
                    <td className="px-2 py-1">
                      {activated ? fmtDate(p.inventura_at) : <span className="text-amber-700">čeká</span>}
                    </td>
                    <td className="px-2 py-1">{fmtDate(p.last_entry_at)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{p.entry_count}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-6 text-center text-gray-500">
                    Žádné osoby pro zvolený filtr.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'red' | 'ok' }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${tone === 'red' ? 'text-red-700' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}
