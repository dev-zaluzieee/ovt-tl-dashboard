'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TeamFilter, type TeamSelection } from '../teams/TeamFilter';
import { OUTCOME_LABEL, WORKFLOW_LABEL, eventInTeam, fmtDateTime, fmtKc, ymd, type TlDayEvent } from './shared';
import { openForCorrection, reopenAction } from './reopen';

type Kind = 'nesedi_doplatek' | 'eskalace' | 'reopen_request' | 'zapis_selhal' | 'erp_nezapsano' | 'reklamace_ceka';
type Severity = 'red' | 'amber' | 'low' | 'info';
interface Resolution {
  reason: 'chyba_mvt' | 'jina_chyba' | 'v_poradku';
  note: string | null;
  resolved_by: string;
  resolved_at: string;
}
export interface ProblemItem {
  kind: Kind;
  key: string;
  severity: Severity;
  title: string;
  reason: string;
  at: string;
  monterName: string | null;
  monterRaynetId: number | null;
  event: TlDayEvent | null;
  eventId: number | null;
  orderId: number | null;
  erpOrderId: number | null;
  erpUrl: string | null;
  detail: Record<string, unknown>;
  resolution: Resolution | null;
  resolveVia: 'problem' | 'escalation' | 'reopen';
}

export const KIND_UI: Record<Kind, { label: string; cls: string }> = {
  eskalace: { label: 'Eskalováno na TL', cls: 'bg-rose-100 text-rose-800' },
  zapis_selhal: { label: 'Zápis selhal', cls: 'bg-red-100 text-red-800' },
  erp_nezapsano: { label: 'ERP nezapsáno', cls: 'bg-amber-100 text-amber-800' },
  nesedi_doplatek: { label: 'Nesedí doplatek', cls: 'bg-amber-100 text-amber-800' },
  reklamace_ceka: { label: 'Reklamace čeká', cls: 'bg-purple-100 text-purple-800' },
  reopen_request: { label: 'Žádost o otevření', cls: 'bg-sky-100 text-sky-800' },
};
const SEV_ROW: Record<Severity, string> = { red: 'border-l-4 border-rose-400', amber: 'border-l-4 border-amber-400', low: 'border-l-4 border-gray-200', info: 'border-l-4 border-blue-200' };
/** The backend may ship a kind this build does not know yet (deploy skew) — degrade, never crash. */
const kindUi = (k: string) => KIND_UI[k as Kind] ?? { label: k, cls: 'bg-gray-100 text-gray-700' };
const sevRow = (s: string) => SEV_ROW[s as Severity] ?? 'border-l-4 border-gray-200';
const REASON_LABEL: Record<Resolution['reason'], string> = { chyba_mvt: 'Chyba MVT', jina_chyba: 'Jiná chyba', v_poradku: 'V pořádku' };
const SOURCE_LABEL: Record<string, string> = { finalni: 'Finální doplatek (kancelář)', admf: 'ADMF', raynet: 'Zaměření', zbyva: 'Zbývá uhradit' };
const ERP_SEDI: Record<string, string> = { ano: 'Ano', ne: 'Ne', zkontroluj: 'ZKONTROLUJ' };

export function problemInTeam(it: ProblemItem, team: TeamSelection | null): boolean {
  if (!team?.memberRaynetIds) return true;
  if (it.event) return eventInTeam(it.event, team.memberRaynetIds);
  return it.monterRaynetId != null && team.memberRaynetIds.map(String).includes(String(it.monterRaynetId));
}

/** One problem row — shared with Přehled. */
export function ProblemRow({ it, onChanged, compact }: { it: ProblemItem; onChanged: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const d = it.detail as Record<string, unknown>;
  const label = it.event?.customer ?? (d.customer as string | null) ?? `zápis ${it.key}`;

  const resolveProblem = async () => {
    const reason = window.prompt(`Uzavřít — ${label}. Důvod: chyba_mvt / jina_chyba / v_poradku`, it.kind === 'nesedi_doplatek' ? 'v_poradku' : 'jina_chyba');
    if (reason == null) return;
    const r = reason.trim().toLowerCase();
    if (!['chyba_mvt', 'jina_chyba', 'v_poradku'].includes(r)) return window.alert('Zadejte chyba_mvt, jina_chyba nebo v_poradku.');
    const note = window.prompt('Poznámka (nepovinná):', '') ?? '';
    setBusy(true);
    try {
      await fetch(`/api/mvt-problems/${it.kind}/${encodeURIComponent(it.key)}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: r, note }) });
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const unresolve = async () => {
    setBusy(true);
    try {
      await fetch(`/api/mvt-problems/${it.kind}/${encodeURIComponent(it.key)}/resolve`, { method: 'DELETE' });
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const resolveEscalation = async () => {
    const reason = window.prompt(`Uzavřít eskalaci — ${label}. Důvod: chyba_mvt / jina_chyba`, 'chyba_mvt');
    if (reason == null) return;
    const r = reason.trim().toLowerCase();
    if (!['chyba_mvt', 'jina_chyba'].includes(r)) return window.alert('Zadejte chyba_mvt nebo jina_chyba.');
    const note = window.prompt('Poznámka (nepovinná):', '') ?? '';
    setBusy(true);
    try {
      const res = await fetch(`/api/tl-escalations/${it.orderId}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ escalationId: Number(d.escalationId), reason: r, note: note || null }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) window.alert(j?.error || j?.message || `Nepodařilo se (HTTP ${res.status}).`);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    const note = window.prompt('Schválit otevření na 48 h. Poznámka pro montéra (nepovinná):', '');
    if (note == null) return;
    setBusy(true);
    try {
      if (await reopenAction(Number(d.reopenId), 'approve', note || null)) onChanged();
    } finally {
      setBusy(false);
    }
  };
  const decline = async () => {
    const note = window.prompt('Zamítnout žádost. Důvod (povinný, uvidí ho montér):', '');
    if (note == null) return;
    setBusy(true);
    try {
      if (await reopenAction(Number(d.reopenId), 'decline', note)) onChanged();
    } finally {
      setBusy(false);
    }
  };
  const open = async () => {
    if (it.eventId == null) return;
    setBusy(true);
    try {
      if (await openForCorrection(it.eventId, label)) onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={`border-t border-gray-100 align-top ${sevRow(it.severity)} ${it.resolution ? 'opacity-60' : ''}`}>
      <td className="px-3 py-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${kindUi(it.kind).cls}`}>{kindUi(it.kind).label}</span>
        <p className="mt-1 text-sm font-medium text-gray-900">{it.title}</p>
        <p className="mt-0.5 max-w-sm text-xs text-gray-600">{it.reason}</p>
        {it.kind === 'nesedi_doplatek' && (
          <p className="mt-1 text-xs text-gray-500">
            {WORKFLOW_LABEL[String(d.workflow)] ?? String(d.workflow)} · {OUTCOME_LABEL[String(d.outcome)] ?? String(d.outcome)} · očekáváno {fmtKc(d.expected as number | null)}
            {d.expectedSource ? ` (${SOURCE_LABEL[String(d.expectedSource)] ?? String(d.expectedSource)})` : ''} · vybráno {fmtKc(d.vybrano as number)} · {String(d.zpusobUhrady ?? '—')}
            {typeof d.sleva === 'number' && d.sleva > 0 ? ` · sleva ${fmtKc(d.sleva)}` : ''}
          </p>
        )}
        {it.kind === 'nesedi_doplatek' && !!(d.infoKeSleve || d.infoKZachrane || d.komentar) && (
          <p className="mt-1 max-w-sm text-xs italic text-gray-700">{[d.infoKeSleve, d.infoKZachrane, d.komentar].filter(Boolean).map(String).join(' · ')}</p>
        )}
        {it.kind === 'eskalace' && (
          <p className="mt-1 text-xs text-gray-500">
            {String(d.escalatedBy)} ({String(d.escalatedByRole)}) · {fmtDateTime(it.at)}
          </p>
        )}
        {it.kind === 'reopen_request' && <p className="mt-1 text-xs text-gray-500">{String(d.requestedBy ?? '')} · {fmtDateTime(it.at)}</p>}
        {['zapis_selhal', 'erp_nezapsano', 'reklamace_ceka'].includes(it.kind) && (
          <p className="mt-1 text-xs text-gray-500">
            {fmtDateTime(it.at)}
            {d.erpComplaintId ? ` · reklamace #${String(d.erpComplaintId)}${d.claimStatus ? ` (${String(d.claimStatus)})` : ''}` : ''}
            {d.komentar ? ` · „${String(d.komentar)}“` : ''}
          </p>
        )}
      </td>
      {!compact && (
        <td className="px-3 py-2">
          <p className="font-medium text-gray-900">{it.monterName ?? '—'}</p>
          <p className="text-xs text-gray-500">{fmtDateTime(it.event?.scheduledFrom ?? it.at)}</p>
        </td>
      )}
      <td className="px-3 py-2">
        <p className="font-medium text-gray-900">{label}</p>
        {(it.event?.address ?? (d.address as string | null)) && <p className="text-xs text-gray-500">{it.event?.address ?? (d.address as string)}</p>}
        {it.kind === 'nesedi_doplatek' && d.erpSediDoplatek ? (
          <p className="mt-1 text-xs">
            <span className={`rounded px-2 py-0.5 font-medium ${d.fixedInErp ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>Sedí doplatek? {ERP_SEDI[String(d.erpSediDoplatek)] ?? String(d.erpSediDoplatek)}</span>
            {d.fixedInErp ? <span className="ml-1 text-green-700">opraveno v ERP</span> : null}
          </p>
        ) : null}
        {it.resolution && (
          <p className="mt-1 text-xs text-gray-500">
            Uzavřeno · {REASON_LABEL[it.resolution.reason]} · {it.resolution.resolved_by}
            {it.resolution.note ? ` · ${it.resolution.note}` : ''}
          </p>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {it.event && <a href={it.event.raynetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Raynet</a>}
          {it.erpUrl && <a href={it.erpUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">ERP</a>}
          {it.kind === 'nesedi_doplatek' && <Link href={`/mvt/zapisy/${it.key}`} className="text-blue-600 hover:underline">Zápis</Link>}
          {(it.kind === 'eskalace' || ['zapis_selhal', 'erp_nezapsano', 'reklamace_ceka'].includes(it.kind)) && d.outcomeId ? <Link href={`/mvt/zapisy/${String(d.outcomeId)}`} className="text-blue-600 hover:underline">Zápis</Link> : null}
          {it.resolveVia === 'reopen' ? (
            <>
              <button type="button" disabled={busy} onClick={() => void approve()} className="rounded bg-[#1E8449] px-2 py-1 font-medium text-white disabled:opacity-50">Otevřít (48 h)</button>
              <button type="button" disabled={busy} onClick={() => void decline()} className="rounded border border-rose-300 px-2 py-1 text-rose-800 disabled:opacity-50">Zamítnout</button>
            </>
          ) : it.resolveVia === 'escalation' ? (
            <>
              {it.eventId != null && it.event?.reopen?.status !== 'open' && (
                <button type="button" disabled={busy} onClick={() => void open()} className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900 disabled:opacity-50">Otevřít k opravě</button>
              )}
              <button type="button" disabled={busy} onClick={() => void resolveEscalation()} className="rounded bg-[#1E8449] px-2 py-1 font-medium text-white disabled:opacity-50">Uzavřít eskalaci</button>
            </>
          ) : it.resolution ? (
            <button type="button" disabled={busy} onClick={() => void unresolve()} className="rounded border border-gray-300 px-2 py-1 text-gray-700 disabled:opacity-50">Vrátit</button>
          ) : (
            <>
              {it.eventId != null && it.event?.reopen?.status !== 'open' && (
                <button type="button" disabled={busy} onClick={() => void open()} className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900 disabled:opacity-50">Otevřít k opravě</button>
              )}
              <button type="button" disabled={busy} onClick={() => void resolveProblem()} className="rounded bg-[#1E8449] px-2 py-1 font-medium text-white disabled:opacity-50">Uzavřít</button>
            </>
          )}
        </div>
        {it.event?.reopen?.status === 'open' && <p className="mt-1 text-amber-800">🔓 otevřeno k opravě</p>}
      </td>
    </tr>
  );
}

/** Problematické zakázky (MVT): a queue of things needing a TL decision, resolved with a reason. */
export function MvtProblemsClient() {
  // Dates are filled after mount: the server and the browser can disagree on
  // "today", so the SSR markup differed from the first client render (React #418).
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => {
    setFrom(ymd(new Date(Date.now() - 29 * 86_400_000)));
    setTo(ymd(new Date()));
  }, []);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [items, setItems] = useState<ProblemItem[]>([]);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [team, setTeam] = useState<TeamSelection | null>(null);
  const [kinds, setKinds] = useState<Kind[]>([]);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mvt-problems?from=${from}&to=${to}&include_resolved=${includeResolved}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || json.message || `HTTP ${res.status}`);
        return;
      }
      setItems((json.data?.items ?? []) as ProblemItem[]);
      setResolvedCount(json.data.resolvedCount ?? 0);
    } catch {
      setError('Chyba spojení.');
    } finally {
      setLoading(false);
    }
  }, [from, to, includeResolved]);
  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => items.filter((i) => problemInTeam(i, team) && (kinds.length === 0 || kinds.includes(i.kind))), [items, team, kinds]);
  const counts = useMemo(() => items.reduce<Record<string, number>>((a, i) => (i.resolution ? a : { ...a, [i.kind]: (a[i.kind] ?? 0) + 1 }), {}), [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">Od<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">Do<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" /></label>
        <TeamFilter workforce="mvt" value={teamId} onChange={(sel) => { setTeamId(sel?.id ?? null); setTeam(sel); }} />
        <div className="flex flex-wrap gap-1">
          {(Object.keys(KIND_UI) as Kind[]).map((k) => (
            <button key={k} type="button" onClick={() => setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))} className={`rounded-full px-2.5 py-1 text-xs font-medium ${kindUi(k).cls} ${kinds.includes(k) ? 'ring-2 ring-gray-500 ring-offset-1' : 'opacity-80'}`}>
              {kindUi(k).label} · {counts[k] ?? 0}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={includeResolved} onChange={(e) => setIncludeResolved(e.target.checked)} />
          zobrazit uzavřené ({resolvedCount})
        </label>
        <button type="button" onClick={() => void load()} className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm">Obnovit</button>
      </div>
      <p className="text-xs text-gray-500">Eskalace a nesedící doplatky nejsou omezené datem zápisu jen u eskalací; doplatky se hledají v zápisech ve zvoleném období. Položky zůstávají, dokud je neuzavřete — i když je kancelář mezitím opravila v ERP.</p>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Problém</th>
              <th className="px-3 py-2">Montér / termín</th>
              <th className="px-3 py-2">Zákazník</th>
              <th className="px-3 py-2">Akce</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-500">Načítám…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-500">Žádné problematické zakázky. 🎉</td></tr>
            ) : (
              visible.map((it) => <ProblemRow key={`${it.kind}-${it.key}`} it={it} onChanged={() => void load()} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
