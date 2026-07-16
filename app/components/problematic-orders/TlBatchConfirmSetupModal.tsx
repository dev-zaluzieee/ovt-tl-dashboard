'use client';

/**
 * Pre-flight modal for the batch TL confirm. Captures the decision-specific
 * inputs (nedopadlo reason enum OR retence free-text) + optional note, then
 * hands the payload to the wizard.
 */

import { useEffect, useState } from 'react';
import type {
  BatchConfirmItem,
  NedopadloReason,
  TlConfirmDecision,
} from './TlBatchConfirmWizardModal';

interface Props {
  decision: TlConfirmDecision;
  items: BatchConfirmItem[];
  onCancel: () => void;
  onSubmit: (payload: { reason: string; note: string | null }) => void;
}

const NEDOPADLO_OPTIONS: Array<{ id: NedopadloReason; label: string }> = [
  { id: 'vysoka_cena', label: 'Vysoká cena' },
  { id: 'nema_zajem', label: 'Nemá zájem' },
  { id: 'nemozna_realizace', label: 'Nemožná realizace' },
];

export function TlBatchConfirmSetupModal({
  decision,
  items,
  onCancel,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  // Reset inputs when the modal opens for a new decision.
  useEffect(() => {
    setReason('');
    setNote('');
  }, [decision]);

  const canSubmit =
    decision === 'nedopadlo'
      ? reason === 'vysoka_cena' ||
        reason === 'nema_zajem' ||
        reason === 'nemozna_realizace'
      : reason.trim().length > 0;

  const title =
    decision === 'nedopadlo'
      ? `Označit jako nedopadlo (${items.length})`
      : `Poslat do retence (${items.length})`;

  const description =
    decision === 'nedopadlo'
      ? 'Zapíše ERP status + Raynet tagy stejně jako TRIÁŽ nedopadlo. Zakázky se skryjí z fronty problematických (TL-only).'
      : 'Zařadí zakázky do fronty retencí (žádost „Posláno team leaderem OVT“) — retenční tým si je převezme z fronty. Zakázky se skryjí z fronty problematických.';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-xs text-gray-600">{description}</p>

        <div className="mt-4 space-y-4">
          {decision === 'nedopadlo' ? (
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Důvod (aplikuje se na všechny)
              </legend>
              <div className="mt-2 space-y-1.5">
                {NEDOPADLO_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      reason === opt.id
                        ? 'border-rose-400 bg-rose-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="nedopadlo-reason"
                      value={opt.id}
                      checked={reason === opt.id}
                      onChange={() => setReason(opt.id)}
                      className="h-4 w-4 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-gray-900">{opt.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <div>
              <label
                htmlFor="retence-reason"
                className="text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Důvod (aplikuje se na všechny)
              </label>
              <textarea
                id="retence-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Např. Vysoká cena / chce zvážit / poslat nabídku…"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                maxLength={4000}
              />
            </div>
          )}

          <div>
            <label
              htmlFor="tl-note"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Poznámka TL (volitelné)
            </label>
            <textarea
              id="tl-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Interní poznámka pro audit (jen v TL potvrzeních)."
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              maxLength={4000}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Zrušit
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                reason: reason.trim(),
                note: note.trim().length > 0 ? note.trim() : null,
              })
            }
            className={`rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 ${
              decision === 'nedopadlo'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            Spustit
          </button>
        </div>
      </div>
    </div>
  );
}
