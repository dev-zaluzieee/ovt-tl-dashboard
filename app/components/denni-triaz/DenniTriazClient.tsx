'use client';

import { useCallback, useEffect, useState } from 'react';
import { raynetEventDeepLink, raynetCompanyDeepLink } from '@/lib/raynetUrls';
import { erpOrderDeepLink } from '@/lib/erpUrls';
import { officePortalOrderDeepLink } from '@/lib/officePortalUrls';

type TriageOutcome = 'resi_tl' | 'retence' | 'nedopadlo' | 'proslo' | 'bez_rozhodnuti';

interface TriageReview {
  disposition: 'nedopadlo' | 'retence' | 'ponechat';
  reason: string | null;
  note: string | null;
  by: string;
  at: string;
}
interface TriageRow {
  orderId: number;
  customerName: string | null;
  ovt: { email: string; name: string };
  zamereniAt: string;
  sourceErpOrderId: number | null;
  raynetId: number | null;
  sourceRaynetEventId: number | null;
  outcome: TriageOutcome;
  done: boolean;
  review: TriageReview | null;
}
interface TriageDayResult {
  from: string;
  to: string;
  rows: TriageRow[];
  counts: { total: number; done: number; needsAction: number };
}

const REASONS: { value: string; label: string }[] = [
  { value: 'vysoka_cena', label: 'Vysoká cena' },
  { value: 'nema_zajem', label: 'Nemá zájem' },
  { value: 'nemozna_realizace', label: 'Nemožná realizace' },
];
const REASON_LABEL: Record<string, string> = Object.fromEntries(
  REASONS.map((r) => [r.value, r.label])
);

const OUTCOME_BADGE: Record<TriageOutcome, { label: string; cls: string }> = {
  bez_rozhodnuti: { label: 'Bez rozhodnutí', cls: 'bg-red-100 text-red-800' },
  nedopadlo: { label: 'Nedopadlo', cls: 'bg-rose-100 text-rose-800' },
  retence: { label: 'Na retenci', cls: 'bg-amber-100 text-amber-800' },
  resi_tl: { label: 'Řeší TL', cls: 'bg-blue-100 text-blue-800' },
  proslo: { label: 'Prošlo', cls: 'bg-green-100 text-green-800' },
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' });
}

export function DenniTriazClient() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<TriageDayResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [reasonFor, setReasonFor] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchReason, setBatchReason] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tl-triage?date=${encodeURIComponent(date)}`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || json.error || 'Načtení selhalo.');
        setData(null);
        return;
      }
      setData(json.data as TriageDayResult);
    } catch {
      setError('Chyba spojení.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  /** POST one disposition; returns null on success, an error string otherwise. */
  async function postDisposition(
    orderId: number,
    body: Record<string, unknown>
  ): Promise<string | null> {
    try {
      const res = await fetch(`/api/tl-triage/${orderId}/disposition`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return json?.error || json?.message || `#${orderId} selhalo`;
      return null;
    } catch {
      return `#${orderId}: chyba spojení`;
    }
  }

  async function act(orderId: number, body: Record<string, unknown>) {
    setBusy(orderId);
    const err = await postDisposition(orderId, body);
    if (err) alert(err);
    else {
      setReasonFor(null);
      await load();
    }
    setBusy(null);
  }

  function toggleSelect(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function runBatch(body: Record<string, unknown>) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBatchBusy(true);
    const errors: string[] = [];
    for (const id of ids) {
      const e = await postDisposition(id, body);
      if (e) errors.push(e);
    }
    setBatchBusy(false);
    setBatchReason(false);
    setSelected(new Set());
    await load();
    if (errors.length > 0) {
      alert(`Dokončeno s chybami (${errors.length}):\n` + errors.slice(0, 12).join('\n'));
    }
  }

  function batchRetence() {
    const note = window.prompt(`Důvod pro retenci pro ${selected.size} zakázek:`);
    if (note == null || note.trim().length === 0) return;
    runBatch({ disposition: 'retence', note: note.trim() });
  }

  async function clearReview(orderId: number) {
    setBusy(orderId);
    try {
      const res = await fetch(`/api/tl-triage/${orderId}/review`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        alert(json?.error || 'Zrušení selhalo.');
        return;
      }
      await load();
    } catch {
      alert('Chyba spojení.');
    } finally {
      setBusy(null);
    }
  }

  function sendRetence(orderId: number) {
    const note = window.prompt('Důvod pro retenci (uvidí retenční tým):');
    if (note == null || note.trim().length === 0) return;
    act(orderId, { disposition: 'retence', note: note.trim() });
  }

  const rows = (data?.rows ?? []).filter((r) => (onlyOpen ? !r.done : true));
  const counts = data?.counts;
  const pct = counts && counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;

  // Batch selection targets visible rows without a review stamp yet.
  const selectableIds = rows.filter((r) => !r.review).map((r) => r.orderId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleSelectAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allSelected) selectableIds.forEach((id) => n.delete(id));
      else selectableIds.forEach((id) => n.add(id));
      return n;
    });

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-700">
          Den (zaměření):{' '}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Jen nevyřízené
        </label>
        <button
          onClick={load}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Obnovit
        </button>
      </div>

      {/* Progress */}
      {counts && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-sm text-gray-600">
            <span>
              Zkontrolováno {counts.done} / {counts.total}
              {counts.needsAction > 0 && (
                <span className="ml-2 font-medium text-red-700">
                  ({counts.needsAction} k vyřízení)
                </span>
              )}
            </span>
            <span>{pct} %</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full bg-[#1E8449]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {loading && <p className="text-sm text-gray-500">Načítám…</p>}

      {!loading && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          {onlyOpen ? 'Vše z tohoto dne je vyřízené. 🎉' : 'Pro tento den nejsou žádné zakázky.'}
        </div>
      )}

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#1E8449]/40 bg-green-50 px-3 py-2 text-sm">
          <span className="font-medium text-[#1E8449]">Vybráno {selected.size}</span>
          {batchReason ? (
            <>
              <span className="text-xs text-gray-500">Důvod:</span>
              {REASONS.map((rs) => (
                <button
                  key={rs.value}
                  disabled={batchBusy}
                  onClick={() => runBatch({ disposition: 'nedopadlo', reason: rs.value })}
                  className="rounded bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {rs.label}
                </button>
              ))}
              <button onClick={() => setBatchReason(false)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800">
                zrušit
              </button>
            </>
          ) : (
            <>
              <button
                disabled={batchBusy}
                onClick={() => setBatchReason(true)}
                className="rounded border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                Nedopadlo…
              </button>
              <button
                disabled={batchBusy}
                onClick={batchRetence}
                className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
              >
                Na retenci
              </button>
              <button
                disabled={batchBusy}
                onClick={() => runBatch({ disposition: 'ponechat' })}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Ponechat / OK
              </button>
              <button onClick={() => setSelected(new Set())} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800">
                odznačit
              </button>
            </>
          )}
          {batchBusy && <span className="text-xs text-gray-500">Zpracovávám…</span>}
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={selectableIds.length === 0}
                    title="Vybrat vše (bez razítka)"
                  />
                </th>
                <th className="px-3 py-2 font-medium">Zákazník</th>
                <th className="px-3 py-2 font-medium">OVT</th>
                <th className="px-3 py-2 font-medium">Zaměření</th>
                <th className="px-3 py-2 font-medium">Stav</th>
                <th className="px-3 py-2 font-medium">Odkazy</th>
                <th className="px-3 py-2 font-medium">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const badge = OUTCOME_BADGE[r.outcome];
                return (
                  <tr key={r.orderId} className={r.done ? 'bg-gray-50/60' : ''}>
                    <td className="px-3 py-2 align-top">
                      {!r.review && (
                        <input
                          type="checkbox"
                          checked={selected.has(r.orderId)}
                          onChange={() => toggleSelect(r.orderId)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">
                        {r.customerName ?? `Zakázka #${r.orderId}`}
                      </div>
                      <div className="text-xs text-gray-400">#{r.orderId}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{r.ovt.name}</td>
                    <td className="px-3 py-2 text-gray-600">{fmtTime(r.zamereniAt)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {r.review && (
                        <div className="mt-1 text-xs text-gray-500">
                          TL: {r.review.disposition}
                          {r.review.reason ? ` (${REASON_LABEL[r.review.reason] ?? r.review.reason})` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 text-xs">
                        {r.sourceRaynetEventId != null && (
                          <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer"
                            href={raynetEventDeepLink(r.sourceRaynetEventId)}>Raynet</a>
                        )}
                        {r.raynetId != null && (
                          <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer"
                            href={raynetCompanyDeepLink(r.raynetId)}>Karta</a>
                        )}
                        {r.sourceErpOrderId != null && (
                          <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer"
                            href={erpOrderDeepLink(r.sourceErpOrderId)}>ERP</a>
                        )}
                        <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer"
                          href={officePortalOrderDeepLink(r.orderId)}>Portál</a>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {r.review ? (
                        <button
                          disabled={busy === r.orderId}
                          onClick={() => clearReview(r.orderId)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                        >
                          Zrušit razítko
                        </button>
                      ) : reasonFor === r.orderId ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {REASONS.map((rs) => (
                            <button
                              key={rs.value}
                              disabled={busy === r.orderId}
                              onClick={() => act(r.orderId, { disposition: 'nedopadlo', reason: rs.value })}
                              className="rounded bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                            >
                              {rs.label}
                            </button>
                          ))}
                          <button
                            onClick={() => setReasonFor(null)}
                            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-700"
                          >
                            zrušit
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          <button
                            disabled={busy === r.orderId}
                            onClick={() => setReasonFor(r.orderId)}
                            className="rounded border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Nedopadlo…
                          </button>
                          <button
                            disabled={busy === r.orderId}
                            onClick={() => sendRetence(r.orderId)}
                            className="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                          >
                            Na retenci
                          </button>
                          <button
                            disabled={busy === r.orderId}
                            onClick={() => act(r.orderId, { disposition: 'ponechat' })}
                            className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Ponechat / OK
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
