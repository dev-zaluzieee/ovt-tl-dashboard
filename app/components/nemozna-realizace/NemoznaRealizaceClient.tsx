'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { raynetEventDeepLink } from '@/lib/raynetUrls';
import { erpOrderDeepLink } from '@/lib/erpUrls';
import { officePortalOrderDeepLink } from '@/lib/officePortalUrls';

/**
 * Kontrola nemožné realizace — TL verification queue for one OVT claim.
 *
 * An OVT closing a zaměření as "nemožná realizace" claims the deal was
 * unwinnable through no fault of theirs. The TL sees every such order in the
 * window that no TL has reviewed yet and takes exactly one decision:
 *   - Potvrdit   → TL stamp only (tl_triage_reviews 'ponechat'); leaves queue
 *   - Změnit důvod → ERP + Raynet rewritten with vysoká cena / nemá zájem
 *                    (shared nedopadlo transition) + stamp; leaves queue
 *   - Na retenci → retention queue (OVT_REQUEST with tl_user_id) + stamp
 * Backend: ceniky-2 /api/admin/tl-triage (range queue, max 62 days).
 */

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

/** The OVT reason this page verifies. */
const REVIEWED_REASON = 'nemozna_realizace';
const REVIEWED_REASON_LABEL = 'Nemožná realizace';

/** Alternative reasons a TL can correct to. */
const OTHER_REASONS: { value: string; label: string }[] = [
  { value: 'vysoka_cena', label: 'Vysoká cena' },
  { value: 'nema_zajem', label: 'Nemá zájem' },
];
const REASON_LABEL: Record<string, string> = {
  [REVIEWED_REASON]: REVIEWED_REASON_LABEL,
  ...Object.fromEntries(OTHER_REASONS.map((r) => [r.value, r.label])),
};

const OUTCOME_BADGE: Record<TriageOutcome, { label: string; cls: string }> = {
  bez_rozhodnuti: { label: 'Bez rozhodnutí', cls: 'bg-red-100 text-red-800' },
  nedopadlo: { label: 'Nedopadlo', cls: 'bg-rose-100 text-rose-800' },
  retence: { label: 'Na retenci', cls: 'bg-amber-100 text-amber-800' },
  resi_tl: { label: 'Řeší TL', cls: 'bg-blue-100 text-blue-800' },
  proslo: { label: 'Prošlo', cls: 'bg-green-100 text-green-800' },
};

const STAMP_LABEL: Record<TriageReview['disposition'], string> = {
  ponechat: 'potvrzeno',
  nedopadlo: 'důvod změněn',
  retence: 'posláno na retenci',
};

/** Window presets (days back from today, inclusive of today). Backend caps at 62. */
const WINDOW_PRESETS: { days: number; label: string }[] = [
  { days: 7, label: '7 dní' },
  { days: 14, label: '14 dní' },
  { days: 30, label: '30 dní' },
  { days: 60, label: '60 dní' },
];
const DEFAULT_WINDOW_DAYS = 30;

/**
 * "Reviewed" = a TL already dealt with the order: it carries a triage stamp,
 * or the nedopadlo reason itself came from a TL (confirmation via
 * Problematické / triage). Rows marked by the OVT alone are NOT reviewed.
 */
function isReviewedByTl(r: TriageRow): boolean {
  return r.review != null || r.nedopadloReasonBy === 'tl';
}

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
/** Compact zaměření stamp, e.g. "st 3. 9. 14:30" (Prague). */
function fmtZamereni(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  });
}

export function NemoznaRealizaceClient() {
  const [from, setFrom] = useState(daysAgoYmd(DEFAULT_WINDOW_DAYS - 1));
  const [to, setTo] = useState(todayYmd());
  const [data, setData] = useState<TriageQueueResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReviewed, setShowReviewed] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [changeReasonFor, setChangeReasonFor] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchChangeReason, setBatchChangeReason] = useState(false);

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
      setChangeReasonFor(null);
      await load();
    }
    setBusy(null);
  }

  function confirmReason(orderId: number) {
    act(orderId, { disposition: 'ponechat', note: `Potvrzeno TL: ${REVIEWED_REASON_LABEL}` });
  }

  function changeReason(orderId: number, reason: string) {
    act(orderId, { disposition: 'nedopadlo', reason });
  }

  function sendRetence(orderId: number) {
    const note = window.prompt('Důvod pro retenci (uvidí retenční tým):');
    if (note == null || note.trim().length === 0) return;
    act(orderId, { disposition: 'retence', note: note.trim() });
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
    setBatchChangeReason(false);
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

  // Universe of this page: rows in the window whose nedopadlo reason is the
  // reviewed one. Queue = the unreviewed subset.
  const allRows = useMemo(() => data?.rows ?? [], [data]);
  const reasonRows = useMemo(
    () => allRows.filter((r) => r.nedopadloReason === REVIEWED_REASON),
    [allRows]
  );
  const rows = useMemo(
    () => (showReviewed ? reasonRows : reasonRows.filter((r) => !isReviewedByTl(r))),
    [reasonRows, showReviewed]
  );
  const reviewedCount = useMemo(
    () => reasonRows.filter(isReviewedByTl).length,
    [reasonRows]
  );
  const total = reasonRows.length;
  const pct = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;

  // Flat list, oldest zaměření first.
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.zamereniAt.localeCompare(b.zamereniAt)),
    [rows]
  );

  // Batch selection targets visible rows not yet reviewed.
  const selectableIds = rows.filter((r) => !isReviewedByTl(r)).map((r) => r.orderId);
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
        <label
          className="ml-auto flex items-center gap-2 text-sm text-gray-700"
          title="Zobrazí i zakázky, které už TL prověřil (mají razítko, nebo důvod zadal TL)"
        >
          <input
            type="checkbox"
            checked={showReviewed}
            onChange={(e) => setShowReviewed(e.target.checked)}
          />
          Zobrazit i prověřené
        </label>
      </div>

      {/* Progress over the window */}
      {data && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-sm text-gray-600">
            <span>
              Prověřeno {reviewedCount} / {total} zakázek „{REVIEWED_REASON_LABEL}“ za období
              {total - reviewedCount > 0 && (
                <span className="ml-2 font-medium text-red-700">
                  ({total - reviewedCount} k prověření)
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

      {!loading && data && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          {total === 0
            ? `Za toto období není žádná zakázka s důvodem „${REVIEWED_REASON_LABEL}“.`
            : 'Vše prověřeno. Fronta je prázdná.'}
        </div>
      )}

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#1E8449]/40 bg-green-50 px-3 py-2 text-sm">
          <span className="font-medium text-[#1E8449]">Vybráno {selected.size}</span>
          {batchChangeReason ? (
            <>
              <span className="text-xs text-gray-500">Nový důvod:</span>
              {OTHER_REASONS.map((rs) => (
                <button
                  key={rs.value}
                  disabled={batchBusy}
                  onClick={() => runBatch({ disposition: 'nedopadlo', reason: rs.value })}
                  className="rounded bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {rs.label}
                </button>
              ))}
              <button onClick={() => setBatchChangeReason(false)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800">
                zrušit
              </button>
            </>
          ) : (
            <>
              <button
                disabled={batchBusy}
                onClick={() =>
                  runBatch({
                    disposition: 'ponechat',
                    note: `Potvrzeno TL: ${REVIEWED_REASON_LABEL}`,
                  })
                }
                className="rounded border border-[#1E8449] bg-white px-2 py-1 text-xs font-medium text-[#1E8449] hover:bg-green-100 disabled:opacity-50"
              >
                Potvrdit nemožnou realizaci
              </button>
              <button
                disabled={batchBusy}
                onClick={() => setBatchChangeReason(true)}
                className="rounded border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                Změnit důvod…
              </button>
              <button
                disabled={batchBusy}
                onClick={batchRetence}
                className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
              >
                Na retenci
              </button>
              <button onClick={() => setSelected(new Set())} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800">
                odznačit
              </button>
            </>
          )}
          {batchBusy && <span className="text-xs text-gray-500">Zpracovávám…</span>}
        </div>
      )}

      {sortedRows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full whitespace-nowrap text-xs">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-2 py-1 w-8 font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={selectableIds.length === 0}
                    title="Vybrat vše neprověřené"
                  />
                </th>
                <th className="px-2 py-1 font-medium">Zákazník</th>
                <th className="px-2 py-1 font-medium">OVT</th>
                <th className="px-2 py-1 font-medium">Zaměření</th>
                <th className="px-2 py-1 font-medium">Stav</th>
                <th className="px-2 py-1 font-medium">Odkazy</th>
                <th className="px-2 py-1 font-medium">Rozhodnutí TL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRows.map((r) => {
                const reviewed = isReviewedByTl(r);
                const badge = OUTCOME_BADGE[r.outcome];
                const isBusy = busy === r.orderId;
                return (
                  <tr
                    key={r.orderId}
                    className={`${reviewed ? 'bg-gray-50/60 text-gray-500' : 'hover:bg-gray-50'} ${
                      selected.has(r.orderId) ? 'bg-green-50' : ''
                    }`}
                  >
                    <td className="px-2 py-1">
                      {!reviewed && (
                        <input
                          type="checkbox"
                          checked={selected.has(r.orderId)}
                          onChange={() => toggleSelect(r.orderId)}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1 max-w-[260px] truncate">
                      <span className={reviewed ? '' : 'font-medium text-gray-900'}>
                        {r.customerName ?? `Zakázka #${r.orderId}`}
                      </span>
                      <span className="ml-1.5 text-gray-400">#{r.orderId}</span>
                    </td>
                    <td className="px-2 py-1 max-w-[160px] truncate text-gray-700">{r.ovt.name}</td>
                    <td className="px-2 py-1 text-gray-600">{fmtZamereni(r.zamereniAt)}</td>
                    <td className="px-2 py-1">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="ml-1.5 text-gray-400">
                        {r.nedopadloReasonBy === 'tl' ? 'zadal TL' : 'zadal OVT'}
                      </span>
                      {r.review && (
                        <span className="ml-1.5 text-gray-500">
                          · TL: {STAMP_LABEL[r.review.disposition]}
                          {r.review.disposition === 'nedopadlo' && r.review.reason
                            ? ` → ${REASON_LABEL[r.review.reason] ?? r.review.reason}`
                            : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex gap-2">
                        {r.sourceRaynetEventId != null ? (
                          <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer"
                            href={raynetEventDeepLink(r.sourceRaynetEventId)}>Raynet</a>
                        ) : (
                          <span className="text-gray-300">Raynet</span>
                        )}
                        {r.sourceErpOrderId != null ? (
                          <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer"
                            href={erpOrderDeepLink(r.sourceErpOrderId)}>ERP</a>
                        ) : (
                          <span className="text-gray-300">ERP</span>
                        )}
                        <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer"
                          href={officePortalOrderDeepLink(r.orderId)}>Objednávka</a>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      {r.review ? (
                        <button
                          disabled={isBusy}
                          onClick={() => clearReview(r.orderId)}
                          className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                        >
                          Zrušit rozhodnutí
                        </button>
                      ) : reviewed ? (
                        <span className="text-[11px] text-gray-400">rozhodnuto TL mimo tuto frontu</span>
                      ) : changeReasonFor === r.orderId ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-gray-500">Nový důvod:</span>
                          {OTHER_REASONS.map((rs) => (
                            <button
                              key={rs.value}
                              disabled={isBusy}
                              onClick={() => changeReason(r.orderId, rs.value)}
                              className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                            >
                              {rs.label}
                            </button>
                          ))}
                          <button
                            onClick={() => setChangeReasonFor(null)}
                            className="px-1 text-[11px] text-gray-400 hover:text-gray-700"
                          >
                            zrušit
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            disabled={isBusy}
                            onClick={() => confirmReason(r.orderId)}
                            className="rounded border border-[#1E8449] px-1.5 py-0.5 text-[11px] font-medium text-[#1E8449] hover:bg-green-50 disabled:opacity-50"
                          >
                            Potvrdit
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => setChangeReasonFor(r.orderId)}
                            className="rounded border border-rose-300 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Změnit důvod…
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => sendRetence(r.orderId)}
                            className="rounded border border-amber-300 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                          >
                            Na retenci
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
