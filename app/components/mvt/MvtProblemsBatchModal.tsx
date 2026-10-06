'use client';

/**
 * Hromadné uzavření problematických zakázek (MVT TL).
 *
 * Three transparent steps, like the other batch actions in the portal
 * (finance Doklady sign-off, retenční portál):
 *   1. potvrzení — what will happen, to how many rows, and which of them will
 *      also write ERP „Sedí doplatek = Ano" (the green „Ověřeno — lze uzavřít"
 *      rows; the backend re-verifies the invoice for each one anyway);
 *   2. průběh — one row at a time, result appears as it lands, so a half-done
 *      batch is never a mystery;
 *   3. výsledek — counts + every skip and failure listed by name.
 *
 * Rows are closed through the SAME single endpoint as the per-row button, so
 * there is one close path and one ERP rule, no batch-only shortcut.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface BatchTarget {
  kind: string;
  key: string;
  /** Customer / label for the progress list. */
  label: string;
  /** 'ok' = green „Ověřeno — lze uzavřít" → close also writes ERP. */
  severity: string;
}

type Reason = 'v_poradku' | 'chyba_mvt' | 'jina_chyba';

const REASON_OPTION: { value: Reason; label: string; hint: string }[] = [
  { value: 'v_poradku', label: 'V pořádku', hint: 'Zakázka je v pořádku — u ověřených faktur zapíšeme „Sedí doplatek = Ano" do ERP.' },
  { value: 'chyba_mvt', label: 'Chyba montéra', hint: 'Montér zapsal špatně; do ERP se nic nezapisuje.' },
  { value: 'jina_chyba', label: 'Jiná chyba', hint: 'Řešeno jinak; do ERP se nic nezapisuje.' },
];

interface RowResult {
  key: string;
  label: string;
  state: 'ok' | 'erp' | 'skipped' | 'failed';
  detail: string | null;
}

export default function MvtProblemsBatchModal({
  targets,
  onClose,
  onFinished,
}: {
  targets: BatchTarget[];
  onClose: () => void;
  onFinished: () => void;
}) {
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done'>('confirm');
  const [reason, setReason] = useState<Reason>('v_poradku');
  const [note, setNote] = useState('');
  const [results, setResults] = useState<RowResult[]>([]);
  const [current, setCurrent] = useState(0);
  const cancelled = useRef(false);

  const greenCount = targets.filter((t) => t.severity === 'ok' && t.kind === 'nesedi_doplatek').length;
  const willWriteErp = reason === 'v_poradku' ? greenCount : 0;

  useEffect(() => () => { cancelled.current = true; }, []);

  const run = useCallback(async () => {
    setPhase('running');
    setResults([]);
    const out: RowResult[] = [];
    for (let i = 0; i < targets.length; i += 1) {
      if (cancelled.current) break;
      const t = targets[i];
      setCurrent(i + 1);
      let row: RowResult;
      try {
        const res = await fetch(`/api/mvt-problems/${t.kind}/${encodeURIComponent(t.key)}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason, note }),
        });
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; error?: string; message?: string; data?: { erpSediDoplatek: string | null; erpSkipped: string | null; erpError: string | null } }
          | null;
        if (!res.ok || json?.success === false) {
          row = { key: t.key, label: t.label, state: 'failed', detail: json?.error ?? json?.message ?? `HTTP ${res.status}` };
        } else if (json?.data?.erpError) {
          row = { key: t.key, label: t.label, state: 'failed', detail: `Uzavřeno, ale ERP zápis selhal: ${json.data.erpError}` };
        } else if (json?.data?.erpSkipped) {
          row = { key: t.key, label: t.label, state: 'skipped', detail: json.data.erpSkipped };
        } else if (json?.data?.erpSediDoplatek === 'written') {
          row = { key: t.key, label: t.label, state: 'erp', detail: 'Zapsáno „Sedí doplatek = Ano" do ERP.' };
        } else if (json?.data?.erpSediDoplatek === 'already') {
          row = { key: t.key, label: t.label, state: 'ok', detail: 'V ERP už bylo „Sedí doplatek = Ano".' };
        } else {
          row = { key: t.key, label: t.label, state: 'ok', detail: null };
        }
      } catch (e) {
        row = { key: t.key, label: t.label, state: 'failed', detail: e instanceof Error ? e.message : 'Chyba spojení.' };
      }
      out.push(row);
      setResults([...out]);
    }
    setPhase('done');
  }, [targets, reason, note]);

  const closed = results.filter((r) => r.state !== 'failed').length;
  const erpWritten = results.filter((r) => r.state === 'erp').length;
  const skipped = results.filter((r) => r.state === 'skipped').length;
  const failed = results.filter((r) => r.state === 'failed');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">
            {phase === 'confirm' ? `Hromadné uzavření — ${targets.length} položek` : phase === 'running' ? `Uzavírám ${current} / ${targets.length}` : 'Hotovo'}
          </h2>
          {phase !== 'running' && (
            <button type="button" onClick={phase === 'done' ? onFinished : onClose} className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100">
              Zavřít
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {phase === 'confirm' && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Důvod uzavření</p>
                {REASON_OPTION.map((o) => (
                  <label key={o.value} className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 ${reason === o.value ? 'border-[#1E8449] bg-green-50' : 'border-gray-200'}`}>
                    <input type="radio" name="reason" className="mt-1" checked={reason === o.value} onChange={() => setReason(o.value)} />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">{o.label}</span>
                      <span className="block text-xs text-gray-500">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              <label className="mt-3 block text-xs text-gray-600">
                Poznámka (nepovinná, uloží se ke všem vybraným)
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
              </label>

              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
                <p className="font-medium">Co se stane:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-700">
                  <li>{targets.length} položek se uzavře a zmizí z fronty.</li>
                  <li>
                    {willWriteErp > 0 ? (
                      <>
                        U <b>{willWriteErp}</b> ověřených plateb fakturou zapíšeme do ERP „Sedí doplatek = Ano“ (kancelář už to nebude muset dělat ručně). Úhradu ověříme u fakturace znovu u každé zakázky — pokud ji nepotvrdí, položku jen uzavřeme a napíšeme proč.
                      </>
                    ) : (
                      'Do ERP se nic nezapisuje.'
                    )}
                  </li>
                  <li>„Dořešeno účetní“ zůstává na kanceláři. Vrácení položky do fronty zápis v ERP nezruší.</li>
                </ul>
              </div>

              <details className="mt-3 text-xs text-gray-600">
                <summary className="cursor-pointer">Zobrazit vybrané ({targets.length})</summary>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto pl-4">
                  {targets.map((t) => (
                    <li key={`${t.kind}-${t.key}`} className="list-disc">
                      {t.label}
                      {t.severity === 'ok' && t.kind === 'nesedi_doplatek' ? <span className="ml-1 text-green-700">· ověřeno</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}

          {phase !== 'confirm' && (
            <>
              {phase === 'running' && (
                <div className="mb-3 h-2 w-full overflow-hidden rounded bg-gray-200">
                  <div className="h-2 bg-[#1E8449] transition-all" style={{ width: `${Math.round((current / Math.max(1, targets.length)) * 100)}%` }} />
                </div>
              )}
              {phase === 'done' && (
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['Uzavřeno', closed, 'text-gray-900'],
                    ['Zapsáno do ERP', erpWritten, 'text-emerald-700'],
                    ['Bez zápisu', skipped, 'text-amber-700'],
                    ['Chyby', failed.length, failed.length ? 'text-rose-700' : 'text-gray-900'],
                  ].map(([l, v, cls]) => (
                    <div key={String(l)} className="rounded-lg border border-gray-200 bg-white p-2">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500">{l}</div>
                      <div className={`text-lg font-semibold ${cls}`}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
              <ul className="space-y-1 text-xs">
                {results.map((r) => (
                  <li key={r.key} className="flex gap-2 rounded border border-gray-100 px-2 py-1">
                    <span className={r.state === 'failed' ? 'text-rose-600' : r.state === 'skipped' ? 'text-amber-600' : 'text-emerald-600'}>
                      {r.state === 'failed' ? '✕' : r.state === 'skipped' ? '!' : '✓'}
                    </span>
                    <span className="min-w-0">
                      <span className="text-gray-900">{r.label}</span>
                      {r.detail ? <span className="ml-1 text-gray-500">{r.detail}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          {phase === 'confirm' && (
            <>
              <button type="button" onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700">Zrušit</button>
              <button type="button" onClick={() => void run()} className="rounded bg-[#1E8449] px-3 py-1.5 text-sm font-semibold text-white">
                Uzavřít {targets.length} položek
              </button>
            </>
          )}
          {phase === 'running' && <span className="text-xs text-gray-500">Probíhá — nezavírejte okno.</span>}
          {phase === 'done' && (
            <button type="button" onClick={onFinished} className="rounded bg-[#1E8449] px-3 py-1.5 text-sm font-semibold text-white">Hotovo</button>
          )}
        </div>
      </div>
    </div>
  );
}
