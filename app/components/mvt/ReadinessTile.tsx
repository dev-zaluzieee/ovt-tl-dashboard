'use client';

import Link from 'next/link';
import { plural } from '@/lib/format';
import { useReadinessCount } from './useReadinessCount';

/** Tile on the MVT overview: the 7-day red count behind the release gate (at most 15), plus today and tomorrow. Nothing when there is nothing safe to say. */
export function ReadinessTile() {
  const b = useReadinessCount();
  if (!b || !b.gate) return null;
  const urgent = b.urgent > 0 ? ` Dnes a zítra: ${b.urgent} (dnes ${b.todayRed}, zítra ${b.tomorrowRed}).` : '';
  return (
    <Link href="/mvt/pripravenost" className={`block rounded-xl border bg-white p-4 shadow-sm transition hover:shadow ${b.red7 > 0 ? 'border-red-300' : 'border-emerald-200'}`}>
      <p className="font-semibold text-gray-900">Připravenost montáží</p>
      <p className="mt-1 text-sm text-gray-700">
        {b.red7 > 0
          ? `${b.red7} ${plural(b.red7, 'návštěva', 'návštěvy', 'návštěv')} s chybou dnes a v příštích 7 dnech. Montér k nim v aplikaci nedostane vše potřebné.${urgent}`
          : `Žádná z ${b.checked} naplánovaných návštěv dnes a v příštích 7 dnech nemá chybu v datech.`}
      </p>
    </Link>
  );
}
