'use client';

import { useState } from 'react';
import { tlGet, tlSend } from '@/lib/tl-api';
import { parseMissing } from '@/lib/tl-parse';
import { errorText } from '@/lib/tl-errors';
import type { EventView, MissingRow, MvtMissing } from '@/lib/types';
import { fmtDateTime, fmtYmd, isYmd, shiftYmd } from '@/lib/format';
import { useMeta } from '@/app/components/shell/MetaContext';
import { DateRange, PersonSelect, useUrlParams } from '@/app/components/ui/filters';
import { Alert, Chip, Empty, EventLinks, LoadError, PageHeader, ReasonDialog, Skeleton, StateChip, btnSmall } from '@/app/components/ui/kit';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { useLoad } from '@/app/components/ui/useLoad';
import { ReopenButton } from './ReopenButton';
import { ResultLine } from './MvtDayClient';

/** Chybí výsledek: visits past their end without a result, who owes them, what was closed outside the app. */
export function MvtMissingClient() {
  const { meta } = useMeta();
  const { get, set } = useUrlParams();
  const [density, setDensity] = useListDensity();
  const [closing, setClosing] = useState<MissingRow | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const today = meta?.today ?? '';
  const from = isYmd(get('from')) ? get('from') : shiftYmd(today, -13);
  const to = isYmd(get('to')) ? get('to') : today;
  const person = get('person');
  const handled = get('handled') === '1';

  const { data, error, loading, reload } = useLoad<MvtMissing>(`missing-${from}-${to}-${person}-${handled}`, async (signal) =>
    parseMissing(await tlGet('mvt/missing', { from, to, person, includeHandled: handled }, signal)),
  );
  const pad = density === 'compact' ? 'px-3 py-1' : 'px-3 py-2';

  async function undo(r: MissingRow) {
    if (!r.resolution) return;
    setRowError(null);
    try {
      await tlSend('POST', `resolutions/${r.resolution.id}/undo`);
      setNotice('Uzavření bylo vzato zpět.');
      reload();
    } catch (e) {
      setRowError(errorText(e));
    }
  }

  function table(rows: MissingRow[], title: string, hint: string) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">
          {title} <span className="text-sm font-normal text-gray-500">({rows.length})</span>
        </h2>
        <p className="text-xs text-gray-500">{hint}</p>
        {rows.length === 0 ? (
          <Empty title="Nic nechybí" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.event.id} className={`align-top ${r.resolution ? 'bg-gray-50 text-gray-500' : ''}`}>
                    <td className={`${pad} whitespace-nowrap tabular-nums`}>{fmtDateTime(r.event.startsAt)}</td>
                    <td className={pad}><Chip tone="slate">{r.event.typeLabel}</Chip></td>
                    <td className={pad}>
                      <p className="font-medium text-gray-900">{r.event.customer?.name ?? r.event.title ?? '—'}</p>
                      {density === 'standard' && r.event.customer?.city && <p className="text-xs text-gray-500">{r.event.customer.city}</p>}
                    </td>
                    <td className={`${pad} whitespace-nowrap`}>{r.event.people.map((p) => p.name).join(', ') || <span className="text-gray-400">bez montéra</span>}</td>
                    <td className={pad}>
                      <StateChip ev={r.event} />
                      <p className="mt-0.5 text-xs text-gray-500">{r.ageDays} dní po termínu</p>
                      {r.resolution && (
                        <p className="mt-0.5 text-xs text-gray-600">
                          Uzavřeno: {data?.closeReasons[r.resolution.reason] ?? r.resolution.reason} · {r.resolution.actorName ?? r.resolution.actorEmail} · {fmtDateTime(r.resolution.createdAt)}
                          {r.resolution.note ? ` · „${r.resolution.note}“` : ''}
                        </p>
                      )}
                    </td>
                    <td className={`${pad} whitespace-nowrap text-right text-xs`}>
                      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                        {r.resolution ? (
                          <button type="button" className={btnSmall} onClick={() => void undo(r)}>Vrátit zpět</button>
                        ) : (
                          <button type="button" className={btnSmall} onClick={() => setClosing(r)}>Uzavřít</button>
                        )}
                        <EventLinks ev={r.event} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Montéři (MVT): Chybí výsledek" subtitle="Přiřazené návštěvy po termínu (více než 2 h po konci) bez zaznamenaného výsledku." />
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <DateRange from={from} to={to} onChange={(f, t) => set({ from: f, to: t })} />
          <PersonSelect side="mvt" value={person} onChange={(v) => set({ person: v })} />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={handled} onChange={(e) => set({ handled: e.target.checked ? '1' : null })} />
            zobrazit i uzavřené řádky{data && data.handledCount ? ` (${data.handledCount})` : ''}
          </label>
          <DensityToggle density={density} onChange={setDensity} />
          <button type="button" className={btnSmall} onClick={reload}>Obnovit</button>
        </div>
        {notice && <Alert tone="green">{notice}</Alert>}
        {rowError && <Alert tone="red">{rowError}</Alert>}
        {error && <LoadError error={error} onRetry={reload} />}
        {data?.warnings.map((w) => (
          <Alert key={w} tone="amber">{w}</Alert>
        ))}
        {!data && !error && <Skeleton />}
        {data && (
          <div className={`space-y-6 ${loading ? 'opacity-60' : ''}`}>
            {data.truncated && <Alert tone="amber">Seznam je zkrácený (nejvýše 1000 řádků).</Alert>}
            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">Kdo dluží výsledek</h2>
              {data.owing.length === 0 ? (
                <p className="text-sm text-gray-500">Nikdo.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.owing.map((o) => (
                    <Chip key={o.person?.id ?? 'none'} tone="rose" active={!!o.person && person === String(o.person.id)} onClick={o.person ? () => set({ person: person === String(o.person!.id) ? null : String(o.person!.id) }) : undefined}>
                      {o.person?.name ?? 'Bez montéra'} · {o.count}
                    </Chip>
                  ))}
                </div>
              )}
            </section>
            {table(data.recent, `Chybí za posledních ${data.thresholds.recentDays} dní`, 'Čerstvé návštěvy, které montér ještě nezapsal.')}
            {table(data.backlog, 'Starší nedodělky', `Starší než ${data.thresholds.recentDays} dní.`)}
            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">
                Uzavřeno mimo aplikaci <span className="text-sm font-normal text-gray-500">({data.closedOutside.count})</span>
              </h2>
              <p className="text-xs text-gray-500">Dokončeno v ERP bez výsledku nebo uzavřeno ze zakázky. {data.closedOutside.count > data.closedOutside.rows.length ? `Zobrazeno prvních ${data.closedOutside.rows.length}.` : ''}</p>
              {data.closedOutside.rows.length === 0 ? (
                <Empty title="Nic" />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                  <table className="min-w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {data.closedOutside.rows.map((e: EventView) => (
                        <tr key={e.id} className="align-top">
                          <td className={`${pad} whitespace-nowrap tabular-nums`}>{fmtDateTime(e.startsAt)}</td>
                          <td className={pad}><Chip tone="slate">{e.typeLabel}</Chip></td>
                          <td className={pad}>{e.customer?.name ?? e.title ?? '—'}</td>
                          <td className={pad}>{e.people.map((p) => p.name).join(', ') || '—'}</td>
                          <td className={pad}><StateChip ev={e} /><ResultLine ev={e} /></td>
                          <td className={`${pad} whitespace-nowrap text-right text-xs`}>
                            <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                              <ReopenButton ev={e} onDone={reload} />
                              <EventLinks ev={e} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <p className="text-xs text-gray-400">Období {fmtYmd(data.from)} až {fmtYmd(data.to)}.</p>
          </div>
        )}
      </div>
      {closing && data && (
        <ReasonDialog
          title="Uzavřít řádek"
          intro={<>{closing.event.customer?.name ?? closing.event.title} · {closing.event.typeLabel}. Uzavření je vaše poznámka v dashboardu, do ERP se nic nezapisuje; jde vzít zpět.</>}
          reasons={data.closeReasons}
          submitLabel="Uzavřít"
          onClose={() => setClosing(null)}
          onSubmit={async ({ reason, note }) => {
            await tlSend('POST', 'mvt/missing/close', { eventId: closing.event.id, reason, note: note || undefined });
            setNotice('Řádek byl uzavřen.');
            reload();
          }}
        />
      )}
    </main>
  );
}
