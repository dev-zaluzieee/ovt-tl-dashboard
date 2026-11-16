'use client';

import { useCallback } from 'react';
import { tlGet } from '@/lib/tl-api';
import { parseOvtDay } from '@/lib/tl-parse';
import type { OvtDay } from '@/lib/types';
import { isYmd } from '@/lib/format';
import { useMeta } from '@/app/components/shell/MetaContext';
import { DayNav, PersonSelect, SearchBox, useUrlParams } from '@/app/components/ui/filters';
import { Alert, Empty, LoadError, PageHeader, Skeleton } from '@/app/components/ui/kit';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { useLoad } from '@/app/components/ui/useLoad';
import { DayCalendar } from './DayCalendar';
import { DayList } from './DayList';

/** Přehled dne (OVT): zaměření a znovuzaměření of one Prague day per surveyor, calendar or list, a state per visit. */
export function OvtDayClient() {
  const { meta } = useMeta();
  const { get, set } = useUrlParams();
  const [density, setDensity] = useListDensity();
  const today = meta?.today ?? '';
  const dateRaw = get('date');
  const date = isYmd(dateRaw) ? dateRaw : today;
  const person = get('person');
  const q = get('q');
  const view = get('view') === 'list' ? 'list' : 'calendar';
  const onQ = useCallback((v: string) => set({ q: v }), [set]);

  const { data, error, loading, reload } = useLoad<OvtDay>(`ovt-day-${date}-${person}-${q}`, async (signal) =>
    parseOvtDay(await tlGet('ovt/day', { date, person, q }, signal)),
  );

  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Přehled dne" subtitle="Zaměření a znovuzaměření vybraného dne (pražský čas), po jednotlivých OVT." />
      <div className="space-y-4">
        <DayNav date={date} today={today} onChange={(d) => set({ date: d === today ? null : d })} />
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <PersonSelect side="ovt" value={person} onChange={(v) => set({ person: v })} />
          <SearchBox value={q} onChange={onQ} placeholder="Hledat v tomto dni: zákazník, telefon, číslo zakázky…" ignored={data?.qIgnored} />
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="Způsob zobrazení">
            {(['calendar', 'list'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => set({ view: v === 'list' ? 'list' : null })} className={`rounded-md px-3 py-1 text-sm font-semibold ${view === v ? 'bg-[#1E8449] text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                {v === 'calendar' ? 'Kalendář' : 'Seznam'}
              </button>
            ))}
          </div>
          {view === 'list' && <DensityToggle density={density} onChange={setDensity} />}
        </div>

        {error && <LoadError error={error} onRetry={reload} />}
        {!data && !error && <Skeleton rows={3} h="h-24" />}
        {data && (
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              {[
                ['OVT', data.tiles.people],
                ['Návštěv', data.tiles.events],
                ['Z toho uzavřeno', data.tiles.closed],
              ].map(([l, v]) => (
                <div key={l} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{l}</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">{v}</p>
                </div>
              ))}
            </div>
            {data.truncated && <Alert tone="amber">Seznam je zkrácený (nejvýše 1000 řádků). Zúžte filtr.</Alert>}
            {data.events.length === 0 ? (
              <Empty title="Pro tento den nejsou žádná zaměření">Zkuste jiný den nebo zrušte filtr. Zobrazují se jen návštěvy od začátku nového provozu.</Empty>
            ) : view === 'calendar' ? (
              <DayCalendar ymd={data.date} groups={data.groups} nowIso={data.now} onChanged={reload} />
            ) : (
              <DayList groups={data.groups} density={density} onChanged={reload} />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
