'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { tlGet } from '@/lib/tl-api';
import { parseMvtDay } from '@/lib/tl-parse';
import type { EventView, MvtDay } from '@/lib/types';
import { fmtDateTime, fmtKc, fmtTimeRange, isYmd, plural } from '@/lib/format';
import { useHistoryMin, useMeta } from '@/app/components/shell/MetaContext';
import { DayNav, PersonSelect, SearchBox, useUrlParams } from '@/app/components/ui/filters';
import { Alert, Chip, Empty, EventLinks, LoadError, PageHeader, Skeleton, StateChip, btnSmall, stateTone } from '@/app/components/ui/kit';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { useLoad } from '@/app/components/ui/useLoad';
import { ReopenButton } from './ReopenButton';

export function ResultLine({ ev }: { ev: EventView }) {
  const r = ev.result;
  if (!r) return null;
  const bits = [r.outcomeLabel, r.reasonLabel, r.collectedAmount !== null ? `vybráno ${fmtKc(r.collectedAmount)}` : null, r.paymentMethodLabel, r.discountAmount ? `sleva ${fmtKc(r.discountAmount)}` : null].filter(Boolean);
  return (
    <p className="mt-0.5 text-xs text-gray-600">
      {bits.join(' · ')}
      {!r.current && <span className="text-amber-800"> (původní, otevřeno k opravě)</span>}
    </p>
  );
}

/** Přehled dne (MVT): montáže, servisy, reklamace and placené opravy per fitter, state chips, refresh every 120 s. */
export function MvtDayClient() {
  const { meta } = useMeta();
  const historyMin = useHistoryMin();
  const { get, set } = useUrlParams();
  const [density, setDensity] = useListDensity();
  const [picked, setPicked] = useState<string[]>([]);
  const today = meta?.today ?? '';
  const dateRaw = get('date');
  const date = isYmd(dateRaw) ? dateRaw : today;
  const person = get('person');
  const q = get('q');
  const showAll = get('all') === '1';
  const onQ = useCallback((v: string) => set({ q: v }), [set]);

  const { data, error, loading, reload } = useLoad<MvtDay>(`mvt-day-${date}-${person}-${q}`, async (signal) => parseMvtDay(await tlGet('mvt/day', { date, person, q }, signal)), { refreshMs: 120_000 });

  const quiet = useMemo(() => new Set(data?.quietStates ?? meta?.vocabulary.quietStates ?? []), [data, meta]);
  const visibleGroups = useMemo(() => {
    if (!data) return [];
    const keep = (e: EventView) => (picked.length ? picked.includes(e.state.code) : showAll || !quiet.has(e.state.code));
    return data.groups.map((g) => ({ ...g, events: g.events.filter(keep) })).filter((g) => g.events.length > 0);
  }, [data, picked, showAll, quiet]);
  const hidden = data && !showAll && !picked.length ? data.events.filter((e) => quiet.has(e.state.code)).length : 0;
  const pad = density === 'compact' ? 'px-3 py-1' : 'px-3 py-2';
  const stateLabels = meta?.vocabulary.states ?? {};

  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Montéři (MVT): Přehled dne" subtitle="Montáže, servisy, reklamace a placené opravy dne po montérech. Stránka se sama obnovuje každé 2 minuty." />
      <div className="space-y-4">
        <DayNav date={date} today={today} min={historyMin} onChange={(d) => set({ date: d === today ? null : d })} />
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <PersonSelect side="mvt" scope="history" value={person} onChange={(v) => set({ person: v })} />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={showAll} onChange={(e) => set({ all: e.target.checked ? '1' : null })} />
            zobrazit i uzavřené a bez montéra{hidden ? ` (${hidden})` : ''}
          </label>
          <SearchBox value={q} onChange={onQ} placeholder="Hledat v tomto dni: zákazník, telefon, číslo zakázky…" ignored={data?.qIgnored} />
          <DensityToggle density={density} onChange={setDensity} />
          <button type="button" className={btnSmall} onClick={reload}>
            Obnovit
          </button>
        </div>

        {error && <LoadError error={error} onRetry={reload} />}
        {data?.warnings.map((w) => (
          <Alert key={w} tone="amber">{w}</Alert>
        ))}
        {!data && !error && <Skeleton />}
        {data && (
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
              <span className="font-semibold text-gray-900">{data.tiles.events} {plural(data.tiles.events, 'událost', 'události', 'událostí')}</span>
              <span className="text-green-800">uzavřeno <b>{data.tiles.closed}</b></span>
              <span className={data.tiles.open ? 'font-semibold text-rose-700' : 'text-gray-500'}>otevřeno <b>{data.tiles.open}</b></span>
              <span className="ml-auto text-xs text-gray-400">načteno {fmtDateTime(data.now)}</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Object.entries(data.stateCounts).map(([code, n]) => (
                <Chip key={code} tone={stateTone(code)} active={picked.includes(code)} onClick={() => setPicked((p) => (p.includes(code) ? p.filter((x) => x !== code) : [...p, code]))}>
                  {stateLabels[code] ?? code} · {n}
                </Chip>
              ))}
            </div>
            {data.truncated && <Alert tone="amber">Seznam je zkrácený (nejvýše 1000 řádků).</Alert>}
            {visibleGroups.length === 0 ? (
              <Empty title={hidden ? 'Nic otevřeného' : 'Žádné události pro tento den a filtr'}>
                {hidden ? `${hidden} uzavřených nebo nepřiřazených událostí je skryto, zapněte „zobrazit i uzavřené“.` : 'Zkuste jiný den nebo zrušte filtr.'}
              </Empty>
            ) : (
              <div className="space-y-4">
                {visibleGroups.map((g) => (
                  <section key={g.person?.id ?? 'none'} className="rounded-lg border border-gray-200 bg-white">
                    <h2 className="flex items-center justify-between border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-800">
                      <span>{g.person?.name ?? 'Bez montéra'}</span>
                      <span className="text-xs font-normal text-gray-500">{g.events.length} {plural(g.events.length, 'událost', 'události', 'událostí')}</span>
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <tbody>
                          {g.events.map((e) => {
                            const partners = e.people.filter((p) => p.id !== g.person?.id);
                            return (
                              <tr key={e.id} className="border-t border-gray-100 align-top hover:bg-gray-50">
                                <td className={`${pad} whitespace-nowrap tabular-nums text-gray-700`}>{fmtTimeRange(e.startsAt, e.endsAt)}</td>
                                <td className={pad}><Chip tone="slate">{e.typeLabel}</Chip></td>
                                <td className={pad}>
                                  <p className="font-medium text-gray-900">{e.customer?.name ?? e.title ?? '—'}</p>
                                  {density === 'standard' && e.customer?.city && <p className="text-xs text-gray-500">{e.customer.city}</p>}
                                  {partners.length > 0 && <p className="text-xs text-sky-700">ve dvou s {partners.map((p) => p.name).join(' a ')}</p>}
                                </td>
                                <td className={`${pad} text-xs text-gray-600`}>
                                  {e.orderId ? `#${e.orderId}${e.orderStatusLabel ? ` · ${e.orderStatusLabel}` : ''}` : e.link?.code === 'bez_zakazky' ? <span className="text-amber-700">montáž bez zakázky</span> : '—'}
                                  {e.claim && <p>Reklamace #{e.claim.id}{e.claim.statusLabel ? ` · ${e.claim.statusLabel}` : ''}</p>}
                                  {e.link?.code === 'bez_reklamace' && <p className="text-amber-700">návštěva bez reklamace</p>}
                                  {e.link?.code === 'servis_ze_zakazky' && <p className="text-gray-500">servis ze zakázky: uzavírá kancelář</p>}
                                </td>
                                <td className={pad}>
                                  <StateChip ev={e} />
                                  {e.app && <p className="mt-0.5 text-xs text-gray-600">Aplikace: {e.app.statusLabel ?? e.app.status}{e.app.outcomeLabel ? ` · ${e.app.outcomeLabel}` : ''}</p>}
                                  {e.reopenRequest && <p className="mt-0.5 text-xs text-sky-800">Montér žádá o otevření{e.reopenRequest.requestedByName ? ` (${e.reopenRequest.requestedByName})` : ''}: „{e.reopenRequest.reason}“ <Link href="/mvt/opravy" className="text-blue-600 hover:underline">Vyřídit</Link></p>}
                                  {e.reopen && <p className="mt-0.5 text-xs text-amber-800">{e.reopen.actorName ?? ''}: „{e.reopen.reason ?? ''}“</p>}
                                  <ResultLine ev={e} />
                                </td>
                                <td className={`${pad} whitespace-nowrap text-right text-xs`}>
                                  <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                                    <ReopenButton ev={e} onDone={reload} />
                                    {e.app && <Link href={`/mvt/zapisy?eventId=${e.id}`} className="text-blue-600 hover:underline">Zápis</Link>}
                                    {['overdue', 'closed_from_order', 'closed_no_result'].includes(e.state.code) && <Link href="/mvt/nedokoncene" className="text-blue-600 hover:underline">Chybí výsledek</Link>}
                                    <EventLinks ev={e} />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
