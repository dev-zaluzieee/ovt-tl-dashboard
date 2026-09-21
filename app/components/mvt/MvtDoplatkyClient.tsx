'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TeamFilter, type TeamSelection } from '../teams/TeamFilter';
import { OUTCOME_LABEL, WORKFLOW_LABEL, eventInTeam, fmtDateTime, fmtKc, ymd, type TlDayEvent } from './shared';

type Severity = 'red' | 'amber' | 'low' | 'invoice';
interface DoplatekItem {
  outcomeId: number;
  workflow: string;
  outcome: 'happy' | 'reklamace' | 'zachrana';
  submittedAt: string;
  monterName: string | null;
  monterRaynetId: number;
  event: TlDayEvent | null;
  orderId: number | null;
  erpOrderId: number | null;
  erpUrl: string | null;
  expected: number | null;
  expectedSource: string | null;
  vybrano: number;
  diff: number;
  zpusobUhrady: string | null;
  sleva: number | null;
  infoKeSleve: string | null;
  infoKZachrane: string | null;
  komentar: string | null;
  severity: Severity;
  reason: string;
  erpSediDoplatek: string | null;
  fixedInErp: boolean;
  mark: { note: string | null; marked_by_email: string; created_at: string } | null;
}

const SEVERITY_UI: Record<Severity, { label: string; cls: string; row: string }> = {
  red: { label: 'Nesedí', cls: 'bg-rose-100 text-rose-800', row: 'border-l-4 border-rose-400' },
  amber: { label: 'Nesedí se slevou', cls: 'bg-amber-100 text-amber-800', row: 'border-l-4 border-amber-400' },
  low: { label: 'Sleva vysvětluje', cls: 'bg-gray-100 text-gray-700', row: 'border-l-4 border-gray-200' },
  invoice: { label: 'Fakturou', cls: 'bg-blue-100 text-blue-800', row: 'border-l-4 border-blue-200' },
};
const SOURCE_LABEL: Record<string, string> = { finalni: 'Finální doplatek (kancelář)', admf: 'ADMF', raynet: 'Zaměření', zbyva: 'Zbývá uhradit' };
const ERP_SEDI: Record<string, string> = { ano: 'Ano', ne: 'Ne', zkontroluj: 'ZKONTROLUJ' };

/** Doplatky: queue of submissions whose collected amount does not match the expected doplatek. */
export function MvtDoplatkyClient() {
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(() => ymd(new Date()));
  const [includeMarked, setIncludeMarked] = useState(false);
  const [items, setItems] = useState<DoplatekItem[]>([]);
  const [markedCount, setMarkedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [team, setTeam] = useState<TeamSelection | null>(null);
  const [severities, setSeverities] = useState<Severity[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mvt-doplatky?from=${from}&to=${to}&include_marked=${includeMarked}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || json.message || `HTTP ${res.status}`);
        return;
      }
      setItems(json.data.items ?? []);
      setMarkedCount(json.data.markedCount ?? 0);
    } catch {
      setError('Chyba spojení.');
    } finally {
      setLoading(false);
    }
  }, [from, to, includeMarked]);
  useEffect(() => {
    void load();
  }, [load]);

  const mark = async (it: DoplatekItem) => {
    const note = window.prompt(`Označit jako vyřízené — ${it.event?.customer ?? `zápis ${it.outcomeId}`}. Poznámka (nepovinná):`, '');
    if (note === null) return;
    setBusy(it.outcomeId);
    try {
      await fetch(`/api/mvt-doplatky/${it.outcomeId}/mark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
      await load();
    } finally {
      setBusy(null);
    }
  };
  const unmark = async (it: DoplatekItem) => {
    setBusy(it.outcomeId);
    try {
      await fetch(`/api/mvt-doplatky/${it.outcomeId}/mark`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const inTeam = (it: DoplatekItem) => {
    if (!team?.memberRaynetIds) return true;
    if (it.event) return eventInTeam(it.event, team.memberRaynetIds);
    return team.memberRaynetIds.map(String).includes(String(it.monterRaynetId));
  };
  const visible = useMemo(() => items.filter((i) => inTeam(i) && (severities.length === 0 || severities.includes(i.severity))), [items, team, severities]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => items.reduce<Record<string, number>>((a, i) => ({ ...a, [i.severity]: (a[i.severity] ?? 0) + 1 }), {}), [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">Od<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">Do<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" /></label>
        <TeamFilter workforce="mvt" value={teamId} onChange={(sel) => { setTeamId(sel?.id ?? null); setTeam(sel); }} />
        <div className="flex flex-wrap gap-1">
          {(Object.keys(SEVERITY_UI) as Severity[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSeverities((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${SEVERITY_UI[k].cls} ${severities.includes(k) ? 'ring-2 ring-gray-500 ring-offset-1' : 'opacity-80'}`}
            >
              {SEVERITY_UI[k].label} · {counts[k] ?? 0}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={includeMarked} onChange={(e) => setIncludeMarked(e.target.checked)} />
          zobrazit vyřízené ({markedCount})
        </label>
        <button type="button" onClick={() => void load()} className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm">Obnovit</button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Proč</th>
              <th className="px-3 py-2 text-right">Očekáváno</th>
              <th className="px-3 py-2 text-right">Vybráno</th>
              <th className="px-3 py-2 text-right">Rozdíl</th>
              <th className="px-3 py-2">Platba</th>
              <th className="px-3 py-2">Montér / termín</th>
              <th className="px-3 py-2">Zákazník</th>
              <th className="px-3 py-2">ERP</th>
              <th className="px-3 py-2">Akce</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500">Načítám…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500">Všechny doplatky sedí. 🎉</td></tr>
            ) : (
              visible.map((it) => (
                <tr key={it.outcomeId} className={`border-t border-gray-100 align-top ${SEVERITY_UI[it.severity].row} ${it.mark ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_UI[it.severity].cls}`}>{SEVERITY_UI[it.severity].label}</span>
                    <p className="mt-1 max-w-xs text-xs text-gray-600">{it.reason}</p>
                    <p className="mt-1 text-xs text-gray-500">{WORKFLOW_LABEL[it.workflow] ?? it.workflow} · {OUTCOME_LABEL[it.outcome] ?? it.outcome}</p>
                    {(it.infoKeSleve || it.infoKZachrane || it.komentar) && (
                      <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs italic text-gray-700">
                        {[it.infoKeSleve, it.infoKZachrane, it.komentar].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {fmtKc(it.expected)}
                    {it.expectedSource && <p className="text-[11px] text-gray-500">{SOURCE_LABEL[it.expectedSource] ?? it.expectedSource}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtKc(it.vybrano)}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${it.diff > 0 ? 'text-rose-700' : it.diff < 0 ? 'text-blue-700' : 'text-gray-500'}`}>
                    {it.diff > 0 ? `−${fmtKc(it.diff)}` : it.diff < 0 ? `+${fmtKc(-it.diff)}` : '0'}
                    {it.sleva != null && it.sleva > 0 && <p className="text-[11px] font-normal text-gray-500">sleva {fmtKc(it.sleva)}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{it.zpusobUhrady ?? '—'}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-900">{it.event?.monters.map((m) => m.name).join(', ') || it.monterName || '—'}</p>
                    <p className="text-xs text-gray-500">{fmtDateTime(it.event?.scheduledFrom ?? it.submittedAt)}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-900">{it.event?.customer ?? it.event?.title ?? '—'}</p>
                    {it.event?.address && <p className="text-xs text-gray-500">{it.event.address}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {it.erpSediDoplatek ? (
                      <span className={`rounded px-2 py-0.5 font-medium ${it.fixedInErp ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                        Sedí doplatek? {ERP_SEDI[it.erpSediDoplatek] ?? it.erpSediDoplatek}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                    {it.fixedInErp && <p className="mt-1 text-[11px] text-green-700">opraveno v ERP</p>}
                    {it.mark && <p className="mt-1 text-gray-500">Vyřízeno · {it.mark.marked_by_email}{it.mark.note ? ` · ${it.mark.note}` : ''}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {it.event && <a href={it.event.raynetUrl} target="_blank" rel="noopener noreferrer" className="mr-2 text-blue-600 hover:underline">Raynet</a>}
                    {it.erpUrl && <a href={it.erpUrl} target="_blank" rel="noopener noreferrer" className="mr-2 text-blue-600 hover:underline">ERP</a>}
                    <Link href={`/mvt/zapisy/${it.outcomeId}`} className="mr-2 text-blue-600 hover:underline">Zápis</Link>
                    {it.mark ? (
                      <button type="button" disabled={busy === it.outcomeId} onClick={() => void unmark(it)} className="rounded border border-gray-300 px-2 py-1 text-gray-700 disabled:opacity-50">Vrátit</button>
                    ) : (
                      <button type="button" disabled={busy === it.outcomeId} onClick={() => void mark(it)} className="rounded bg-[#1E8449] px-2 py-1 font-medium text-white disabled:opacity-50">Vyřízeno</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
