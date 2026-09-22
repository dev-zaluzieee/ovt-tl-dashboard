'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TeamFilter, type TeamSelection } from '../teams/TeamFilter';
import { eventInTeam, fmtDateTime, ymd, type TlDayEvent } from './shared';

type State = 'ceka' | 'naplanovano' | 'vyreseno' | 'bez_reklamace';
export interface ReklamaceItem {
  outcomeId: number;
  eventId: number;
  submittedAt: string;
  monterName: string | null;
  monterRaynetId: number;
  duvod: string | null;
  komentar: string | null;
  event: TlDayEvent | null;
  claim: { id: number; status: string; statusLabel: string; blockerLabel: string | null; druh: string | null; uznano: string | null; createdAt: string; datumVyreseni: string | null; portalUrl: string } | null;
  followUp: { eventId: number; scheduledFrom: string | null; categoryLabel: string; raynetUrl: string; status: string | null } | null;
  state: State;
  ageDays: number;
}

export const REKL_STATE_UI: Record<State, { label: string; cls: string; hint: string }> = {
  ceka: { label: 'Čeká na naplánování', cls: 'bg-amber-100 text-amber-800', hint: 'Reklamace je v ERP, návštěva ještě není v kalendáři.' },
  bez_reklamace: { label: 'Bez reklamace v ERP', cls: 'bg-rose-100 text-rose-800', hint: 'Montér poslal na reklamace, ale reklamace v ERP nevznikla — založí ji kancelář.' },
  naplanovano: { label: 'Návštěva naplánována', cls: 'bg-sky-100 text-sky-800', hint: 'Navazující událost je v Raynetu.' },
  vyreseno: { label: 'Vyřešeno', cls: 'bg-green-100 text-green-800', hint: 'Reklamační oddělení reklamaci uzavřelo.' },
};
const stateUi = (s: string) => REKL_STATE_UI[s as State] ?? { label: s, cls: 'bg-gray-100 text-gray-700', hint: '' };

export function ReklamaceRow({ it, compact }: { it: ReklamaceItem; compact?: boolean }) {
  const ui = stateUi(it.state);
  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="px-3 py-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${ui.cls}`}>{ui.label}</span>
        <p className="mt-1 text-xs text-gray-500">
          {it.ageDays === 0 ? 'dnes' : `${it.ageDays} ${it.ageDays === 1 ? 'den' : it.ageDays < 5 ? 'dny' : 'dní'}`} od odeslání
        </p>
      </td>
      <td className="px-3 py-2">
        <p className="font-medium text-gray-900">{it.event?.customer ?? it.event?.title ?? `Událost ${it.eventId}`}</p>
        {it.event?.address && <p className="text-xs text-gray-500">{it.event.address}</p>}
        {!compact && (
          <p className="mt-1 text-xs text-gray-600">
            {it.duvod ? <b>{it.duvod}</b> : null}
            {it.duvod && it.komentar ? ' · ' : ''}
            {it.komentar ? <span className="italic">„{it.komentar}“</span> : null}
          </p>
        )}
      </td>
      {!compact && (
        <td className="px-3 py-2">
          <p className="text-gray-900">{it.monterName ?? '—'}</p>
          <p className="text-xs text-gray-500">{fmtDateTime(it.submittedAt)}</p>
        </td>
      )}
      <td className="px-3 py-2 text-xs">
        {it.claim ? (
          <>
            <a href={it.claim.portalUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
              #{it.claim.id}
            </a>{' '}
            <span className="text-gray-800">{it.claim.statusLabel}</span>
            {it.claim.blockerLabel && <p className="text-gray-500">čeká na: {it.claim.blockerLabel}</p>}
            {it.claim.uznano && <p className="text-gray-500">{it.claim.uznano === 'uznano' ? 'uznáno' : 'zamítnuto'}</p>}
          </>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {it.followUp ? (
          <a href={it.followUp.raynetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            {it.followUp.categoryLabel} · {fmtDateTime(it.followUp.scheduledFrom)}
          </a>
        ) : (
          <span className="text-gray-400">zatím ne</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs">
        {it.event && <a href={it.event.raynetUrl} target="_blank" rel="noopener noreferrer" className="mr-2 text-blue-600 hover:underline">Raynet</a>}
        <Link href={`/mvt/zapisy/${it.outcomeId}`} className="text-blue-600 hover:underline">Zápis</Link>
      </td>
    </tr>
  );
}

/** Reklamace z montáží — a tracker, not a to-do list. */
export function MvtReklamaceClient() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => {
    setFrom(ymd(new Date(Date.now() - 59 * 86_400_000)));
    setTo(ymd(new Date()));
  }, []);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [items, setItems] = useState<ReklamaceItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [team, setTeam] = useState<TeamSelection | null>(null);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mvt-reklamace?from=${from}&to=${to}&include_resolved=${includeResolved}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || json.message || `HTTP ${res.status}`);
        return;
      }
      setItems((json.data?.items ?? []) as ReklamaceItem[]);
      setCounts(json.data?.counts ?? {});
    } catch {
      setError('Chyba spojení.');
    } finally {
      setLoading(false);
    }
  }, [from, to, includeResolved]);
  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => items.filter((i) => (i.event ? eventInTeam(i.event, team?.memberRaynetIds ?? null) : !team?.memberRaynetIds || team.memberRaynetIds.map(String).includes(String(i.monterRaynetId)))),
    [items, team]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">Od<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">Do<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" /></label>
        <TeamFilter workforce="mvt" value={teamId} onChange={(sel) => { setTeamId(sel?.id ?? null); setTeam(sel); }} />
        <div className="flex flex-wrap gap-1">
          {(Object.keys(REKL_STATE_UI) as State[]).map((k) => (
            <span key={k} className={`rounded-full px-2.5 py-1 text-xs font-medium ${REKL_STATE_UI[k].cls}`} title={REKL_STATE_UI[k].hint}>
              {REKL_STATE_UI[k].label} · {counts[k] ?? 0}
            </span>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={includeResolved} onChange={(e) => setIncludeResolved(e.target.checked)} />
          zobrazit vyřešené
        </label>
        <button type="button" onClick={() => void load()} className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm">Obnovit</button>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Stav</th>
              <th className="px-3 py-2">Zákazník · důvod</th>
              <th className="px-3 py-2">Poslal</th>
              <th className="px-3 py-2">Reklamace v ERP</th>
              <th className="px-3 py-2">Navazující návštěva</th>
              <th className="px-3 py-2">Odkazy</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">Načítám…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">Žádné otevřené reklamace z montáží.</td></tr>
            ) : (
              visible.map((it) => <ReklamaceRow key={it.outcomeId} it={it} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
