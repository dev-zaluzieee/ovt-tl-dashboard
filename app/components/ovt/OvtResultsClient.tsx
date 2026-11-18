'use client';

import { useState } from 'react';
import { tlGet } from '@/lib/tl-api';
import { parseResults, parseVisits } from '@/lib/tl-parse';
import type { EventView, OvtResults } from '@/lib/types';
import { daysBetween, fmtDateTime, fmtTimeRange, fmtYmd, isYmd, shiftYmd } from '@/lib/format';
import { useHistoryMin, useMeta } from '@/app/components/shell/MetaContext';
import { DateRange, PersonSelect, useUrlParams } from '@/app/components/ui/filters';
import { Alert, Empty, EventLinks, LoadError, Modal, PageHeader, Skeleton, StateChip, btnSmall } from '@/app/components/ui/kit';
import { useLoad } from '@/app/components/ui/useLoad';

const ORDER = ['order', 'retence', 'nedopadlo', 'nezastizen', 'zruseno', 'closed_no_result', 'legacy_no_result', 'no_result', 'reopened', 'other'];

interface Drill {
  person: { id: number | 'none'; name: string };
  bucket: string;
  reason?: string;
  title: string;
}

function DrillDown({ d, from, to, onClose }: { d: Drill; from: string; to: string; onClose: () => void }) {
  const { data, error } = useLoad(`drill-${d.person.id}-${d.bucket}-${d.reason}-${from}-${to}`, async (signal) =>
    parseVisits(await tlGet('ovt/results/visits', { from, to, person: String(d.person.id), bucket: d.bucket, reason: d.reason }, signal)),
  );
  return (
    <Modal title={`${d.person.name}: ${d.title}`} onClose={onClose} wide>
      <p className="mb-2 text-xs text-gray-500">
        {fmtYmd(from)} až {fmtYmd(to)}
      </p>
      {error && <LoadError error={error} />}
      {!data && !error && <Skeleton rows={3} h="h-8" />}
      {data && (
        <>
          {data.truncated && <Alert tone="amber">Seznam je zkrácený na 1000 návštěv.</Alert>}
          {data.visits.length === 0 ? (
            <Empty title="Žádné návštěvy" />
          ) : (
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {data.visits.map((v: EventView) => (
                  <tr key={v.id} className="align-top">
                    <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-gray-700">
                      {fmtYmd(v.day)} {fmtTimeRange(v.startsAt, v.endsAt)}
                    </td>
                    <td className="py-1.5 pr-3">
                      <p className="font-medium text-gray-900">{v.customer?.name ?? v.title ?? '—'}</p>
                      <p className="text-xs text-gray-500">{v.result?.reasonLabel ?? v.result?.outcomeLabel ?? ''}</p>
                    </td>
                    <td className="py-1.5 pr-3">
                      <StateChip ev={v} />
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-right text-xs">
                      <EventLinks ev={v} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Modal>
  );
}

/** Výsledky: counts of surveys per surveyor by what the visit ended with, drill-down to the visits. */
export function OvtResultsClient() {
  const { meta } = useMeta();
  const historyMin = useHistoryMin();
  const { get, set } = useUrlParams();
  const [drill, setDrill] = useState<Drill | null>(null);
  const today = meta?.today ?? '';
  const defFrom = `${today.slice(0, 8)}01`;
  const from = isYmd(get('from')) ? get('from') : defFrom;
  const to = isYmd(get('to')) ? get('to') : today;
  const person = get('person');
  const tooLong = daysBetween(from, to) > (meta?.limits.maxRangeDays ?? 92) - 1;
  const bad = to < from || tooLong;

  const { data, error, loading, reload } = useLoad<OvtResults | null>(bad ? 'bad' : `results-${from}-${to}-${person}`, async (signal) =>
    bad ? null : parseResults(await tlGet('ovt/results', { from, to, person }, signal)),
  );
  const buckets = data ? ORDER.filter((b) => b in data.bucketLabels || (data.totals[b] ?? 0) > 0) : [];

  const presets: Array<[string, string, string]> = [
    ['Tento měsíc', defFrom, today],
    ['Posledních 30 dní', shiftYmd(today, -29), today],
    ['Minulý měsíc', (() => { const [y, m] = defFrom.split('-').map(Number); const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1; return `${py}-${String(pm).padStart(2, '0')}-01`; })(), shiftYmd(defFrom, -1)],
  ];

  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Výsledky" subtitle="Zaměření, která skončila, podle výsledku návštěvy. Období = den návštěvy (pražský čas). Počty, bez hodnoty zakázek." />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <DateRange from={from} to={to} min={historyMin} onChange={(f, t) => set({ from: f, to: t })} />
          {presets.map(([l, f, t]) => (
            <button key={l} type="button" className={btnSmall} onClick={() => set({ from: f, to: t })}>
              {l}
            </button>
          ))}
          <PersonSelect side="ovt" scope="history" value={person} onChange={(v) => set({ person: v })} />
        </div>
        {bad && <Alert tone="amber">Zvolte období od–do, nejvýše {meta?.limits.maxRangeDays ?? 92} dní.</Alert>}
        {error && <LoadError error={error} onRetry={reload} />}
        {!data && !error && !bad && <Skeleton />}
        {data && !bad && (
          data.rows.length === 0 ? (
            <Empty title="Za toto období nejsou žádná ukončená zaměření" />
          ) : (
            <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">OVT</th>
                    <th className="px-3 py-2">Celkem</th>
                    {buckets.map((b) => (
                      <th key={b} className="px-3 py-2">{data.bucketLabels[b] ?? b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map((r) => {
                    const who = { id: (r.person?.id ?? 'none') as number | 'none', name: r.person?.name ?? 'Bez vlastníka' };
                    return (
                      <tr key={who.id} className="align-top">
                        <td className="px-3 py-1.5 font-medium text-gray-900">{who.name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{r.total}</td>
                        {buckets.map((b) => {
                          const n = r.buckets[b] ?? 0;
                          return (
                            <td key={b} className="px-3 py-1.5 text-right tabular-nums">
                              {n > 0 ? (
                                <button type="button" className="text-blue-700 hover:underline" onClick={() => setDrill({ person: who, bucket: b, title: data.bucketLabels[b] ?? b })}>
                                  {n}
                                </button>
                              ) : (
                                <span className="text-gray-300">0</span>
                              )}
                              {b === 'nedopadlo' && r.nedopadloReasons.length > 0 && (
                                <div className="mt-0.5 space-y-0.5 text-[11px] text-gray-500">
                                  {r.nedopadloReasons.map((x) => (
                                    <button key={x.reason} type="button" className="block w-full text-right hover:underline" onClick={() => setDrill({ person: who, bucket: 'nedopadlo', reason: x.reason, title: `Nedopadlo: ${x.label}` })}>
                                      {x.label} {x.count}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-2">Celkem</td>
                    <td className="px-3 py-2 text-right tabular-nums">{data.total}</td>
                    {buckets.map((b) => (
                      <td key={b} className="px-3 py-2 text-right tabular-nums">{data.totals[b] ?? 0}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )
        )}
        {data?.note && <p className="text-xs text-gray-500">{data.note}</p>}
        {data && <p className="text-xs text-gray-400">Načteno {fmtDateTime(meta?.now ?? null)}. „Uzavřeno bez výsledku“ zahrnuje i návštěvy uzavřené ze zakázky.</p>}
      </div>
      {drill && <DrillDown d={drill} from={from} to={to} onClose={() => setDrill(null)} />}
    </main>
  );
}
