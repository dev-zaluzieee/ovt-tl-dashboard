'use client';

/**
 * Hidden orders — TL-confirmed rows kept out of the daily problematic view.
 *
 * Two escape hatches per row:
 *   → Do retence   — un-hide + route to retention (atomic; single-row modal
 *                    with a reason field; batch variant loops the wizard).
 *   → Happy path   — deep-link out to ceniky-2 /objednavka/[id]; the office
 *                    portal's TRIÁŽ handles the interactive happy-path flow.
 *                    Server-side hook clears the TL confirmation when happy
 *                    path succeeds (see officeOrderTriage / HappyPathModal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { officePortalOrderDeepLink } from '@/lib/officePortalUrls';
import { erpOrderDeepLink } from '@/lib/erpUrls';
import { raynetEventDeepLink } from '@/lib/raynetUrls';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';

type Decision = 'nedopadlo' | 'retence';

interface ConfirmationRow {
  id: number;
  order_id: number;
  decision: Decision;
  reason: string;
  note: string | null;
  confirmed_by: string;
  confirmed_at: string;
  order_customer_name: string | null;
  order_source_erp_order_id: number | null;
  order_source_raynet_event_id: number | null;
  order_raynet_id: number | null;
  order_user_id: string | null;
}

const NEDOPADLO_LABEL: Record<string, string> = {
  vysoka_cena: 'vysoká cena',
  nema_zajem: 'nemá zájem',
  nemozna_realizace: 'nemožná realizace',
};

function formatDateTimeCs(iso: string): string {
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function reasonLabel(row: ConfirmationRow): string {
  if (row.decision === 'nedopadlo') {
    return NEDOPADLO_LABEL[row.reason] ?? row.reason;
  }
  return row.reason;
}

// ---------------------------------------------------------------------------

export function HiddenOrdersClient() {
  const [rows, setRows] = useState<ConfirmationRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [density, setDensity] = useListDensity();
  const isCompact = density === 'compact';
  const cellPad = isCompact ? 'px-2 py-1' : 'px-3 py-2.5';

  const [retenceTarget, setRetenceTarget] = useState<ConfirmationRow | null>(
    null
  );

  // Batch selection.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [batchSetupOpen, setBatchSetupOpen] = useState(false);
  const [batchWizardPayload, setBatchWizardPayload] = useState<{
    reason: string;
    items: ConfirmationRow[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tl-problematic-confirmations', {
        headers: { Accept: 'application/json' },
      });
      const body = (await res.json()) as {
        success?: boolean;
        message?: string;
        data?: ConfirmationRow[];
      };
      if (!res.ok || !body.success || !body.data) {
        setError(body.message || `Chyba při načítání (${res.status})`);
        setRows(null);
        return;
      }
      setRows(body.data);
    } catch {
      setError('Nepodařilo se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSelected = useCallback((orderId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  const selectedItems = useMemo(() => {
    const list = rows ?? [];
    return list.filter((r) => selectedIds.has(r.order_id));
  }, [rows, selectedIds]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {rows == null
            ? ' '
            : rows.length === 0
              ? 'Žádné skryté zakázky.'
              : `${rows.length} ${
                  rows.length === 1
                    ? 'skrytá zakázka'
                    : rows.length < 5
                      ? 'skryté zakázky'
                      : 'skrytých zakázek'
                }.`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <DensityToggle density={density} onChange={setDensity} />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Načítání…' : 'Obnovit'}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading && !rows && (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {rows != null && rows.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          {selectedItems.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-[#F8FAFC] px-4 py-3">
              <p className="text-xs font-medium text-gray-700">
                Vybráno {selectedItems.length}{' '}
                {selectedItems.length === 1
                  ? 'zakázka'
                  : selectedItems.length < 5
                    ? 'zakázky'
                    : 'zakázek'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Zrušit výběr
                </button>
                <button
                  type="button"
                  onClick={() => setBatchSetupOpen(true)}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  → Do retence ({selectedItems.length})
                </button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className={`${cellPad} w-8`}>
                    <span className="sr-only">Vybrat</span>
                  </th>
                  <th className={cellPad}>Rozhodnutí</th>
                  <th className={cellPad}>Zakázka</th>
                  <th className={cellPad}>Důvod / poznámka</th>
                  <th className={cellPad}>Potvrdil</th>
                  <th className={`${cellPad} text-right`}>Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const selected = selectedIds.has(r.order_id);
                  return (
                    <tr
                      key={r.id}
                      className={`align-top border-l-4 ${
                        r.decision === 'nedopadlo'
                          ? 'border-l-rose-500'
                          : 'border-l-emerald-500'
                      }`}
                    >
                      <td className={`${cellPad} w-8`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelected(r.order_id)}
                          aria-label={`Vybrat zakázku #${r.order_id}`}
                          className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>
                      <td className={cellPad}>
                        <span
                          className={`inline-block w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            r.decision === 'nedopadlo'
                              ? 'border-rose-500 bg-rose-50 text-rose-900'
                              : 'border-emerald-500 bg-emerald-50 text-emerald-900'
                          }`}
                        >
                          {r.decision === 'nedopadlo'
                            ? 'Nedopadlo'
                            : 'Retence'}
                        </span>
                      </td>
                      <td className={`${cellPad} whitespace-nowrap`}>
                        <div className="font-medium text-gray-900">
                          {r.order_customer_name ?? `Zakázka #${r.order_id}`}
                        </div>
                        {r.order_user_id && (
                          <div className="text-xs text-gray-500">
                            OVT: {r.order_user_id}
                          </div>
                        )}
                        {!isCompact && (
                          <div className="text-xs text-gray-400">
                            #{r.order_id}
                          </div>
                        )}
                      </td>
                      <td className={cellPad}>
                        <p
                          className={`text-gray-800 ${isCompact ? 'line-clamp-2' : 'whitespace-pre-line'}`}
                          title={isCompact ? reasonLabel(r) : undefined}
                        >
                          {reasonLabel(r)}
                        </p>
                        {r.note && !isCompact && (
                          <p className="mt-1 whitespace-pre-line text-xs text-gray-500">
                            {r.note}
                          </p>
                        )}
                      </td>
                      <td className={`${cellPad} whitespace-nowrap text-gray-600`}>
                        <div className="truncate">{r.confirmed_by}</div>
                        <div className="text-xs text-gray-400">
                          {formatDateTimeCs(r.confirmed_at)}
                        </div>
                      </td>
                      <td className={`${cellPad} whitespace-nowrap text-right`}>
                        <div className="flex flex-nowrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setRetenceTarget(r)}
                            className="shrink-0 rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            → Do retence
                          </button>
                          <a
                            href={officePortalOrderDeepLink(r.order_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 rounded-md border border-[#1565C0] bg-[#1565C0] px-2 py-1 text-xs font-semibold text-white hover:bg-[#0d4f9c]"
                          >
                            → Happy path
                          </a>
                          {r.order_source_raynet_event_id != null && (
                            <a
                              href={raynetEventDeepLink(
                                r.order_source_raynet_event_id
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-md border border-[#1E8449] px-2 py-1 text-xs font-medium text-[#1E8449] hover:bg-[#F1F8F4]"
                            >
                              Raynet
                            </a>
                          )}
                          {r.order_source_erp_order_id != null && (
                            <a
                              href={erpOrderDeepLink(
                                r.order_source_erp_order_id
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-md border border-[#1565C0] px-2 py-1 text-xs font-medium text-[#1565C0] hover:bg-[#E3F2FD]"
                            >
                              ERP
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {retenceTarget && (
        <SendToRetenceModal
          row={retenceTarget}
          onCancel={() => setRetenceTarget(null)}
          onDone={() => {
            setRetenceTarget(null);
            void load();
          }}
        />
      )}

      {batchSetupOpen && selectedItems.length > 0 && (
        <BatchToRetenceSetupModal
          items={selectedItems}
          onCancel={() => setBatchSetupOpen(false)}
          onSubmit={(reason) => {
            setBatchWizardPayload({ reason, items: selectedItems });
            setBatchSetupOpen(false);
          }}
        />
      )}

      {batchWizardPayload && (
        <BatchToRetenceWizardModal
          items={batchWizardPayload.items}
          reason={batchWizardPayload.reason}
          onClose={() => setBatchWizardPayload(null)}
          onDone={() => {
            setBatchWizardPayload(null);
            setSelectedIds(new Set());
            void load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single-row: un-hide + retention
// ---------------------------------------------------------------------------

function SendToRetenceModal({
  row,
  onCancel,
  onDone,
}: {
  row: ConfirmationRow;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = reason.trim().length > 0 && !submitting;

  const submit = useCallback(async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/tl-problematic-confirmations/${row.order_id}/undo-and-send-retence`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason.trim() }),
        }
      );
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
      };
      if (!res.ok || !json.success) {
        setErr(json.message || `Chyba (${res.status})`);
        return;
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Chyba spojení.');
    } finally {
      setSubmitting(false);
    }
  }, [reason, row.order_id, onDone]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900">
          Přesunout do retence
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Přepíše ERP status (→ cenova-nabidka), přidá Raynet CN tagy, zapíše
          retention log. Odstraní TL potvrzení pro tuto zakázku — pokud pak
          znovu Rule A/B zabere, objeví se ve frontě problematických.
        </p>

        <div className="mt-4 rounded-md bg-gray-50 px-3 py-2">
          <p className="text-sm font-semibold text-gray-900">
            {row.order_customer_name ?? `Zakázka #${row.order_id}`}
          </p>
          <p className="text-xs text-gray-500">#{row.order_id}</p>
        </div>

        <div className="mt-4">
          <label
            htmlFor="retence-reason"
            className="text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Důvod přesunu do retence
          </label>
          <textarea
            id="retence-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Např. Zákazník volal, chce nabídku…"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            maxLength={4000}
            autoFocus
          />
        </div>

        {err && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {err}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Odesílám…' : 'Přesunout'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batch to retention: setup + wizard
// ---------------------------------------------------------------------------

function BatchToRetenceSetupModal({
  items,
  onCancel,
  onSubmit,
}: {
  items: ConfirmationRow[];
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const canSubmit = reason.trim().length > 0;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900">
          Přesunout do retence ({items.length})
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Aplikuje stejný důvod na všechny vybrané zakázky. Nedají-li se
          přesměrovat všechny, zbytek pokračuje; chyby uvidíte v souhrnu.
        </p>
        <div className="mt-4">
          <label
            htmlFor="batch-retence-reason"
            className="text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Důvod (aplikuje se na všechny)
          </label>
          <textarea
            id="batch-retence-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            maxLength={4000}
            autoFocus
          />
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
            onClick={() => onSubmit(reason.trim())}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Spustit
          </button>
        </div>
      </div>
    </div>
  );
}

type BatchOutcome =
  | { status: 'ok'; orderId: number; customerName: string | null }
  | { status: 'failed'; orderId: number; customerName: string | null; message: string };

function BatchToRetenceWizardModal({
  items,
  reason,
  onClose,
  onDone,
}: {
  items: ConfirmationRow[];
  reason: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<BatchOutcome[]>([]);
  const [phase, setPhase] = useState<'running' | 'done'>('running');
  const [submitting, setSubmitting] = useState(false);
  const total = items.length;
  const current = index < total ? items[index] : null;

  const advance = useCallback(() => {
    setIndex((i) => {
      const next = i + 1;
      if (next >= total) setPhase('done');
      return next;
    });
  }, [total]);

  useEffect(() => {
    if (phase !== 'running' || !current) return;
    let cancelled = false;
    setSubmitting(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/tl-problematic-confirmations/${current.order_id}/undo-and-send-retence`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
          }
        );
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          message?: string;
        } | null;
        if (cancelled) return;
        if (res.ok && json?.success) {
          setOutcomes((prev) => [
            ...prev,
            {
              status: 'ok',
              orderId: current.order_id,
              customerName: current.order_customer_name,
            },
          ]);
        } else {
          setOutcomes((prev) => [
            ...prev,
            {
              status: 'failed',
              orderId: current.order_id,
              customerName: current.order_customer_name,
              message: json?.message || `Chyba (${res.status})`,
            },
          ]);
        }
        advance();
      } catch (e) {
        if (cancelled) return;
        setOutcomes((prev) => [
          ...prev,
          {
            status: 'failed',
            orderId: current.order_id,
            customerName: current.order_customer_name,
            message: e instanceof Error ? e.message : 'Chyba spojení.',
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
  }, [index, current, phase, reason, advance]);

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
              ? `Přesun do retence · ${Math.min(index + 1, total)} / ${total}`
              : 'Přesun dokončen'}
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
          Důvod: {reason}
        </p>

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
                {current.order_customer_name ?? '(bez jména)'}
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
