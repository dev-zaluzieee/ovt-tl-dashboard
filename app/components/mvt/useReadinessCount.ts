'use client';

import { tlGet } from '@/lib/tl-api';
import { parseReadiness } from '@/lib/tl-parse';
import type { MvtReadiness } from '@/lib/types';
import { useLoad } from '@/app/components/ui/useLoad';

export interface ReadinessCount {
  /** Visits with a RED finding today or tomorrow (the nav mark; no gate). */
  urgent: number;
  /** Red visits of today + 7 days, and whether the release gate lets the tile show them. */
  red7: number;
  gate: boolean;
  checked: number;
  /** Today and tomorrow, for the tile text. */
  todayRed: number;
  tomorrowRed: number;
}

/**
 * The count of the nav mark and of the tile: its OWN fetch (the light `summary=1` answer, no rows) with its own catch, so a failure (old backend, ERP
 * slow, breaker open) is `null` here and can never block or break another page. `null` = nothing to show (never a false "all fine").
 */
export function useReadinessCount(): ReadinessCount | null {
  const { data } = useLoad<MvtReadiness | null>(
    'readiness-summary',
    async (signal) => {
      try {
        return parseReadiness(await tlGet('mvt/readiness', { summary: 1 }, signal));
      } catch {
        return null;
      }
    },
    { refreshMs: 120_000 },
  );
  if (!data || !data.available || data.checked === 0 || !data.urgent) return null;
  return {
    urgent: data.urgent.red,
    red7: data.badge ? data.badge.red : data.counts?.chyba ?? 0,
    gate: !!data.badge && data.badge.show,
    checked: data.checked,
    todayRed: data.urgent.today.chyba,
    tomorrowRed: data.urgent.tomorrow.chyba,
  };
}
