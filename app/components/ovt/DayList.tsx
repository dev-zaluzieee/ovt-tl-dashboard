'use client';

import type { DayGroup } from '@/lib/types';
import { fmtTimeRange, plural } from '@/lib/format';
import { B2BControl } from './B2BControl';
import { Chip, EventLinks, StateChip } from '@/app/components/ui/kit';
import type { ListDensity } from '@/app/components/retention/listDensity';

/** One dense row per visit, grouped per surveyor. */
export function DayList({ groups, density, onChanged }: { groups: DayGroup[]; density: ListDensity; onChanged: () => void }) {
  const pad = density === 'compact' ? 'px-3 py-1' : 'px-3 py-2.5';
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.person?.id ?? 'none'} className="rounded-lg border border-gray-200 bg-white">
          <h2 className="flex items-center justify-between border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-800">
            <span>{g.person?.name ?? 'Bez vlastníka'}</span>
            <span className="text-xs font-normal text-gray-500">
              {g.events.length} {plural(g.events.length, 'návštěva', 'návštěvy', 'návštěv')}
            </span>
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <tbody>
                {g.events.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100 align-top hover:bg-gray-50">
                    <td className={`${pad} whitespace-nowrap tabular-nums text-gray-700`}>{fmtTimeRange(e.startsAt, e.endsAt)}</td>
                    <td className={pad}>
                      <Chip tone="slate">{e.typeLabel}</Chip>
                    </td>
                    <td className={pad}>
                      <p className="font-medium text-gray-900">{e.customer?.name ?? e.title ?? '—'}</p>
                      {density === 'standard' && (
                        <p className="text-xs text-gray-500">
                          {[e.customer?.city, e.customer?.phone].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </td>
                    <td className={`${pad} whitespace-nowrap text-xs text-gray-600`}>{e.orderId ? `#${e.orderId}${e.orderStatusLabel ? ` · ${e.orderStatusLabel}` : ''}` : 'bez zakázky'}</td>
                    <td className={pad}>
                      <StateChip ev={e} />
                      {e.tabletDraft && e.state.code !== 'tablet_in_progress' && <span className="ml-1 text-xs text-sky-700">koncept v tabletu</span>}
                      {e.result && (
                        <p className="mt-0.5 text-xs text-gray-600">
                          {e.result.outcomeLabel}
                          {e.result.reasonLabel ? ` · ${e.result.reasonLabel}` : ''}
                          {!e.result.current ? ' (původní)' : ''}
                        </p>
                      )}
                    </td>
                    <td className={`${pad} whitespace-nowrap`}>
                      <B2BControl orderId={e.orderId} b2b={e.b2b} onDone={onChanged} />
                    </td>
                    <td className={`${pad} whitespace-nowrap text-right text-xs`}>
                      <EventLinks ev={e} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
