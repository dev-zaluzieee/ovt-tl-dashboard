'use client';

import { useReadinessCount } from './useReadinessCount';

/** Red count of visits with an error in the data TODAY or TOMORROW, next to the navigation entry. Always shown from 1 (no limit); hidden at 0 and on any failure. */
export function ReadinessBadge() {
  const b = useReadinessCount();
  if (!b || b.urgent < 1) return null;
  const text = `${b.urgent} návštěv dnes a zítra s chybou v podkladech`;
  return (
    <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white" title={text} aria-label={text}>
      {b.urgent}
    </span>
  );
}
