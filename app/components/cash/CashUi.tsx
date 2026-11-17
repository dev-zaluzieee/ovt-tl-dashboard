'use client';

import type { ReactNode } from 'react';
import { cashErrorText, isCashNotConfigured } from '@/lib/cash-api';
import { Alert, Empty, btnSmall } from '@/app/components/ui/kit';

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: 'red' | 'amber' | 'ok' }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-900';
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

/** A failed Hotovost load: "not set up" gets its own explanation, everything else shows finance's Czech message. */
export function CashLoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (isCashNotConfigured(error)) {
    return (
      <Empty title="Hotovost není nastavena">
        Server dashboardu nemá nastavenou adresu financí (proměnná FINANCE_API_URL). Obraťte se na správce.
      </Empty>
    );
  }
  return (
    <Alert tone="red">
      <p>{cashErrorText(error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${btnSmall} mt-2`}>
          Zkusit znovu
        </button>
      )}
    </Alert>
  );
}
