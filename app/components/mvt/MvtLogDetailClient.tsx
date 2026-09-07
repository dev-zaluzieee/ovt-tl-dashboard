'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OUTCOME_LABEL, WORKFLOW_LABEL, fmtDateTime, fmtKc, statusClasses } from './shared';

interface Detail {
  outcome: {
    id: number; event_id: number; order_id: number | null; erp_order_id: number | null; workflow: string; outcome: string;
    monter_raynet_id: number; monter_name: string | null; payload: Record<string, unknown>; status: string; test_mode: boolean;
    error_message: string | null; warnings: unknown[] | null; duration_ms: number | null; created_at: string; completed_at: string | null;
  };
  steps: { id: number; target: string; status: string; request_payload: unknown; response_status: number | null; response_body: unknown; error_code: string | null; error_message: string | null; duration_ms: number | null; created_at: string }[];
  attachments: { id: number; kind: string; file_name: string; file_size: number | null; created_at: string }[];
}

const TARGET_LABEL: Record<string, string> = {
  raynet_event: 'Raynet — událost (pole + stav)',
  erp_order: 'ERP — zakázka (stav + sloupce)',
  raynet_attachment: 'Raynet — příloha',
  finance_cash: 'Hotovost — pokladna montéra',
};
const KIND_LABEL: Record<string, string> = { predavak: 'Předávací protokol', reklamacni_formular: 'Reklamační formulář', foto: 'Foto z montáže' };
const FIELD_LABEL: Record<string, string> = {
  outcome: 'Výsledek', monter: 'Montér', vybranoKolik: 'Vybráno kolik', zpusobUhrady: 'Způsob úhrady', slevaMvt: 'Sleva (zadaná)',
  slevaMvtEffective: 'Sleva (zapsaná)', infoKeSleve: 'Info ke slevě', infoKZachrane: 'Info k záchraně', doplatekAtSubmit: 'Doplatek při odeslání',
  expectedAtSubmit: 'Očekávaná částka při odeslání', testMode: 'Testovací režim',
};

/** Plain-language rendering of what the montér entered — no raw JSON for team leaders. */
function PayloadTable({ p }: { p: Record<string, unknown> }) {
  const rows = Object.entries(p)
    .filter(([k, v]) => v !== null && v !== undefined && v !== '' && k !== 'testMode')
    .map(([k, v]) => {
      let text: string;
      if (k === 'outcome') text = OUTCOME_LABEL[String(v)] ?? String(v);
      else if (typeof v === 'number' && /kolik|sleva|doplatek|expected/i.test(k)) text = fmtKc(v);
      else if (typeof v === 'boolean') text = v ? 'Ano' : 'Ne';
      else text = String(v);
      return { label: FIELD_LABEL[k] ?? k, text };
    });
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-3 border-b border-gray-100 py-1"><dt className="text-gray-500">{r.label}</dt><dd className="text-right text-gray-900">{r.text}</dd></div>
      ))}
    </dl>
  );
}

export function MvtLogDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/mvt-outcomes/logs/${encodeURIComponent(id)}`);
        const json = await res.json();
        if (!res.ok || !json.success) { setError(json.error || json.message || `HTTP ${res.status}`); return; }
        setData(json.data as Detail);
      } catch { setError('Chyba spojení.'); }
    })();
  }, [id]);

  const o = data?.outcome;
  return (
    <div>
      <Link href="/mvt/zapisy" className="text-sm text-blue-600 hover:underline">← Zápisy z aplikace</Link>
      {error && <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {!data && !error && <p className="mt-4 text-gray-500">Načítám…</p>}
      {o && data && (
        <div className="mt-4 space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{WORKFLOW_LABEL[o.workflow] ?? o.workflow} → {OUTCOME_LABEL[o.outcome] ?? o.outcome}</h1>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusClasses(o.status)}`}>{o.status}</span>
              {o.test_mode && <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-800">TEST</span>}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
              <div><dt className="text-xs text-gray-500">Montér</dt><dd>{o.monter_name ?? `#${o.monter_raynet_id}`}</dd></div>
              <div><dt className="text-xs text-gray-500">Odesláno</dt><dd>{fmtDateTime(o.created_at)}</dd></div>
              <div><dt className="text-xs text-gray-500">Raynet event</dt><dd className="tabular-nums">{o.event_id}</dd></div>
              <div><dt className="text-xs text-gray-500">Objednávka / ERP</dt><dd className="tabular-nums">{o.order_id ?? '—'} / {o.erp_order_id ?? '—'}</dd></div>
            </dl>
            {o.error_message && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-800">{o.error_message}</p>}
            {Array.isArray(o.warnings) && o.warnings.length > 0 && (
              <ul className="mt-3 list-disc rounded bg-amber-50 p-2 pl-6 text-sm text-amber-900">{o.warnings.map((w, i) => <li key={i}>{String(w)}</li>)}</ul>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Co montér zadal</h2>
            <PayloadTable p={o.payload} />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Co se kam zapsalo</h2>
            {data.steps.length === 0 ? <p className="text-sm text-gray-500">Žádné kroky (zápis neproběhl).</p> : (
              <ul className="space-y-2">
                {data.steps.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 rounded border border-gray-100 p-3 text-sm">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusClasses(s.status === 'SKIPPED' ? 'PENDING' : s.status)}`}>{s.status === 'SKIPPED' ? 'BEZ ZMĚNY' : s.status}</span>
                    <span className="font-medium">{TARGET_LABEL[s.target] ?? s.target}</span>
                    <span className="text-xs text-gray-500">{fmtDateTime(s.created_at)}</span>
                    {s.error_message && <span className="text-xs text-red-700">{s.error_message}</span>}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setShowRaw((v) => !v)} className="mt-3 text-xs text-gray-500 underline">{showRaw ? 'Skrýt technické detaily' : 'Technické detaily (pro IT)'}</button>
            {showRaw && <pre className="mt-2 max-h-96 overflow-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(data.steps, null, 2)}</pre>}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Přílohy nahrané montérem</h2>
            {data.attachments.length === 0 ? <p className="text-sm text-gray-500">Žádné.</p> : (
              <ul className="text-sm">{data.attachments.map((a) => <li key={a.id} className="flex flex-wrap gap-3 border-t border-gray-100 py-1.5 first:border-t-0"><span className="rounded bg-gray-100 px-1.5 text-xs">{KIND_LABEL[a.kind] ?? a.kind}</span><span>{a.file_name}</span><span className="text-xs text-gray-500">{fmtDateTime(a.created_at)}</span></li>)}</ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
