'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { OUTCOME_LABEL, WORKFLOW_LABEL, fmtDateTime, statusClasses, ymd } from './shared';

interface OutcomeRow {
  id: number;
  event_id: number;
  order_id: number | null;
  erp_order_id: number | null;
  workflow: 'montaz' | 'reklamace';
  outcome: 'happy' | 'reklamace' | 'zachrana';
  monter_raynet_id: number;
  monter_name: string | null;
  status: string;
  test_mode: boolean;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
  payload: Record<string, unknown>;
}

const API = '/api/mvt-outcomes';
const PAGE_SIZE = 50;
const STATUSES = ['PENDING', 'SENDING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED'];

/** Zápisy z aplikace — every outcome submission from the montér app. */
export function MvtLogsClient() {
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(() => ymd(new Date()));
  const [status, setStatus] = useState<string[]>([]);
  const [workflow, setWorkflow] = useState('');
  const [outcome, setOutcome] = useState('');
  const [monter, setMonter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<OutcomeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [monters, setMonters] = useState<{ raynetId: number; name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFilters = useCallback(async () => {
    try {
      const res = await fetch(`${API}/filter-options?from=${from}&to=${to}`);
      const json = await res.json();
      if (json.success) setMonters(json.data.monters ?? []);
    } catch {
      /* non-fatal */
    }
  }, [from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const p = new URLSearchParams({ from, to, page: String(page), page_size: String(PAGE_SIZE) });
    status.forEach((s) => p.append('status', s));
    if (workflow) p.set('workflow', workflow);
    if (outcome) p.set('outcome', outcome);
    if (monter) p.set('monter', monter);
    if (search.trim()) p.set('search', search.trim());
    try {
      const res = await fetch(`${API}/logs?${p.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || json.message || `HTTP ${res.status}`);
        return;
      }
      setRows(json.data.rows ?? []);
      setTotal(json.data.total ?? 0);
    } catch {
      setError('Chyba spojení.');
    } finally {
      setLoading(false);
    }
  }, [from, to, page, status, workflow, outcome, monter, search]);

  useEffect(() => { void loadFilters(); }, [loadFilters]);
  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const toggleStatus = (s: string) => { setStatus((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])); setPage(1); };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">Od<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="rounded border border-gray-300 px-2 py-1 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">Do<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="rounded border border-gray-300 px-2 py-1 text-sm" /></label>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-600">Stav zápisu</span>
          <div className="flex flex-wrap gap-1">
            {STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => toggleStatus(s)} className={`rounded px-2 py-1 text-xs font-medium ${status.includes(s) ? statusClasses(s) + ' ring-2 ring-offset-1 ring-gray-400' : 'bg-white text-gray-600 border border-gray-300'}`}>{s}</button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-xs text-gray-600">Workflow
          <select value={workflow} onChange={(e) => { setWorkflow(e.target.value); setPage(1); }} className="rounded border border-gray-300 px-2 py-1 text-sm"><option value="">vše</option><option value="montaz">Montáž</option><option value="reklamace">Reklamace</option></select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">Výsledek
          <select value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1); }} className="rounded border border-gray-300 px-2 py-1 text-sm"><option value="">vše</option><option value="happy">Dokončeno</option><option value="reklamace">Odesláno na reklamace</option><option value="zachrana">Se záchranou</option></select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">Montér
          <select value={monter} onChange={(e) => { setMonter(e.target.value); setPage(1); }} className="rounded border border-gray-300 px-2 py-1 text-sm"><option value="">všichni</option>{monters.map((m) => <option key={m.raynetId} value={m.raynetId}>{m.name ?? `#${m.raynetId}`}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">Hledat<input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="event / objednávka / ERP / chyba" className="rounded border border-gray-300 px-2 py-1 text-sm" /></label>
      </div>

      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr><th className="px-3 py-2">Čas</th><th className="px-3 py-2">Montér</th><th className="px-3 py-2">Workflow</th><th className="px-3 py-2">Výsledek</th><th className="px-3 py-2">Vybráno</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Objednávka</th><th className="px-3 py-2">ERP</th><th className="px-3 py-2">Zápis</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-500">Načítám…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-500">Žádné zápisy v období.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="whitespace-nowrap px-3 py-2">{fmtDateTime(r.created_at)}</td>
                <td className="px-3 py-2">{r.monter_name ?? `#${r.monter_raynet_id}`}</td>
                <td className="px-3 py-2">{WORKFLOW_LABEL[r.workflow] ?? r.workflow}</td>
                <td className="px-3 py-2">{OUTCOME_LABEL[r.outcome] ?? r.outcome}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{typeof r.payload?.vybranoKolik === 'number' ? `${r.payload.vybranoKolik.toLocaleString('cs-CZ')} Kč` : '—'}{typeof r.payload?.zpusobUhrady === 'string' ? <span className="ml-1 text-xs text-gray-500">{r.payload.zpusobUhrady}</span> : null}</td>
                <td className="px-3 py-2 tabular-nums">{r.event_id}</td>
                <td className="px-3 py-2 tabular-nums">{r.order_id ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums">{r.erp_order_id ?? '—'}</td>
                <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusClasses(r.status)}`}>{r.status}</span>{r.test_mode && <span className="ml-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-800">TEST</span>}</td>
                <td className="px-3 py-2"><Link href={`/mvt/zapisy/${r.id}`} className="text-blue-600 hover:underline">Detail</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
        <span>Celkem {total}</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40">‹</button>
          <span>{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40">›</button>
        </div>
      </div>
    </div>
  );
}
