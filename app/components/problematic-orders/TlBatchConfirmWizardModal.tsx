'use client';

/**
 * Batch "TL confirm" wizard. Loops the selected orders and calls
 * /api/tl-problematic-confirmations/:orderId/confirm for each. Best-effort:
 * a failure on one row records the outcome and moves to the next — same
 * pattern as retention's BatchTakeWizardModal.
 *
 * Two decisions supported (chosen up-front by the user):
 *   nedopadlo → shared state via OfficeOrderTriageService lane='nedopadlo';
 *               TL selects one of vysoka_cena | nema_zajem | nemozna_realizace.
 *   retence   → open OVT_REQUEST row (fronta retencí; 2026-07-16 change);
 *               TL enters a free-form reason.
 *
 * Every successful row also writes a TL confirmation row that hides it from
 * the /problematicke-zakazky view (day-agnostic).
 */

import { useCallback, useEffect, useState } from 'react';

export type TlConfirmDecision = 'nedopadlo' | 'retence';
export type NedopadloReason =
  | 'vysoka_cena'
  | 'nema_zajem'
  | 'nemozna_realizace';

export interface BatchConfirmItem {
  order_id: number;
  customer_name: string | null;
}

interface Props {
  items: BatchConfirmItem[];
  decision: TlConfirmDecision;
  /** For nedopadlo: one of the enum values. For retence: any trimmed string. */
  reason: string;
  /** Optional freeform note applied to every row. */
  note: string | null;
  onClose: () => void;
  /** Fired after the wizard closes cleanly. Parent should refresh the list. */
  onDone: () => void;
}

type RowOutcome =
  | { status: 'ok'; orderId: number; customerName: string | null }
  | { status: 'failed'; orderId: number; customerName: string | null; message: string };

const NEDOPADLO_LABEL: Record<NedopadloReason, string> = {
  vysoka_cena: 'vysoká cena',
  nema_zajem: 'nemá zájem',
  nemozna_realizace: 'nemožná realizace',
};

function decisionTitle(decision: TlConfirmDecision, reason: string): string {
  if (decision === 'nedopadlo') {
    return `Nedopadlo — ${NEDOPADLO_LABEL[reason as NedopadloReason] ?? reason}`;
  }
  return `Retence — ${reason}`;
}

export function TlBatchConfirmWizardModal({
  items,
  decision,
  reason,
  note,
  onClose,
  onDone,
}: Props) {
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<RowOutcome[]>([]);
  const [phase, setPhase] = useState<'running' | 'done'>('running');
  const [submitting, setSubmitting] = useState(false);
  const total = items.length;
  const current = index < total ? items[index] : null;

  const submitRow = useCallback(
    async (
      item: BatchConfirmItem
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const res = await fetch(
        `/api/tl-problematic-confirmations/${item.order_id}/confirm`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, reason, note }),
        }
      );
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
      } | null;
      if (res.ok && json?.success) return { ok: true };
      return {
        ok: false,
        message: json?.message || `Chyba (${res.status})`,
      };
    },
    [decision, reason, note]
  );

  const advance = useCallback(() => {
    setIndex((i) => {
      const next = i + 1;
      if (next >= total) setPhase('done');
      return next;
    });
  }, [total]);

  useEffect(() => {
    if (phase !== 'running') return;
    if (!current) return;
    let cancelled = false;
    setSubmitting(true);
    void (async () => {
      try {
        const result = await submitRow(current);
        if (cancelled) return;
        if (result.ok) {
          setOutcomes((prev) => [
            ...prev,
            {
              status: 'ok',
              orderId: current.order_id,
              customerName: current.customer_name,
            },
          ]);
        } else {
          setOutcomes((prev) => [
            ...prev,
            {
              status: 'failed',
              orderId: current.order_id,
              customerName: current.customer_name,
              message: result.message,
            },
          ]);
        }
        advance();
      } catch (err) {
        if (cancelled) return;
        setOutcomes((prev) => [
          ...prev,
          {
            status: 'failed',
            orderId: current.order_id,
            customerName: current.customer_name,
            message: err instanceof Error ? err.message : 'Chyba spojení.',
          },
        ]);
        advance();
      } finally {
        setSubmitting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current, phase, submitRow, advance]);

  const okCount = outcomes.filter((o) => o.status === 'ok').length;
  const failCount = outcomes.filter((o) => o.status === 'failed').length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">
            {phase === 'running'
              ? `Hromadné potvrzení · ${Math.min(index + 1, total)} / ${total}`
              : 'Hromadné potvrzení dokončeno'}
          </h3>
          {phase === 'done' && (
            <button
              type="button"
              onClick={() => {
                onDone();
                onClose();
              }}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Zavřít
            </button>
          )}
        </div>

        <p className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
          {decisionTitle(decision, reason)}
          {note ? (
            <span className="mt-1 block text-gray-500">Poznámka: {note}</span>
          ) : null}
        </p>

        {/* Progress bar */}
        <div className="mb-4 h-1.5 w-full rounded-full bg-gray-200">
          <div
            className={`h-1.5 rounded-full transition-[width] duration-200 ${
              failCount > 0 ? 'bg-rose-500' : 'bg-emerald-500'
            }`}
            style={{
              width: `${total === 0 ? 0 : (outcomes.length / total) * 100}%`,
            }}
          />
        </div>

        {phase === 'running' && current && (
          <div className="space-y-3">
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-sm font-semibold text-gray-900">
                {current.customer_name ?? '(bez jména)'}
              </p>
              <p className="text-xs text-gray-500">
                Zakázka #{current.order_id}
              </p>
            </div>
            {submitting ? (
              <p className="text-xs text-gray-500">Odesílám…</p>
            ) : (
              <p className="text-xs text-gray-500">Připravuji další…</p>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-3">
            <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
              <p className="text-gray-700">
                Dokončeno:{' '}
                <span className="font-semibold text-emerald-700">
                  {okCount} úspěšně
                </span>
                {failCount > 0 && (
                  <>
                    {', '}
                    <span className="font-semibold text-rose-700">
                      {failCount} chyba
                    </span>
                  </>
                )}
                .
              </p>
            </div>
            <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-200">
              {outcomes.map((o) => (
                <li
                  key={`${o.orderId}-${o.status}`}
                  className="flex items-start gap-3 px-3 py-2"
                >
                  <span
                    className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                      o.status === 'ok' ? 'bg-emerald-600' : 'bg-rose-600'
                    }`}
                  >
                    {o.status === 'ok' ? '✓' : '✕'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900">
                      {o.customerName ?? `Zakázka #${o.orderId}`}
                    </p>
                    <p className="text-xs text-gray-500">#{o.orderId}</p>
                    {o.status === 'failed' && (
                      <p className="mt-0.5 text-xs text-rose-700">
                        {o.message}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
