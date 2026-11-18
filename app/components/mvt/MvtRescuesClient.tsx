'use client';

import { useCallback } from 'react';
import { tlGet } from '@/lib/tl-api';
import { parseRescues } from '@/lib/tl-parse';
import type { MvtRescues } from '@/lib/types';
import { fmtDateTime, fmtKc, isYmd, shiftYmd } from '@/lib/format';
import { useHistoryMin, useMeta } from '@/app/components/shell/MetaContext';
import { DateRange, PersonSelect, SearchBox, useUrlParams } from '@/app/components/ui/filters';
import { Alert, Chip, Empty, EventLinks, LoadError, PageHeader, Skeleton, btnSmall } from '@/app/components/ui/kit';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { useLoad } from '@/app/components/ui/useLoad';

/** Záchrany: montáže dokončené se záchranou, sleva a zda po nich přišla reklamace. */
export function MvtRescuesClient() {
  const { meta } = useMeta();
  const historyMin = useHistoryMin();
  const { get, set } = useUrlParams();
  const [density, setDensity] = useListDensity();
  const today = meta?.today ?? '';
  const from = isYmd(get('from')) ? get('from') : shiftYmd(today, -29);
  const to = isYmd(get('to')) ? get('to') : today;
  const person = get('person');
  const q = get('q');
  const onQ = useCallback((v: string) => set({ q: v }), [set]);
  const { data, error, loading, reload } = useLoad<MvtRescues>(`rescues-${from}-${to}-${person}-${q}`, async (signal) => parseRescues(await tlGet('mvt/rescues', { from, to, person, q }, signal)));
  const pad = density === 'compact' ? 'px-2 py-1' : 'px-3 py-2';
  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Montéři (MVT): Záchrany" subtitle="Montáže dokončené se záchranou: co bylo špatně, sleva a jestli po nich později přišla reklamace na stejnou zakázku." />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <DateRange from={from} to={to} min={historyMin} onChange={(f, t) => set({ from: f, to: t })} />
          <PersonSelect side="mvt" scope="history" value={person} onChange={(v) => set({ person: v })} />
          <SearchBox value={q} onChange={onQ} placeholder="Hledat: zákazník, telefon, číslo zakázky…" ignored={data?.qIgnored} />
          <DensityToggle density={density} onChange={setDensity} />
          <button type="button" className={btnSmall} onClick={reload}>Obnovit</button>
        </div>
        {error && <LoadError error={error} onRetry={reload} />}
        {!data && !error && <Skeleton />}
        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ['Záchran', String(data.summary.count)],
                ['Z toho s pozdější reklamací', String(data.summary.claimed)],
                ['Slevy celkem', fmtKc(data.summary.totalDiscount)],
                ['Medián dní do reklamace', data.summary.medianDaysToClaim === null ? '—' : String(data.summary.medianDaysToClaim)],
              ].map(([l, v]) => (
                <div key={l} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{l}</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">{v}</p>
                </div>
              ))}
            </div>
            {data.truncated && <Alert tone="amber">Seznam je zkrácený (nejvýše 1000 řádků).</Alert>}
            {data.rows.length === 0 ? (
              <Empty title="Žádné záchrany v tomto období" />
            ) : (
              <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}>
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr><th className={pad}>Montáž</th><th className={pad}>Montér</th><th className={pad}>Co bylo špatně a jak se vyřešilo</th><th className={`${pad} text-right`}>Sleva</th><th className={pad}>Reklamace potom</th><th className={pad} /></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.rows.map((r) => (
                      <tr key={r.event.id} className="align-top">
                        <td className={pad}>
                          <p className="font-medium text-gray-900">{r.event.customer?.name ?? r.event.title ?? '—'}</p>
                          <p className="text-xs text-gray-500">{fmtDateTime(r.event.startsAt)}{r.event.orderId ? ` · zakázka #${r.event.orderId}` : ''}</p>
                        </td>
                        <td className={`${pad} whitespace-nowrap`}>{r.event.people.map((p) => p.name).join(', ') || '—'}</td>
                        <td className={`${pad} max-w-md text-gray-800`}>{r.rescueNote ?? <span className="text-gray-400">bez popisu</span>}{r.discountNote ? <p className="text-xs text-gray-500">sleva: {r.discountNote}</p> : null}</td>
                        <td className={`${pad} whitespace-nowrap text-right tabular-nums`}>{fmtKc(r.discount)}</td>
                        <td className={`${pad} whitespace-nowrap`}>
                          {r.laterClaim ? <Chip tone="rose">Reklamace #{r.laterClaim.id} po {r.heldDays ?? '?'} dnech</Chip> : r.held ? <Chip tone="green">drží {r.heldDays ?? 0} dní</Chip> : '—'}
                        </td>
                        <td className={`${pad} text-right text-xs`}><EventLinks ev={r.event} claimId={r.laterClaim?.id ?? null} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
