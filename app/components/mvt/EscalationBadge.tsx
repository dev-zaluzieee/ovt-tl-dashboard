'use client';

import { useEffect } from 'react';
import { tlGet } from '@/lib/tl-api';
import { parseEscalations } from '@/lib/escalations';
import { useLoad } from '@/app/components/ui/useLoad';
import { ESCALATIONS_CHANGED } from './EscalationEvents';

/** Number of open escalations from finance, shown next to the navigation entry (refreshed every 2 minutes and after a resolve). */
export function EscalationBadge() {
  const { data, reload } = useLoad<number>('escalation-count', async (signal) => parseEscalations(await tlGet('mvt/escalations', undefined, signal)).openCount, { refreshMs: 120_000 });
  useEffect(() => {
    window.addEventListener(ESCALATIONS_CHANGED, reload);
    return () => window.removeEventListener(ESCALATIONS_CHANGED, reload);
  }, [reload]);
  if (!data) return null;
  return (
    <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white" title={`Otevřených eskalací z financí: ${data}`}>
      {data}
    </span>
  );
}
