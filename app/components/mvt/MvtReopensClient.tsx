'use client';

import { tlGet } from '@/lib/tl-api';
import { parseReopens } from '@/lib/tl-parse';
import type { MvtReopens, ResultChange, ResultSnapshot } from '@/lib/types';
import { fmtDateTime, fmtKc, isYmd, shiftYmd } from '@/lib/format';
import { useMeta } from '@/app/components/shell/MetaContext';
import { DateRange, PersonSelect, useUrlParams } from '@/app/components/ui/filters';
import { Alert, Chip, Empty, EventLinks, LoadError, PageHeader, Skeleton, btnSmall, inputCls } from '@/app/components/ui/kit';
import { useLoad } from '@/app/components/ui/useLoad';

function Snapshot({ s, label }: { s: ResultSnapshot | null; label: string }) {
  if (!s) return <p className="text-xs text-gray-400">{label}: zatím není</p>;
  return (
    <p className="text-xs text-gray-700">
      <span className="font-semibold text-gray-500">{label}:</span> {s.outcomeLabel ?? '—'}
      {s.collectedAmount !== null ? ` · ${fmtKc(s.collectedAmount)}` : ''}
      {s.paymentMethodLabel ? ` · ${s.paymentMethodLabel}` : ''}
      {s.discountAmount ? ` · sleva ${fmtKc(s.discountAmount)}` : ''}
      {s.closedByName ? ` · ${s.closedByName}` : ''}
    </p>
  );
}

function changeValue(field: string, v: string | number | null): string {
  if (v === null || v === '') return 'nic';
  return typeof v === 'number' && (field === 'collectedAmount' || field === 'discountAmount') ? fmtKc(v) : String(v);
}

function Changes({ changes, fallback }: { changes: ResultChange[]; fallback: string }) {
  if (changes.length === 0) return <>{fallback}</>;
  return (
    <ul className="space-y-0.5">
      {changes.map((c) => (
        <li key={c.field}>
          <span className="font-semibold text-gray-600">{c.label}:</span> <span className="whitespace-nowrap">{changeValue(c.field, c.before)} <span className="text-gray-400">→</span> {changeValue(c.field, c.after)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Opravy: visits reopened for correction, who and why, the result before and after. */
export function MvtReopensClient() {
  const { meta } = useMeta();
  const { get, set } = useUrlParams();
  const today = meta?.today ?? '';
  const from = isYmd(get('from')) ? get('from') : shiftYmd(today, -29);
  const to = isYmd(get('to')) ? get('to') : today;
  const person = get('person');
  const onlyOpen = get('open') === '1';
  const side = get('side') === 'ovt' ? 'ovt' : get('side') === 'all' ? 'all' : 'mvt';
  const { data, error, loading, reload } = useLoad<MvtReopens>(`reopens-${from}-${to}-${person}-${onlyOpen}-${side}`, async (signal) =>
    parseReopens(await tlGet('mvt/reopens', { from, to, person, open: onlyOpen, side }, signal)),
  );

  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Montéři (MVT): Opravy" subtitle="Návštěvy otevřené k opravě. Období = den, kdy se oprava otevřela. Otevřít k opravě jde z Přehledu dne a z Chybí výsledek." />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <DateRange from={from} to={to} onChange={(f, t) => set({ from: f, to: t })} />
          <PersonSelect side="mvt" value={person} onChange={(v) => set({ person: v })} />
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-700">Strana</span>
            <select value={side} onChange={(e) => set({ side: e.target.value === 'mvt' ? null : e.target.value })} className={inputCls}>
              <option value="mvt">montáže a servis</option>
              <option value="ovt">zaměření</option>
              <option value="all">vše</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => set({ open: e.target.checked ? '1' : null })} />
            jen dosud otevřené{data ? ` (${data.openCount})` : ''}
          </label>
          <button type="button" className={btnSmall} onClick={reload}>Obnovit</button>
        </div>
        {error && <LoadError error={error} onRetry={reload} />}
        {!data && !error && <Skeleton />}
        {data?.truncated && <Alert tone="amber">Seznam je zkrácený (nejvýše 1000 řádků).</Alert>}
        {data && (data.rows.length === 0 ? (
          <Empty title="Žádné opravy v tomto období" />
        ) : (
          <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Otevřeno</th>
                  <th className="px-3 py-2">Návštěva</th>
                  <th className="px-3 py-2">Důvod</th>
                  <th className="px-3 py-2">Výsledek před a po</th>
                  <th className="px-3 py-2">Změněno</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2">
                      {fmtDateTime(r.at)}
                      <p className="text-xs text-gray-500">{r.reopenedBy ?? '—'}</p>
                      <Chip tone={r.stillOpen ? 'amber' : 'green'}>{r.stillOpen ? 'Otevřeno k opravě' : 'Znovu uzavřeno'}</Chip>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{r.event.customer?.name ?? r.event.title ?? '—'}</p>
                      <p className="text-xs text-gray-500">{r.event.typeLabel} · {fmtDateTime(r.event.startsAt)} · {r.event.people.map((p) => p.name).join(', ') || 'bez vlastníka'}</p>
                    </td>
                    <td className="max-w-xs px-3 py-2 text-gray-800">{r.reason ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Snapshot s={r.before} label="Před" />
                      <Snapshot s={r.after} label="Po" />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700"><Changes changes={r.changes} fallback={r.after ? 'beze změny' : '—'} /></td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs"><EventLinks ev={r.event} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </main>
  );
}
