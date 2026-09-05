'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  nedopadloReason: string | null;
  nedopadloReasonBy: 'ovt' | 'tl' | null;
  done: boolean;
  review: TriageReview | null;
}
interface TriageQueueResult {
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

/** Window presets (days back from today, inclusive of today). Backend caps at 62. */
const WINDOW_PRESETS: { days: number; label: string }[] = [
  { days: 7, label: '7 dní' },
  { days: 14, label: '14 dní' },
  { days: 30, label: '30 dní' },
  { days: 60, label: '60 dní' },
];
const DEFAULT_WINDOW_DAYS = 30;

const PRAGUE_YMD = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function todayYmd(): string {
  return PRAGUE_YMD.format(new Date());
}
function daysAgoYmd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return PRAGUE_YMD.format(d);
}
/** Prague calendar day of an ISO timestamp — used to group the queue by zaměření day. */
function dayOf(iso: string): string {
  return PRAGUE_YMD.format(new Date(iso));
}
function fmtDayHeader(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

export function DenniTriazClient() {
  const [from, setFrom] = useState(daysAgoYmd(DEFAULT_WINDOW_DAYS - 1));
  const [to, setTo] = useState(todayYmd());
  const [data, setData] = useState<TriageQueueResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [reasonFilter, setReasonFilter] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [reasonFor, setReasonFor] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchReason, setBatchReason] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to }).toString();
      const res = await fetch(`/api/tl-triage?${qs}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || json.error || 'Načtení selhalo.');
        setData(null);
        return;
      }
      setData(json.data as TriageQueueResult);
    } catch {
      setError('Chyba spojení.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  function applyPreset(days: number) {
    setFrom(daysAgoYmd(days - 1));
    setTo(todayYmd());
  }
  const activePreset = useMemo(() => {
    if (to !== todayYmd()) return null;
    return WINDOW_PRESETS.find((p) => daysAgoYmd(p.days - 1) === from)?.days ?? null;
  }, [from, to]);

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

  // A reason filter selects rows that are by definition "done" (they have a
  // nedopadlo outcome), so it bypasses the "Jen nevyřízené" toggle entirely.
  const allRows = useMemo(() => data?.rows ?? [], [data]);
  const rows = useMemo(() => {
    if (reasonFilter) return allRows.filter((r) => r.nedopadloReason === reasonFilter);
    return onlyOpen ? allRows.filter((r) => !r.done) : allRows;
  }, [allRows, reasonFilter, onlyOpen]);

  const reasonCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of allRows) {
      if (r.nedopadloReason) out[r.nedopadloReason] = (out[r.nedopadloReason] ?? 0) + 1;
    }
    return out;
  }, [allRows]);

  // Group by zaměření day (Prague), oldest day first — the server already
  // orders needs-action first, so within the visible set we re-sort by time.
  const groups = useMemo(() => {
    const byDay = new Map<string, TriageRow[]>();
    for (const r of rows) {
      const k = dayOf(r.zamereniAt);
      const arr = byDay.get(k);
      if (arr) arr.push(r);
      else byDay.set(k, [r]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, list]) => ({
        day,
        rows: list.sort((a, b) => a.zamereniAt.localeCompare(b.zamereniAt)),
        open: list.filter((r) => !r.done).length,
      }));
  }, [rows]);

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
      {/* Window */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-700">Období (zaměření):</span>
        {WINDOW_PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => applyPreset(p.days)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              activePreset === p.days
                ? 'border-[#1E8449] bg-[#1E8449] text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            posledních {p.label}
          </button>
        ))}
        <label className="ml-2 text-sm text-gray-700">
          od{' '}
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm text-gray-700">
          do{' '}
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          onClick={load}
          className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50"
        >
          Obnovit
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label
          className={`flex items-center gap-2 text-sm ${
            reasonFilter ? 'text-gray-400' : 'text-gray-700'
          }`}
          title={reasonFilter ? 'Filtr důvodu zobrazuje i vyřízené zakázky' : undefined}
        >
          <input
            type="checkbox"
            checked={onlyOpen}
            disabled={reasonFilter != null}
            onChange={(e) => setOnlyOpen(e.target.checked)}
          />
          Jen nevyřízené
        </label>
        <span className="mx-1 h-4 w-px bg-gray-300" />
        <span className="text-xs text-gray-500">Důvod nedopadlo:</span>
        <button
          onClick={() => setReasonFilter(null)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            reasonFilter == null
              ? 'border-gray-700 bg-gray-700 text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Vše
        </button>
        {REASONS.map((rs) => (
          <button
            key={rs.value}
            onClick={() => setReasonFilter(reasonFilter === rs.value ? null : rs.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              reasonFilter === rs.value
                ? 'border-rose-600 bg-rose-600 text-white'
                : 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
            }`}
          >
            {rs.label}
            <span className="ml-1 opacity-70">({reasonCounts[rs.value] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Progress over the window */}
      {counts && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-sm text-gray-600">
            <span>
              Vyřízeno {counts.done} / {counts.total} za období
              {counts.needsAction > 0 && (
                <span className="ml-2 font-medium text-red-700">
                  ({counts.needsAction} ve frontě)
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
          {reasonFilter
            ? `Za toto období není žádná zakázka s důvodem „${REASON_LABEL[reasonFilter]}“.`
            : onlyOpen
              ? 'Fronta je prázdná — vše za toto období je vyřízené.'
              : 'Pro toto období nejsou žádné zakázky.'}
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
            {groups.map((g) => (
              <tbody key={g.day} className="divide-y divide-gray-100 border-t border-gray-200">
                <tr className="bg-gray-100/80">
                  <td colSpan={7} className="px-3 py-1.5 text-xs font-semibold text-gray-700">
                    {fmtDayHeader(g.day)}
                    <span className="ml-2 font-normal text-gray-500">
                      {g.rows.length} zakázek
                      {g.open > 0 && !reasonFilter && (
                        <span className="ml-1 text-red-700">· {g.open} ve frontě</span>
                      )}
                    </span>
                  </td>
                </tr>
                {g.rows.map((r) => {
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
                        {r.nedopadloReason && (
                          <div className="mt-1 text-xs text-rose-700">
                            {REASON_LABEL[r.nedopadloReason] ?? r.nedopadloReason}
                            <span className="text-gray-400">
                              {r.nedopadloReasonBy === 'tl' ? ' (TL)' : ' (OVT)'}
                            </span>
                          </div>
                        )}
                        {r.review && (
                          <div className="mt-1 text-xs text-gray-500">
                            Razítko TL: {r.review.disposition}
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
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
