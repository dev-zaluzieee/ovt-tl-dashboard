'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DayGroup, EventView } from '@/lib/types';
import { assignLanes, barGeometry, nowLeftPct, visibleHourRange } from '@/lib/dayGrid';
import { fmtTimeRange } from '@/lib/format';
import { B2BBadge, EventLinks, Modal, StateChip, stateBarClass } from '@/app/components/ui/kit';
import { B2BControl } from './B2BControl';

const LANE_H = 26;
const LANE_GAP = 4;
const PAD = 8;

function EventDetail({ ev, onChanged, onClose }: { ev: EventView; onChanged: () => void; onClose: () => void }) {
  return (
    <Modal title={ev.customer?.name ?? ev.title ?? `Událost ${ev.id}`} onClose={onClose}>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-gray-500">Typ</dt>
        <dd>{ev.typeLabel}</dd>
        <dt className="text-gray-500">Čas</dt>
        <dd>{fmtTimeRange(ev.startsAt, ev.endsAt)}</dd>
        <dt className="text-gray-500">Stav</dt>
        <dd>
          <StateChip ev={ev} />
          {ev.tabletDraft && <span className="ml-2 text-xs text-sky-700">rozpracováno v tabletu</span>}
        </dd>
        {ev.result && (
          <>
            <dt className="text-gray-500">Výsledek</dt>
            <dd>
              {ev.result.outcomeLabel ?? '—'}
              {ev.result.reasonLabel ? ` · ${ev.result.reasonLabel}` : ''}
              {!ev.result.current && <span className="ml-1 text-xs text-amber-800">(původní, návštěva je otevřená k opravě)</span>}
            </dd>
          </>
        )}
        {ev.reopen && (
          <>
            <dt className="text-gray-500">Otevřeno k opravě</dt>
            <dd>
              {ev.reopen.actorName ?? '—'}: „{ev.reopen.reason ?? ''}“
            </dd>
          </>
        )}
        <dt className="text-gray-500">Zákazník</dt>
        <dd>
          {ev.customer?.name ?? '—'}
          {ev.customer?.phone ? ` · ${ev.customer.phone}` : ''}
          {ev.customer?.city ? ` · ${ev.customer.city}` : ''}
        </dd>
        <dt className="text-gray-500">Zakázka</dt>
        <dd>
          {ev.orderId ? `#${ev.orderId}` : '—'}
          {ev.orderStatusLabel ? ` · ${ev.orderStatusLabel}` : ''}
        </dd>
        <dt className="text-gray-500">Obchodník</dt>
        <dd>{ev.people.map((p) => p.name).join(', ') || '—'}</dd>
        <dt className="text-gray-500">B2B</dt>
        <dd>
          <B2BControl orderId={ev.orderId} b2b={ev.b2b} onDone={onChanged} />
        </dd>
        <dt className="text-gray-500">V ERP</dt>
        <dd>
          <EventLinks ev={ev} />
        </dd>
      </dl>
    </Modal>
  );
}

/** Time axis per surveyor (Prague time), bars coloured by the visit's state; click a bar for the detail. */
export function DayCalendar({ ymd, groups, nowIso, onChanged }: { ymd: string; groups: DayGroup[]; nowIso: string; onChanged: () => void }) {
  const [open, setOpen] = useState<EventView | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.parse(nowIso));
  useEffect(() => {
    // The backend's clock draws the marker; the browser only advances it between loads.
    const base = Date.parse(nowIso);
    const started = Date.now();
    const t = window.setInterval(() => setNowMs(base + (Date.now() - started)), 30_000);
    return () => window.clearInterval(t);
  }, [nowIso]);

  const all = useMemo(() => groups.flatMap((g) => g.events), [groups]);
  const { startHour, endExclusive } = useMemo(() => visibleHourRange(ymd, all), [ymd, all]);
  const hours = Array.from({ length: endExclusive - startHour }, (_, i) => startHour + i);
  const nowPct = nowLeftPct(ymd, startHour, endExclusive, nowMs);

  const rows = useMemo(
    () =>
      groups.map((g) => {
        const bars = g.events.flatMap((ev) => {
          const geo = barGeometry(ev, ymd, startHour, endExclusive);
          return geo ? [{ item: ev, ...geo }] : [];
        });
        const laned = assignLanes(bars);
        const laneCount = laned.length ? Math.max(...laned.map((b) => b.lane)) + 1 : 1;
        return { g, laned, height: PAD * 2 + laneCount * LANE_H + (laneCount - 1) * LANE_GAP };
      }),
    [groups, ymd, startHour, endExclusive],
  );

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {[
          ['border-slate-400 bg-slate-200', 'Naplánováno / bez výsledku'],
          ['border-blue-500 bg-blue-100', 'Probíhá'],
          ['border-sky-500 bg-sky-100', 'Rozpracováno v tabletu'],
          ['border-rose-500 bg-rose-100', 'Po termínu bez výsledku'],
          ['border-amber-500 bg-amber-100', 'Po konci / otevřeno k opravě'],
          ['border-green-600 bg-green-100', 'Uzavřeno'],
        ].map(([c, l]) => (
          <li key={l} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm border ${c}`} />
            {l}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-px shrink-0 bg-red-500" />
          Nyní
        </li>
      </ul>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="min-w-[720px]">
          <div className="grid border-b border-gray-200 bg-gray-50" style={{ gridTemplateColumns: 'minmax(10rem,12rem) 1fr' }}>
            <div className="border-r border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Obchodník</div>
            <div className="relative flex min-h-[2.5rem]">
              {hours.map((h) => (
                <div key={h} className="flex-1 border-l border-gray-200/80 py-2 text-center text-[11px] font-semibold tabular-nums text-gray-600 first:border-l-0">
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
              {nowPct !== null && <div className="pointer-events-none absolute inset-y-0 z-[15] w-px bg-red-500" style={{ left: `${nowPct}%` }} />}
            </div>
          </div>
          {rows.map(({ g, laned, height }) => (
            <div key={g.person?.id ?? 'none'} className="grid border-b border-gray-100 last:border-b-0" style={{ gridTemplateColumns: 'minmax(10rem,12rem) 1fr' }}>
              <div className="border-r border-gray-200 px-3 py-3">
                <p className="text-sm font-semibold text-gray-900">{g.person?.name ?? 'Bez vlastníka'}</p>
                <p className="text-xs text-gray-500">{g.events.length} návštěv</p>
              </div>
              <div className="relative" style={{ minHeight: Math.max(height, 56) }}>
                <div className="pointer-events-none absolute inset-0 flex" aria-hidden>
                  {hours.map((h) => (
                    <div key={h} className="flex-1 border-l border-gray-200/80 first:border-l-0" />
                  ))}
                </div>
                {laned.map((b) => (
                  <button
                    key={b.item.id}
                    type="button"
                    onClick={() => setOpen(b.item)}
                    title={`${b.item.customer?.name ?? b.item.title ?? ''} · ${fmtTimeRange(b.item.startsAt, b.item.endsAt)} · ${b.item.state.label}`}
                    className={`absolute flex max-w-full items-center gap-1 overflow-hidden rounded-md border px-1.5 text-left text-xs font-medium shadow-sm transition ${stateBarClass(b.item.state.code)}`}
                    style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%`, top: PAD + b.lane * (LANE_H + LANE_GAP), height: LANE_H }}
                  >
                    {b.item.b2b && <B2BBadge b2b />}
                    <span className="block truncate">{b.item.customer?.name ?? b.item.title ?? `#${b.item.id}`}</span>
                  </button>
                ))}
                {nowPct !== null && <div className="pointer-events-none absolute inset-y-0 z-[15] w-px bg-red-500" style={{ left: `${nowPct}%` }} />}
              </div>
            </div>
          ))}
        </div>
      </div>
      {open && <EventDetail ev={open} onChanged={onChanged} onClose={() => setOpen(null)} />}
    </div>
  );
}
